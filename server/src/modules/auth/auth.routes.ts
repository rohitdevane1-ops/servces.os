import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../../database/pool.js';
import { AuthService } from './auth.service.js';
import { successResponse, errorResponse } from '../../types/envelope.js';
import { authenticate } from '../../middleware/rbac.js';
import { verifyCaptcha } from '../../middleware/captcha.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['ADMIN', 'STAFF', 'TECHNICIAN', 'CUSTOMER']).optional(),
});

const mfaVerifySchema = z.object({
  mfaSessionToken: z.string().min(10),
  totpCode: z.string().length(6),
});

const mfaConfirmSchema = z.object({
  totpCode: z.string().length(6),
});

const mfaRecoverySchema = z.object({
  mfaSessionToken: z.string().min(10),
  backupCode: z.string().min(6).max(16),
});

function isMobile(platformHeader?: string | string[]): boolean {
  const platform = String(platformHeader || '').toLowerCase();
  return ['android', 'flutter', 'ios'].includes(platform);
}

export async function authRoutes(fastify: FastifyInstance) {
  // 1. User Login Route (Tiered rate limit: 5 req/min + Anti-bot CAPTCHA)
  fastify.post('/login', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute'
      }
    },
    preHandler: [verifyCaptcha],
    schema: {
      tags: ['Authentication'],
      summary: 'Authenticate with email and password',
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          role: { type: 'string', enum: ['ADMIN', 'STAFF', 'TECHNICIAN', 'CUSTOMER'] }
        }
      }
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const parsed = loginSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'Invalid credentials format', requestId)
      );
    }

    const { email, password, role } = parsed.data;
    const tenantId = request.tenantId;

    // Query user in current tenant
    let queryText = 'SELECT * FROM users WHERE tenant_id = $1 AND email = $2';
    const params: any[] = [tenantId, email.toLowerCase().trim()];

    if (role) {
      queryText += ' AND role = $3';
      params.push(role);
    }

    const userRes = await pool.query(queryText, params);

    if (userRes.rows.length === 0) {
      return reply.status(401).send(
        errorResponse('INVALID_CREDENTIALS', 'Invalid email or password.', requestId)
      );
    }

    const user = userRes.rows[0];

    // Check account active state
    if (!user.is_active) {
      return reply.status(403).send(
        errorResponse('ACCOUNT_INACTIVE', 'This account has been deactivated. Please contact support.', requestId)
      );
    }

    // Check account lockout
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return reply.status(423).send(
        errorResponse('ACCOUNT_LOCKED', 'Account temporarily locked due to multiple failed attempts. Try again later.', requestId)
      );
    }

    // Verify password
    const valid = await AuthService.verifyPassword(password, user.password_hash);

    if (!valid) {
      const failed = user.failed_login_attempts + 1;
      let lockUpdate = 'failed_login_attempts = $1';
      const lockParams: any[] = [failed, user.id];

      // Lock after 5 consecutive failures for 15 minutes
      if (failed >= 5) {
        lockUpdate += ', locked_until = NOW() + INTERVAL \'15 minutes\'';
      }

      await pool.query(`UPDATE users SET ${lockUpdate} WHERE id = $2`, lockParams);

      return reply.status(401).send(
        errorResponse('INVALID_CREDENTIALS', 'Invalid email or password.', requestId)
      );
    }

    // Reset failed login attempts
    await pool.query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1', [user.id]);

    // Check if MFA enabled for user
    const mfaRes = await pool.query(
      'SELECT is_enabled FROM user_mfa_credentials WHERE user_id = $1 AND is_enabled = TRUE',
      [user.id]
    );

    if (mfaRes.rows.length > 0) {
      // Issue strictly scoped MFA challenge token (cannot be used for general API access)
      const mfaSessionToken = AuthService.generateMfaChallengeToken({
        id: user.id,
        role: user.role,
        tenantId: user.tenant_id,
        email: user.email
      });

      return reply.status(200).send(
        successResponse({
          status: 'MFA_REQUIRED',
          mfaSessionToken,
          userId: user.id,
        }, requestId)
      );
    }

    // Issue tokens
    const accessToken = AuthService.generateAccessToken({
      id: user.id,
      role: user.role,
      tenantId: user.tenant_id,
      email: user.email,
    });

    const ipAddress = request.ip;
    const userAgent = request.headers['user-agent'];
    const refreshToken = await AuthService.createSession(user.id, user.tenant_id, ipAddress, userAgent);

    // Set refresh token in HTTP-only cookie (Web clients)
    reply.setCookie('refresh_token', refreshToken, {
      path: '/api/v1/auth',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    const permissions = await AuthService.getUserPermissions(user.role);
    const mobileClient = isMobile(request.headers['x-client-platform']);

    return reply.status(200).send(
      successResponse({
        accessToken,
        ...(mobileClient ? { refreshToken } : {}),
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          tenantId: user.tenant_id,
        },
        permissions
      }, requestId)
    );
  });

  // 2. MFA Verification Route (Rate limited: 5 req/min)
  fastify.post('/mfa/verify', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute'
      }
    },
    schema: {
      tags: ['Authentication'],
      summary: 'Verify two-factor TOTP authentication code',
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const parsed = mfaVerifySchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'Invalid MFA verification payload', requestId)
      );
    }

    const { mfaSessionToken, totpCode } = parsed.data;

    try {
      const payload = AuthService.verifyMfaChallengeToken(mfaSessionToken);

      // Verify user is active and check lockout status (BACK-10)
      const userRes = await pool.query(
        'SELECT is_active, failed_login_attempts, locked_until FROM users WHERE id = $1',
        [payload.sub]
      );
      if (userRes.rows.length === 0 || !userRes.rows[0].is_active) {
        return reply.status(403).send(
          errorResponse('ACCOUNT_INACTIVE', 'This account has been deactivated.', requestId)
        );
      }

      const userRow = userRes.rows[0];
      if (userRow.locked_until && new Date(userRow.locked_until) > new Date()) {
        return reply.status(429).send(
          errorResponse('ACCOUNT_LOCKED', 'Account is temporarily locked due to multiple failed MFA attempts. Please try again later.', requestId)
        );
      }

      const valid = await AuthService.verifyTotpCode(payload.sub, totpCode);

      if (!valid) {
        const attempts = (userRow.failed_login_attempts || 0) + 1;
        const willLock = attempts >= 5;
        await pool.query(
          `UPDATE users 
           SET failed_login_attempts = $1, 
               locked_until = CASE WHEN $2 THEN NOW() + INTERVAL '15 minutes' ELSE locked_until END,
               updated_at = NOW()
           WHERE id = $3`,
          [attempts, willLock, payload.sub]
        );

        if (willLock) {
          return reply.status(429).send(
            errorResponse('ACCOUNT_LOCKED', 'Too many failed MFA verification attempts. Account locked for 15 minutes.', requestId)
          );
        }

        return reply.status(401).send(
          errorResponse('INVALID_TOTP_CODE', `The 6-digit verification code is invalid. ${5 - attempts} attempts remaining before temporary lockout.`, requestId)
        );
      }

      // Reset failure counter on successful verification
      await pool.query(
        `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE id = $1`,
        [payload.sub]
      );

      const accessToken = AuthService.generateAccessToken({
        id: payload.sub,
        role: payload.role,
        tenantId: payload.tenantId,
        email: payload.email,
      });

      const refreshToken = await AuthService.createSession(payload.sub, payload.tenantId, request.ip, request.headers['user-agent']);

      reply.setCookie('refresh_token', refreshToken, {
        path: '/api/v1/auth',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60,
      });

      const permissions = await AuthService.getUserPermissions(payload.role);
      const mobileClient = isMobile(request.headers['x-client-platform']);

      return reply.status(200).send(
        successResponse({
          accessToken,
          ...(mobileClient ? { refreshToken } : {}),
          user: {
            id: payload.sub,
            email: payload.email,
            role: payload.role,
            tenantId: payload.tenantId,
          },
          permissions
        }, requestId)
      );
    } catch {
      return reply.status(401).send(
        errorResponse('MFA_SESSION_EXPIRED', 'MFA session token expired or invalid. Please log in again.', requestId)
      );
    }
  });

  // 3. MFA Setup (Initiates 2FA setup, generates secret & QR code URI)
  fastify.post('/mfa/setup', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute'
      }
    },
    preHandler: [authenticate],
    schema: {
      tags: ['Authentication'],
      summary: 'Initiate TOTP MFA setup and retrieve authenticator URI',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const user = request.user!;
    const currentTotpCode = (request.body as any)?.currentTotpCode;

    try {
      const setupData = await AuthService.setupMfa(user.id, user.email, currentTotpCode);

      return reply.status(200).send(
        successResponse({
          secret: setupData.secret,
          otpAuthUrl: setupData.otpAuthUrl,
          instructions: 'Scan the QR code or enter the secret key into Google Authenticator or 1Password, then confirm with a 6-digit code.'
        }, requestId)
      );
    } catch (err: any) {
      if (err.message === 'CURRENT_MFA_REQUIRED') {
        return reply.status(400).send(
          errorResponse('CURRENT_MFA_REQUIRED', 'Active two-factor authentication is enabled on your account. Please provide your current 6-digit TOTP code in currentTotpCode to reconfigure MFA.', requestId)
        );
      }
      if (err.message === 'INVALID_CURRENT_TOTP') {
        return reply.status(401).send(
          errorResponse('INVALID_CURRENT_TOTP', 'Current 6-digit verification code is invalid.', requestId)
        );
      }
      throw err;
    }
  });

  // 4. MFA Confirm (Verifies code and permanently enables 2FA with backup codes)
  fastify.post('/mfa/confirm', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute'
      }
    },
    preHandler: [authenticate],
    schema: {
      tags: ['Authentication'],
      summary: 'Confirm and activate TOTP MFA with first 6-digit code',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const parsed = mfaConfirmSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'A valid 6-digit numeric TOTP code is required.', requestId)
      );
    }

    const { totpCode } = parsed.data;
    const user = request.user!;

    const result = await AuthService.confirmMfa(user.id, totpCode);

    if (!result.success) {
      return reply.status(400).send(
        errorResponse('INVALID_TOTP_CODE', 'Verification code failed. Please check the time on your authenticator device and try again.', requestId)
      );
    }

    return reply.status(200).send(
      successResponse({
        enabled: true,
        backupCodes: result.backupCodes,
        warning: 'Store these single-use emergency backup recovery codes in a secure location.'
      }, requestId)
    );
  });

  // 5. MFA Recovery Route (Fallback when user lost TOTP authenticator device)
  fastify.post('/mfa/recovery', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute'
      }
    },
    schema: {
      tags: ['Authentication'],
      summary: 'Recover account using a single-use emergency backup code',
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const parsed = mfaRecoverySchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'Invalid recovery payload. Both mfaSessionToken and backupCode are required.', requestId)
      );
    }

    const { mfaSessionToken, backupCode } = parsed.data;

    try {
      const payload = AuthService.verifyMfaChallengeToken(mfaSessionToken);

      // Verify user is active and check lockout status (BACK-10)
      const userRes = await pool.query(
        'SELECT is_active, failed_login_attempts, locked_until FROM users WHERE id = $1',
        [payload.sub]
      );
      if (userRes.rows.length === 0 || !userRes.rows[0].is_active) {
        return reply.status(403).send(
          errorResponse('ACCOUNT_INACTIVE', 'This account has been deactivated.', requestId)
        );
      }

      const userRow = userRes.rows[0];
      if (userRow.locked_until && new Date(userRow.locked_until) > new Date()) {
        return reply.status(429).send(
          errorResponse('ACCOUNT_LOCKED', 'Account is temporarily locked due to multiple failed MFA attempts. Please try again later.', requestId)
        );
      }

      const valid = await AuthService.verifyMfaRecovery(payload.sub, backupCode);

      if (!valid) {
        const attempts = (userRow.failed_login_attempts || 0) + 1;
        const willLock = attempts >= 5;
        await pool.query(
          `UPDATE users 
           SET failed_login_attempts = $1, 
               locked_until = CASE WHEN $2 THEN NOW() + INTERVAL '15 minutes' ELSE locked_until END,
               updated_at = NOW()
           WHERE id = $3`,
          [attempts, willLock, payload.sub]
        );

        if (willLock) {
          return reply.status(429).send(
            errorResponse('ACCOUNT_LOCKED', 'Too many failed emergency recovery attempts. Account locked for 15 minutes.', requestId)
          );
        }

        return reply.status(401).send(
          errorResponse('INVALID_BACKUP_CODE', `Emergency backup code is invalid or has already been used. ${5 - attempts} attempts remaining before temporary lockout.`, requestId)
        );
      }

      // Reset failure counter on successful recovery
      await pool.query(
        `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE id = $1`,
        [payload.sub]
      );

      const accessToken = AuthService.generateAccessToken({
        id: payload.sub,
        role: payload.role,
        tenantId: payload.tenantId,
        email: payload.email,
      });

      const refreshToken = await AuthService.createSession(payload.sub, payload.tenantId, request.ip, request.headers['user-agent']);

      reply.setCookie('refresh_token', refreshToken, {
        path: '/api/v1/auth',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60,
      });

      const permissions = await AuthService.getUserPermissions(payload.role);
      const mobileClient = isMobile(request.headers['x-client-platform']);

      return reply.status(200).send(
        successResponse({
          accessToken,
          ...(mobileClient ? { refreshToken } : {}),
          user: {
            id: payload.sub,
            email: payload.email,
            role: payload.role,
            tenantId: payload.tenantId,
          },
          permissions,
          recovered: true
        }, requestId)
      );
    } catch {
      return reply.status(401).send(
        errorResponse('MFA_SESSION_EXPIRED', 'MFA session token expired or invalid. Please log in again.', requestId)
      );
    }
  });

  // 6. Refresh Token Session Rotation Route
  fastify.post('/refresh', {
    schema: {
      tags: ['Authentication'],
      summary: 'Rotate session tokens',
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const rawRefreshToken = request.cookies.refresh_token || (request.body as any)?.refreshToken;

    if (!rawRefreshToken) {
      return reply.status(401).send(
        errorResponse('MISSING_REFRESH_TOKEN', 'Valid refresh token session cookie or body required.', requestId)
      );
    }

    const rotated = await AuthService.rotateSession(rawRefreshToken, request.ip, request.headers['user-agent']);

    if (!rotated) {
      return reply.status(401).send(
        errorResponse('SESSION_EXPIRED', 'Session expired or revoked. Please log in again.', requestId)
      );
    }

    reply.setCookie('refresh_token', rotated.newRefreshToken, {
      path: '/api/v1/auth',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
    });

    const permissions = await AuthService.getUserPermissions(rotated.user.role);
    const mobileClient = isMobile(request.headers['x-client-platform']);

    return reply.status(200).send(
      successResponse({
        accessToken: rotated.accessToken,
        ...(mobileClient ? { refreshToken: rotated.newRefreshToken } : {}),
        user: rotated.user,
        permissions
      }, requestId)
    );
  });

  // 7. Logout Route
  fastify.post('/logout', {
    schema: {
      tags: ['Authentication'],
      summary: 'Log out and invalidate session',
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const rawRefreshToken = request.cookies.refresh_token || (request.body as any)?.refreshToken;

    if (rawRefreshToken) {
      await AuthService.revokeSession(rawRefreshToken);
    }

    reply.clearCookie('refresh_token', { path: '/api/v1/auth' });

    return reply.status(200).send(
      successResponse({ loggedOut: true }, requestId)
    );
  });

  // 8. Current Authenticated User & Permissions
  fastify.get('/me', {
    preHandler: [authenticate],
    schema: {
      tags: ['Authentication'],
      summary: 'Get current authenticated user profile and permissions',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const userId = request.user!.id;

    const userRes = await pool.query(
      `SELECT u.id, u.email, u.phone, u.role, u.tenant_id, u.created_at,
              COALESCE(ap.full_name, sp.full_name, cp.full_name, pp.full_name, 'User') as full_name
       FROM users u
       LEFT JOIN admin_profiles ap ON ap.user_id = u.id
       LEFT JOIN staff_profiles sp ON sp.user_id = u.id
       LEFT JOIN customer_profiles cp ON cp.user_id = u.id
       LEFT JOIN provider_profiles pp ON pp.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    );

    if (userRes.rows.length === 0) {
      return reply.status(404).send(
        errorResponse('USER_NOT_FOUND', 'User record not found.', requestId)
      );
    }

    const user = userRes.rows[0];
    const permissions = await AuthService.getUserPermissions(user.role);

    return reply.status(200).send(
      successResponse({
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          tenantId: user.tenant_id,
          createdAt: user.created_at
        },
        tenant: request.tenant,
        permissions
      }, requestId)
    );
  });
}

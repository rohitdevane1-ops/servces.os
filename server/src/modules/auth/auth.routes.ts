import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { tenantQuery, withTenantTransaction } from '../../database/pool.js';
import { AuthService } from './auth.service.js';
import { successResponse, errorResponse } from '../../types/envelope.js';
import { authenticate } from '../../middleware/rbac.js';
import { verifyCaptcha } from '../../middleware/captcha.js';
import { blockInDemoMode, isDemoModeEnabled } from '../../middleware/demoGuard.js';
import { env } from '../../config/env.js';

function isLocalDevOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function isOriginAllowedForCookie(request: FastifyRequest): boolean {
  let candidateOrigin = request.headers.origin;
  if (!candidateOrigin && request.headers.referer) {
    try {
      candidateOrigin = new URL(request.headers.referer).origin;
    } catch {
      return false;
    }
  }
  if (!candidateOrigin) return true;
  const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
  if (allowedOrigins.includes(candidateOrigin)) return true;
  if (env.NODE_ENV !== 'production' && isLocalDevOrigin(candidateOrigin)) {
    return true;
  }
  return false;
}

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
  backupCode: z.string().min(6).max(32),
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

    const userRes = await tenantQuery(queryText, params, tenantId);

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
      await tenantQuery(
        `UPDATE users
         SET failed_login_attempts = CASE
               WHEN locked_until IS NOT NULL AND locked_until <= NOW() THEN 1
               ELSE COALESCE(failed_login_attempts, 0) + 1
             END,
             locked_until = CASE
               WHEN (CASE WHEN locked_until IS NOT NULL AND locked_until <= NOW() THEN 1 ELSE COALESCE(failed_login_attempts, 0) + 1 END) >= 5
               THEN NOW() + INTERVAL '15 minutes'
               ELSE NULL
             END,
             updated_at = NOW()
         WHERE id = $1`,
        [user.id],
        tenantId
      );

      return reply.status(401).send(
        errorResponse('INVALID_CREDENTIALS', 'Invalid email or password.', requestId)
      );
    }

    // Reset failed login attempts
    await tenantQuery('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1', [user.id], tenantId);

    // Check if MFA enabled for user
    const mfaRes = await tenantQuery(
      'SELECT is_enabled FROM user_mfa_credentials WHERE user_id = $1 AND is_enabled = TRUE',
      [user.id],
      tenantId
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
      if (request.tenantId && payload.tenantId !== request.tenantId) {
        return reply.status(403).send(
          errorResponse('CROSS_TENANT_FORBIDDEN', 'MFA challenge token belongs to another organization.', requestId)
        );
      }

      // Verify user is active and check lockout status (BACK-10)
      const userRes = await tenantQuery(
        'SELECT is_active, failed_login_attempts, locked_until FROM users WHERE id = $1 AND tenant_id = $2',
        [payload.sub, payload.tenantId],
        payload.tenantId
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

      const valid = await AuthService.verifyTotpCode(payload.sub, totpCode, payload.tenantId);

      if (!valid) {
        const failRes = await tenantQuery<{ failed_login_attempts: number; locked_until: Date | null }>(
          `UPDATE users
           SET failed_login_attempts = CASE
                 WHEN locked_until IS NOT NULL AND locked_until <= NOW() THEN 1
                 ELSE COALESCE(failed_login_attempts, 0) + 1
               END,
               locked_until = CASE
                 WHEN (CASE WHEN locked_until IS NOT NULL AND locked_until <= NOW() THEN 1 ELSE COALESCE(failed_login_attempts, 0) + 1 END) >= 5
                 THEN NOW() + INTERVAL '15 minutes'
                 ELSE NULL
               END,
               updated_at = NOW()
           WHERE id = $1
           RETURNING failed_login_attempts, locked_until`,
          [payload.sub],
          payload.tenantId
        );
        const attempts = failRes.rows[0]?.failed_login_attempts ?? 1;
        const willLock = attempts >= 5;

        if (willLock) {
          return reply.status(429).send(
            errorResponse('ACCOUNT_LOCKED', 'Too many failed MFA verification attempts. Account locked for 15 minutes.', requestId)
          );
        }

        return reply.status(401).send(
          errorResponse('INVALID_TOTP_CODE', `The 6-digit verification code is invalid. ${Math.max(0, 5 - attempts)} attempts remaining before temporary lockout.`, requestId)
        );
      }

      // Reset failure counter on successful verification
      await tenantQuery(
        `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE id = $1`,
        [payload.sub],
        payload.tenantId
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
    preHandler: [authenticate, blockInDemoMode('Modifying two-factor authentication')],
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
      const setupData = await AuthService.setupMfa(user.id, user.email, currentTotpCode, user.tenantId);

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
    preHandler: [authenticate, blockInDemoMode('Modifying two-factor authentication')],
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

    const result = await AuthService.confirmMfa(user.id, totpCode, user.tenantId);

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
      if (request.tenantId && payload.tenantId !== request.tenantId) {
        return reply.status(403).send(
          errorResponse('CROSS_TENANT_FORBIDDEN', 'MFA challenge token belongs to another organization.', requestId)
        );
      }

      // Verify user is active and check lockout status (BACK-10)
      const userRes = await tenantQuery(
        'SELECT is_active, failed_login_attempts, locked_until FROM users WHERE id = $1 AND tenant_id = $2',
        [payload.sub, payload.tenantId],
        payload.tenantId
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

      const valid = await AuthService.verifyMfaRecovery(payload.sub, backupCode, payload.tenantId);

      if (!valid) {
        const failRes = await tenantQuery<{ failed_login_attempts: number; locked_until: Date | null }>(
          `UPDATE users
           SET failed_login_attempts = CASE
                 WHEN locked_until IS NOT NULL AND locked_until <= NOW() THEN 1
                 ELSE COALESCE(failed_login_attempts, 0) + 1
               END,
               locked_until = CASE
                 WHEN (CASE WHEN locked_until IS NOT NULL AND locked_until <= NOW() THEN 1 ELSE COALESCE(failed_login_attempts, 0) + 1 END) >= 5
                 THEN NOW() + INTERVAL '15 minutes'
                 ELSE NULL
               END,
               updated_at = NOW()
           WHERE id = $1
           RETURNING failed_login_attempts, locked_until`,
          [payload.sub],
          payload.tenantId
        );
        const attempts = failRes.rows[0]?.failed_login_attempts ?? 1;
        const willLock = attempts >= 5;

        if (willLock) {
          return reply.status(429).send(
            errorResponse('ACCOUNT_LOCKED', 'Too many failed emergency recovery attempts. Account locked for 15 minutes.', requestId)
          );
        }

        return reply.status(401).send(
          errorResponse('INVALID_BACKUP_CODE', `Emergency backup code is invalid or has already been used. ${Math.max(0, 5 - attempts)} attempts remaining before temporary lockout.`, requestId)
        );
      }

      // Reset failure counter on successful recovery
      await tenantQuery(
        `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE id = $1`,
        [payload.sub],
        payload.tenantId
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
    const bodyToken = (request.body as any)?.refreshToken;
    const cookieToken = request.cookies.refresh_token;

    const rawRefreshToken = bodyToken || cookieToken;

    // Enforce CSRF origin check whenever the browser refresh_token cookie is actually used
    if (!bodyToken && cookieToken && !isOriginAllowedForCookie(request)) {
      return reply.status(403).send(
        errorResponse('CSRF_ORIGIN_MISMATCH', 'Cross-origin cookie refresh request rejected.', requestId)
      );
    }

    if (!rawRefreshToken) {
      return reply.status(401).send(
        errorResponse('MISSING_REFRESH_TOKEN', 'Valid refresh token session cookie or body required.', requestId)
      );
    }

    const rotated = await AuthService.rotateSession(rawRefreshToken, request.ip, request.headers['user-agent'], request.tenantId);

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
    const bodyToken = (request.body as any)?.refreshToken;
    const cookieToken = request.cookies.refresh_token;

    if (!bodyToken && cookieToken && !isOriginAllowedForCookie(request)) {
      return reply.status(403).send(
        errorResponse('CSRF_ORIGIN_MISMATCH', 'Cross-origin cookie logout request rejected.', requestId)
      );
    }

    const rawRefreshToken = bodyToken || cookieToken;

    if (rawRefreshToken) {
      await AuthService.revokeSession(rawRefreshToken, request.tenantId);
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

    const userRes = await tenantQuery(
      `SELECT u.id, u.email, u.phone, u.role, u.tenant_id, u.created_at,
              COALESCE(ap.full_name, sp.full_name, cp.full_name, pp.full_name, 'User') as full_name
       FROM users u
       LEFT JOIN admin_profiles ap ON ap.user_id = u.id
       LEFT JOIN staff_profiles sp ON sp.user_id = u.id
       LEFT JOIN customer_profiles cp ON cp.user_id = u.id
       LEFT JOIN provider_profiles pp ON pp.user_id = u.id
       WHERE u.id = $1`,
      [userId],
      request.user!.tenantId
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
          phone: user.phone ?? null,
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

  // 9. One-Click Demo Sandbox Login (Strictly disabled unless APP_DEMO_MODE=true)
  fastify.post('/demo-login', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    schema: {
      tags: ['Authentication'],
      summary: 'One-click sandbox login by role (only enabled when APP_DEMO_MODE=true)',
    },
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    if (!isDemoModeEnabled()) {
      return reply.status(403).send(
        errorResponse('DEMO_MODE_DISABLED', 'One-click demo login is only available in the interactive sandbox environment.', requestId)
      );
    }

    const demoRoleSchema = z.object({
      role: z.enum(['ADMIN', 'STAFF', 'CUSTOMER', 'TECHNICIAN']),
    });
    const parsed = demoRoleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'Valid demo role (ADMIN, STAFF, CUSTOMER, TECHNICIAN) is required.', requestId)
      );
    }

    const userRes = await tenantQuery(
      `SELECT id, email, role, tenant_id FROM users
       WHERE tenant_id = $1 AND role = $2 AND is_active = TRUE
       ORDER BY created_at ASC LIMIT 1`,
      [request.tenantId, parsed.data.role],
      request.tenantId
    );
    if (userRes.rows.length === 0) {
      return reply.status(404).send(
        errorResponse('DEMO_ACCOUNT_NOT_SEEDED', `No demo ${parsed.data.role} account found. Run npm run seed:demo first.`, requestId)
      );
    }

    const user = userRes.rows[0];
    const accessToken = AuthService.generateAccessToken({
      id: user.id,
      role: user.role,
      tenantId: user.tenant_id,
      email: user.email,
    });
    const refreshToken = await AuthService.createSession(user.id, user.tenant_id, request.ip, request.headers['user-agent']);

    reply.setCookie('refresh_token', refreshToken, {
      path: '/api/v1/auth',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
    });

    const permissions = await AuthService.getUserPermissions(user.role);
    const mobileClient = isMobile(request.headers['x-client-platform']);

    return reply.status(200).send(
      successResponse({
        accessToken,
        ...(mobileClient ? { refreshToken } : {}),
        demoMode: true,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          tenantId: user.tenant_id,
        },
        permissions,
      }, requestId)
    );
  });

  // 10. Authenticated Password Change (Blocked in Demo Mode to protect sandbox credentials)
  fastify.post('/change-password', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    preHandler: [authenticate, blockInDemoMode('Changing account passwords')],
    schema: {
      tags: ['Authentication'],
      summary: 'Change current user password (revokes existing refresh sessions)',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const changeSchema = z.object({
      currentPassword: z.string().min(8),
      newPassword: z.string().min(8).max(100),
    });
    const parsed = changeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'Current password and new password (min 8 characters) are required.', requestId)
      );
    }

    const userRes = await tenantQuery<{ id: string; password_hash: string }>(
      'SELECT id, password_hash FROM users WHERE id = $1 AND tenant_id = $2',
      [request.user!.id, request.tenantId],
      request.tenantId
    );
    if (userRes.rows.length === 0) {
      return reply.status(404).send(errorResponse('USER_NOT_FOUND', 'User not found.', requestId));
    }

    const valid = await AuthService.verifyPassword(parsed.data.currentPassword, userRes.rows[0].password_hash);
    if (!valid) {
      return reply.status(401).send(errorResponse('INVALID_CURRENT_PASSWORD', 'Current password is incorrect.', requestId));
    }

    const newHash = await AuthService.hashPassword(parsed.data.newPassword);
    await withTenantTransaction(request.tenantId, async (client) => {
      await client.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, request.user!.id]);
      await client.query('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [request.user!.id]);
    });

    return reply.status(200).send(
      successResponse({ changed: true, message: 'Password updated successfully.' }, requestId)
    );
  });

  // 11. Self-Service Customer Registration
  fastify.post('/register', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    preHandler: [verifyCaptcha],
    schema: {
      tags: ['Authentication'],
      summary: 'Register a new customer account within the active tenant',
    },
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;

    const registerSchema = z.object({
      email: z.string().trim().email().max(250),
      password: z.string().min(8).max(100),
      fullName: z.string().trim().min(2).max(150),
      phone: z.string().trim().min(5).max(40).optional(),
    });
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid registration payload.', requestId)
      );
    }

    const emailNormalized = parsed.data.email.toLowerCase();
    const passwordHash = await AuthService.hashPassword(parsed.data.password);

    let createdUser: { id: string; email: string; role: string; tenant_id: string };
    try {
      createdUser = await withTenantTransaction(tenantId, async (client) => {
        const uRes = await client.query<{ id: string; email: string; role: string; tenant_id: string }>(
          `INSERT INTO users (tenant_id, email, phone, password_hash, role, is_active, is_verified)
           VALUES ($1, $2, $3, $4, 'CUSTOMER', TRUE, TRUE)
           RETURNING id, email, role, tenant_id`,
          [tenantId, emailNormalized, parsed.data.phone || null, passwordHash]
        );
        const u = uRes.rows[0];
        await client.query(
          `INSERT INTO customer_profiles (user_id, tenant_id, full_name)
           VALUES ($1, $2, $3)`,
          [u.id, tenantId, parsed.data.fullName]
        );
        return u;
      });
    } catch (err: any) {
      if (err?.code === '23505') {
        return reply.status(409).send(
          errorResponse('EMAIL_ALREADY_REGISTERED', 'An account with this email already exists in this organization.', requestId)
        );
      }
      throw err;
    }

    const accessToken = AuthService.generateAccessToken({
      id: createdUser.id,
      role: createdUser.role,
      tenantId: createdUser.tenant_id,
      email: createdUser.email,
    });
    const refreshToken = await AuthService.createSession(
      createdUser.id,
      createdUser.tenant_id,
      request.ip,
      request.headers['user-agent']
    );

    reply.setCookie('refresh_token', refreshToken, {
      path: '/api/v1/auth',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
    });

    const permissions = await AuthService.getUserPermissions(createdUser.role);
    const mobileClient = isMobile(request.headers['x-client-platform']);

    return reply.status(201).send(
      successResponse({
        accessToken,
        ...(mobileClient ? { refreshToken } : {}),
        user: {
          id: createdUser.id,
          email: createdUser.email,
          fullName: parsed.data.fullName,
          phone: parsed.data.phone || null,
          role: createdUser.role,
          tenantId: createdUser.tenant_id,
        },
        permissions,
      }, requestId)
    );
  });

  // 12. Forgot Password (Anti-Enumeration)
  fastify.post('/forgot-password', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    preHandler: [verifyCaptcha],
    schema: {
      tags: ['Authentication'],
      summary: 'Initiate password reset flow (anti-enumeration)',
    },
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;

    const schema = z.object({ email: z.string().trim().email() });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'Valid email address is required.', requestId)
      );
    }

    const emailNormalized = parsed.data.email.toLowerCase();
    const userRes = await tenantQuery<{ id: string; email: string; is_active: boolean }>(
      `SELECT id, email, is_active FROM users WHERE tenant_id = $1 AND email = $2 LIMIT 1`,
      [tenantId, emailNormalized],
      tenantId
    );

    if (userRes.rows.length > 0 && userRes.rows[0].is_active) {
      await AuthService.createPasswordResetToken(
        tenantId,
        userRes.rows[0].id,
        userRes.rows[0].email,
        request.ip
      );
    }

    return reply.status(200).send(
      successResponse({
        requested: true,
        message: 'If an account with that email exists, password reset instructions have been issued.',
      }, requestId)
    );
  });

  // 13. Consume Password Reset Token
  fastify.post('/reset-password', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    schema: {
      tags: ['Authentication'],
      summary: 'Reset account password using a single-use token',
    },
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const schema = z.object({
      token: z.string().trim().min(20).max(256),
      newPassword: z.string().min(8).max(100),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'Valid reset token and newPassword (min 8 chars) are required.', requestId)
      );
    }

    const outcome = await AuthService.consumePasswordResetToken(
      parsed.data.token,
      parsed.data.newPassword,
      request.tenantId,
      request.ip
    );

    if (!outcome.ok) {
      return reply.status(400).send(
        errorResponse(outcome.code, outcome.message, requestId)
      );
    }

    return reply.status(200).send(
      successResponse({ reset: true, message: 'Password has been reset and existing sessions revoked.' }, requestId)
    );
  });

  // 14. Disable MFA (Requires Current Password + Active TOTP or Backup Code)
  fastify.post('/mfa/disable', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    preHandler: [authenticate, blockInDemoMode('Disabling two-factor authentication')],
    schema: {
      tags: ['Authentication'],
      summary: 'Disable two-factor authentication for the current user',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const disableSchema = z.object({
      currentPassword: z.string().min(8),
      totpCode: z.string().length(6).optional(),
      backupCode: z.string().min(6).max(32).optional(),
    }).refine((d) => Boolean(d.totpCode || d.backupCode), {
      message: 'Either totpCode or backupCode is required to disable MFA.',
    });

    const parsed = disableSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid MFA disable payload.', requestId)
      );
    }

    const outcome = await AuthService.disableMfa(request.user!.id, request.tenantId, {
      currentPassword: parsed.data.currentPassword,
      totpCode: parsed.data.totpCode,
      backupCode: parsed.data.backupCode,
      ipAddress: request.ip,
    });

    if (!outcome.ok) {
      return reply.status(outcome.status).send(
        errorResponse(outcome.code, outcome.message, requestId)
      );
    }

    return reply.status(200).send(
      successResponse({ disabled: true, message: 'Two-factor authentication has been disabled.' }, requestId)
    );
  });

  // 15. Re-authenticate Current User (Server-Backed Lock Screen Unlock)
  fastify.post('/reauthenticate', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    preHandler: [authenticate],
    schema: {
      tags: ['Authentication'],
      summary: 'Re-verify password for active session lock-screen unlock',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const schema = z.object({ password: z.string().min(1) });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'Password is required.', requestId)
      );
    }

    const userRes = await tenantQuery<{ password_hash: string; is_active: boolean }>(
      'SELECT password_hash, is_active FROM users WHERE id = $1 AND tenant_id = $2',
      [request.user!.id, request.tenantId],
      request.tenantId
    );
    if (userRes.rows.length === 0 || !userRes.rows[0].is_active) {
      return reply.status(401).send(
        errorResponse('INVALID_CREDENTIALS', 'Account is unavailable.', requestId)
      );
    }

    const valid = await AuthService.verifyPassword(parsed.data.password, userRes.rows[0].password_hash);
    if (!valid) {
      return reply.status(401).send(
        errorResponse('INVALID_CREDENTIALS', 'Password verification failed.', requestId)
      );
    }

    return reply.status(200).send(
      successResponse({ verified: true, verifiedAt: new Date().toISOString() }, requestId)
    );
  });
}

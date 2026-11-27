import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import { pool, tenantQuery, withTenantTransaction, getActiveTenantId } from '../../database/pool.js';
import pg from 'pg';
import { env } from '../../config/env.js';

export type PasswordResetNotifier = (info: {
  tenantId: string;
  userId: string;
  email: string;
  token: string;
  expiresAt: Date;
}) => void | Promise<void>;

let passwordResetNotifier: PasswordResetNotifier | null = null;

/** Register a callback (used in tests or mail dispatch hooks) when a reset token is issued. */
export function setPasswordResetNotifierForTest(fn: PasswordResetNotifier | null): void {
  passwordResetNotifier = fn;
}

export interface UserAuthRecord {
  id: string;
  tenant_id: string;
  email: string;
  phone: string | null;
  password_hash: string;
  role: 'ADMIN' | 'STAFF' | 'TECHNICIAN' | 'CUSTOMER';
  is_active: boolean;
  is_verified: boolean;
  failed_login_attempts: number;
  locked_until: Date | null;
}

export class AuthService {
  private static readonly SALT_ROUNDS = 12;

  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  static generateAccessToken(user: { id?: string; sub?: string; role: string; tenantId: string; email: string; sessionId?: string }): string {
    return jwt.sign(
      {
        sub: user.id || user.sub,
        role: user.role,
        tenantId: user.tenantId,
        email: user.email,
        ...(user.sessionId ? { sid: user.sessionId } : {}),
        tokenType: 'ACCESS_TOKEN',
      },
      env.JWT_ACCESS_SECRET,
      { expiresIn: env.JWT_ACCESS_EXPIRY_SECONDS }
    );
  }

  static generateMfaChallengeToken(user: { id?: string; sub?: string; role: string; tenantId: string; email: string }): string {
    return jwt.sign(
      {
        sub: user.id || user.sub,
        role: user.role,
        tenantId: user.tenantId,
        email: user.email,
        tokenType: 'MFA_CHALLENGE',
      },
      env.JWT_ACCESS_SECRET,
      { expiresIn: 300 } // 5 minutes validity for challenge completion
    );
  }

  static generateRefreshToken(): string {
    return crypto.randomBytes(40).toString('hex');
  }

  static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  static verifyAccessToken(token: string): { sub: string; role: string; tenantId: string; email: string; sid?: string; tokenType?: string } {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as any;
    if (payload.tokenType === 'MFA_CHALLENGE') {
      throw new Error('MFA_CHALLENGE_TOKEN_NOT_AUTHORIZED');
    }
    if (payload.tokenType && payload.tokenType !== 'ACCESS_TOKEN') {
      throw new Error('INVALID_ACCESS_TOKEN_TYPE');
    }
    return payload;
  }

  static verifyMfaChallengeToken(token: string): { sub: string; role: string; tenantId: string; email: string } {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as any;
    if (payload.tokenType !== 'MFA_CHALLENGE') {
      throw new Error('INVALID_MFA_CHALLENGE_TOKEN');
    }
    return payload;
  }

  private static getEncryptionKey(): Buffer {
    const rawKey = env.APP_ENCRYPTION_KEY;
    if (!rawKey || !/^[0-9a-f]{64}$/i.test(rawKey)) {
      throw new Error('INVALID_APP_ENCRYPTION_KEY: Must be a 64-character hex string (32 bytes).');
    }
    return Buffer.from(rawKey, 'hex');
  }

  static encryptSecret(plaintext: string): string {
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  static decryptSecret(encryptedPayload: string): string {
    const parts = encryptedPayload.split(':');
    if (parts.length !== 3) {
      throw new Error('INVALID_ENCRYPTED_PAYLOAD_FORMAT: Expected iv:authTag:ciphertext');
    }
    const [ivHex, authTagHex, encryptedText] = parts;
    if (!/^[0-9a-f]{24}$/i.test(ivHex) || !/^[0-9a-f]{32}$/i.test(authTagHex) || !/^[0-9a-f]+$/i.test(encryptedText)) {
      throw new Error('CORRUPTED_ENCRYPTION_METADATA');
    }
    const key = this.getEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  static encryptTotpSecret(secret: string): string {
    return this.encryptSecret(secret);
  }

  static decryptTotpSecret(encryptedPayload: string): string {
    return this.decryptSecret(encryptedPayload);
  }

  static hashBackupCode(code: string): string {
    const key = this.getEncryptionKey();
    return crypto.createHmac('sha256', key).update(code.trim().toUpperCase()).digest('hex');
  }

  static generateBackupCodes(count: number = 8): { rawCodes: string[]; hashedCodes: string[] } {
    const rawCodes: string[] = [];
    const hashedCodes: string[] = [];
    for (let i = 0; i < count; i++) {
      // 10 random bytes = 80 bits of cryptographic entropy
      const raw = crypto.randomBytes(10).toString('hex').toUpperCase();
      const formatted = `${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}-${raw.slice(15, 20)}`;
      rawCodes.push(formatted);
      hashedCodes.push(this.hashBackupCode(formatted));
    }
    return { rawCodes, hashedCodes };
  }

  static async createSessionWithMeta(userId: string, tenantId: string, ipAddress?: string, userAgent?: string): Promise<{
    refreshToken: string;
    sessionId: string;
    sessionCreatedAt: string;
  }> {
    const rawRefreshToken = this.generateRefreshToken();
    const tokenHash = this.hashToken(rawRefreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + env.JWT_REFRESH_EXPIRY_DAYS);

    const res = await tenantQuery<{ id: string; created_at: string }>(
      `INSERT INTO user_sessions (user_id, tenant_id, refresh_token_hash, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [userId, tenantId, tokenHash, ipAddress || null, userAgent || null, expiresAt],
      tenantId
    );

    return {
      refreshToken: rawRefreshToken,
      sessionId: res.rows[0].id,
      sessionCreatedAt: new Date(res.rows[0].created_at).toISOString(),
    };
  }

  static async createSession(userId: string, tenantId: string, ipAddress?: string, userAgent?: string): Promise<string> {
    const meta = await this.createSessionWithMeta(userId, tenantId, ipAddress, userAgent);
    return meta.refreshToken;
  }

  static async rotateSession(rawRefreshToken: string, ipAddress?: string, userAgent?: string, expectedTenantId?: string): Promise<{
    locked?: false;
    accessToken: string;
    newRefreshToken: string;
    sessionId: string;
    sessionCreatedAt: string;
    user: { id: string; role: string; tenantId: string; email: string; mfaEnabled: boolean };
  } | {
    locked: true;
    user: { id: string; role: string; tenantId: string; email: string };
  } | null> {
    const tokenHash = this.hashToken(rawRefreshToken);
    let tenantId = expectedTenantId;
    if (!tenantId) {
      const tRes = await pool.query<{ tenant_id: string | null }>(
        'SELECT rls_resolve_session_tenant($1) AS tenant_id',
        [tokenHash]
      );
      tenantId = tRes.rows[0]?.tenant_id ?? undefined;
    }
    if (!tenantId) {
      return null;
    }

    return withTenantTransaction(tenantId, async (client) => {
      const sessionRes = await client.query(
        `SELECT s.id, s.user_id, s.tenant_id, s.expires_at, s.revoked_at, s.locked_at, s.created_at,
                u.email, u.role, u.is_active,
                COALESCE(mfa.is_enabled, FALSE) AS mfa_enabled
         FROM user_sessions s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN user_mfa_credentials mfa ON mfa.user_id = u.id
         WHERE s.refresh_token_hash = $1
         FOR UPDATE OF s`,
        [tokenHash]
      );

      if (sessionRes.rows.length === 0) {
        return null;
      }

      const session = sessionRes.rows[0];
      if (expectedTenantId && session.tenant_id !== expectedTenantId) {
        return null;
      }

      // Replay Detection: Revoke entire token family if already revoked
      if (session.revoked_at) {
        await client.query(
          'UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
          [session.user_id]
        );
        return null;
      }

      // Check expiry or inactive user
      if (new Date(session.expires_at) < new Date() || !session.is_active) {
        await client.query('UPDATE user_sessions SET revoked_at = NOW() WHERE id = $1', [session.id]);
        return null;
      }

      // Server-backed lock screen: refuse silent refresh until password reauthentication unlocks
      if (session.locked_at) {
        return {
          locked: true as const,
          user: {
            id: session.user_id,
            role: session.role,
            tenantId: session.tenant_id,
            email: session.email,
          },
        };
      }

      // Revoke old session immediately
      await client.query(
        'UPDATE user_sessions SET revoked_at = NOW() WHERE id = $1',
        [session.id]
      );

      const user = {
        id: session.user_id,
        role: session.role,
        tenantId: session.tenant_id,
        email: session.email,
        mfaEnabled: Boolean(session.mfa_enabled),
      };

      const rawNewRefreshToken = this.generateRefreshToken();
      const newTokenHash = this.hashToken(rawNewRefreshToken);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + env.JWT_REFRESH_EXPIRY_DAYS);

      const newSessRes = await client.query<{ id: string; created_at: string }>(
        `INSERT INTO user_sessions (user_id, tenant_id, refresh_token_hash, ip_address, user_agent, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, created_at`,
        [user.id, user.tenantId, newTokenHash, ipAddress || null, userAgent || null, expiresAt]
      );

      const newAccessToken = this.generateAccessToken({
        ...user,
        sessionId: newSessRes.rows[0].id,
      });

      return {
        accessToken: newAccessToken,
        newRefreshToken: rawNewRefreshToken,
        sessionId: newSessRes.rows[0].id,
        sessionCreatedAt: new Date(newSessRes.rows[0].created_at).toISOString(),
        user,
      };
    });
  }

  static async revokeSession(rawRefreshToken: string, expectedTenantId?: string): Promise<void> {
    const tokenHash = this.hashToken(rawRefreshToken);
    let tenantId = expectedTenantId;
    if (!tenantId) {
      const tRes = await pool.query<{ tenant_id: string | null }>(
        'SELECT rls_resolve_session_tenant($1) AS tenant_id',
        [tokenHash]
      );
      tenantId = tRes.rows[0]?.tenant_id ?? undefined;
    }
    if (!tenantId) {
      return;
    }
    await tenantQuery(
      'UPDATE user_sessions SET revoked_at = NOW() WHERE refresh_token_hash = $1',
      [tokenHash],
      tenantId
    );
  }

  static async getUserPermissions(role: string): Promise<string[]> {
    const res = await pool.query<{ permission_id: string }>(
      'SELECT permission_id FROM role_permissions WHERE role = $1',
      [role]
    );
    return res.rows.map(r => r.permission_id);
  }

  static async verifyTotpCode(userId: string, code: string, tenantId?: string): Promise<boolean> {
    const res = await tenantQuery<{ totp_secret_encrypted: string }>(
      'SELECT totp_secret_encrypted FROM user_mfa_credentials WHERE user_id = $1 AND is_enabled = TRUE',
      [userId],
      tenantId
    );
    if (res.rows.length === 0) return false;

    const rawOrEncrypted = res.rows[0].totp_secret_encrypted;
    const secret = this.decryptTotpSecret(rawOrEncrypted);
    return authenticator.check(code, secret);
  }

  static async setupMfa(userId: string, email: string, currentTotpCode?: string, tenantId?: string): Promise<{ secret: string; otpAuthUrl: string }> {
    const existing = await tenantQuery<{ is_enabled: boolean; totp_secret_encrypted: string }>(
      'SELECT is_enabled, totp_secret_encrypted FROM user_mfa_credentials WHERE user_id = $1',
      [userId],
      tenantId
    );

    if (existing.rows.length > 0 && existing.rows[0].is_enabled) {
      if (!currentTotpCode) {
        throw new Error('CURRENT_MFA_REQUIRED');
      }
      const currentSecret = this.decryptTotpSecret(existing.rows[0].totp_secret_encrypted);
      const isCurrentValid = authenticator.check(currentTotpCode, currentSecret);
      if (!isCurrentValid) {
        throw new Error('INVALID_CURRENT_TOTP');
      }
    }

    const secret = authenticator.generateSecret();
    const otpAuthUrl = authenticator.keyuri(email, 'ServicePro OS', secret);
    const encryptedSecret = this.encryptTotpSecret(secret);

    if (existing.rows.length > 0 && existing.rows[0].is_enabled) {
      // Zero-downtime: stage the replacement secret without disabling the active MFA factor
      await tenantQuery(
        'UPDATE user_mfa_credentials SET pending_totp_secret_encrypted = $1 WHERE user_id = $2',
        [encryptedSecret, userId],
        tenantId
      );
    } else {
      // First-time MFA setup
      await tenantQuery(
        `INSERT INTO user_mfa_credentials (user_id, totp_secret_encrypted, is_enabled, backup_codes_hashed)
         VALUES ($1, $2, FALSE, '[]'::jsonb)
         ON CONFLICT (user_id) 
         DO UPDATE SET totp_secret_encrypted = EXCLUDED.totp_secret_encrypted, is_enabled = FALSE`,
        [userId, encryptedSecret],
        tenantId
      );
    }

    return { secret, otpAuthUrl };
  }

  static async confirmMfa(userId: string, totpCode: string, tenantId?: string): Promise<{ success: boolean; backupCodes?: string[] }> {
    const res = await tenantQuery<{ totp_secret_encrypted: string; pending_totp_secret_encrypted: string | null }>(
      'SELECT totp_secret_encrypted, pending_totp_secret_encrypted FROM user_mfa_credentials WHERE user_id = $1',
      [userId],
      tenantId
    );
    if (res.rows.length === 0) return { success: false };

    const cred = res.rows[0];
    const targetEncrypted = cred.pending_totp_secret_encrypted || cred.totp_secret_encrypted;
    const secret = this.decryptTotpSecret(targetEncrypted);
    const isValid = authenticator.check(totpCode, secret);
    if (!isValid) {
      return { success: false };
    }

    const { rawCodes, hashedCodes } = this.generateBackupCodes(8);

    await tenantQuery(
      `UPDATE user_mfa_credentials
       SET totp_secret_encrypted = $1,
           pending_totp_secret_encrypted = NULL,
           is_enabled = TRUE,
           confirmed_at = NOW(),
           backup_codes_hashed = $2::jsonb
       WHERE user_id = $3`,
      [targetEncrypted, JSON.stringify(hashedCodes), userId],
      tenantId
    );

    return { success: true, backupCodes: rawCodes };
  }

  static async verifyMfaRecovery(userId: string, backupCode: string, tenantId?: string): Promise<boolean> {
    const rawClean = backupCode.trim().toUpperCase();
    const normalizedDigits = rawClean.replace(/[^0-9A-Z]/g, '');
    const formatted = normalizedDigits.length === 20
      ? `${normalizedDigits.slice(0, 5)}-${normalizedDigits.slice(5, 10)}-${normalizedDigits.slice(10, 15)}-${normalizedDigits.slice(15, 20)}`
      : rawClean;

    const codeHash1 = this.hashBackupCode(rawClean);
    const codeHash2 = this.hashBackupCode(formatted);
    const legacyHash = this.hashToken(rawClean);

    const runRecovery = async (client: pg.PoolClient): Promise<boolean> => {
      const res = await client.query<{ backup_codes_hashed: string[] }>(
        'SELECT backup_codes_hashed FROM user_mfa_credentials WHERE user_id = $1 AND is_enabled = TRUE FOR UPDATE',
        [userId]
      );

      if (res.rows.length === 0) {
        return false;
      }

      const storedHashes: string[] = Array.isArray(res.rows[0].backup_codes_hashed)
        ? res.rows[0].backup_codes_hashed
        : [];

      let matchIndex = storedHashes.indexOf(codeHash1);
      if (matchIndex === -1) matchIndex = storedHashes.indexOf(codeHash2);
      if (matchIndex === -1) matchIndex = storedHashes.indexOf(legacyHash);

      if (matchIndex === -1) {
        return false;
      }

      // One-time atomic use: remove used backup code
      storedHashes.splice(matchIndex, 1);

      await client.query(
        'UPDATE user_mfa_credentials SET backup_codes_hashed = $1::jsonb WHERE user_id = $2',
        [JSON.stringify(storedHashes), userId]
      );

      return true;
    };

    const effectiveTenantId = tenantId ?? getActiveTenantId();
    if (effectiveTenantId) {
      return withTenantTransaction(effectiveTenantId, runRecovery);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ok = await runRecovery(client);
      await client.query(ok ? 'COMMIT' : 'ROLLBACK');
      return ok;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  static async createPasswordResetToken(
    tenantId: string,
    userId: string,
    email: string,
    ipAddress?: string
  ): Promise<void> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const safeIp = ipAddress && /^[0-9a-f.:]+$/i.test(ipAddress) ? ipAddress : null;

    let notifLogId: string | null = null;
    await withTenantTransaction(tenantId, async (client) => {
      await client.query(
        `UPDATE password_reset_tokens
         SET used_at = NOW()
         WHERE user_id = $1 AND tenant_id = $2 AND used_at IS NULL`,
        [userId, tenantId]
      );

      await client.query(
        `INSERT INTO password_reset_tokens (tenant_id, user_id, token_hash, expires_at, requested_ip)
         VALUES ($1, $2, $3, $4, $5)`,
        [tenantId, userId, tokenHash, expiresAt, safeIp]
      );

      const logRes = await client.query<{ id: string }>(
        `INSERT INTO notification_logs (tenant_id, recipient_user_id, channel, template_type, destination, status)
         VALUES ($1, $2, 'EMAIL', 'PASSWORD_RESET', $3, 'PENDING')
         RETURNING id`,
        [tenantId, userId, email]
      );
      notifLogId = logRes.rows[0]?.id || null;
    });

    if (passwordResetNotifier) {
      await passwordResetNotifier({ tenantId, userId, email, token: rawToken, expiresAt });
    }

    const resendKey = process.env.RESEND_API_KEY?.trim();
    if (notifLogId && resendKey && !resendKey.includes('your_resend') && env.NODE_ENV !== 'test') {
      try {
        const resetUrl = `${env.APP_BASE_URL.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(rawToken)}`;
        const mailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: env.SES_FROM_EMAIL || 'support@serviceproos.com',
            to: [email],
            subject: 'ServiceOS Password Reset Request',
            html: `<p>Use the following link to reset your ServiceOS password (valid for 15 minutes):</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
          }),
          signal: AbortSignal.timeout(8000),
        });
        const mailData: any = await mailRes.json().catch(() => ({}));
        if (mailRes.ok && mailData?.id) {
          await tenantQuery(
            `UPDATE notification_logs SET status = 'SENT', provider_response_id = $2 WHERE id = $1`,
            [notifLogId, String(mailData.id)],
            tenantId
          );
        } else {
          await tenantQuery(
            `UPDATE notification_logs SET status = 'FAILED', error_message = $2 WHERE id = $1`,
            [notifLogId, mailData?.message || `Email provider returned status ${mailRes.status}`],
            tenantId
          );
        }
      } catch (err: any) {
        await tenantQuery(
          `UPDATE notification_logs SET status = 'FAILED', error_message = $2 WHERE id = $1`,
          [notifLogId, err?.message || 'Email dispatch network error'],
          tenantId
        ).catch(() => {});
      }
    }
  }

  static async consumePasswordResetToken(
    rawToken: string,
    newPassword: string,
    expectedTenantId?: string,
    ipAddress?: string
  ): Promise<{ ok: true; userId: string; tenantId: string } | { ok: false; code: string; message: string }> {
    const tokenHash = this.hashToken(rawToken.trim());
    const tRes = await pool.query<{ tenant_id: string | null }>(
      'SELECT rls_resolve_password_reset_tenant($1) AS tenant_id',
      [tokenHash]
    );
    const resolvedTenantId = tRes.rows[0]?.tenant_id;

    if (!resolvedTenantId || (expectedTenantId && resolvedTenantId !== expectedTenantId)) {
      return {
        ok: false,
        code: 'INVALID_OR_EXPIRED_RESET_TOKEN',
        message: 'Password reset token is invalid or has expired.',
      };
    }

    const newHash = await this.hashPassword(newPassword);
    const safeIp = ipAddress && /^[0-9a-f.:]+$/i.test(ipAddress) ? ipAddress : null;

    return withTenantTransaction(resolvedTenantId, async (client) => {
      const tokRes = await client.query<{
        id: string;
        user_id: string;
        expires_at: Date;
        used_at: Date | null;
      }>(
        `SELECT prt.id, prt.user_id, prt.expires_at, prt.used_at
         FROM password_reset_tokens prt
         JOIN users u ON u.id = prt.user_id AND u.tenant_id = prt.tenant_id
         WHERE prt.token_hash = $1 AND prt.tenant_id = $2 AND u.is_active = TRUE
         FOR UPDATE`,
        [tokenHash, resolvedTenantId]
      );

      if (tokRes.rows.length === 0) {
        return {
          ok: false,
          code: 'INVALID_OR_EXPIRED_RESET_TOKEN',
          message: 'Password reset token is invalid or has expired.',
        };
      }

      const row = tokRes.rows[0];
      if (row.used_at || new Date(row.expires_at).getTime() <= Date.now()) {
        return {
          ok: false,
          code: 'INVALID_OR_EXPIRED_RESET_TOKEN',
          message: 'Password reset token is invalid or has expired.',
        };
      }

      await client.query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`, [row.id]);
      await client.query(
        `UPDATE users
         SET password_hash = $1, failed_login_attempts = 0, locked_until = NULL, updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [newHash, row.user_id, resolvedTenantId]
      );
      await client.query(
        `UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
        [row.user_id]
      );
      await client.query(
        `INSERT INTO audit_logs (tenant_id, actor_id, action, resource_type, resource_id, ip_address, diff_payload)
         VALUES ($1, $2, 'PASSWORD_RESET', 'user', $3, $4, '{"sessionsRevoked":true}'::jsonb)`,
        [resolvedTenantId, row.user_id, row.user_id, safeIp]
      );

      return { ok: true, userId: row.user_id, tenantId: resolvedTenantId };
    });
  }

  static async disableMfa(
    userId: string,
    tenantId: string,
    opts: { currentPassword: string; totpCode?: string; backupCode?: string; ipAddress?: string }
  ): Promise<{ ok: true } | { ok: false; status: number; code: string; message: string }> {
    const userRes = await tenantQuery<{ password_hash: string; role: string }>(
      'SELECT password_hash, role FROM users WHERE id = $1 AND tenant_id = $2',
      [userId, tenantId],
      tenantId
    );
    if (userRes.rows.length === 0) {
      return { ok: false, status: 404, code: 'USER_NOT_FOUND', message: 'User record not found.' };
    }

    const validPass = await this.verifyPassword(opts.currentPassword, userRes.rows[0].password_hash);
    if (!validPass) {
      return { ok: false, status: 401, code: 'INVALID_CURRENT_PASSWORD', message: 'Current password is incorrect.' };
    }

    const mfaRes = await tenantQuery<{ is_enabled: boolean; totp_secret_encrypted: string }>(
      'SELECT is_enabled, totp_secret_encrypted FROM user_mfa_credentials WHERE user_id = $1',
      [userId],
      tenantId
    );
    if (mfaRes.rows.length === 0 || !mfaRes.rows[0].is_enabled) {
      return {
        ok: false,
        status: 400,
        code: 'MFA_NOT_ENABLED',
        message: 'Two-factor authentication is not currently enabled on this account.',
      };
    }

    let verifiedSecondFactor = false;
    if (opts.totpCode && mfaRes.rows[0].totp_secret_encrypted) {
      const secret = this.decryptSecret(mfaRes.rows[0].totp_secret_encrypted);
      verifiedSecondFactor = authenticator.check(opts.totpCode, secret);
    } else if (opts.backupCode) {
      verifiedSecondFactor = await this.verifyMfaRecovery(userId, opts.backupCode, tenantId);
    }

    if (!verifiedSecondFactor) {
      return {
        ok: false,
        status: 401,
        code: 'INVALID_MFA_CODE',
        message: 'Invalid verification or recovery code.',
      };
    }

    const safeIp = opts.ipAddress && /^[0-9a-f.:]+$/i.test(opts.ipAddress) ? opts.ipAddress : null;
    await withTenantTransaction(tenantId, async (client) => {
      await client.query(
        `UPDATE user_mfa_credentials
         SET is_enabled = FALSE,
             totp_secret_encrypted = '',
             pending_totp_secret_encrypted = NULL,
             backup_codes_hashed = '[]'::jsonb,
             confirmed_at = NULL
         WHERE user_id = $1`,
        [userId]
      );
      await client.query(
        `INSERT INTO audit_logs (tenant_id, actor_id, actor_role, action, resource_type, resource_id, ip_address, diff_payload)
         VALUES ($1, $2, $3, 'MFA_DISABLED', 'user', $4, $5, '{"disabled":true}'::jsonb)`,
        [tenantId, userId, userRes.rows[0].role, userId, safeIp]
      );
    });

    return { ok: true };
  }
}

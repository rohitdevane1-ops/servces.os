import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import { pool } from '../../database/pool.js';
import { env } from '../../config/env.js';

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

  static generateAccessToken(user: { id?: string; sub?: string; role: string; tenantId: string; email: string }): string {
    return jwt.sign(
      {
        sub: user.id || user.sub,
        role: user.role,
        tenantId: user.tenantId,
        email: user.email,
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

  static verifyAccessToken(token: string): { sub: string; role: string; tenantId: string; email: string; tokenType?: string } {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as any;
    if (payload.tokenType === 'MFA_CHALLENGE') {
      throw new Error('MFA_CHALLENGE_TOKEN_NOT_AUTHORIZED');
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

  static encryptTotpSecret(secret: string): string {
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(secret, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  static decryptTotpSecret(encryptedPayload: string): string {
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

  static async createSession(userId: string, tenantId: string, ipAddress?: string, userAgent?: string): Promise<string> {
    const rawRefreshToken = this.generateRefreshToken();
    const tokenHash = this.hashToken(rawRefreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + env.JWT_REFRESH_EXPIRY_DAYS);

    await pool.query(
      `INSERT INTO user_sessions (user_id, tenant_id, refresh_token_hash, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, tenantId, tokenHash, ipAddress || null, userAgent || null, expiresAt]
    );

    return rawRefreshToken;
  }

  static async rotateSession(rawRefreshToken: string, ipAddress?: string, userAgent?: string): Promise<{
    accessToken: string;
    newRefreshToken: string;
    user: { id: string; role: string; tenantId: string; email: string };
  } | null> {
    const tokenHash = this.hashToken(rawRefreshToken);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const sessionRes = await client.query(
        `SELECT s.id, s.user_id, s.tenant_id, s.expires_at, s.revoked_at,
                u.email, u.role, u.is_active
         FROM user_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.refresh_token_hash = $1
         FOR UPDATE OF s`,
        [tokenHash]
      );

      if (sessionRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const session = sessionRes.rows[0];

      // Replay Detection: Revoke entire token family if already revoked
      if (session.revoked_at) {
        await client.query(
          'UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
          [session.user_id]
        );
        await client.query('COMMIT');
        return null;
      }

      // Check expiry or inactive user
      if (new Date(session.expires_at) < new Date() || !session.is_active) {
        await client.query('UPDATE user_sessions SET revoked_at = NOW() WHERE id = $1', [session.id]);
        await client.query('COMMIT');
        return null;
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
      };

      // Generate new pair within the locked transaction
      const newAccessToken = this.generateAccessToken(user);
      const rawNewRefreshToken = this.generateRefreshToken();
      const newTokenHash = this.hashToken(rawNewRefreshToken);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + env.JWT_REFRESH_EXPIRY_DAYS);

      await client.query(
        `INSERT INTO user_sessions (user_id, tenant_id, refresh_token_hash, ip_address, user_agent, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [user.id, user.tenantId, newTokenHash, ipAddress || null, userAgent || null, expiresAt]
      );

      await client.query('COMMIT');

      return {
        accessToken: newAccessToken,
        newRefreshToken: rawNewRefreshToken,
        user
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async revokeSession(rawRefreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawRefreshToken);
    await pool.query(
      'UPDATE user_sessions SET revoked_at = NOW() WHERE refresh_token_hash = $1',
      [tokenHash]
    );
  }

  static async getUserPermissions(role: string): Promise<string[]> {
    const res = await pool.query<{ permission_id: string }>(
      'SELECT permission_id FROM role_permissions WHERE role = $1',
      [role]
    );
    return res.rows.map(r => r.permission_id);
  }

  static async verifyTotpCode(userId: string, code: string): Promise<boolean> {
    const res = await pool.query<{ totp_secret_encrypted: string }>(
      'SELECT totp_secret_encrypted FROM user_mfa_credentials WHERE user_id = $1 AND is_enabled = TRUE',
      [userId]
    );
    if (res.rows.length === 0) return false;

    const rawOrEncrypted = res.rows[0].totp_secret_encrypted;
    const secret = this.decryptTotpSecret(rawOrEncrypted);
    return authenticator.check(code, secret);
  }

  static async setupMfa(userId: string, email: string, currentTotpCode?: string): Promise<{ secret: string; otpAuthUrl: string }> {
    const existing = await pool.query<{ is_enabled: boolean; totp_secret_encrypted: string }>(
      'SELECT is_enabled, totp_secret_encrypted FROM user_mfa_credentials WHERE user_id = $1',
      [userId]
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
      await pool.query(
        'UPDATE user_mfa_credentials SET pending_totp_secret_encrypted = $1 WHERE user_id = $2',
        [encryptedSecret, userId]
      );
    } else {
      // First-time MFA setup
      await pool.query(
        `INSERT INTO user_mfa_credentials (user_id, totp_secret_encrypted, is_enabled, backup_codes_hashed)
         VALUES ($1, $2, FALSE, '[]'::jsonb)
         ON CONFLICT (user_id) 
         DO UPDATE SET totp_secret_encrypted = EXCLUDED.totp_secret_encrypted, is_enabled = FALSE`,
        [userId, encryptedSecret]
      );
    }

    return { secret, otpAuthUrl };
  }

  static async confirmMfa(userId: string, totpCode: string): Promise<{ success: boolean; backupCodes?: string[] }> {
    const res = await pool.query<{ totp_secret_encrypted: string; pending_totp_secret_encrypted: string | null }>(
      'SELECT totp_secret_encrypted, pending_totp_secret_encrypted FROM user_mfa_credentials WHERE user_id = $1',
      [userId]
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

    await pool.query(
      `UPDATE user_mfa_credentials
       SET totp_secret_encrypted = $1,
           pending_totp_secret_encrypted = NULL,
           is_enabled = TRUE,
           confirmed_at = NOW(),
           backup_codes_hashed = $2::jsonb
       WHERE user_id = $3`,
      [targetEncrypted, JSON.stringify(hashedCodes), userId]
    );

    return { success: true, backupCodes: rawCodes };
  }

  static async verifyMfaRecovery(userId: string, backupCode: string): Promise<boolean> {
    const rawClean = backupCode.trim().toUpperCase();
    const normalizedDigits = rawClean.replace(/[^0-9A-Z]/g, '');
    const formatted = normalizedDigits.length === 20
      ? `${normalizedDigits.slice(0, 5)}-${normalizedDigits.slice(5, 10)}-${normalizedDigits.slice(10, 15)}-${normalizedDigits.slice(15, 20)}`
      : rawClean;

    const codeHash1 = this.hashBackupCode(rawClean);
    const codeHash2 = this.hashBackupCode(formatted);
    const legacyHash = this.hashToken(rawClean);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const res = await client.query<{ backup_codes_hashed: string[] }>(
        'SELECT backup_codes_hashed FROM user_mfa_credentials WHERE user_id = $1 AND is_enabled = TRUE FOR UPDATE',
        [userId]
      );

      if (res.rows.length === 0) {
        await client.query('ROLLBACK');
        return false;
      }

      const storedHashes: string[] = Array.isArray(res.rows[0].backup_codes_hashed)
        ? res.rows[0].backup_codes_hashed
        : [];

      let matchIndex = storedHashes.indexOf(codeHash1);
      if (matchIndex === -1) matchIndex = storedHashes.indexOf(codeHash2);
      if (matchIndex === -1) matchIndex = storedHashes.indexOf(legacyHash);

      if (matchIndex === -1) {
        await client.query('ROLLBACK');
        return false;
      }

      // One-time atomic use: remove used backup code
      storedHashes.splice(matchIndex, 1);

      await client.query(
        'UPDATE user_mfa_credentials SET backup_codes_hashed = $1::jsonb WHERE user_id = $2',
        [JSON.stringify(storedHashes), userId]
      );

      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

/**
 * ServicePro OS — Cryptographic Session Management & Invalidation Engine
 * Standards: OWASP ASVS v4.0.3 Chapter 3, NIST SP 800-63B
 */

import type { AuthSession } from '../context/types';

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes of inactivity
const ABSOLUTE_LIFETIME_MS = 12 * 60 * 60 * 1000; // 12 hours absolute ceiling

export function generateCryptographicToken(prefix: string = 'tok'): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${Date.now()}_${hex}`;
}

export interface SessionVerificationResult {
  isValid: boolean;
  isIdleTimedOut: boolean;
  isExpired: boolean;
  reason?: string;
}

export function verifySessionValidity(session: AuthSession | null, lastActivityTime: number): SessionVerificationResult {
  if (!session || !session.token) {
    return { isValid: false, isIdleTimedOut: false, isExpired: true, reason: 'No active session token' };
  }

  const now = Date.now();
  const loginTime = new Date(session.loginTime).getTime();

  // 1. Absolute lifetime check
  if (now - loginTime > ABSOLUTE_LIFETIME_MS) {
    return { isValid: false, isIdleTimedOut: false, isExpired: true, reason: 'Session expired (12h maximum lifetime reached)' };
  }

  // 2. Idle timeout check
  if (now - lastActivityTime > IDLE_TIMEOUT_MS) {
    return { isValid: false, isIdleTimedOut: true, isExpired: false, reason: 'Session locked due to 15 minutes of inactivity' };
  }

  return { isValid: true, isIdleTimedOut: false, isExpired: false };
}

/**
 * ServicePro OS — API & Data Protection Security Layer
 * Standards: OWASP Top 10 A03:2021-Injection, OWASP API Security Top 10
 */

import { recordSecurityEvent } from './securityAuditLogger';

/**
 * Escapes HTML characters to prevent Cross-Site Scripting (XSS)
 */
export function encodeHtmlEntities(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Strips dangerous HTML tags, inline event handlers, and script payloads
 */
export function sanitizeString(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
    .replace(/javascript:[^"']*/gi, '')
    .trim();
}

const SQL_INJECTION_PATTERNS = [
  /(\b(union(\s+all)?)\b)/i,
  /(\b(select|insert|update|delete|drop|truncate|alter)\b\s+.*\b(from|into|table)\b)/i,
  /(\bexec(\s+|\+)+(s|x)p\w+)/i,
  /(--|\b(or|and)\b\s+['"\d\w]+\s*=\s*['"\d\w]+)/i,
  /(\/\*.*\*\/)/i
];

const XSS_PATTERNS = [
  /<script\b[^>]*>/i,
  /javascript\s*:/i,
  /\bon\w+\s*=/i,
  /<\s*img\b[^>]*\bsrc\s*=\s*["']?data:text\/html/i,
  /<\s*iframe\b[^>]*>/i
];

const PATH_TRAVERSAL_PATTERNS = [
  /\.\.[/\\]/,
  /%2e%2e[/\\]/i,
  /%252e%252e[/\\]/i
];

export interface ThreatScanResult {
  hasThreat: boolean;
  threatType?: 'SQL_INJECTION' | 'XSS' | 'PATH_TRAVERSAL';
  patternDetected?: string;
}

/**
 * Inspects untrusted input strings for injection and traversal signatures.
 */
export function scanUntrustedInput(input: string, fieldName: string = 'field'): ThreatScanResult {
  if (!input || typeof input !== 'string') return { hasThreat: false };

  // Check SQLi
  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      recordSecurityEvent(
        'UNAUTHORIZED_ACCESS_ATTEMPT',
        'api-client',
        'UNKNOWN',
        'CRITICAL',
        `SQL injection pattern intercepted in ${fieldName}`
      );
      return { hasThreat: true, threatType: 'SQL_INJECTION', patternDetected: pattern.source };
    }
  }

  // Check XSS
  for (const pattern of XSS_PATTERNS) {
    if (pattern.test(input)) {
      recordSecurityEvent(
        'UNAUTHORIZED_ACCESS_ATTEMPT',
        'api-client',
        'UNKNOWN',
        'CRITICAL',
        `XSS attack pattern intercepted in ${fieldName}`
      );
      return { hasThreat: true, threatType: 'XSS', patternDetected: pattern.source };
    }
  }

  // Check Path Traversal
  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    if (pattern.test(input)) {
      recordSecurityEvent(
        'UNAUTHORIZED_ACCESS_ATTEMPT',
        'api-client',
        'UNKNOWN',
        'CRITICAL',
        `Path traversal pattern intercepted in ${fieldName}`
      );
      return { hasThreat: true, threatType: 'PATH_TRAVERSAL', patternDetected: pattern.source };
    }
  }

  return { hasThreat: false };
}

/**
 * Generates OWASP-recommended HTTP response security headers
 */
export function getRecommendedSecurityHeaders(): Record<string, string> {
  return {
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), camera=(), microphone=(), payment=(self)',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https: blob:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co;"
  };
}

/**
 * CSRF Double Submit Token Engine
 */
const CSRF_KEY = 'servicepro_csrf_token';

export function getOrCreateCsrfToken(): string {
  let token = sessionStorage.getItem(CSRF_KEY);
  if (!token) {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    token = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    sessionStorage.setItem(CSRF_KEY, token);
  }
  return token;
}

export function validateCsrfToken(submittedToken: string): boolean {
  const currentToken = sessionStorage.getItem(CSRF_KEY);
  if (!currentToken || !submittedToken) return false;
  return currentToken === submittedToken.trim();
}

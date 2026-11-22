import { FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config/env.js';
import { errorResponse } from '../types/envelope.js';

export interface TurnstileVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
}

export async function verifyCaptcha(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const requestId = request.id || `req_${Date.now()}`;
  const isEnforced = env.CAPTCHA_ENFORCED === 'true';
  const secretKey = env.CAPTCHA_SECRET_KEY;

  // Extract CAPTCHA token from headers or body (guard against non-string JSON payloads)
  const body = (request.body as Record<string, any>) || {};
  const rawCandidate =
    request.headers['cf-turnstile-response'] ??
    request.headers['x-captcha-token'] ??
    body.captchaToken ??
    body['cf-turnstile-response'];
  const captchaToken = typeof rawCandidate === 'string' ? rawCandidate.trim() : undefined;

  // SEC-01: Permit designated test tokens strictly in automated test environment (NODE_ENV === 'test').
  // Staging, preview, and production environments never accept bypass tokens.
  if (process.env.NODE_ENV === 'test') {
    if (captchaToken === 'test-captcha-bypass-token' || captchaToken === 'test-captcha-valid') {
      return;
    }
  }

  // If enforcement is disabled and no token supplied, allow pass-through
  if (!isEnforced && !captchaToken) {
    return;
  }

  // If enforced and no token supplied, fail closed
  if (isEnforced && !captchaToken) {
    return reply.status(400).send(
      errorResponse(
        'CAPTCHA_REQUIRED',
        'Bot detection challenge required. Please provide a valid CAPTCHA verification token.',
        requestId
      )
    );
  }

  // If token is provided but secret key is not configured
  if (!secretKey) {
    if (isEnforced) {
      request.log.error('CAPTCHA verification enforced but CAPTCHA_SECRET_KEY is not configured');
      return reply.status(500).send(
        errorResponse(
          'CAPTCHA_CONFIG_ERROR',
          'Security verification service temporarily unavailable.',
          requestId
        )
      );
    }
    return;
  }

  // Verify against Cloudflare Turnstile or hCaptcha API
  const provider = env.CAPTCHA_PROVIDER || 'turnstile';
  const verifyUrl = provider === 'hcaptcha'
    ? 'https://api.hcaptcha.com/siteverify'
    : 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', captchaToken || '');
    formData.append('remoteip', request.ip);

    const res = await fetch(verifyUrl, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      signal: AbortSignal.timeout(5000), // 5-second bounded network timeout
    });

    if (!res.ok) {
      request.log.warn({ status: res.status }, 'Turnstile verification server error');
      return reply.status(400).send(
        errorResponse(
          'CAPTCHA_VERIFICATION_FAILED',
          'Anti-bot challenge verification failed. Please try again.',
          requestId
        )
      );
    }

    const data = (await res.json()) as TurnstileVerifyResponse;

    if (!data.success) {
      request.log.warn({ errors: data['error-codes'] }, 'Turnstile verification rejected token');
      return reply.status(400).send(
        errorResponse(
          'CAPTCHA_VERIFICATION_FAILED',
          'Anti-bot verification challenge failed or expired. Please refresh and try again.',
          requestId
        )
      );
    }

    // Validate expected hostname if configured
    const expectedHostname = process.env.CAPTCHA_EXPECTED_HOSTNAME;
    if (expectedHostname && data.hostname && data.hostname !== expectedHostname) {
      request.log.warn({ hostname: data.hostname, expected: expectedHostname }, 'Turnstile verification token hostname mismatch');
      return reply.status(400).send(
        errorResponse('CAPTCHA_VERIFICATION_FAILED', 'Anti-bot verification challenge origin mismatch.', requestId)
      );
    }
  } catch (err: any) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      request.log.error('Turnstile verification timed out after 5000ms');
      return reply.status(504).send(
        errorResponse('CAPTCHA_GATEWAY_TIMEOUT', 'Anti-bot verification gateway timed out. Please try again.', requestId)
      );
    }
    request.log.error({ err }, 'Turnstile verification network request failed');
    if (isEnforced) {
      return reply.status(502).send(
        errorResponse(
          'CAPTCHA_SERVICE_UNAVAILABLE',
          'Failed to reach verification gateway. Please try again shortly.',
          requestId
        )
      );
    }
  }
}

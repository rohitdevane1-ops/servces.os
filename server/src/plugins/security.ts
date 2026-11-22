import fp from 'fastify-plugin';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';
import { errorResponse } from '../types/envelope.js';

export default fp(async function securityPlugin(fastify: FastifyInstance) {
  // 1. Security Headers (Helmet)
  await fastify.register(helmet, {
    contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
    crossOriginEmbedderPolicy: false
  });

  // 2. Strict Cross-Origin Resource Sharing (CORS)
  const allowedOrigins = env.CORS_ORIGIN.split(',').map(o => o.trim()).filter(Boolean);

  await fastify.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) return cb(null, true);

      // Check strict origin whitelist
      if (allowedOrigins.includes(origin)) {
        return cb(null, true);
      }

      // In non-production, permit local dev tooling (strict hostname check)
      if (env.NODE_ENV !== 'production') {
        try {
          const parsed = new URL(origin);
          if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
            return cb(null, true);
          }
        } catch {
          // Malformed origin rejected below
        }
      }

      // Reject unauthorized origins with credentials (403, not 500)
      const err: any = new Error('CORS request rejected: Origin not authorized');
      err.statusCode = 403;
      return cb(err, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-tenant-id',
      'idempotency-key',
      'x-client-platform',
      'x-captcha-token',
      'cf-turnstile-response',
      'x-bootstrap-token'
    ]
  });

  // 3. HTTP-Only Cookie Support (for Refresh Token rotation)
  await fastify.register(cookie, {
    secret: env.JWT_REFRESH_SECRET,
    hook: 'onRequest'
  });

  // 4. Rate Limiting Protection (Anti-Brute-Force & Anti-DDoS)
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: (request, context) => {
      const err = errorResponse(
        'RATE_LIMIT_EXCEEDED',
        `Rate limit exceeded: Too many requests. Please try again after ${context.after}.`,
        request.id || `req_${Date.now()}`
      );
      return {
        statusCode: 429,
        ...err
      };
    }
  });

  // 5. Multipart File Uploads (Work order photos, signatures)
  await fastify.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB maximum file size
      files: 5
    }
  });
});

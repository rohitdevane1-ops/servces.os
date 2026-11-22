import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { errorResponse } from '../types/envelope.js';

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  const requestId = request.id || `req_${Date.now()}`;

  // 1. Zod Validation Errors
  if (error instanceof ZodError) {
    const details = error.issues.map(issue => ({
      field: issue.path.join('.'),
      issue: issue.message
    }));
    return reply.status(400).send(
      errorResponse('VALIDATION_ERROR', 'The request payload failed validation checks.', requestId, details)
    );
  }

  // 2. Fastify Schema Validation Errors
  if (error.validation) {
    const details = error.validation.map(v => ({
      field: v.instancePath || v.params?.missingProperty as string || 'field',
      issue: v.message || 'Invalid value'
    }));
    return reply.status(400).send(
      errorResponse('SCHEMA_VALIDATION_ERROR', error.message, requestId, details)
    );
  }

  // 3. Fastify HTTP Errors (e.g. 401, 403, 404, 429)
  const statusCode = error.statusCode || 500;
  
  if (statusCode === 429) {
    return reply.status(429).send(
      errorResponse('RATE_LIMIT_EXCEEDED', 'Too many requests. Please try again later.', requestId)
    );
  }

  if (statusCode === 401) {
    return reply.status(401).send(
      errorResponse('UNAUTHORIZED', error.message || 'Authentication credentials required.', requestId)
    );
  }

  if (statusCode === 403) {
    return reply.status(403).send(
      errorResponse('FORBIDDEN', error.message || 'Access denied for this resource.', requestId)
    );
  }

  if (statusCode === 404) {
    return reply.status(404).send(
      errorResponse('NOT_FOUND', error.message || 'Resource not found.', requestId)
    );
  }

  // Preserve all other 4xx client errors (400 Bad Request, 409 Conflict, 413 Payload Too Large, 415, 422, etc.)
  if (statusCode >= 400 && statusCode < 500) {
    const codeMap: Record<number, string> = {
      400: 'BAD_REQUEST',
      405: 'METHOD_NOT_ALLOWED',
      409: 'CONFLICT',
      413: 'PAYLOAD_TOO_LARGE',
      415: 'UNSUPPORTED_MEDIA_TYPE',
      422: 'UNPROCESSABLE_ENTITY',
      423: 'LOCKED',
    };
    return reply.status(statusCode).send(
      errorResponse(codeMap[statusCode] || 'CLIENT_ERROR', error.message || 'Invalid request.', requestId)
    );
  }

  // Preserve explicit 501 / 503 operational status codes (e.g. GatewayOperationNotSupportedError)
  if (statusCode === 501 || statusCode === 503) {
    return reply.status(statusCode).send(
      errorResponse(
        (error as any).code || (statusCode === 501 ? 'NOT_IMPLEMENTED' : 'SERVICE_UNAVAILABLE'),
        error.message || 'Service unavailable.',
        requestId
      )
    );
  }

  // Map common PostgreSQL input/constraint errors to proper 4xx codes instead of 500
  const pgCode = (error as any)?.code;
  if (pgCode === '22P02' || pgCode === '22007') {
    return reply.status(400).send(
      errorResponse('INVALID_IDENTIFIER', 'Invalid identifier or date format provided.', requestId)
    );
  }
  if (pgCode === '23505') {
    return reply.status(409).send(
      errorResponse('DUPLICATE_RESOURCE', 'A resource with the provided unique key already exists.', requestId)
    );
  }
  if (pgCode === '23503') {
    return reply.status(400).send(
      errorResponse('INVALID_REFERENCE', 'A referenced resource does not exist or cannot be modified due to existing records.', requestId)
    );
  }
  if (pgCode === '23514') {
    return reply.status(400).send(
      errorResponse('CONSTRAINT_VIOLATION', 'The provided values violate a domain constraint.', requestId)
    );
  }

  // 4. Uncaught Internal Server Errors
  request.log.error(error);
  return reply.status(500).send(
    errorResponse(
      'INTERNAL_SERVER_ERROR',
      process.env.NODE_ENV === 'production' ? 'An unexpected error occurred.' : error.message,
      requestId
    )
  );
}

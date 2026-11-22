import { FastifyReply, FastifyRequest } from 'fastify';
import { errorResponse } from '../types/envelope.js';

export function isDemoModeEnabled(): boolean {
  return process.env.APP_DEMO_MODE === 'true';
}

/**
 * Blocks destructive operations when running in Live Interactive Demo Sandbox mode
 * (e.g., changing admin passwords, deleting core services, editing payment gateway keys).
 */
export function blockInDemoMode(actionDescription = 'This destructive action') {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isDemoModeEnabled()) return;
    const requestId = request.id || `req_${Date.now()}`;
    return reply.status(403).send(
      errorResponse(
        'DEMO_MODE_RESTRICTED',
        `${actionDescription} is disabled in the Live Interactive Dubai Sandbox. Acquire the clean production deployment for full administrative control.`,
        requestId
      )
    );
  };
}

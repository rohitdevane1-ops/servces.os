import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '../modules/auth/auth.service.js';
import { errorResponse } from '../types/envelope.js';
import { tenantQuery } from '../database/pool.js';

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const requestId = request.id || `req_${Date.now()}`;
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send(
      errorResponse('UNAUTHORIZED', 'Bearer authentication token is required.', requestId)
    );
  }

  const token = authHeader.substring(7).trim();

  let payload: ReturnType<typeof AuthService.verifyAccessToken>;
  try {
    payload = AuthService.verifyAccessToken(token);
  } catch {
    return reply.status(401).send(
      errorResponse('TOKEN_EXPIRED_OR_INVALID', 'The provided access token is expired or invalid.', requestId)
    );
  }

  request.user = {
    id: payload.sub,
    role: payload.role,
    tenantId: payload.tenantId,
    email: payload.email,
  };

  // Strict Cross-Tenant Guard: Enforce token tenant matches request tenant
  if (request.tenantId && request.user.tenantId !== request.tenantId) {
    return reply.status(403).send(
      errorResponse('CROSS_TENANT_FORBIDDEN', 'Access token belongs to another organization.', requestId)
    );
  }

  try {
    // Verify account still exists and has not been deactivated/suspended in DB (fail-closed)
    const activeCheck = await tenantQuery<{ is_active: boolean }>(
      'SELECT is_active FROM users WHERE id = $1 AND tenant_id = $2',
      [request.user.id, request.user.tenantId],
      request.user.tenantId
    );
    if (activeCheck.rows.length === 0) {
      return reply.status(401).send(
        errorResponse('ACCOUNT_NOT_FOUND', 'User account no longer exists.', requestId)
      );
    }
    if (!activeCheck.rows[0].is_active) {
      return reply.status(403).send(
        errorResponse('ACCOUNT_DEACTIVATED', 'This user account is inactive or has been suspended.', requestId)
      );
    }
  } catch (err: any) {
    request.log?.error(err, 'Database unavailable during authentication check');
    return reply.status(503).send(
      errorResponse('SERVICE_UNAVAILABLE', 'Authentication verification temporarily unavailable.', requestId)
    );
  }
}

export function requirePermission(permissionId: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // 1. Ensure user is authenticated first
    await authenticate(request, reply);
    if (reply.sent) return;

    const requestId = request.id || `req_${Date.now()}`;
    const userRole = request.user?.role;
    const userId = request.user?.id;

    if (!userRole || !userId) {
      return reply.status(401).send(
        errorResponse('UNAUTHORIZED', 'Authentication credentials required.', requestId)
      );
    }

    // 2. Administrators have root access (active status already verified in authenticate)
    if (userRole === 'ADMIN') {
      return;
    }

    // 3. Query role permissions (fail closed on DB errors)
    let permissions: string[];
    try {
      permissions = await AuthService.getUserPermissions(userRole);
    } catch (err) {
      request.log?.error(err, 'Failed to verify RBAC permissions');
      return reply.status(503).send(
        errorResponse('SERVICE_UNAVAILABLE', 'Unable to verify authorization permissions.', requestId)
      );
    }

    if (!permissions.includes(permissionId)) {
      return reply.status(403).send(
        errorResponse(
          'FORBIDDEN',
          `Your role (${userRole}) lacks the required '${permissionId}' permission.`,
          requestId
        )
      );
    }
  };
}

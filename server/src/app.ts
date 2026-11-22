import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import swaggerPlugin from './plugins/swagger.js';
import securityPlugin from './plugins/security.js';
import { errorHandler } from './middleware/errorHandler.js';
import { tenantResolver } from './middleware/tenant.js';
import { successResponse } from './types/envelope.js';
import { pool, tenantContextStorage } from './database/pool.js';
import { env, trustProxySetting } from './config/env.js';

// Feature Route Modules
import { authRoutes } from './modules/auth/auth.routes.js';
import { installerRoutes } from './modules/installer/installer.routes.js';
import { serviceRoutes } from './modules/services/services.routes.js';
import { bookingRoutes } from './modules/bookings/bookings.routes.js';
import { dispatchRoutes } from './modules/dispatch/dispatch.routes.js';
import { crmRoutes } from './modules/crm/crm.routes.js';
import { financeRoutes } from './modules/finances/finances.routes.js';
import { supportRoutes } from './modules/support/support.routes.js';
import { systemRoutes } from './modules/system/system.routes.js';
import { uploadsRoutes } from './modules/uploads/uploads.routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    // Untrusted by default: X-Forwarded-For is only honoured when explicitly configured via TRUST_PROXY.
    trustProxy: trustProxySetting,
    logger: process.env.NODE_ENV === 'test' ? false : {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  });

  // Global Error Handler
  app.setErrorHandler(errorHandler);

  // Security & Core Plugins
  await app.register(securityPlugin);
  await app.register(swaggerPlugin);

  // Per-request AsyncLocalStorage tenant scope + Global Tenant Resolution Hook
  app.addHook('onRequest', (_request, _reply, done) => {
    tenantContextStorage.run({}, done);
  });
  app.addHook('onRequest', tenantResolver);

  // Universal Health Check Route (mounted at both /health and /api/v1/health)
  const healthHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    let dbStatus = 'healthy';
    try {
      await pool.query('SELECT 1');
    } catch {
      dbStatus = 'disconnected';
    }

    return reply.status(dbStatus === 'healthy' ? 200 : 503).send(
      successResponse({
        status: dbStatus === 'healthy' ? 'pass' : 'fail',
        service: 'servicepro-os-api',
        version: '1.0.0',
        database: dbStatus,
        demoMode: env.APP_DEMO_MODE === 'true',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
      }, request.id || `req_${Date.now()}`)
    );
  };

  app.get('/health', healthHandler);
  app.get('/api/v1/health', healthHandler);

  // Register API v1 Feature Routes
  await app.register(systemRoutes, { prefix: '/api/v1/system' });
  await app.register(uploadsRoutes, { prefix: '/api/v1/uploads' });
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(installerRoutes, { prefix: '/api/v1/installer' });
  await app.register(serviceRoutes, { prefix: '/api/v1/services' });
  await app.register(bookingRoutes, { prefix: '/api/v1/bookings' });
  await app.register(dispatchRoutes, { prefix: '/api/v1/dispatch' });
  await app.register(crmRoutes, { prefix: '/api/v1/crm' });
  await app.register(financeRoutes, { prefix: '/api/v1/finances' });
  await app.register(supportRoutes, { prefix: '/api/v1/support' });

  return app;
}

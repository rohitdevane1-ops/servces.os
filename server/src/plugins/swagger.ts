import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { FastifyInstance } from 'fastify';

export default fp(async function swaggerPlugin(fastify: FastifyInstance) {
  await fastify.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'ServicePro OS — Enterprise REST API',
        description: 'Universal shared backend API for Admin Web, Staff Dispatch, Flutter Mobile, and Native Android clients.',
        version: '1.0.0',
        contact: {
          name: 'Platform Engineering & Handover Desk',
          email: 'support@serviceproos.com'
        }
      },
      servers: [
        {
          url: 'http://localhost:3000',
          description: 'Local development server'
        }
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Provide your 15-minute access token in the format: Bearer <token>'
          },
          tenantHeader: {
            type: 'apiKey',
            name: 'x-tenant-id',
            in: 'header',
            description: 'Optional tenant organization UUID'
          }
        }
      },
      security: [
        { bearerAuth: [], tenantHeader: [] }
      ]
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    await fastify.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true
      },
      staticCSP: true,
      transformStaticCSP: (header) => header
    });
  }
});

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../../database/pool.js';
import { successResponse, errorResponse } from '../../types/envelope.js';
import { authenticate, requirePermission } from '../../middleware/rbac.js';

const createCategorySchema = z.object({
  name: z.string().min(2).max(150),
  iconName: z.string().default('wrench'),
  bannerUrl: z.string().optional(),
  displayOrder: z.number().default(0),
});

const createServiceSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(2).max(255),
  description: z.string().optional(),
  basePriceCents: z.number().int().min(0),
  estimatedDurationMinutes: z.number().int().min(15).default(60),
  isPopular: z.boolean().default(false),
  tiers: z.array(z.object({
    tierName: z.string(),
    multiplier: z.number().min(0.5).max(5.0),
    description: z.string().optional()
  })).optional()
});

export async function serviceRoutes(fastify: FastifyInstance) {
  // 1. Get Service Categories
  fastify.get('/categories', {
    schema: {
      tags: ['Services & Catalog'],
      summary: 'List active service categories',
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;

    const res = await pool.query(
      `SELECT c.id, c.name, c.slug, c.icon_name, c.banner_url, c.display_order,
              COUNT(s.id)::int as service_count
       FROM service_categories c
       LEFT JOIN services s ON s.category_id = c.id AND s.is_active = TRUE
       WHERE c.tenant_id = $1 AND c.is_active = TRUE
       GROUP BY c.id
       ORDER BY c.display_order ASC, c.name ASC`,
      [tenantId]
    );

    return reply.status(200).send(
      successResponse(res.rows, requestId)
    );
  });

  // 2. Create Service Category (Admin)
  fastify.post('/categories', {
    preHandler: [requirePermission('system:settings:update')],
    schema: {
      tags: ['Services & Catalog'],
      summary: 'Create a new service category',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const parsed = createCategorySchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'Invalid category data', requestId)
      );
    }

    const { name, iconName, bannerUrl, displayOrder } = parsed.data;
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    const tenantId = request.tenantId;

    const res = await pool.query(
      `INSERT INTO service_categories (tenant_id, name, slug, icon_name, banner_url, display_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [tenantId, name, slug, iconName, bannerUrl || null, displayOrder]
    );

    return reply.status(201).send(
      successResponse(res.rows[0], requestId)
    );
  });

  // 3. Query Services (with optional category & search filter)
  const queryServicesHandler = async (request: any, reply: any) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;
    const { categoryId, categorySlug, search, popularOnly } = request.query as any;

    let queryText = `
      SELECT s.id, s.name, s.slug, s.description, s.base_price_cents,
             s.estimated_duration_minutes, s.is_popular, s.is_active,
             c.name as category_name, c.slug as category_slug
      FROM services s
      JOIN service_categories c ON c.id = s.category_id
      WHERE s.tenant_id = $1 AND s.is_active = TRUE
    `;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (categoryId && categoryId !== 'all') {
      queryText += ` AND s.category_id = $${paramIndex++}`;
      params.push(categoryId);
    } else if (categorySlug && categorySlug !== 'all') {
      queryText += ` AND c.slug = $${paramIndex++}`;
      params.push(categorySlug.toLowerCase());
    }

    if (popularOnly === 'true' || popularOnly === true) {
      queryText += ` AND s.is_popular = TRUE`;
    }

    if (search && search.trim()) {
      queryText += ` AND (s.name ILIKE $${paramIndex} OR s.description ILIKE $${paramIndex})`;
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    queryText += ` ORDER BY s.is_popular DESC, s.name ASC`;

    const res = await pool.query(queryText, params);

    return reply.status(200).send(
      successResponse(res.rows, requestId)
    );
  };

  const servicesQuerySchema = {
    schema: {
      tags: ['Services & Catalog'],
      summary: 'Query service products catalog',
      querystring: {
        type: 'object',
        properties: {
          categoryId: { type: 'string' },
          categorySlug: { type: 'string' },
          search: { type: 'string' },
          popularOnly: { type: 'boolean' }
        }
      }
    }
  };

  fastify.get('/', servicesQuerySchema, queryServicesHandler);
  fastify.get('/services', servicesQuerySchema, queryServicesHandler);

  // 4. Create Service Catalog Item (Admin)
  const createServiceHandler = async (request: any, reply: any) => {
    const requestId = request.id || `req_${Date.now()}`;
    const parsed = createServiceSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'Invalid service creation payload', requestId)
      );
    }

    const { categoryId, name, description, basePriceCents, estimatedDurationMinutes, isPopular, tiers } = parsed.data;
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    const tenantId = request.tenantId;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // BACK-13: Validate that category exists and belongs to the authenticated tenant
      const catCheck = await client.query(
        `SELECT id FROM service_categories WHERE id = $1 AND tenant_id = $2`,
        [categoryId, tenantId]
      );
      if (catCheck.rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.status(404).send(
          errorResponse('CATEGORY_NOT_FOUND', 'Service category not found in your organization.', requestId)
        );
      }

      const serviceRes = await client.query(
        `INSERT INTO services (
          tenant_id, category_id, name, slug, description, base_price_cents,
          estimated_duration_minutes, is_popular
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [tenantId, categoryId, name, slug, description || null, basePriceCents, estimatedDurationMinutes, isPopular]
      );
      const service = serviceRes.rows[0];

      // Insert Tiers if provided
      if (tiers && tiers.length > 0) {
        for (const tier of tiers) {
          await client.query(
            `INSERT INTO service_pricing_tiers (service_id, tier_name, multiplier, description)
             VALUES ($1, $2, $3, $4)`,
            [service.id, tier.tierName, tier.multiplier, tier.description || null]
          );
        }
      }

      await client.query('COMMIT');

      return reply.status(201).send(
        successResponse(service, requestId)
      );
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  };

  const createServiceOpts = {
    preHandler: [requirePermission('system:settings:update')],
    schema: {
      tags: ['Services & Catalog'],
      summary: 'Create a new service catalog product',
      security: [{ bearerAuth: [] }]
    }
  };

  fastify.post('/', createServiceOpts, createServiceHandler);
  fastify.post('/services', createServiceOpts, createServiceHandler);
}

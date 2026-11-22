import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { tenantQuery, withTenantTransaction } from '../../database/pool.js';
import { successResponse, errorResponse } from '../../types/envelope.js';
import { requirePermission } from '../../middleware/rbac.js';
import { blockInDemoMode } from '../../middleware/demoGuard.js';
import { safeMediaUrlSchema } from '../../utils/urlValidator.js';
import { toUnicodeSlug } from '../../utils/slug.js';

const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(150),
  iconName: z.string().trim().min(1).max(50).default('wrench'),
  bannerUrl: safeMediaUrlSchema.nullable().optional(),
  displayOrder: z.number().int().default(0),
});

const updateCategorySchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  iconName: z.string().trim().min(1).max(50).optional(),
  bannerUrl: safeMediaUrlSchema.nullable().optional(),
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const pricingTierSchema = z.object({
  tierName: z.string().trim().min(1).max(100),
  multiplier: z.number().min(0.5).max(5.0),
  description: z.string().optional(),
});

const createServiceSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().trim().min(2).max(255),
  description: z.string().optional(),
  basePriceCents: z.number().int().min(0),
  estimatedDurationMinutes: z.number().int().min(15).default(60),
  isPopular: z.boolean().default(false),
  tiers: z.array(pricingTierSchema).optional(),
});

const updateServiceSchema = z.object({
  categoryId: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(255).optional(),
  description: z.string().nullable().optional(),
  basePriceCents: z.number().int().min(0).optional(),
  estimatedDurationMinutes: z.number().int().min(15).optional(),
  isPopular: z.boolean().optional(),
  isActive: z.boolean().optional(),
  tiers: z.array(pricingTierSchema).optional(),
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

    const res = await tenantQuery(
      `SELECT c.id, c.name, c.slug, c.icon_name, c.banner_url, c.display_order,
              COUNT(s.id)::int as service_count
       FROM service_categories c
       LEFT JOIN services s ON s.category_id = c.id AND s.is_active = TRUE
       WHERE c.tenant_id = $1 AND c.is_active = TRUE
       GROUP BY c.id
       ORDER BY c.display_order ASC, c.name ASC`,
      [tenantId],
      tenantId
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
    const slug = toUnicodeSlug(name, 'cat');
    const tenantId = request.tenantId;

    let res;
    try {
      res = await tenantQuery(
        `INSERT INTO service_categories (tenant_id, name, slug, icon_name, banner_url, display_order)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [tenantId, name, slug, iconName, bannerUrl || null, displayOrder],
        tenantId
      );
    } catch (err: any) {
      if (err?.code === '23505') {
        return reply.status(409).send(
          errorResponse('CATEGORY_ALREADY_EXISTS', `A category with slug '${slug}' already exists.`, requestId)
        );
      }
      throw err;
    }

    return reply.status(201).send(
      successResponse(res.rows[0], requestId)
    );
  });

  // 2b. Update Service Category (Admin)
  fastify.put('/categories/:id', {
    preHandler: [requirePermission('system:settings:update'), blockInDemoMode('Updating service categories')],
    schema: {
      tags: ['Services & Catalog'],
      summary: 'Update an existing service category',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const { id } = request.params as { id: string };
    if (!z.string().uuid().safeParse(id).success) {
      return reply.status(400).send(errorResponse('VALIDATION_ERROR', 'Invalid category ID.', requestId));
    }

    const parsed = updateCategorySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid category update payload.', requestId)
      );
    }

    const tenantId = request.tenantId;
    const { name, iconName, bannerUrl, displayOrder, isActive } = parsed.data;
    const newSlug = name !== undefined ? toUnicodeSlug(name, 'cat') : undefined;

    try {
      const res = await tenantQuery(
        `UPDATE service_categories
         SET name = COALESCE($1, name),
             slug = COALESCE($2, slug),
             icon_name = COALESCE($3, icon_name),
             banner_url = CASE WHEN $4::boolean THEN $5 ELSE banner_url END,
             display_order = COALESCE($6, display_order),
             is_active = COALESCE($7, is_active),
             updated_at = NOW()
         WHERE id = $8 AND tenant_id = $9
         RETURNING *`,
        [
          name ?? null,
          newSlug ?? null,
          iconName ?? null,
          bannerUrl !== undefined,
          bannerUrl ?? null,
          displayOrder ?? null,
          isActive ?? null,
          id,
          tenantId,
        ],
        tenantId
      );

      if (res.rows.length === 0) {
        return reply.status(404).send(errorResponse('NOT_FOUND', 'Service category not found.', requestId));
      }

      return reply.status(200).send(successResponse(res.rows[0], requestId));
    } catch (err: any) {
      if (err?.code === '23505') {
        return reply.status(409).send(
          errorResponse('CATEGORY_ALREADY_EXISTS', `A category with slug '${newSlug}' already exists.`, requestId)
        );
      }
      throw err;
    }
  });

  // 2c. Soft-Delete Service Category (Admin)
  fastify.delete('/categories/:id', {
    preHandler: [requirePermission('system:settings:update'), blockInDemoMode('Deleting service categories')],
    schema: {
      tags: ['Services & Catalog'],
      summary: 'Soft-delete a service category',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const { id } = request.params as { id: string };
    if (!z.string().uuid().safeParse(id).success) {
      return reply.status(400).send(errorResponse('VALIDATION_ERROR', 'Invalid category ID.', requestId));
    }

    const tenantId = request.tenantId;
    const res = await tenantQuery(
      `UPDATE service_categories
       SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id, is_active`,
      [id, tenantId],
      tenantId
    );

    if (res.rows.length === 0) {
      return reply.status(404).send(errorResponse('NOT_FOUND', 'Service category not found.', requestId));
    }

    return reply.status(200).send(
      successResponse({ id, deleted: true, isActive: false }, requestId)
    );
  });

  // 3. Query Services (with optional category & search filter)
  const queryServicesHandler = async (request: any, reply: any) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;
    const { categoryId, categorySlug, search, popularOnly } = request.query as any;

    let queryText = `
      SELECT s.id, s.category_id, s.name, s.slug, s.description, s.base_price_cents,
             s.estimated_duration_minutes, s.is_popular, s.is_active,
             c.name as category_name, c.slug as category_slug,
             COALESCE(
               (SELECT json_agg(json_build_object(
                 'id', t.id,
                 'tierName', t.tier_name,
                 'multiplier', t.multiplier,
                 'priceCents', ROUND(s.base_price_cents * t.multiplier)::BIGINT,
                 'description', t.description
               ) ORDER BY t.multiplier ASC)
               FROM service_pricing_tiers t WHERE t.service_id = s.id),
               '[]'::json
             ) as pricing_tiers
      FROM services s
      JOIN service_categories c ON c.id = s.category_id
      WHERE s.tenant_id = $1 AND s.is_active = TRUE
    `;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (categoryId && categoryId !== 'all') {
      if (!z.string().uuid().safeParse(categoryId).success) {
        return reply.status(400).send(
          errorResponse('VALIDATION_ERROR', 'categoryId must be a valid UUID.', requestId)
        );
      }
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

    const res = await tenantQuery(queryText, params, tenantId);

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
    const slug = toUnicodeSlug(name, 'svc');
    const tenantId = request.tenantId;

    let txResult: { notFound: true } | { notFound: false; service: any };
    try {
      txResult = await withTenantTransaction<{ notFound: true } | { notFound: false; service: any }>(
        tenantId,
        async (client) => {
          // BACK-13: Validate that category exists and belongs to the authenticated tenant
          const catCheck = await client.query(
            `SELECT id FROM service_categories WHERE id = $1 AND tenant_id = $2`,
            [categoryId, tenantId]
          );
          if (catCheck.rowCount === 0) {
            return { notFound: true };
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

          return { notFound: false, service };
        }
      );
    } catch (err: any) {
      if (err?.code === '23505') {
        return reply.status(409).send(
          errorResponse('SERVICE_ALREADY_EXISTS', `A service with slug '${slug}' already exists.`, requestId)
        );
      }
      throw err;
    }

    if (txResult.notFound) {
      return reply.status(404).send(
        errorResponse('CATEGORY_NOT_FOUND', 'Service category not found in your organization.', requestId)
      );
    }

    return reply.status(201).send(
      successResponse(txResult.service, requestId)
    );
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

  // 5. Update Service Catalog Item (Admin)
  const updateServiceHandler = async (request: any, reply: any) => {
    const requestId = request.id || `req_${Date.now()}`;
    const { id } = request.params as { id: string };
    if (!z.string().uuid().safeParse(id).success) {
      return reply.status(400).send(errorResponse('VALIDATION_ERROR', 'Invalid service ID.', requestId));
    }

    const parsed = updateServiceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid service update payload.', requestId)
      );
    }

    const { categoryId, name, description, basePriceCents, estimatedDurationMinutes, isPopular, isActive, tiers } = parsed.data;
    const newSlug = name !== undefined ? toUnicodeSlug(name, 'svc') : undefined;
    const tenantId = request.tenantId;

    let txResult: { ok: false; status: number; code: string; message: string } | { ok: true; service: any };
    try {
      txResult = await withTenantTransaction<
        { ok: false; status: number; code: string; message: string } | { ok: true; service: any }
      >(tenantId, async (client) => {
        if (categoryId) {
          const catCheck = await client.query(
            `SELECT id FROM service_categories WHERE id = $1 AND tenant_id = $2`,
            [categoryId, tenantId]
          );
          if (catCheck.rowCount === 0) {
            return { ok: false, status: 404, code: 'CATEGORY_NOT_FOUND', message: 'Service category not found in your organization.' };
          }
        }

        const updRes = await client.query(
          `UPDATE services
           SET category_id = COALESCE($1, category_id),
               name = COALESCE($2, name),
               slug = COALESCE($3, slug),
               description = CASE WHEN $4::boolean THEN $5 ELSE description END,
               base_price_cents = COALESCE($6, base_price_cents),
               estimated_duration_minutes = COALESCE($7, estimated_duration_minutes),
               is_popular = COALESCE($8, is_popular),
               is_active = COALESCE($9, is_active),
               updated_at = NOW()
           WHERE id = $10 AND tenant_id = $11
           RETURNING *`,
          [
            categoryId ?? null,
            name ?? null,
            newSlug ?? null,
            description !== undefined,
            description ?? null,
            basePriceCents ?? null,
            estimatedDurationMinutes ?? null,
            isPopular ?? null,
            isActive ?? null,
            id,
            tenantId,
          ]
        );

        if (updRes.rows.length === 0) {
          return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Service catalog item not found.' };
        }

        const service = updRes.rows[0];
        if (tiers !== undefined) {
          await client.query(`DELETE FROM service_pricing_tiers WHERE service_id = $1`, [id]);
          for (const tier of tiers) {
            await client.query(
              `INSERT INTO service_pricing_tiers (service_id, tier_name, multiplier, description)
               VALUES ($1, $2, $3, $4)`,
              [id, tier.tierName, tier.multiplier, tier.description || null]
            );
          }
        }

        const tiersRes = await client.query(
          `SELECT id, tier_name AS "tierName", multiplier, description
           FROM service_pricing_tiers WHERE service_id = $1 ORDER BY multiplier ASC`,
          [id]
        );

        return { ok: true, service: { ...service, pricing_tiers: tiersRes.rows } };
      });
    } catch (err: any) {
      if (err?.code === '23505') {
        return reply.status(409).send(
          errorResponse('SERVICE_ALREADY_EXISTS', `A service with slug '${newSlug}' already exists.`, requestId)
        );
      }
      throw err;
    }

    if (!txResult.ok) {
      return reply.status(txResult.status).send(
        errorResponse(txResult.code, txResult.message, requestId)
      );
    }

    return reply.status(200).send(successResponse(txResult.service, requestId));
  };

  const updateServiceOpts = {
    preHandler: [requirePermission('system:settings:update'), blockInDemoMode('Updating service catalog items')],
    schema: {
      tags: ['Services & Catalog'],
      summary: 'Update an existing service catalog product',
      security: [{ bearerAuth: [] }],
    },
  };

  fastify.put('/services/:id', updateServiceOpts, updateServiceHandler);
  fastify.put('/:id', updateServiceOpts, updateServiceHandler);

  // 6. Soft-Delete Service Catalog Item (Admin)
  const deleteServiceHandler = async (request: any, reply: any) => {
    const requestId = request.id || `req_${Date.now()}`;
    const { id } = request.params as { id: string };
    if (!z.string().uuid().safeParse(id).success) {
      return reply.status(400).send(errorResponse('VALIDATION_ERROR', 'Invalid service ID.', requestId));
    }

    const tenantId = request.tenantId;
    const res = await tenantQuery(
      `UPDATE services SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [id, tenantId],
      tenantId
    );

    if (res.rows.length === 0) {
      return reply.status(404).send(errorResponse('NOT_FOUND', 'Service catalog item not found.', requestId));
    }

    return reply.status(200).send(
      successResponse({ id, deleted: true, isActive: false }, requestId)
    );
  };

  const deleteServiceOpts = {
    preHandler: [requirePermission('system:settings:update'), blockInDemoMode('Deleting service catalog items')],
    schema: {
      tags: ['Services & Catalog'],
      summary: 'Soft-delete a service catalog product',
      security: [{ bearerAuth: [] }],
    },
  };

  fastify.delete('/services/:id', deleteServiceOpts, deleteServiceHandler);
  fastify.delete('/:id', deleteServiceOpts, deleteServiceHandler);
}

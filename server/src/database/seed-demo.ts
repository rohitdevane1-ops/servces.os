import pg from 'pg';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import path from 'node:path';
import { AuthService } from '../modules/auth/auth.service.js';
import { migrateUp } from './migrate.js';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

const DUBAI_ZONES = [
  { area: 'Dubai Marina', address: 'Marina Promenade, Tower B', lat: 25.0805, lng: 55.1403 },
  { area: 'Downtown Dubai', address: 'Boulevard Plaza, Sheikh Mohammed bin Rashid Blvd', lat: 25.1972, lng: 55.2744 },
  { area: 'Business Bay', address: 'Executive Towers, Bay Avenue', lat: 25.1865, lng: 55.2636 },
  { area: 'JLT (Jumeirah Lake Towers)', address: 'Cluster D, Lake Terrace', lat: 25.0694, lng: 55.1419 },
  { area: 'Al Quoz', address: 'Al Quoz Industrial Area 3, Street 8', lat: 25.1342, lng: 55.2273 },
];

const DEMO_SERVICES = [
  { catSlug: 'hvac-ac', name: 'Split AC Deep Cleaning', slug: 'split-ac-deep-cleaning', priceAed: 180, duration: 75 },
  { catSlug: 'plumbing', name: 'Emergency Plumbing Repair', slug: 'emergency-plumbing-repair', priceAed: 150, duration: 60 },
  { catSlug: 'electrical', name: 'Electrical Safety Inspection', slug: 'electrical-safety-inspection', priceAed: 250, duration: 90 },
  { catSlug: 'hvac-ac', name: 'AC Duct Sanitization & Coil Wash', slug: 'ac-duct-sanitization', priceAed: 320, duration: 120 },
  { catSlug: 'cleaning', name: 'Deep Villa Cleaning (4BR)', slug: 'deep-villa-cleaning', priceAed: 450, duration: 180 },
  { catSlug: 'plumbing', name: 'Water Heater Repair & Descaling', slug: 'water-heater-repair', priceAed: 220, duration: 75 },
  { catSlug: 'electrical', name: 'Smart Door Lock Installation', slug: 'smart-lock-installation', priceAed: 290, duration: 60 },
  { catSlug: 'cleaning', name: 'Dubai Municipality Pest Control', slug: 'pest-control-treatment', priceAed: 195, duration: 60 },
  { catSlug: 'plumbing', name: 'Thermal Water Leak Detection', slug: 'thermal-leak-detection', priceAed: 210, duration: 60 },
  { catSlug: 'hvac-ac', name: 'Chiller & FCU Preventive Maintenance', slug: 'chiller-maintenance', priceAed: 380, duration: 120 },
  { catSlug: 'appliances', name: 'Kitchen Appliance Diagnostics & Repair', slug: 'appliance-repair', priceAed: 175, duration: 60 },
  { catSlug: 'appliances', name: 'Interior Painting & Wall Touch-Up', slug: 'painting-touch-up', priceAed: 340, duration: 150 },
];

const DEMO_TECHNICIANS = [
  { name: 'Tariq Al-Mansoori', email: 'tech@dubaidemo.serviceos.ae', trade: 'HVAC & AC', rateAed: 95, rating: 4.9, zoneIdx: 0 },
  { name: 'Khalid Bin Rashid', email: 'khalid.tech@dubaidemo.serviceos.ae', trade: 'Plumbing', rateAed: 85, rating: 4.8, zoneIdx: 1 },
  { name: 'Faisal Al-Hashimi', email: 'faisal.tech@dubaidemo.serviceos.ae', trade: 'Electrical', rateAed: 110, rating: 4.9, zoneIdx: 2 },
  { name: 'Omar Al-Suwaidi', email: 'omar.tech@dubaidemo.serviceos.ae', trade: 'HVAC & AC', rateAed: 90, rating: 4.7, zoneIdx: 3 },
  { name: 'Imran Siddiqui', email: 'imran.tech@dubaidemo.serviceos.ae', trade: 'Appliances', rateAed: 80, rating: 4.8, zoneIdx: 4 },
  { name: 'Rami Khoury', email: 'rami.tech@dubaidemo.serviceos.ae', trade: 'Plumbing', rateAed: 85, rating: 4.9, zoneIdx: 0 },
  { name: 'Saeed Al-Nuaimi', email: 'saeed.tech@dubaidemo.serviceos.ae', trade: 'Electrical', rateAed: 105, rating: 4.8, zoneIdx: 1 },
  { name: 'Nabil Haddad', email: 'nabil.tech@dubaidemo.serviceos.ae', trade: 'Cleaning & Pest', rateAed: 75, rating: 4.7, zoneIdx: 2 },
  { name: 'Youssef Darwish', email: 'youssef.tech@dubaidemo.serviceos.ae', trade: 'HVAC & AC', rateAed: 95, rating: 4.9, zoneIdx: 3 },
  { name: 'Bilal Qureshi', email: 'bilal.tech@dubaidemo.serviceos.ae', trade: 'Appliances', rateAed: 80, rating: 4.8, zoneIdx: 4 },
];

export async function runDemoSeed(targetPool?: pg.Pool): Promise<{
  tenantId: string;
  servicesSeeded: number;
  techniciansSeeded: number;
  bookingsSeeded: number;
}> {
  const connectionString = process.env.DEMO_DATABASE_URL?.trim();
  if (!targetPool) {
    if (!connectionString) {
      throw new Error('DEMO_DATABASE_URL must be configured to run seed:demo (never falls back to DATABASE_URL).');
    }
    if (process.env.DATABASE_URL && connectionString === process.env.DATABASE_URL.trim()) {
      throw new Error('REFUSING seed:demo — DEMO_DATABASE_URL MUST NOT equal DATABASE_URL.');
    }
  }

  const ownsPool = !targetPool;
  const db = targetPool || new pg.Pool({ connectionString });

  try {
    if (ownsPool) {
      await migrateUp(db);
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // 1. Upsert Dubai Demo Tenant (AED + 5% UAE VAT = 500 bps)
      const existingTenant = await client.query<{ id: string }>(
        `SELECT id FROM tenants WHERE slug = 'dubai-demo' LIMIT 1`
      );
      let tenantId: string;
      if (existingTenant.rows.length > 0) {
        tenantId = existingTenant.rows[0].id;
        await client.query(
          `UPDATE tenants
           SET name = 'Dubai Elite Home Services',
               currency_code = 'AED',
               currency_symbol = 'AED ',
               timezone = 'Asia/Dubai',
               default_platform_commission_bps = 1500,
               default_tax_rate_bps = 500,
               country_code = 'AE',
               tax_name = 'VAT',
               distance_unit = 'km',
               default_map_lat = 25.204800,
               default_map_lng = 55.270800,
               support_phone = '+971 4 800 7378',
               support_whatsapp = '+971501234567',
               default_locale = 'en',
               is_active = TRUE,
               installer_completed_at = COALESCE(installer_completed_at, NOW())
           WHERE id = $1`,
          [tenantId]
        );
      } else {
        const tRes = await client.query<{ id: string }>(
          `INSERT INTO tenants (
            name, slug, primary_color, currency_code, currency_symbol, timezone,
            default_platform_commission_bps, default_tax_rate_bps,
            country_code, tax_name, distance_unit, default_map_lat, default_map_lng,
            support_phone, support_whatsapp, default_locale, is_active, installer_completed_at
          ) VALUES (
            'Dubai Elite Home Services', 'dubai-demo', '#6366F1', 'AED', 'AED ', 'Asia/Dubai',
            1500, 500,
            'AE', 'VAT', 'km', 25.204800, 55.270800,
            '+971 4 800 7378', '+971501234567', 'en', TRUE, NOW()
          ) RETURNING id`
        );
        tenantId = tRes.rows[0].id;
      }

      // Bind transaction-local FORCE RLS tenant context
      await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);

      // 2. Ensure Chart of Accounts (AED)
      const coa = [
        ['1010', 'Operating Cash Clearing (AED)', 'ASSET'],
        ['1020', 'UAE Payment Gateway Escrow Clearing', 'ASSET'],
        ['2010', 'Customer Escrow Deposits Liability', 'LIABILITY'],
        ['2020', 'Technician Unpaid Payables', 'LIABILITY'],
        ['2030', 'Tax / VAT / GST Payable', 'LIABILITY'],
        ['4010', 'Platform Commission Revenue', 'REVENUE'],
        ['5010', 'Gateway Processing Expense', 'EXPENSE'],
      ];
      const accountIds: Record<string, string> = {};
      for (const [no, name, type] of coa) {
        const acc = await client.query<{ id: string }>(
          `INSERT INTO ledger_accounts (tenant_id, account_number, account_name, account_type, currency_code)
           VALUES ($1, $2, $3, $4, 'AED')
           ON CONFLICT (tenant_id, account_number) DO UPDATE SET account_name = EXCLUDED.account_name
           RETURNING id`,
          [tenantId, no, name, type]
        );
        accountIds[no] = acc.rows[0].id;
      }

      // 3. Upsert CMS White-Label Config
      await client.query(
        `INSERT INTO tenant_cms_configs (tenant_id, hero_heading, hero_subheading, search_placeholder)
         VALUES ($1, 'Dubai Home Maintenance — On Demand in 60 Mins', 'Certified UAE AC, Plumbing, Electrical & Cleaning specialists with upfront AED pricing & 5% VAT invoicing.', 'Search AC cleaning, plumbing, electrical...')
         ON CONFLICT (tenant_id) DO NOTHING`,
        [tenantId]
      );

      const demoPasswordHash = await AuthService.hashPassword(process.env.DEMO_DEFAULT_PASSWORD || 'DubaiDemo2026!');

      const upsertUser = async (email: string, role: string): Promise<string> => {
        const res = await client.query<{ id: string }>(
          `INSERT INTO users (tenant_id, email, password_hash, role, is_active, is_verified)
           VALUES ($1, $2, $3, $4, TRUE, TRUE)
           ON CONFLICT (tenant_id, email) DO UPDATE SET is_active = TRUE, is_verified = TRUE
           RETURNING id`,
          [tenantId, email.toLowerCase(), demoPasswordHash, role]
        );
        return res.rows[0].id;
      };

      // 4. Core Demo Persona Accounts (Admin, Staff, Primary Customer + 4 Dubai Residents)
      const adminId = await upsertUser('admin@dubaidemo.serviceos.ae', 'ADMIN');
      await client.query(
        `INSERT INTO admin_profiles (user_id, tenant_id, full_name)
         VALUES ($1, $2, 'Zayed Al-Maktoum (Demo Admin)')
         ON CONFLICT (user_id) DO NOTHING`,
        [adminId, tenantId]
      );

      const staffId = await upsertUser('dispatch@dubaidemo.serviceos.ae', 'STAFF');
      await client.query(
        `INSERT INTO staff_profiles (user_id, tenant_id, full_name, department, assigned_territory)
         VALUES ($1, $2, 'Layla Al-Farsi', 'Dubai Operations Desk', 'Dubai Metro')
         ON CONFLICT (user_id) DO NOTHING`,
        [staffId, tenantId]
      );

      const demoCustomers = [
        { email: 'customer@dubaidemo.serviceos.ae', name: 'Aisha Al-Mansoor', zoneIdx: 0 },
        { email: 'hamdan.c@dubaidemo.serviceos.ae', name: 'Hamdan Al-Falasi', zoneIdx: 1 },
        { email: 'nadia.c@dubaidemo.serviceos.ae', name: 'Nadia Karam', zoneIdx: 2 },
        { email: 'james.c@dubaidemo.serviceos.ae', name: 'James Thornton', zoneIdx: 3 },
        { email: 'fatima.c@dubaidemo.serviceos.ae', name: 'Fatima Al-Mazrouei', zoneIdx: 4 },
      ];
      const customerIds: string[] = [];
      const customerAddressIds: string[] = [];

      for (const c of demoCustomers) {
        const cid = await upsertUser(c.email, 'CUSTOMER');
        customerIds.push(cid);
        const zone = DUBAI_ZONES[c.zoneIdx];
        await client.query(
          `INSERT INTO customer_profiles (user_id, tenant_id, full_name, default_address_text)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id) DO NOTHING`,
          [cid, tenantId, c.name, `${zone.address}, ${zone.area}, Dubai, UAE`]
        );
        const existingAddr = await client.query<{ id: string }>(
          `SELECT id FROM customer_addresses WHERE customer_id = $1 AND tenant_id = $2 LIMIT 1`,
          [cid, tenantId]
        );
        if (existingAddr.rows.length > 0) {
          customerAddressIds.push(existingAddr.rows[0].id);
        } else {
          const addrRes = await client.query<{ id: string }>(
            `INSERT INTO customer_addresses (customer_id, tenant_id, address_line1, city, state_province, postal_code, location, is_default)
             VALUES ($1, $2, $3, 'Dubai', 'Dubai', '00000', ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, TRUE)
             RETURNING id`,
            [cid, tenantId, `${zone.address}, ${zone.area}`, zone.lng, zone.lat]
          );
          customerAddressIds.push(addrRes.rows[0].id);
        }
      }

      // 5. Seed 10 Verified Dubai Technicians with Live GPS across 5 Dubai Districts
      const techIds: string[] = [];
      for (let i = 0; i < DEMO_TECHNICIANS.length; i++) {
        const t = DEMO_TECHNICIANS[i];
        const tid = await upsertUser(t.email, 'TECHNICIAN');
        techIds.push(tid);
        const zone = DUBAI_ZONES[t.zoneIdx];
        const jitterLat = zone.lat + ((i % 3) - 1) * 0.004;
        const jitterLng = zone.lng + ((i % 2) * 2 - 1) * 0.004;

        await client.query(
          `INSERT INTO provider_profiles (
            user_id, tenant_id, full_name, trade_category, hourly_rate_cents,
            is_verified, is_active, stripe_connect_account_id, stripe_payouts_enabled
          ) VALUES ($1, $2, $3, $4, $5, TRUE, TRUE, $6, TRUE)
          ON CONFLICT (user_id) DO UPDATE
            SET is_verified = TRUE, is_active = TRUE, stripe_payouts_enabled = TRUE`,
          [tid, tenantId, t.name, t.trade, t.rateAed * 100, `acct_dubai_demo_${i + 1}`]
        );

        await client.query(
          `INSERT INTO provider_locations (provider_id, tenant_id, location, duty_status, last_ping_at)
           VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, $5, NOW())
           ON CONFLICT (provider_id) DO UPDATE
             SET location = EXCLUDED.location, duty_status = EXCLUDED.duty_status, last_ping_at = NOW()`,
          [tid, tenantId, jitterLng, jitterLat, i < 7 ? 'ONLINE' : 'EN_ROUTE']
        );
      }

      // 6. Seed 5 Categories & 12 UAE Home Maintenance Services (Priced in AED)
      const categories = [
        { slug: 'hvac-ac', name: 'AC & HVAC Maintenance' },
        { slug: 'plumbing', name: 'Plumbing & Water Systems' },
        { slug: 'electrical', name: 'Electrical & Smart Home' },
        { slug: 'cleaning', name: 'Deep Cleaning & Pest Control' },
        { slug: 'appliances', name: 'Appliances & Handyman' },
      ];
      const catIds: Record<string, string> = {};
      for (const cat of categories) {
        const cRes = await client.query<{ id: string }>(
          `INSERT INTO service_categories (tenant_id, name, slug, is_active)
           VALUES ($1, $2, $3, TRUE)
           ON CONFLICT (tenant_id, slug) DO UPDATE SET name = EXCLUDED.name, is_active = TRUE
           RETURNING id`,
          [tenantId, cat.name, cat.slug]
        );
        catIds[cat.slug] = cRes.rows[0].id;
      }

      const serviceIds: Array<{ id: string; priceCents: number; name: string }> = [];
      for (const srv of DEMO_SERVICES) {
        const sRes = await client.query<{ id: string }>(
          `INSERT INTO services (tenant_id, category_id, name, slug, base_price_cents, estimated_duration_minutes, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, TRUE)
           ON CONFLICT (tenant_id, slug) DO UPDATE SET base_price_cents = EXCLUDED.base_price_cents, is_active = TRUE
           RETURNING id`,
          [tenantId, catIds[srv.catSlug], srv.name, srv.slug, srv.priceAed * 100, srv.duration]
        );
        serviceIds.push({ id: sRes.rows[0].id, priceCents: srv.priceAed * 100, name: srv.name });
      }

      // 7. Seed 45 Realistic Historical Bookings across the Past 30 Days (Idempotent by booking_reference)
      let bookingsSeeded = 0;
      const existingBookings = await client.query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt FROM bookings WHERE tenant_id = $1 AND booking_reference LIKE 'DXB-DEMO-%'`,
        [tenantId]
      );
      if (parseInt(existingBookings.rows[0].cnt, 10) < 45) {
        for (let idx = 1; idx <= 45; idx++) {
          const ref = `DXB-DEMO-${String(idx).padStart(3, '0')}`;
          const exists = await client.query(`SELECT 1 FROM bookings WHERE tenant_id = $1 AND booking_reference = $2`, [tenantId, ref]);
          if (exists.rows.length > 0) continue;

          const daysAgo = Math.floor(((45 - idx) / 45) * 29);
          const scheduledAt = new Date(Date.now() - daysAgo * 86400_000);
          const srv = serviceIds[idx % serviceIds.length];
          const custIdx = idx % customerIds.length;
          const techIdx = idx % techIds.length;
          const status = idx <= 34 ? 'COMPLETED' : idx <= 40 ? 'ON_SITE' : idx <= 42 ? 'EN_ROUTE' : 'REQUESTED';
          const assignedTech = status === 'REQUESTED' ? null : techIds[techIdx];
          const pin = String(1000 + ((idx * 733) % 9000));

          const bRes = await client.query<{ id: string }>(
            `INSERT INTO bookings (
              tenant_id, booking_reference, customer_id, service_id, address_id,
              assigned_provider_id, status, priority, scheduled_start, customer_safety_pin, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $9)
            RETURNING id`,
            [
              tenantId,
              ref,
              customerIds[custIdx],
              srv.id,
              customerAddressIds[custIdx],
              assignedTech,
              status,
              idx % 5 === 0 ? 'EMERGENCY' : 'STANDARD',
              scheduledAt,
              pin,
            ]
          );
          const bookingId = bRes.rows[0].id;

          // Server-side UAE 5% VAT invoice calculation
          const laborCents = srv.priceCents;
          const diagnosticCents = idx % 5 === 0 ? 4900 : 2000;
          const subtotalCents = laborCents + diagnosticCents;
          const taxRateBps = 500; // 5% UAE VAT
          const vatCents = Math.round((subtotalCents * taxRateBps) / 10000);
          const totalCents = subtotalCents + vatCents;
          const invStatus = status === 'COMPLETED' ? 'PAID' : 'AUTHORIZED';

          const invRes = await client.query<{ id: string }>(
            `INSERT INTO invoices (
              tenant_id, booking_id, invoice_number, labor_subtotal_cents, diagnostic_fee_cents,
              tax_rate_bps, tax_total_cents, total_amount_cents, status, issued_at, paid_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id`,
            [
              tenantId,
              bookingId,
              `INV-DXB-${String(idx).padStart(4, '0')}`,
              laborCents,
              diagnosticCents,
              taxRateBps,
              vatCents,
              totalCents,
              invStatus,
              scheduledAt,
              status === 'COMPLETED' ? scheduledAt : null,
            ]
          );
          const invoiceId = invRes.rows[0].id;

          await client.query(
            `INSERT INTO invoice_items (invoice_id, description, item_type, quantity, unit_price_cents, total_cents)
             VALUES ($1, $2, 'LABOR', 1, $3, $3),
                    ($1, 'Dubai Dispatch Callout Fee', 'DIAGNOSTIC', 1, $4, $4),
                    ($1, 'UAE VAT (5.00%)', 'TAX', 1, $5, $5)`,
            [invoiceId, srv.name, laborCents, diagnosticCents, vatCents]
          );

          const txRes = await client.query<{ id: string }>(
            `INSERT INTO payment_transactions (
              tenant_id, invoice_id, stripe_payment_intent_id, idempotency_key,
              authorized_amount_cents, captured_amount_cents, currency, transaction_type, status, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, 'aed', $7, $8, $9)
            RETURNING id`,
            [
              tenantId,
              invoiceId,
              `pi_dubai_demo_${idx}_${crypto.randomBytes(3).toString('hex')}`,
              `idem_dxb_${ref}`,
              totalCents,
              status === 'COMPLETED' ? totalCents : 0,
              status === 'COMPLETED' ? 'CAPTURE' : 'PRE_AUTH',
              status === 'COMPLETED' ? 'SUCCEEDED' : 'REQUIRES_CAPTURE',
              scheduledAt,
            ]
          );
          const txId = txRes.rows[0].id;

          if (status === 'COMPLETED') {
            const commissionCents = Math.round((subtotalCents * 1500) / 10000);
            const techNetCents = subtotalCents - commissionCents;
            await client.query(
              `INSERT INTO ledger_entries (tenant_id, transaction_id, posting_type, debit_account_id, credit_account_id, amount_cents, description, posted_at)
               VALUES
                 ($1, $2, 'ESCROW_HOLD', $3, $4, $5, $6, $9),
                 ($1, $2, 'TAX_PAYABLE', $4, $14, $15, $16, $9),
                 ($1, $2, 'COMMISSION_REVENUE', $4, $7, $8, $10, $9),
                 ($1, $2, 'TECH_PAYABLE', $4, $11, $12, $13, $9)
               ON CONFLICT (transaction_id, posting_type) DO NOTHING`,
              [
                tenantId,
                txId,
                accountIds['1020'],
                accountIds['2010'],
                totalCents,
                `Dubai Demo Escrow Capture ${ref}`,
                accountIds['4010'],
                commissionCents,
                scheduledAt,
                `Platform 15% Commission ${ref}`,
                accountIds['2020'],
                techNetCents,
                `Technician Net Payable ${ref}`,
                accountIds['2030'],
                vatCents,
                `Dubai 5% VAT Liability ${ref}`,
              ]
            );

            // Seed high-trust UAE customer review (4.7–5.0)
            const rating = idx % 3 === 0 ? 4 : 5;
            await client.query(
              `INSERT INTO customer_reviews (tenant_id, booking_id, customer_id, provider_id, rating, comment, is_public, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7)
               ON CONFLICT (booking_id) DO NOTHING`,
              [
                tenantId,
                bookingId,
                customerIds[custIdx],
                techIds[techIdx],
                rating,
                `Punctual and professional ${srv.name} in ${DUBAI_ZONES[custIdx].area}. Transparent AED VAT invoice.`,
                scheduledAt,
              ]
            );
          }

          bookingsSeeded++;
        }
      }

      await client.query('COMMIT');
      console.log(`✅ [seed:demo] Dubai Interactive Sandbox seeded successfully!`);
      console.log(`   Tenant: Dubai Elite Home Services (AED, 5% UAE VAT, Asia/Dubai)`);
      console.log(`   Demo Logins: admin@dubaidemo.serviceos.ae / customer@dubaidemo.serviceos.ae / tech@dubaidemo.serviceos.ae`);
      console.log(`   Services: ${serviceIds.length} | Verified Dubai Technicians: ${techIds.length} | New Bookings Seeded: ${bookingsSeeded}`);
      return {
        tenantId,
        servicesSeeded: serviceIds.length,
        techniciansSeeded: techIds.length,
        bookingsSeeded,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } finally {
    if (ownsPool) {
      await db.end();
    }
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]).includes('seed-demo');
if (isDirectRun) {
  runDemoSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ [seed:demo] Failed:', err);
      process.exit(1);
    });
}

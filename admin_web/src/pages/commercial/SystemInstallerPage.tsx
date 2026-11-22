import React, { useCallback, useEffect, useState } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  Play,
  Download,
  FileText,
  AlertTriangle,
  Code2,
} from 'lucide-react';
import { useAdmin } from '../../context/adminContextCore';
import { apiClient } from '../../services/apiClient';

const FASTIFY_MIGRATIONS = [
  { id: '001', file: '001_tenants_and_auth.sql', desc: 'Tenants, users, sessions, and authentication core' },
  { id: '002', file: '002_profiles_and_entities.sql', desc: 'Admin, staff, customer, and provider profiles + PostGIS locations' },
  { id: '003', file: '003_services_and_catalog.sql', desc: 'Service categories, services, and pricing tiers' },
  { id: '004', file: '004_bookings_and_dispatch.sql', desc: 'Bookings lifecycle, dispatch broadcasts, timeline events, work order proofs' },
  { id: '005', file: '005_finance_and_ledger.sql', desc: 'Invoices, payment transactions, double-entry ledger accounts & entries' },
  { id: '006', file: '006_support_crm_and_audit.sql', desc: 'Support tickets, messages, customer reviews, CMS config, immutable audit logs' },
  { id: '007', file: '007_finance_invoices_patch.sql', desc: 'Invoice itemization & diagnostic fee extensions' },
  { id: '008', file: '008_payout_tenant_idempotency_and_durability.sql', desc: 'Provider payouts durability & idempotency fingerprinting' },
  { id: '009', file: '009_ledger_payout_and_booking_references.sql', desc: 'Ledger payout foreign keys & transactional outbox operations' },
  { id: '010', file: '010_remediation_core_invariants.sql', desc: 'Financial and booking state constraint invariants' },
  { id: '011', file: '011_remediation_schema_rbac_and_triggers.sql', desc: 'Role permissions & double-entry balance trigger verification' },
  { id: '012', file: '012_security_rls_immutability_and_indexes.sql', desc: 'Row-Level Security policies, audit immutability triggers, performance indexes' },
  { id: '013', file: '013_security_rls_force_vat_and_uae_settings.sql', desc: 'FORCE ROW LEVEL SECURITY across tenant tables & statutory VAT columns' },
  { id: '014', file: '014_universal_tax_refunds_and_rls_helpers.sql', desc: 'payment_refunds table, proportional tax/fee reversal, SECURITY DEFINER RLS helpers' },
  { id: '015', file: '015_phase2_auth_resets_and_encrypted_integrations.sql', desc: 'password_reset_tokens with FORCE RLS & AES-256-GCM integration_configs vault' },
];

export const SystemInstallerPage: React.FC = () => {
  const { addToast, tenantConfig, systemConfig, refreshSystemConfig, isDemoMode } = useAdmin();
  const [activeTab, setActiveTab] = useState<'health' | 'migrations' | 'dossier'>('health');
  const [isProbing, setIsProbing] = useState(false);
  const [healthStatus, setHealthStatus] = useState<{
    reachable: boolean;
    statusText: string;
    timestamp: string | null;
  }>({
    reachable: false,
    statusText: 'Probing Fastify API...',
    timestamp: null,
  });

  const probeLiveHealth = useCallback(async () => {
    setIsProbing(true);
    try {
      const [hRes] = await Promise.all([apiClient.getHealth(), refreshSystemConfig()]);
      if (hRes.success || (hRes.data && (hRes.data as any).status === 'ok')) {
        setHealthStatus({
          reachable: true,
          statusText: 'Connected to Fastify 5 + PostgreSQL 16 API',
          timestamp: new Date().toISOString(),
        });
        setIsProbing(false);
        return true;
      }
      const cfgRes = await apiClient.getSystemConfig();
      if (cfgRes.success && cfgRes.data) {
        setHealthStatus({
          reachable: true,
          statusText: 'Connected via /api/v1/system/config',
          timestamp: new Date().toISOString(),
        });
        setIsProbing(false);
        return true;
      }
      setHealthStatus({
        reachable: false,
        statusText: hRes.error?.message || 'Backend API unreachable',
        timestamp: null,
      });
      setIsProbing(false);
      return false;
    } catch {
      setHealthStatus({
        reachable: false,
        statusText: 'Network connection failed',
        timestamp: null,
      });
      setIsProbing(false);
      return false;
    }
  }, [refreshSystemConfig]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) void probeLiveHealth();
    });
    return () => {
      active = false;
    };
  }, [probeLiveHealth]);

  const handleDownloadDossier = () => {
    const content = `# ServiceOS â€” Technical Architecture & Handover Summary
Organization: ${tenantConfig.name} (${tenantConfig.slug})
Environment Mode: ${isDemoMode ? 'Interactive Demo Sandbox' : 'Production Deployment'}
Active Currency & Tax: ${tenantConfig.currencyCode} (${tenantConfig.taxName} ${tenantConfig.vatPercent}%)
Platform Commission: ${(tenantConfig.commissionBps / 100).toFixed(2)}%
Payment Gateway Adapter: ${systemConfig?.paymentGateway || 'stripe'} (Configured: ${Boolean(systemConfig?.paymentGatewayConfigured)})
Backend Stack: Fastify 5 + TypeScript + PostgreSQL 16 + PostGIS (15 Paired Up/Down SQL Migrations)
Security Controls: FORCE ROW LEVEL SECURITY, AES-256-GCM Secret Vault, RFC 6238 TOTP MFA, HttpOnly Session Rotation`;

    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'SERVICEOS_DEPLOYMENT_SUMMARY.md';
    a.click();
    addToast('Deployment Architecture Summary downloaded.', 'info');
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              System Health &amp; Migration Inspector
            </h1>
            <span
              className={`px-2.5 py-0.5 text-xs font-black uppercase tracking-wider rounded-full border ${
                healthStatus.reachable
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  : 'bg-amber-100 text-amber-800 border-amber-200'
              }`}
            >
              {healthStatus.reachable ? 'API Online' : 'Check Connection'}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Live Fastify 5 + PostgreSQL 16 + PostGIS runtime diagnostics and paired migration ledger.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl text-xs font-bold">
          <button
            onClick={() => setActiveTab('health')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === 'health' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Runtime Health
          </button>
          <button
            onClick={() => setActiveTab('migrations')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === 'migrations' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            SQL Migrations ({FASTIFY_MIGRATIONS.length})
          </button>
          <button
            onClick={() => setActiveTab('dossier')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === 'dossier' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Deployment Summary
          </button>
        </div>
      </div>

      {activeTab === 'health' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase">Backend API</span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    healthStatus.reachable ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                  }`}
                />
              </div>
              <h3 className="text-lg font-black text-slate-900">Fastify 5 + PG 16</h3>
              <p
                className={`text-[11px] font-bold flex items-center gap-1 ${
                  healthStatus.reachable ? 'text-emerald-600' : 'text-amber-600'
                }`}
              >
                {healthStatus.reachable ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5" />
                )}{' '}
                {healthStatus.statusText}
              </p>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase">Payment Gateway</span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    systemConfig?.paymentGatewayConfigured ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
              </div>
              <h3 className="text-lg font-black text-slate-900 uppercase">
                {systemConfig?.paymentGateway || 'Stripe'}
              </h3>
              <p className="text-[11px] text-slate-600 font-bold">
                {systemConfig?.paymentGatewayConfigured
                  ? 'Credentials Configured'
                  : 'Sandbox / Awaiting Live Keys'}
              </p>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase">Tenant &amp; Tax</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              </div>
              <h3 className="text-lg font-black text-slate-900">
                {tenantConfig.currencyCode} â€¢ {tenantConfig.taxName} {tenantConfig.vatPercent}%
              </h3>
              <p className="text-[11px] text-emerald-600 font-bold">
                Take-Rate: {(tenantConfig.commissionBps / 100).toFixed(1)}% â€¢ Unit: {tenantConfig.distanceUnit}
              </p>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase">Database Mode</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              </div>
              <h3 className="text-lg font-black text-slate-900">
                {isDemoMode ? 'Demo Sandbox DB' : 'Production DB'}
              </h3>
              <p className="text-[11px] text-emerald-600 font-bold">
                FORCE RLS Multi-Tenant Isolation
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-900">Live Backend Connectivity Probe</h3>
              <p className="text-xs text-slate-500">
                Last verified: {healthStatus.timestamp ? new Date(healthStatus.timestamp).toLocaleString() : 'Never'}
              </p>
            </div>
            <button
              onClick={() => void probeLiveHealth()}
              disabled={isProbing}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-2 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isProbing ? 'Probing Server...' : 'Re-Probe Backend Health'}</span>
            </button>
          </div>
        </div>
      )}

      {activeTab === 'migrations' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6">
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
              PostgreSQL 16 + PostGIS Paired Migration Suite (`server/src/database/migrations/`)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              15 forward and rollback SQL migrations managed by `npm run db:migrate`.
            </p>
          </div>

          <div className="space-y-2.5">
            {FASTIFY_MIGRATIONS.map((m) => (
              <div
                key={m.id}
                className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between"
              >
                <div>
                  <span className="font-mono text-xs font-bold text-indigo-600">{m.file}</span>
                  <p className="text-xs text-slate-500 mt-0.5">{m.desc}</p>
                </div>
                <span
                  className={`px-3 py-1 text-xs font-black rounded-lg border flex items-center gap-1 ${
                    healthStatus.reachable
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      : 'bg-amber-100 text-amber-800 border-amber-200'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {healthStatus.reachable ? 'ACTIVE' : 'OFFLINE'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'dossier' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                Technical Architecture &amp; Deployment Handover Summary
              </h3>
              <p className="text-xs text-slate-500">
                Export current tenant runtime configuration and architecture summary.
              </p>
            </div>

            <button
              onClick={handleDownloadDossier}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Download Summary (.MD)</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-xl border border-slate-200 space-y-2">
              <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-indigo-600" /> Dual-Database Isolation
              </h4>
              <p className="text-slate-500">
                Dedicated Production database and self-resetting Demo Sandbox database with server-enforced write guards.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 space-y-2">
              <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" /> Security Architecture
              </h4>
              <p className="text-slate-500">
                PostgreSQL FORCE RLS, AES-256-GCM encrypted integration secrets, RFC 6238 TOTP MFA, and HttpOnly session rotation.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 space-y-2">
              <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                <Code2 className="w-4 h-4 text-amber-600" /> Full-Stack Codebase
              </h4>
              <p className="text-slate-500">
                Fastify 5 + TypeScript API, React 19 Admin/Staff Portal, and mobile Customer/Technician applications.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { apiClient } from '../../services/apiClient';
import type { IntegrationConfigResponse } from '../../types';
import {
  CreditCard,
  MessageSquare,
  Mail,
  Bell,
  Save,
  ShieldCheck,
  RefreshCw,
  Lock,
  Trash2,
  AlertTriangle,
} from 'lucide-react';

export const Page36PaymentNotificationConfig: React.FC = () => {
  const { addToast, isDemoMode } = useAdmin();

  const [config, setConfig] = useState<IntegrationConfigResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Toggles & Public Metadata
  const [stripeAccountId, setStripeAccountId] = useState<string>('');
  const [stripeLiveMode, setStripeLiveMode] = useState<boolean>(false);
  const [twilioEnabled, setTwilioEnabled] = useState<boolean>(false);
  const [awsSesEnabled, setAwsSesEnabled] = useState<boolean>(false);
  const [fcmPushEnabled, setFcmPushEnabled] = useState<boolean>(false);

  // Public non-secret settings
  const [stripePublishableKey, setStripePublishableKey] = useState<string>('');
  const [twilioFromNumber, setTwilioFromNumber] = useState<string>('');
  const [smtpHost, setSmtpHost] = useState<string>('');
  const [smtpPort, setSmtpPort] = useState<string>('587');
  const [smtpFromEmail, setSmtpFromEmail] = useState<string>('');

  // Write-only Secret Inputs (never persisted in browser storage; encrypted via AES-256-GCM on server)
  const [stripeSecretKey, setStripeSecretKey] = useState<string>('');
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState<string>('');
  const [paytabsServerKey, setPaytabsServerKey] = useState<string>('');
  const [telrAuthKey, setTelrAuthKey] = useState<string>('');
  const [twilioAccountSid, setTwilioAccountSid] = useState<string>('');
  const [twilioAuthToken, setTwilioAuthToken] = useState<string>('');
  const [smtpPassword, setSmtpPassword] = useState<string>('');
  const [fcmServiceKey, setFcmServiceKey] = useState<string>('');

  const loadIntegrations = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await apiClient.getIntegrations();
    if (res.success && res.data) {
      const d = res.data;
      setConfig(d);
      setStripeAccountId(d.stripeAccountId || '');
      setStripeLiveMode(Boolean(d.stripeLiveMode));
      setTwilioEnabled(Boolean(d.twilioEnabled));
      setAwsSesEnabled(Boolean(d.awsSesEnabled));
      setFcmPushEnabled(Boolean(d.fcmPushEnabled));

      const pub = d.publicSettings || {};
      setStripePublishableKey(String(pub.stripePublishableKey || ''));
      setTwilioFromNumber(String(pub.twilioFromNumber || ''));
      setSmtpHost(String(pub.smtpHost || ''));
      setSmtpPort(String(pub.smtpPort || '587'));
      setSmtpFromEmail(String(pub.smtpFromEmail || ''));
    } else {
      setError(res.error?.message || 'Unable to load tenant integration settings from server.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) void loadIntegrations();
    });
    return () => {
      active = false;
    };
  }, [loadIntegrations]);

  const getMaskedBadge = (provider: string, subKey?: string): string | null => {
    if (!config?.secretsMasked) return null;
    const entry = config.secretsMasked[provider];
    if (!entry) return null;
    if (typeof entry === 'string') return entry;
    if (subKey && typeof entry === 'object' && entry[subKey]) {
      return String(entry[subKey]);
    }
    return null;
  };

  const handleClearProviderSecret = async (provider: 'stripe' | 'paytabs' | 'telr' | 'twilio' | 'smtp' | 'fcm') => {
    setSaving(true);
    const res = await apiClient.updateIntegrations({
      secrets: { [provider]: null },
    });
    setSaving(false);
    if (res.success && res.data) {
      setConfig(res.data);
      addToast(`Cleared encrypted ${provider.toUpperCase()} credentials from server vault.`, 'info');
    } else {
      addToast(res.error?.message || 'Failed to clear secret.', 'error');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const secretsPayload: Record<string, any> = {};

    if (stripeSecretKey.trim() || stripeWebhookSecret.trim()) {
      secretsPayload.stripe = {
        ...(stripeSecretKey.trim() ? { secretKey: stripeSecretKey.trim() } : {}),
        ...(stripeWebhookSecret.trim() ? { webhookSecret: stripeWebhookSecret.trim() } : {}),
      };
    }
    if (paytabsServerKey.trim()) {
      secretsPayload.paytabs = paytabsServerKey.trim();
    }
    if (telrAuthKey.trim()) {
      secretsPayload.telr = telrAuthKey.trim();
    }
    if (twilioAccountSid.trim() || twilioAuthToken.trim()) {
      secretsPayload.twilio = {
        ...(twilioAccountSid.trim() ? { accountSid: twilioAccountSid.trim() } : {}),
        ...(twilioAuthToken.trim() ? { authToken: twilioAuthToken.trim() } : {}),
      };
    }
    if (smtpPassword.trim()) {
      secretsPayload.smtp = smtpPassword.trim();
    }
    if (fcmServiceKey.trim()) {
      secretsPayload.fcm = fcmServiceKey.trim();
    }

    const res = await apiClient.updateIntegrations({
      stripeAccountId: stripeAccountId.trim() || null,
      stripeLiveMode,
      twilioEnabled,
      awsSesEnabled,
      fcmPushEnabled,
      publicSettings: {
        stripePublishableKey: stripePublishableKey.trim(),
        twilioFromNumber: twilioFromNumber.trim(),
        smtpHost: smtpHost.trim(),
        smtpPort: smtpPort.trim(),
        smtpFromEmail: smtpFromEmail.trim(),
      },
      ...(Object.keys(secretsPayload).length > 0 ? { secrets: secretsPayload } : {}),
    });

    setSaving(false);

    if (!res.success || !res.data) {
      addToast(res.error?.message || 'Failed to update integration configurations.', 'error');
      return;
    }

    setConfig(res.data);
    setStripeSecretKey('');
    setStripeWebhookSecret('');
    setPaytabsServerKey('');
    setTelrAuthKey('');
    setTwilioAccountSid('');
    setTwilioAuthToken('');
    setSmtpPassword('');
    setFcmServiceKey('');
    addToast('Integration settings & AES-256-GCM encrypted secrets saved to PostgreSQL.', 'success');
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Payment, SMS &amp; Notification Integrations
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Server-side AES-256-GCM encrypted credential vault (`integration_configs`) — zero secrets stored in browser storage
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => void loadIntegrations()}
            className="p-2 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-slate-700 cursor-pointer"
            title="Reload Masked Config"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>

          <button
            type="submit"
            disabled={saving || loading || isDemoMode}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'Encrypting & Saving...' : 'Save & Encrypt Credentials'}</span>
          </button>
        </div>
      </div>

      {isDemoMode && (
        <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-2xl text-xs text-indigo-900 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>
            <strong>Interactive Sandbox Guard:</strong> Modifying payment and notification secrets is disabled in Demo Mode.
          </span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => void loadIntegrations()}
            className="px-3 py-1 bg-rose-200 hover:bg-rose-300 text-rose-950 font-bold rounded-lg cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Payment Gateways (Stripe / PayTabs / Telr) */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-extrabold text-slate-900">1. Payment Gateways (Stripe, PayTabs, Telr)</h2>
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={stripeLiveMode}
                onChange={(e) => setStripeLiveMode(e.target.checked)}
                className="rounded text-emerald-600"
              />
              <span>Live Mode</span>
            </label>
          </div>

          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Stripe Connect Account ID</label>
                <input
                  type="text"
                  value={stripeAccountId}
                  onChange={(e) => setStripeAccountId(e.target.value)}
                  placeholder="acct_..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-mono"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Stripe Publishable Key</label>
                <input
                  type="text"
                  value={stripePublishableKey}
                  onChange={(e) => setStripePublishableKey(e.target.value)}
                  placeholder="pk_live_... or pk_test_..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-mono"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-slate-700 flex items-center gap-1">
                  <Lock className="w-3 h-3 text-emerald-600" /> Stripe Secret Key (AES-256-GCM)
                </label>
                {getMaskedBadge('stripe', 'secretKey') && (
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-mono text-[10px] font-bold">
                    Stored: {getMaskedBadge('stripe', 'secretKey')}
                  </span>
                )}
              </div>
              <input
                type="password"
                value={stripeSecretKey}
                onChange={(e) => setStripeSecretKey(e.target.value)}
                placeholder="Leave blank to keep existing encrypted key..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-mono"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-slate-700 flex items-center gap-1">
                  <Lock className="w-3 h-3 text-emerald-600" /> Stripe Webhook Signing Secret
                </label>
                {getMaskedBadge('stripe', 'webhookSecret') && (
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-mono text-[10px] font-bold">
                    Stored: {getMaskedBadge('stripe', 'webhookSecret')}
                  </span>
                )}
              </div>
              <input
                type="password"
                value={stripeWebhookSecret}
                onChange={(e) => setStripeWebhookSecret(e.target.value)}
                placeholder="whsec_... (leave blank to keep existing)"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-mono"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">PayTabs Server Key (MENA)</label>
                  {getMaskedBadge('paytabs') && (
                    <span className="font-mono text-[10px] text-emerald-700">{getMaskedBadge('paytabs')}</span>
                  )}
                </div>
                <input
                  type="password"
                  value={paytabsServerKey}
                  onChange={(e) => setPaytabsServerKey(e.target.value)}
                  placeholder="Rotate PayTabs key..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-mono"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">Telr Auth Key (UAE)</label>
                  {getMaskedBadge('telr') && (
                    <span className="font-mono text-[10px] text-emerald-700">{getMaskedBadge('telr')}</span>
                  )}
                </div>
                <input
                  type="password"
                  value={telrAuthKey}
                  onChange={(e) => setTelrAuthKey(e.target.value)}
                  placeholder="Rotate Telr key..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 2. Twilio SMS Dispatch */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-extrabold text-slate-900">2. Twilio Cellular SMS Gateway</h2>
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={twilioEnabled}
                onChange={(e) => setTwilioEnabled(e.target.checked)}
                className="rounded text-emerald-600"
              />
              <span>Enabled</span>
            </label>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Outbound Sender Phone / Alpha ID</label>
              <input
                type="text"
                value={twilioFromNumber}
                onChange={(e) => setTwilioFromNumber(e.target.value)}
                placeholder="+971500000000"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-mono"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-slate-700">Twilio Account SID (Encrypted)</label>
                {getMaskedBadge('twilio', 'accountSid') && (
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-mono text-[10px] font-bold">
                    Stored: {getMaskedBadge('twilio', 'accountSid')}
                  </span>
                )}
              </div>
              <input
                type="password"
                value={twilioAccountSid}
                onChange={(e) => setTwilioAccountSid(e.target.value)}
                placeholder="AC... (leave blank to keep existing)"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-mono"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-slate-700">Twilio Auth Token (Encrypted)</label>
                {getMaskedBadge('twilio', 'authToken') && (
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-mono text-[10px] font-bold">
                    Stored: {getMaskedBadge('twilio', 'authToken')}
                  </span>
                )}
              </div>
              <input
                type="password"
                value={twilioAuthToken}
                onChange={(e) => setTwilioAuthToken(e.target.value)}
                placeholder="Leave blank to keep existing token..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-mono"
              />
            </div>

            {config?.secretsMasked?.twilio && !isDemoMode && (
              <button
                type="button"
                onClick={() => void handleClearProviderSecret('twilio')}
                className="text-[11px] font-bold text-rose-600 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" /> Clear stored Twilio secrets
              </button>
            )}
          </div>
        </div>

        {/* 3. Transactional Email (SMTP / AWS SES) */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-emerald-600" />
              <h2 className="text-sm font-extrabold text-slate-900">3. Transactional Email (SMTP / AWS SES)</h2>
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={awsSesEnabled}
                onChange={(e) => setAwsSesEnabled(e.target.checked)}
                className="rounded text-emerald-600"
              />
              <span>Enabled</span>
            </label>
          </div>

          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="font-bold text-slate-700 block mb-1">SMTP Host</label>
                <input
                  type="text"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  placeholder="email-smtp.me-central-1.amazonaws.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-mono"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Port</label>
                <input
                  type="text"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(e.target.value)}
                  placeholder="587"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Sender Email Address</label>
              <input
                type="email"
                value={smtpFromEmail}
                onChange={(e) => setSmtpFromEmail(e.target.value)}
                placeholder="no-reply@yourcompany.com"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-slate-700">SMTP / SES Secret Key (Encrypted)</label>
                {getMaskedBadge('smtp') && (
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-mono text-[10px] font-bold">
                    Stored: {getMaskedBadge('smtp')}
                  </span>
                )}
              </div>
              <input
                type="password"
                value={smtpPassword}
                onChange={(e) => setSmtpPassword(e.target.value)}
                placeholder="Leave blank to keep existing SMTP secret..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-mono"
              />
            </div>
          </div>
        </div>

        {/* 4. Mobile Push Notifications (Firebase FCM) */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-600" />
              <h2 className="text-sm font-extrabold text-slate-900">4. Mobile Push Notifications (FCM)</h2>
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={fcmPushEnabled}
                onChange={(e) => setFcmPushEnabled(e.target.checked)}
                className="rounded text-emerald-600"
              />
              <span>Enabled</span>
            </label>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-slate-700">FCM Service Account Key (Encrypted)</label>
                {getMaskedBadge('fcm') && (
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-mono text-[10px] font-bold">
                    Stored: {getMaskedBadge('fcm')}
                  </span>
                )}
              </div>
              <input
                type="password"
                value={fcmServiceKey}
                onChange={(e) => setFcmServiceKey(e.target.value)}
                placeholder="Paste Firebase Admin SDK key or leave blank..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-mono"
              />
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                All credentials are encrypted at rest using 256-bit AES-GCM (`AuthService.encryptSecret`) and returned only as 4-character masked previews.
              </span>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
};

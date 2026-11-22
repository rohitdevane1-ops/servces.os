import React, { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { apiClient } from '../../services/apiClient';
import { formatMoneyCents } from '../../utils/formatters';
import { Modal } from '../../components/common/Modal';
import {
  Send,
  CheckCircle,
  Clock,
  Landmark,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  History,
  X,
} from 'lucide-react';

interface ServerPayoutBalance {
  providerId: string;
  fullName: string;
  tradeCategory: string;
  connectAccountMasked: string;
  payoutsEnabled: boolean;
  completedJobs: number;
  grossRevenueCents: number;
  totalEarnedCents: number;
  totalDisbursedCents: number;
  unpaidBalanceCents: number;
}

interface ServerPayoutHistoryItem {
  id: string;
  providerId: string;
  providerName: string;
  amountCents: number;
  currency: string;
  status: string;
  transferId: string | null;
  processedAt: string | null;
  createdAt: string;
}

export const Page29TechnicianPayouts: React.FC = () => {
  const { addToast, tenantConfig, isDemoMode } = useAdmin();
  const [balances, setBalances] = useState<ServerPayoutBalance[]>([]);
  const [history, setHistory] = useState<ServerPayoutHistoryItem[]>([]);
  const [currency, setCurrency] = useState<string>(tenantConfig.currencyCode || 'AED');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);

  // Confirmation modal state
  const [confirmTarget, setConfirmTarget] = useState<
    | { mode: 'SINGLE'; provider: ServerPayoutBalance }
    | { mode: 'BATCH'; providers: ServerPayoutBalance[] }
    | null
  >(null);

  const loadPayouts = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    const res = await apiClient.getPayoutsOverview();
    if (res.success && res.data) {
      setBalances(Array.isArray(res.data.balances) ? res.data.balances : []);
      setHistory(Array.isArray(res.data.history) ? res.data.history : []);
      if (res.data.currency) setCurrency(res.data.currency);
    } else {
      setLoadError(res.error?.message || 'Unable to load authoritative payout balances from server.');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) void loadPayouts();
    });
    return () => {
      active = false;
    };
  }, [loadPayouts]);

  /**
   * Unified deterministic idempotency key shared across single and batch payout buttons
   * so clicking Single and then Batch in the same settlement cycle never double-disburses.
   */
  const buildUnifiedIdempotencyKey = (providerId: string, unpaidBalanceCents: number) => {
    const periodKey = new Date().toISOString().slice(0, 10);
    return `${providerId}_${unpaidBalanceCents}_${periodKey}`;
  };

  const executeConfirmedPayout = async () => {
    if (!confirmTarget) return;

    if (confirmTarget.mode === 'SINGLE') {
      const p = confirmTarget.provider;
      setConfirmTarget(null);
      setProcessingId(p.providerId);
      try {
        const idemKey = buildUnifiedIdempotencyKey(p.providerId, p.unpaidBalanceCents);
        const res = await apiClient.triggerPayout(
          p.providerId,
          p.unpaidBalanceCents,
          idemKey,
          `Settlement payout for ${p.completedJobs} completed work orders`
        );
        if (!res.success) {
          addToast(res.error?.message || `Payout to ${p.fullName} rejected by server.`, 'error');
        } else {
          addToast(
            `Disbursed ${formatMoneyCents(p.unpaidBalanceCents, currency)} to ${p.fullName} (${res.data?.transferId || 'PROCESSING'}).`,
            'success'
          );
          await loadPayouts();
        }
      } finally {
        setProcessingId(null);
      }
      return;
    }

    const targets = confirmTarget.providers;
    setConfirmTarget(null);
    setProcessingId('BATCH');
    let okCount = 0;
    for (const p of targets) {
      const idemKey = buildUnifiedIdempotencyKey(p.providerId, p.unpaidBalanceCents);
      const res = await apiClient.triggerPayout(
        p.providerId,
        p.unpaidBalanceCents,
        idemKey,
        `Batch settlement payout for ${p.completedJobs} completed work orders`
      );
      if (res.success) {
        okCount++;
      } else {
        addToast(`${p.fullName}: ${res.error?.message || 'Payout failed'}`, 'error');
      }
    }
    setProcessingId(null);
    if (okCount > 0) {
      addToast(`Processed ${okCount} technician payouts via authoritative ledger.`, 'success');
    }
    await loadPayouts();
  };

  const handleReconcile = async (payoutId: string) => {
    setReconcilingId(payoutId);
    const res = await apiClient.reconcilePayout(payoutId);
    setReconcilingId(null);
    if (res.success) {
      addToast(res.data?.message || `Payout ${payoutId.slice(0, 8)} reconciled (${res.data?.status}).`, 'success');
      await loadPayouts();
    } else {
      addToast(res.error?.message || 'Payout reconciliation failed.', 'error');
    }
  };

  const unpaidProviders = balances.filter((b) => b.unpaidBalanceCents > 0);
  const totalUnpaidCents = unpaidProviders.reduce((s, b) => s + b.unpaidBalanceCents, 0);
  const commissionPercent = Number(((tenantConfig.commissionBps ?? 1500) / 100).toFixed(1));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Technician Payouts &amp; Commission Split
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Authoritative server-calculated unpaid balances (after statutory tax &amp; {commissionPercent}% platform commission)
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => void loadPayouts()}
            disabled={isLoading}
            className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <button
            disabled={isLoading || processingId !== null || unpaidProviders.length === 0 || isDemoMode}
            onClick={() => setConfirmTarget({ mode: 'BATCH', providers: unpaidProviders })}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            Disburse All Pending ({formatMoneyCents(totalUnpaidCents, currency)})
          </button>
        </div>
      </div>

      {isDemoMode && (
        <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-2xl text-xs text-indigo-900 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>
            <strong>Interactive Sandbox Guard:</strong> Live Stripe Connect transfers are protected in Demo Mode. Balances and history below are read from the live database.
          </span>
        </div>
      )}

      {loadError && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-center justify-between text-xs text-rose-800">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            <span>{loadError}</span>
          </div>
          <button
            onClick={() => void loadPayouts()}
            className="px-3 py-1.5 bg-white border border-rose-200 rounded-lg font-bold text-rose-700 hover:bg-rose-100 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Unpaid Balances Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-slate-900">Provider Unpaid Ledger Balances</h2>
          <span className="text-[11px] font-mono text-slate-500">Currency: {currency}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3.5 px-4">Technician</th>
                <th className="py-3.5 px-4">Connect Account</th>
                <th className="py-3.5 px-4 text-center">Completed Jobs</th>
                <th className="py-3.5 px-4 text-right">Gross Volume</th>
                <th className="py-3.5 px-4 text-right">Total Net Earned</th>
                <th className="py-3.5 px-4 text-right">Already Disbursed</th>
                <th className="py-3.5 px-4 text-right">Unpaid Balance</th>
                <th className="py-3.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {balances.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    {isLoading ? 'Loading provider balances...' : 'No provider balances found.'}
                  </td>
                </tr>
              ) : (
                balances.map((p) => {
                  const hasUnpaid = p.unpaidBalanceCents > 0;
                  return (
                    <tr key={p.providerId} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{p.fullName}</div>
                        <div className="text-[11px] text-slate-400">{p.tradeCategory}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-600 flex items-center gap-1.5 mt-2">
                        <Landmark className="w-3.5 h-3.5 text-slate-400" />
                        <span>{p.connectAccountMasked}</span>
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold text-slate-700">{p.completedJobs}</td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-700">
                        {formatMoneyCents(p.grossRevenueCents, currency)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-800">
                        {formatMoneyCents(p.totalEarnedCents, currency)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-medium text-slate-500">
                        {formatMoneyCents(p.totalDisbursedCents, currency)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-extrabold text-emerald-700 text-sm">
                        {formatMoneyCents(p.unpaidBalanceCents, currency)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {hasUnpaid ? (
                          <button
                            disabled={processingId !== null || isDemoMode}
                            onClick={() => setConfirmTarget({ mode: 'SINGLE', provider: p })}
                            className="px-3 py-1.5 bg-slate-900 hover:bg-black disabled:opacity-50 text-white font-bold rounded-xl transition-all cursor-pointer"
                          >
                            {processingId === p.providerId ? 'Sending...' : 'Send Payout'}
                          </button>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 inline-flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Settled
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Persisted Payout History Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-extrabold text-slate-900">Persisted Payout Disbursement History</h2>
          </div>
          <span className="text-xs text-slate-400">{history.length} records</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Technician</th>
                <th className="py-3 px-4">Stripe Transfer Ref</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Reconciliation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No historical payout disbursements recorded yet.
                  </td>
                </tr>
              ) : (
                history.map((h) => {
                  const needsReconcile =
                    h.status === 'PENDING_PROVIDER_CONFIRMATION' || h.status === 'PROCESSING';
                  return (
                    <tr key={h.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                        {new Date(h.processedAt || h.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">{h.providerName}</td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                        {h.transferId || 'Pending Transfer'}
                      </td>
                      <td className="py-3 px-4 text-right font-extrabold text-slate-900">
                        {formatMoneyCents(h.amountCents, h.currency || currency)}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold inline-flex items-center gap-1 ${
                            h.status === 'PAID'
                              ? 'bg-emerald-100 text-emerald-800'
                              : h.status === 'FAILED' || h.status === 'REVERSED'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {h.status === 'PAID' ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                          {h.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {needsReconcile && !isDemoMode && (
                          <button
                            disabled={reconcilingId === h.id}
                            onClick={() => void handleReconcile(h.id)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-[11px] cursor-pointer"
                          >
                            {reconcilingId === h.id ? 'Reconciling...' : 'Reconcile'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payout Confirmation Modal */}
      <Modal
        isOpen={Boolean(confirmTarget)}
        onClose={() => setConfirmTarget(null)}
        maxWidthClass="max-w-md"
        ariaLabel="Confirm Technician Payout Disbursement"
      >
        {confirmTarget && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-extrabold text-slate-900">Confirm Payout Disbursement</h3>
              <button
                onClick={() => setConfirmTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {confirmTarget.mode === 'SINGLE' ? (
              <div className="text-xs text-slate-600 space-y-2">
                <p>
                  You are about to initiate an authoritative payout transfer to{' '}
                  <strong className="text-slate-900">{confirmTarget.provider.fullName}</strong> (
                  {confirmTarget.provider.connectAccountMasked}).
                </p>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                  <span className="font-bold text-emerald-900">Net Disbursement Amount:</span>
                  <span className="text-sm font-black text-emerald-700">
                    {formatMoneyCents(confirmTarget.provider.unpaidBalanceCents, currency)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-600 space-y-2">
                <p>
                  You are about to initiate batch payouts for{' '}
                  <strong className="text-slate-900">{confirmTarget.providers.length} technicians</strong>.
                </p>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                  <span className="font-bold text-emerald-900">Total Batch Disbursement:</span>
                  <span className="text-sm font-black text-emerald-700">
                    {formatMoneyCents(totalUnpaidCents, currency)}
                  </span>
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmTarget(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => void executeConfirmedPayout()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-xs cursor-pointer"
              >
                Confirm &amp; Disburse Now
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

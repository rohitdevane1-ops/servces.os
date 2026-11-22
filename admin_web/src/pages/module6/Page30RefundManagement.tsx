import React, { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { apiClient } from '../../services/apiClient';
import { Modal } from '../../components/common/Modal';
import {
  RotateCcw,
  CheckCircle,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  X,
} from 'lucide-react';

export const Page30RefundManagement: React.FC = () => {
  const { addToast, formatCurrencyCents, tenantConfig, isDemoMode, refreshOperationsData } = useAdmin();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);

  const [refundTarget, setRefundTarget] = useState<any | null>(null);
  const [refundAmountInput, setRefundAmountInput] = useState<string>('');
  const [refundReason, setRefundReason] = useState<string>('Customer refund approved by admin');
  const [modalIdempotencyKey, setModalIdempotencyKey] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const loadRefundData = useCallback(async () => {
    const [invRes, refRes] = await Promise.all([
      apiClient.getInvoices({ limit: 100 }),
      apiClient.getRefunds(),
    ]);
    if (invRes.success && Array.isArray(invRes.data)) {
      const relevant = invRes.data.filter((inv: any) =>
        ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(String(inv.status || '').toUpperCase())
      );
      setInvoices(relevant);
    } else {
      setInvoices([]);
    }
    if (refRes.success && Array.isArray(refRes.data)) {
      setRefunds(refRes.data);
    } else {
      setRefunds([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([apiClient.getInvoices({ limit: 100 }), apiClient.getRefunds()])
      .then(([invRes, refRes]) => {
        if (!active) return;
        if (invRes.success && Array.isArray(invRes.data)) {
          const relevant = invRes.data.filter((inv: any) =>
            ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(String(inv.status || '').toUpperCase())
          );
          setInvoices(relevant);
        } else {
          setInvoices([]);
        }
        if (refRes.success && Array.isArray(refRes.data)) {
          setRefunds(refRes.data);
        } else {
          setRefunds([]);
        }
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const openRefundModal = (inv: any) => {
    const totalMajor = (Number(inv.totalAmountCents ?? 0) / 100).toFixed(2);
    setRefundTarget(inv);
    setRefundAmountInput(totalMajor);
    setRefundReason('Customer refund approved by admin');
    setModalIdempotencyKey(`refund_${inv.id}_${Date.now()}`);
  };

  const handleConfirmRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundTarget) return;

    const amountCents = Math.round(parseFloat(refundAmountInput) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      addToast('Please enter a valid positive refund amount.', 'error');
      return;
    }

    setIsSubmitting(true);
    const res = await apiClient.createRefund(
      {
        invoiceId: refundTarget.id,
        bookingId: refundTarget.bookingId,
        amountCents,
        reason: refundReason.trim() || 'Customer refund approved by admin',
      },
      modalIdempotencyKey
    );
    setIsSubmitting(false);

    if (!res.success) {
      addToast(res.error?.message || 'Refund execution rejected by server.', 'error');
      return;
    }

    addToast(
      `Refund of ${formatCurrencyCents(amountCents)} processed (${res.data?.refundId || 'SUCCEEDED'}). Proportional tax & commission reversed in ledger.`,
      'success'
    );
    setRefundTarget(null);
    await loadRefundData();
    await refreshOperationsData();
  };

  const handleReconcileRefund = async (refundId: string) => {
    setReconcilingId(refundId);
    const res = await apiClient.reconcileRefund(refundId);
    setReconcilingId(null);
    if (!res.success) {
      addToast(res.error?.message || 'Refund reconciliation failed.', 'error');
      return;
    }
    addToast(
      `Refund reconciliation complete (status: ${res.data?.status || 'UPDATED'}).`,
      res.data?.status === 'FAILED' ? 'warning' : 'success'
    );
    await loadRefundData();
    await refreshOperationsData();
  };

  const settledCount = invoices.filter((i) => i.status === 'PAID').length;
  const refundedOrPartialCount = invoices.filter(
    (i) => i.status === 'REFUNDED' || i.status === 'PARTIALLY_REFUNDED'
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Refund &amp; Dispute Adjudication
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Execute full or partial Stripe refunds with proportional {tenantConfig.taxName}, platform commission, and technician payable ledger reversals
          </p>
        </div>

        <button
          onClick={() => {
            setLoading(true);
            void loadRefundData();
          }}
          className="px-3.5 py-2 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {isDemoMode && (
        <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-2xl text-xs text-indigo-900 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>
            <strong>Interactive Sandbox Guard:</strong> Refund mutations are read-only in Demo Mode to preserve the shared evaluation dataset.
          </span>
        </div>
      )}

      {/* KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase">Settled Eligible Invoices</div>
          <div className="text-xl font-extrabold text-slate-900 mt-1">{settledCount} Settled</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase">Refunded / Partially Refunded</div>
          <div className="text-xl font-extrabold text-amber-600 mt-1">{refundedOrPartialCount} Processed</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase">Ledger Accounting</div>
          <div className="text-xl font-extrabold text-emerald-600 mt-1">3-Phase Atomic Reversal</div>
        </div>
      </div>

      {/* Invoices List */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3.5 px-4">Invoice #</th>
                <th className="py-3.5 px-4">Booking Ref</th>
                <th className="py-3.5 px-4">Customer</th>
                <th className="py-3.5 px-4">Service</th>
                <th className="py-3.5 px-4 text-right">{tenantConfig.taxName}</th>
                <th className="py-3.5 px-4 text-right">Total Paid</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Adjudication</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Loading settled invoices...
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    No settled or refunded invoices recorded yet.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => {
                  const canRefund = inv.status === 'PAID' || inv.status === 'PARTIALLY_REFUNDED';
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{inv.invoiceNumber}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-600">{inv.bookingReference || 'â€”'}</td>
                      <td className="py-3.5 px-4 font-bold text-slate-800">{inv.customerName}</td>
                      <td className="py-3.5 px-4 text-slate-600">{inv.serviceName}</td>
                      <td className="py-3.5 px-4 text-right text-slate-600">
                        {formatCurrencyCents(inv.taxTotalCents)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-extrabold text-slate-900">
                        {formatCurrencyCents(inv.totalAmountCents)}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                            inv.status === 'REFUNDED'
                              ? 'bg-rose-100 text-rose-800'
                              : inv.status === 'PARTIALLY_REFUNDED'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {canRefund ? (
                          <button
                            disabled={isDemoMode}
                            onClick={() => openRefundModal(inv)}
                            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all cursor-pointer inline-flex items-center gap-1"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Issue Refund</span>
                          </button>
                        ) : (
                          <span className="text-[11px] font-bold text-slate-400 inline-flex items-center gap-1">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> Fully Refunded
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

      {/* Persisted Refund Ledger & Reconciliation Queue */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900">Refund History &amp; Reconciliation Queue</h2>
            <p className="text-[11px] text-slate-500">
              All persisted refund attempts (`GET /api/v1/finances/refunds`) with reconciliation recovery
            </p>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">
            {refunds.length} Record(s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/40 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Booking Ref</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Reason</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4">Gateway Ref</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {refunds.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    No refund requests recorded yet.
                  </td>
                </tr>
              ) : (
                refunds.map((ref) => {
                  const st = String(ref.status || '').toUpperCase();
                  const needsRecon = st === 'PENDING' || st === 'REQUIRES_RECONCILIATION';
                  return (
                    <tr key={ref.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{ref.invoiceNumber || 'â€”'}</td>
                      <td className="py-3 px-4 font-mono text-slate-600">{ref.bookingReference || 'â€”'}</td>
                      <td className="py-3 px-4 font-bold text-slate-800">{ref.customerName || 'Customer'}</td>
                      <td className="py-3 px-4 text-slate-600 max-w-[200px] truncate">{ref.reason || 'â€”'}</td>
                      <td className="py-3 px-4 text-right font-extrabold text-slate-900">
                        {formatCurrencyCents(ref.amountCents)}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500">{ref.stripeRefundId || 'Pending'}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                            st === 'SUCCEEDED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : st === 'FAILED'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {st}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {needsRecon ? (
                          <button
                            disabled={isDemoMode || reconcilingId === ref.id}
                            onClick={() => void handleReconcileRefund(ref.id)}
                            className="px-3 py-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold rounded-lg transition-all cursor-pointer inline-flex items-center gap-1"
                          >
                            <RefreshCw className={`w-3 h-3 ${reconcilingId === ref.id ? 'animate-spin' : ''}`} />
                            <span>{reconcilingId === ref.id ? 'Reconciling...' : 'Reconcile'}</span>
                          </button>
                        ) : (
                          <span className="text-[11px] font-semibold text-slate-400">
                            {ref.ledgerPosted ? 'Ledger Posted' : st}
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

      {/* Refund Adjudication Modal */}
      <Modal
        isOpen={Boolean(refundTarget)}
        onClose={() => setRefundTarget(null)}
        maxWidthClass="max-w-md"
        ariaLabel="Issue Customer Refund"
      >
        {refundTarget && (
          <form onSubmit={handleConfirmRefund} className="p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Issue Refund â€” {refundTarget.invoiceNumber}
                </h3>
                <p className="text-xs text-slate-500">
                  Customer: {refundTarget.customerName} â€¢ Invoice Total:{' '}
                  {formatCurrencyCents(refundTarget.totalAmountCents)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRefundTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Refund Amount ({tenantConfig.currencyCode})
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={(Number(refundTarget.totalAmountCents ?? 0) / 100).toFixed(2)}
                required
                value={refundAmountInput}
                onChange={(e) => setRefundAmountInput(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-rose-500"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Enter full or partial amount. Server reverses proportional {tenantConfig.taxName}, platform fee, and technician payable.
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Refund Reason (Audit Trail)</label>
              <input
                type="text"
                required
                minLength={3}
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Idempotency Key: <code className="font-mono">{modalIdempotencyKey}</code>
              </span>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRefundTarget(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-xs cursor-pointer"
              >
                {isSubmitting ? 'Processing Refund...' : 'Confirm & Issue Refund'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

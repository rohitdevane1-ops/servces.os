import React, { useEffect, useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { apiClient } from '../../services/apiClient';
import { downloadCSV } from '../../utils/exportUtils';
import { Modal } from '../../components/common/Modal';
import {
  FileText,
  Printer,
  CheckCircle,
  Clock,
  AlertCircle,
  Plus,
  Download,
  RefreshCw,
  Eye,
  X,
} from 'lucide-react';

export const Page28CustomerInvoices: React.FC = () => {
  const {
    addToast,
    setIsCreateInvoiceModalOpen,
    tenantConfig,
    formatCurrencyCents,
    currentRole,
  } = useAdmin();

  const [serverInvoices, setServerInvoices] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshTick, setRefreshTick] = useState<number>(0);

  const [detailInvoice, setDetailInvoice] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    apiClient
      .getInvoices({
        limit: 100,
        ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
      })
      .then((res) => {
        if (!active) return;
        if (res.success && Array.isArray(res.data)) {
          setServerInvoices(res.data);
        } else {
          setServerInvoices([]);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setServerInvoices([]);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [statusFilter, refreshTick]);

  const inspectInvoice = async (invoiceId: string) => {
    setDetailLoading(true);
    const res = await apiClient.getInvoice(invoiceId);
    setDetailLoading(false);
    if (res.success && res.data) {
      setDetailInvoice(res.data);
    } else {
      addToast(res.error?.message || 'Unable to load invoice details.', 'error');
    }
  };

  const handleExportCSV = () => {
    // Authoritative server tax & total (no compound double taxation)
    downloadCSV(
      'customer_invoices_ledger',
      [
        'Invoice Number',
        'Booking Ref',
        'Customer Name',
        'Service Rendered',
        'Issued Date',
        `Subtotal Excl. ${tenantConfig.taxName} (${tenantConfig.currencyCode})`,
        `${tenantConfig.taxName} (${tenantConfig.currencyCode})`,
        `Total Amount (${tenantConfig.currencyCode})`,
        'Billing Status',
      ],
      serverInvoices.map((inv) => {
        const subCents = Number(inv.laborSubtotalCents ?? 0) + Number(inv.partsSubtotalCents ?? 0);
        const taxCents = Number(inv.taxTotalCents ?? 0);
        const totalCents = Number(inv.totalAmountCents ?? 0);
        const effectiveSubCents = subCents > 0 ? subCents : Math.max(0, totalCents - taxCents);
        return [
          inv.invoiceNumber,
          inv.bookingReference || '—',
          inv.customerName,
          inv.serviceName,
          inv.issuedAt ? new Date(inv.issuedAt).toLocaleDateString() : '',
          (effectiveSubCents / 100).toFixed(2),
          (taxCents / 100).toFixed(2),
          (totalCents / 100).toFixed(2),
          inv.status,
        ];
      })
    );
    addToast(`Exported ${serverInvoices.length} itemized invoices to CSV.`, 'success');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Customer Invoices &amp; Tax Billing
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Authoritative itemized invoices with server-calculated {tenantConfig.taxName} ({tenantConfig.vatPercent}%)
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="PAID">Paid</option>
            <option value="AUTHORIZED">Authorized</option>
            <option value="PARTIALLY_REFUNDED">Partially Refunded</option>
            <option value="REFUNDED">Refunded</option>
            <option value="DRAFT">Draft</option>
            <option value="VOID">Void</option>
          </select>

          <button
            onClick={() => setRefreshTick((t) => t + 1)}
            className="p-2 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-slate-700 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>

          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-bold text-xs rounded-xl shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>

          {currentRole === 'ADMIN' && (
            <button
              onClick={() => setIsCreateInvoiceModalOpen(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Create Custom Invoice
            </button>
          )}
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3.5 px-4">Invoice #</th>
                <th className="py-3.5 px-4">Customer</th>
                <th className="py-3.5 px-4">Service</th>
                <th className="py-3.5 px-4">Issued Date</th>
                <th className="py-3.5 px-4 text-right">Subtotal</th>
                <th className="py-3.5 px-4 text-right">{tenantConfig.taxName}</th>
                <th className="py-3.5 px-4 text-right">Total</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    Loading invoices from server...
                  </td>
                </tr>
              ) : serverInvoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-14 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                      <FileText className="w-6 h-6" />
                    </div>
                    <h3 className="text-sm font-extrabold text-slate-800">No Invoices Found</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Invoices are generated automatically when customer bookings are created.
                    </p>
                  </td>
                </tr>
              ) : (
                serverInvoices.map((inv) => {
                  const totalCents = Number(inv.totalAmountCents ?? 0);
                  const taxCents = Number(inv.taxTotalCents ?? 0);
                  const rawSubCents = Number(inv.laborSubtotalCents ?? 0) + Number(inv.partsSubtotalCents ?? 0);
                  const subCents = rawSubCents > 0 ? rawSubCents : Math.max(0, totalCents - taxCents);

                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        {inv.invoiceNumber}
                        {inv.bookingReference && (
                          <span className="block text-[10px] text-slate-400">Order {inv.bookingReference}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-800">{inv.customerName}</td>
                      <td className="py-3.5 px-4 text-slate-600">{inv.serviceName}</td>
                      <td className="py-3.5 px-4 text-slate-500">
                        {inv.issuedAt ? new Date(inv.issuedAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-medium text-slate-700">
                        {formatCurrencyCents(subCents)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-medium text-slate-600">
                        {formatCurrencyCents(taxCents)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-extrabold text-slate-900">
                        {formatCurrencyCents(totalCents)}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold inline-flex items-center gap-1 ${
                            inv.status === 'PAID'
                              ? 'bg-emerald-100 text-emerald-800'
                              : inv.status === 'PARTIALLY_REFUNDED' || inv.status === 'AUTHORIZED'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {inv.status === 'PAID' ? (
                            <CheckCircle className="w-3 h-3" />
                          ) : inv.status === 'VOID' || inv.status === 'REFUNDED' ? (
                            <AlertCircle className="w-3 h-3" />
                          ) : (
                            <Clock className="w-3 h-3" />
                          )}
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => inspectInvoice(inv.id)}
                            disabled={detailLoading}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Inspect</span>
                          </button>
                          <button
                            onClick={() => window.print()}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg cursor-pointer"
                            title="Print Invoice"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Itemized Invoice Inspector Modal */}
      <Modal
        isOpen={Boolean(detailInvoice)}
        onClose={() => setDetailInvoice(null)}
        maxWidthClass="max-w-2xl"
        ariaLabel="Itemized Invoice Details"
      >
        {detailInvoice && (
          <div className="p-6 space-y-5 overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">
                  Invoice {detailInvoice.invoiceNumber}
                </h2>
                <p className="text-xs text-slate-500">
                  Customer: {detailInvoice.customerName} ({detailInvoice.customerEmail}) • Status:{' '}
                  <strong>{detailInvoice.status}</strong>
                </p>
              </div>
              <button
                onClick={() => setDetailInvoice(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-2">
                Line Items
              </h3>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 text-[10px] uppercase">
                    <th className="py-2 text-left">Description</th>
                    <th className="py-2 text-center">Type</th>
                    <th className="py-2 text-center">Qty</th>
                    <th className="py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(detailInvoice.items || []).map((item: any) => (
                    <tr key={item.id}>
                      <td className="py-2 font-bold text-slate-800">{item.description}</td>
                      <td className="py-2 text-center font-mono text-[10px] text-slate-500">{item.itemType}</td>
                      <td className="py-2 text-center text-slate-600">{item.quantity}</td>
                      <td className="py-2 text-right font-bold text-slate-900">
                        {formatCurrencyCents(item.totalCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 font-extrabold text-sm">
                    <td colSpan={3} className="py-3 text-right">
                      Total ({tenantConfig.taxName} Incl.):
                    </td>
                    <td className="py-3 text-right text-emerald-700">
                      {formatCurrencyCents(detailInvoice.totalAmountCents)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

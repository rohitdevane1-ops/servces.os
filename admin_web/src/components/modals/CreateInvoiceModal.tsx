import React, { useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { calculateSingleTax } from '../../utils/formatters';
import { Modal } from '../common/Modal';
import { X, FileText, DollarSign, Calendar, User, CheckCircle2, Send } from 'lucide-react';

export const CreateInvoiceModal: React.FC = () => {
  const {
    isCreateInvoiceModalOpen,
    setIsCreateInvoiceModalOpen,
    addInvoice,
    bookings,
    customers,
    services,
    currentRole,
    tenantConfig,
    formatCurrency,
  } = useAdmin();

  const [selectedBookingId, setSelectedBookingId] = useState(bookings[0]?.id || '');
  const [customerName, setCustomerName] = useState(bookings[0]?.customerName || customers[0]?.name || '');
  const [serviceName, setServiceName] = useState(services[0]?.name || 'Custom Home Service');
  const [amount, setAmount] = useState<number>(services[0]?.basePrice || 150);
  const [status, setStatus] = useState<'Paid' | 'Pending' | 'Overdue'>('Pending');
  const [notes, setNotes] = useState('');

  if (currentRole !== 'ADMIN' || !isCreateInvoiceModalOpen) return null;

  // Single non-compounding tenant tax calculation
  const taxBreakdown = calculateSingleTax(amount, tenantConfig.taxRateBps);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await addInvoice({
      bookingId: selectedBookingId || undefined,
      customerName: customerName.trim() || customers[0]?.name || 'Valued Customer',
      serviceName,
      subtotalAmount: taxBreakdown.subtotal,
      amount: taxBreakdown.total,
      status,
    });
    if (res.ok) {
      setIsCreateInvoiceModalOpen(false);
    }
  };

  return (
    <Modal
      isOpen={isCreateInvoiceModalOpen}
      onClose={() => setIsCreateInvoiceModalOpen(false)}
      maxWidthClass="max-w-lg"
      ariaLabel="Generate Itemized Customer Invoice"
    >
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-900">Generate Itemized Customer Invoice</h2>
            <p className="text-xs text-slate-500">
              Single {tenantConfig.taxName} ({taxBreakdown.taxRatePercent}%) calculation in {tenantConfig.currencyCode}
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsCreateInvoiceModalOpen(false)}
          className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200/50 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Attach to Booking</label>
          <select
            value={selectedBookingId}
            onChange={(e) => {
              const id = e.target.value;
              setSelectedBookingId(id);
              const found = bookings.find((b) => b.id === id);
              if (found) {
                setCustomerName(found.customerName);
                setServiceName(found.serviceName);
                if (found.estimate > 0) setAmount(found.estimate);
              }
            }}
            required={bookings.length > 0}
            className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 focus:outline-none font-medium"
          >
            <option value="">Select existing booking...</option>
            {bookings.map((b) => (
              <option key={b.id} value={b.id}>
                #{b.jobNo} — {b.customerName} ({b.serviceName})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-slate-400" />
            <span>Select or Enter Customer</span>
          </label>
          <input
            type="text"
            list="customer-list"
            required
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Type or select customer name..."
            className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 focus:outline-none"
          />
          <datalist id="customer-list">
            {customers.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Line Item Service Description</label>
          <select
            value={serviceName}
            onChange={(e) => {
              setServiceName(e.target.value);
              const found = services.find((s) => s.name === e.target.value);
              if (found) setAmount(found.basePrice);
            }}
            className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 focus:outline-none"
          >
            {services.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name} ({formatCurrency(s.basePrice)})
              </option>
            ))}
            <option value="Custom Inspection & Emergency Repair">Custom Inspection &amp; Emergency Repair</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-slate-400" />
              <span>Subtotal Excl. {tenantConfig.taxName} ({tenantConfig.currencyCode})</span>
            </label>
            <input
              type="number"
              required
              min={1}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 focus:outline-none font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Payment Status</span>
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 focus:outline-none font-bold"
            >
              <option value="Pending">Pending Payment</option>
              <option value="Paid">Paid</option>
              <option value="Overdue">Overdue</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Billing Notes</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Warranty terms or scope notes..."
            className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5 text-xs">
          <div className="flex items-center justify-between text-slate-600">
            <span>Subtotal (Excl. {tenantConfig.taxName}):</span>
            <span className="font-bold text-slate-800">{formatCurrency(taxBreakdown.subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-slate-600">
            <span>
              {tenantConfig.taxName} ({taxBreakdown.taxRatePercent}%):
            </span>
            <span className="font-bold text-slate-800">{formatCurrency(taxBreakdown.taxAmount)}</span>
          </div>
          <div className="pt-1.5 border-t border-slate-200 flex items-center justify-between">
            <span className="text-slate-800 font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Total (Incl. {tenantConfig.taxName}):</span>
            </span>
            <span className="font-black text-emerald-700 text-sm">{formatCurrency(taxBreakdown.total)}</span>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setIsCreateInvoiceModalOpen(false)}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-5 py-2 text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>Issue Invoice</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};

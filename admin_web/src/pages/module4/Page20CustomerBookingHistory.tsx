import React, { useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { downloadCSV } from '../../utils/exportUtils';
import { Search, Download, Eye, Calendar, UserCheck, CreditCard } from 'lucide-react';

export const Page20CustomerBookingHistory: React.FC = () => {
  const {
    bookings,
    customers,
    navigateToPage,
    addToast,
    setSelectedBookingId,
    formatCurrency,
    tenantConfig,
  } = useAdmin();
  const [selectedCustomer, setSelectedCustomer] = useState<string>('All Customers');
  const [search, setSearch] = useState<string>('');

  const filtered = bookings.filter((b) => {
    const matchCust = selectedCustomer === 'All Customers' || b.customerName === selectedCustomer;
    const matchSearch =
      b.jobNo.toLowerCase().includes(search.toLowerCase()) ||
      b.serviceName.toLowerCase().includes(search.toLowerCase()) ||
      b.customerName.toLowerCase().includes(search.toLowerCase());
    return matchCust && matchSearch;
  });

  const totalValue = filtered.reduce((sum, b) => sum + b.estimate, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Customer Booking History</h1>
          <p className="text-xs text-slate-500 mt-1">
            Historical work order ledger, repeat booking tracking, and customer service receipts
          </p>
        </div>

        <button
          onClick={() => {
            downloadCSV(
              'customer_booking_history',
              [
                'Order #',
                'Customer Name',
                'Service Rendered',
                'Category',
                'Technician',
                'Schedule Date',
                `Order Total (${tenantConfig.currencyCode})`,
                'Payment Status',
                'Job Status',
              ],
              filtered.map((b) => [
                b.jobNo,
                b.customerName,
                b.serviceName,
                b.category,
                b.technicianName,
                `${b.scheduleDate} ${b.scheduleTime}`,
                b.estimate.toFixed(2),
                b.paymentStatus,
                b.status,
              ])
            );
            addToast(`Exported ${filtered.length} customer booking records to CSV.`, 'success');
          }}
          className="px-4 py-2 bg-slate-900 hover:bg-black text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
        >
          <Download className="w-3.5 h-3.5" />
          Export Booking History CSV
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase">Filtered Orders</div>
            <div className="text-xl font-extrabold text-slate-900">{filtered.length} Bookings</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase">Filtered Gross Spend</div>
            <div className="text-xl font-extrabold text-emerald-700">{formatCurrency(totalValue)}</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase">Registered Customers</div>
            <div className="text-xl font-extrabold text-slate-900">{customers.length} Profiles</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search order #, service, or customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-bold text-slate-500">Filter by Customer:</span>
          <select
            value={selectedCustomer}
            onChange={(e) => setSelectedCustomer(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
          >
            <option>All Customers</option>
            {customers.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3.5 px-4">Order #</th>
                <th className="py-3.5 px-4">Customer</th>
                <th className="py-3.5 px-4">Service Rendered</th>
                <th className="py-3.5 px-4">Technician</th>
                <th className="py-3.5 px-4">Date &amp; Time</th>
                <th className="py-3.5 px-4">Total</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Dossier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    No customer bookings match your filter criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">#{b.jobNo}</td>
                    <td className="py-3.5 px-4 font-bold text-slate-800">{b.customerName}</td>
                    <td className="py-3.5 px-4 text-slate-700 font-medium">{b.serviceName}</td>
                    <td className="py-3.5 px-4 text-slate-600">{b.technicianName}</td>
                    <td className="py-3.5 px-4 text-slate-500">
                      {b.scheduleDate} â€¢ {b.scheduleTime}
                    </td>
                    <td className="py-3.5 px-4 font-extrabold text-slate-900">{formatCurrency(b.estimate)}</td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          b.status === 'Completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : b.status === 'In Progress'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => {
                          setSelectedBookingId(b.id);
                          navigateToPage(9);
                        }}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { useAdmin } from '../../context/adminContextCore';
import {
  Clock,
  Phone,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';

export const StaffActiveOrders: React.FC = () => {
  const { bookings, updateBookingStatus, addToast, navigateToStaffPage, formatCurrency } = useAdmin();

  const activeOrders = bookings.filter(b => b.status === 'In Progress');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Active In-Progress Orders</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-800">
              {activeOrders.length} On Site
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Supervise technicians currently on customer premises, verified via 4-digit arrival PIN.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateToStaffPage(111)}
            className="px-4 py-2 bg-[#0C3832] text-white text-xs font-bold rounded-xl shadow-xs hover:bg-[#124e45] transition-all flex items-center gap-2 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Go to Order Verification & Signs</span>
          </button>
        </div>
      </div>

      {/* Grid of Active Orders */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {activeOrders.length === 0 ? (
          <div className="col-span-full bg-white rounded-2xl p-10 text-center border border-slate-200/80">
            <Clock className="w-10 h-10 text-slate-300 mx-auto mb-2.5" />
            <h3 className="text-sm font-bold text-slate-700">No Orders In Progress Right Now</h3>
            <p className="text-xs text-slate-400 mt-1">When technicians arrive and enter the customer PIN, live jobs appear here.</p>
          </div>
        ) : (
          activeOrders.map(order => (
            <div key={order.id} className="bg-white rounded-2xl p-4.5 border border-slate-200/80 shadow-xs hover:border-sky-500/50 transition-all flex flex-col justify-between">
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                        {order.jobNo}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse"></span>
                        PIN Verified On-Site
                      </span>
                    </div>
                    <h3 className="text-sm font-black text-slate-900 mt-1.5">
                      {order.serviceName}
                    </h3>
                  </div>

                  <div className="text-right">
                    <span className="text-base font-black text-slate-900">{formatCurrency(order.estimate)}</span>
                    <div className="text-[10px] text-slate-400">Order Value</div>
                  </div>
                </div>

                {/* Info Pills */}
                <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50 p-3 rounded-2xl mb-4">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Customer:</span>
                    <span className="font-bold text-slate-800">{order.customerName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Assigned Pro:</span>
                    <span className="font-bold text-emerald-700">{order.technicianName}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-400 block text-[10px]">Location:</span>
                    <span className="font-medium text-slate-700 truncate block">{order.customerAddress}</span>
                  </div>
                </div>

                {/* Work Checklist Preview */}
                <div className="p-3 rounded-2xl bg-sky-50/50 border border-sky-100 text-xs mb-4">
                  <div className="font-bold text-sky-900 flex items-center gap-1.5 mb-1.5">
                    <ShieldCheck className="w-4 h-4 text-sky-600" />
                    <span>Active Diagnostics & Service Checklist</span>
                  </div>
                  <div className="space-y-1 text-[11px] text-sky-950">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      <span>Field technician active at verified service location</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      <span>Scheduled time: {order.scheduleTime} â€¢ Service: {order.serviceName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                      <span>{order.notes || 'Work order execution underway in field'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => {
                    const phoneToCall = order.customerPhone || '';
                    if (!phoneToCall) {
                      addToast(`No phone contact found for ${order.customerName}`, 'error');
                      return;
                    }
                    window.open(`tel:${phoneToCall.replace(/[^0-9+]/g, '')}`);
                    addToast(`Initiating direct call to ${order.customerName} (${phoneToCall})...`, 'info');
                  }}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span>Call Site</span>
                </button>

                <button
                  onClick={() => void updateBookingStatus(order.id, 'Completed')}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Mark Complete</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

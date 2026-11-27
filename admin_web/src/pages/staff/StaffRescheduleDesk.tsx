import React, { useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { buildScheduledStartIso } from '../../utils/formatters';
import { CalendarRange } from 'lucide-react';
import { Booking } from '../../types';

export const StaffRescheduleDesk: React.FC = () => {
  const { bookings, rescheduleBooking } = useAdmin();
  const scheduledOrders = bookings.filter((b) => b.status === 'Scheduled' || b.status === 'Pending');
  const [selectedOrder, setSelectedOrder] = useState<Booking | null>(
    scheduledOrders.length > 0 ? scheduledOrders[0] : null
  );
  const [newDate, setNewDate] = useState(() => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return tomorrow.toISOString().slice(0, 10);
  });
  const [minDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newSlot, setNewSlot] = useState('02:00 PM - 04:00 PM');
  const [reason, setReason] = useState('Customer Out of Town');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setIsSubmitting(true);
    const iso = buildScheduledStartIso(newDate, newSlot);
    await rescheduleBooking(selectedOrder.id, iso, reason);
    setIsSubmitting(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Order Rescheduling Desk</h1>
        <p className="text-xs text-slate-500 mt-1">
          Adjust appointment dates and time slots with live PostgreSQL booking persistence.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl p-4.5 border border-slate-200/80 shadow-xs flex flex-col h-full">
          <h2 className="text-xs font-black text-slate-900 uppercase tracking-wide mb-3 pb-2 border-b border-slate-100">
            Orders Available for Reschedule
          </h2>

          <div className="space-y-2.5 overflow-y-auto max-h-[500px] thin-scrollbar pr-1">
            {scheduledOrders.map((order) => {
              const isSelected = selectedOrder?.id === order.id;
              return (
                <div
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-emerald-600 bg-emerald-50/40 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-mono font-bold text-slate-800">{order.jobNo}</span>
                    <span className="text-[10px] text-slate-500">{order.scheduleDate}</span>
                  </div>
                  <div className="text-xs font-bold text-slate-900 truncate">{order.serviceName}</div>
                  <div className="text-[11px] text-slate-500 mt-1">Customer: {order.customerName}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          {selectedOrder ? (
            <form onSubmit={handleReschedule} className="space-y-4">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Selected Booking for Slot Change
                </span>
                <div className="text-sm font-black text-slate-900 mt-0.5">
                  {selectedOrder.jobNo} • {selectedOrder.serviceName}
                </div>
                <div className="text-xs text-slate-600 mt-0.5">
                  Current Schedule:{' '}
                  <span className="font-bold text-slate-800">
                    {selectedOrder.scheduleDate} at {selectedOrder.scheduleTime}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  New Scheduled Date *
                </label>
                <input
                  type="date"
                  value={newDate}
                  min={minDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Select New Time Slot *
                </label>
                <select
                  value={newSlot}
                  onChange={(e) => setNewSlot(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-emerald-600"
                >
                  <option value="09:00 AM - 11:00 AM">09:00 AM - 11:00 AM (Morning Slot)</option>
                  <option value="11:30 AM - 01:30 PM">11:30 AM - 01:30 PM (Midday Slot)</option>
                  <option value="02:00 PM - 04:00 PM">02:00 PM - 04:00 PM (Afternoon Slot)</option>
                  <option value="04:30 PM - 06:30 PM">04:30 PM - 06:30 PM (Evening Slot)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Reason for Rescheduling
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-emerald-600"
                >
                  <option value="Customer Out of Town">Customer requested delay — Out of town</option>
                  <option value="Technician Shift Overlap">Technician previous job ran over SLA</option>
                  <option value="Customer Special Access Slot">Customer requested gated society morning slot</option>
                  <option value="Inclement Weather">Severe Weather Conditions / Rain</option>
                </select>
              </div>

              <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  Technician {selectedOrder.technicianName} will receive schedule update.
                </span>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-[#0C3832] hover:bg-[#124e45] disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
                >
                  <CalendarRange className="w-4 h-4 text-amber-300" />
                  <span>{isSubmitting ? 'Updating...' : 'Confirm Slot Reschedule'}</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="p-12 text-center text-slate-400 text-xs">
              Select an order from the left column to reschedule.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

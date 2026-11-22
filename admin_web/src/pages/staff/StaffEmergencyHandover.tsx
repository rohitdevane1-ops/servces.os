import React, { useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { 
  ArrowRightLeft, 
  AlertTriangle, 
  ShieldAlert, 
  Clock, 
} from 'lucide-react';
import { Booking } from '../../types';

export const StaffEmergencyHandover: React.FC = () => {
  const { 
    bookings, 
    technicians, 
    emergencyHandover, 
    addToast 
  } = useAdmin();

  const assignedBookings = bookings.filter(b => b.status === 'Scheduled' || b.status === 'In Progress');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(
    assignedBookings.length > 0 ? assignedBookings[0] : null
  );
  const [selectedNewTechId, setSelectedNewTechId] = useState<string>('');
  const [handoverReason, setHandoverReason] = useState<string>('Vehicle Breakdown');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const availableBackupTechs = technicians.filter(t => 
    (!selectedBooking || t.id !== selectedBooking.technicianId) &&
    t.status === 'Available'
  );

  const handleExecuteHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBooking) {
      addToast('Please select a booking to handover', 'warning');
      return;
    }
    if (!selectedNewTechId) {
      addToast('Please choose a replacement technician', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      await Promise.resolve(
        emergencyHandover(
          selectedBooking.id,
          selectedNewTechId,
          `${handoverReason}: ${notes || 'Handed over by operations staff'}`
        )
      );
      setNotes('');
      const remaining = assignedBookings.filter(b => b.id !== selectedBooking.id);
      setSelectedBooking(remaining.length > 0 ? remaining[0] : null);
    } catch (err: any) {
      addToast(err?.message || 'Emergency handover failed', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Emergency Job Handover</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" />
              Safety Safeguard Active
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Re-assign ongoing or scheduled orders when a technician faces vehicle breakdown, illness, or emergency delay.
          </p>
        </div>
      </div>

      {/* Safety Notice Banner */}
      <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200/80 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900 leading-relaxed">
          <span className="font-bold">Important Operational Rule:</span> Admin and Staff handovers are cryptographically recorded in the system audit log. Previous technician is automatically released from liability, and customer is sent an updated live tracking link with new technician details.
        </div>
      </div>

      {/* Main Grid: Select Job (1 col) + Handover Wizard Form (2 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Col: Assigned Bookings */}
        <div className="bg-white rounded-2xl p-4.5 border border-slate-200/80 shadow-xs flex flex-col h-full">
          <h2 className="text-xs font-black text-slate-900 uppercase tracking-wide mb-3 pb-2 border-b border-slate-100">
            Active / Scheduled Orders ({assignedBookings.length})
          </h2>

          <div className="space-y-3 overflow-y-auto max-h-[520px] thin-scrollbar pr-1">
            {assignedBookings.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No active jobs currently assigned.
              </div>
            ) : (
              assignedBookings.map(b => {
                const isSelected = selectedBooking?.id === b.id;
                return (
                  <div
                    key={b.id}
                    onClick={() => setSelectedBooking(b)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-rose-500 bg-rose-50/40 ring-2 ring-rose-500/20'
                        : 'border-slate-200/80 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-mono font-bold text-slate-800">{b.jobNo}</span>
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                        b.status === 'In Progress' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {b.status}
                      </span>
                    </div>

                    <div className="text-xs font-bold text-slate-900 truncate">
                      {b.serviceName}
                    </div>

                    <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{b.scheduleDate} at {b.scheduleTime}</span>
                    </div>

                    <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium">Assigned: {b.technicianName}</span>
                      <span className="font-bold text-slate-800">${b.estimate}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right 2 Cols: Handover Execution Desk */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          {selectedBooking ? (
            <form onSubmit={handleExecuteHandover} className="space-y-5">
              {/* Target Order Summary */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                    Order Targeted for Handover:
                  </span>
                  <div className="text-sm font-black text-slate-900 mt-0.5 flex items-center gap-2">
                    <span>{selectedBooking.jobNo}</span>
                    <span>â€¢</span>
                    <span>{selectedBooking.serviceName}</span>
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">
                    Customer: {selectedBooking.customerName} ({selectedBooking.customerPhone})
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-xs text-slate-500 font-medium">Currently Assigned Pro:</div>
                  <div className="text-xs font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 mt-1">
                    {selectedBooking.technicianName}
                  </div>
                </div>
              </div>

              {/* Step 1: Handover Reason */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  1. Reason for Transfer / Handover *
                </label>
                <select
                  value={handoverReason}
                  onChange={(e) => setHandoverReason(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-rose-500"
                >
                  <option value="Vehicle Breakdown">Vehicle Breakdown on route</option>
                  <option value="Technician Medical Emergency">Technician Sudden Illness / Medical Emergency</option>
                  <option value="Severe Traffic Jam">Severe Traffic Gridlock / SLA at Risk</option>
                  <option value="Complex Repair Escalation">Complex Problem Requiring Master Senior Pro</option>
                  <option value="Customer Special Request">Customer Special Re-assignment Request</option>
                </select>
              </div>

              {/* Step 2: Select Replacement Technician */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  2. Select Replacement Technician *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-56 overflow-y-auto thin-scrollbar p-1">
                  {availableBackupTechs.map(tech => {
                    const isSelected = selectedNewTechId === tech.id;
                    return (
                      <div
                        key={tech.id}
                        onClick={() => setSelectedNewTechId(tech.id)}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 ${
                          isSelected
                            ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-500/20'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <img
                          src={tech.photo}
                          alt={tech.name}
                          className="w-10 h-10 rounded-xl object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-900 truncate">{tech.name}</div>
                          <div className="text-[10px] text-slate-500">
                            {tech.specialization} â€¢ â˜… {tech.rating}
                          </div>
                          <div className="text-[10px] font-semibold text-emerald-700">
                            Status: {tech.status}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Step 3: Operational Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  3. Internal Handover Notes (Audited under Main Head)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Provide brief details about current technician status and customer notification..."
                  rows={3}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-rose-500"
                />
              </div>

              {/* Submit CTA */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">
                  Automated SMS & push notifications will be dispatched.
                </span>

                <button
                  type="submit"
                  disabled={isSubmitting || !selectedNewTechId}
                  className={`px-5 py-2.5 rounded-xl font-bold text-xs shadow-xs transition-all flex items-center gap-2 cursor-pointer ${
                    !selectedNewTechId
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-rose-600 hover:bg-rose-700 text-white'
                  }`}
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  <span>{isSubmitting ? 'Transferring Order...' : 'Confirm Emergency Handover'}</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="p-12 text-center text-slate-400 text-xs">
              Select an order from the left list to proceed with handover.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

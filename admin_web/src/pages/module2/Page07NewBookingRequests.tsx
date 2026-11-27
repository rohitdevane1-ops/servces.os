import React from 'react';
import { useAdmin } from '../../context/adminContextCore';
import {
  Clock,
  MapPin,
  CheckCircle,
  Zap,
  UserPlus,
} from 'lucide-react';

export const Page07NewBookingRequests: React.FC = () => {
  const { bookings, openAssignModal, updateBookingStatus, addToast, formatCurrency } = useAdmin();
  
  // New requests are pending bookings
  const newRequests = bookings.filter(b => b.status === 'Pending');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">New Booking Requests</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
              {newRequests.length} Pending Acceptance
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Review newly submitted customer requests and initiate automated or manual dispatch</p>
        </div>

        <button
          onClick={async () => {
            if (newRequests.length === 0) return;
            const results = await Promise.all(newRequests.map((b) => updateBookingStatus(b.id, 'Scheduled')));
            const okCount = results.filter((r) => r.ok).length;
            if (okCount > 0) {
              addToast(`Auto-dispatched ${okCount} of ${newRequests.length} incoming request(s)!`, 'success');
            }
          }}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
        >
          <Zap className="w-3.5 h-3.5 fill-current" />
          Auto-Dispatch All Pending
        </button>
      </div>

      {/* Grid of Pending Request Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {newRequests.length === 0 ? (
          <div className="col-span-full bg-white rounded-2xl p-12 text-center border border-slate-200">
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800">All Caught Up!</h3>
            <p className="text-xs text-slate-400 mt-1">There are no pending booking requests awaiting dispatch right now.</p>
          </div>
        ) : (
          newRequests.map((req) => (
            <div key={req.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 flex flex-col justify-between hover:shadow-md transition-shadow">
              <div>
                {/* Header row with Job # and Priority */}
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-xs text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
                    #{req.jobNo}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Slot: {req.scheduleTime}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                      {req.priority}
                    </span>
                  </div>
                </div>

                {/* Service info */}
                <h3 className="text-base font-extrabold text-slate-900 mt-3">{req.serviceName}</h3>
                <p className="text-xs text-slate-500">{req.category} • Pre-auth: {formatCurrency(req.estimate)}</p>

                {/* Customer card */}
                <div className="mt-4 p-3 bg-slate-50 rounded-xl space-y-2 border border-slate-100 text-xs">
                  <div className="font-bold text-slate-800 flex items-center justify-between">
                    <span>{req.customerName}</span>
                    <span className="text-slate-400 text-[11px]">{req.customerPhone}</span>
                  </div>
                  <div className="text-slate-500 flex items-start gap-1 text-[11px]">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span>{req.customerAddress}</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Requested Slot: <strong>{req.scheduleDate} at {req.scheduleTime}</strong>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => void updateBookingStatus(req.id, 'Cancelled')}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Decline
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openAssignModal(req)}
                    className="px-3 py-2 bg-slate-900 hover:bg-black text-white font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Manual Assign
                  </button>

                  <button
                    onClick={() => void updateBookingStatus(req.id, 'Scheduled')}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <Zap className="w-3.5 h-3.5 fill-current" />
                    Auto-Match
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

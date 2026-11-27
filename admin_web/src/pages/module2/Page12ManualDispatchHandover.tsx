import React, { useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { 
  Zap, 
  RotateCcw, 
  UserCheck, 
  MapPin, 
  ShieldAlert, 
  Send, 
  UserX,
} from 'lucide-react';

export const Page12ManualDispatchHandover: React.FC = () => {
  const { bookings, technicians, auditLogs, openAssignModal, emergencyHandover, addToast, selectedBookingId } = useAdmin();

  const [handoverBookingId, setHandoverBookingId] = useState<string>(selectedBookingId || bookings[0]?.id || '');
  const [selectedNewTechId, setSelectedNewTechId] = useState<string>(technicians[0]?.id || '');
  const [handoverReason, setHandoverReason] = useState<string>('Technician vehicle breakdown en route');
  const [customReasonNote, setCustomReasonNote] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [radarStatus, setRadarStatus] = useState<string>('Active Hubs Calibrated');

  const waitingJobs = bookings.filter(b => b.technicianName === 'Unassigned' || b.status === 'Pending');

  const handleReScan = () => {
    setIsScanning(true);
    const activeCount = technicians.filter(t => t.status === 'Available' || t.status === 'Busy').length;
    setIsScanning(false);
    setRadarStatus(`${activeCount} Active Pro Geofence${activeCount === 1 ? '' : 's'} Synced`);
    addToast(`Dispatch Radar synced with ${activeCount} active technician${activeCount === 1 ? '' : 's'}.`, 'success');
  };

  const executeEmergencyHandover = () => {
    emergencyHandover(handoverBookingId, selectedNewTechId, `${handoverReason}: ${customReasonNote}`);
    setCustomReasonNote('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Manual Dispatch &amp; Job Handover</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" />
              Emergency Handover Console
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Resolve unassigned jobs, manually override technician dispatch, and execute emergency transfer protocols with automated customer notifications
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Zone Calibration</span>
            <span className="text-[11px] font-mono font-bold text-emerald-700">{radarStatus}</span>
          </div>

          <button
            onClick={handleReScan}
            disabled={isScanning}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Zap className={`w-3.5 h-3.5 fill-current ${isScanning ? 'animate-bounce text-amber-300' : ''}`} />
            <span>{isScanning ? 'Scanning Available Hubs...' : 'Re-Scan Area Technicians'}</span>
          </button>
        </div>
      </div>

      {/* Grid: Part A (Unassigned Jobs) & Part C (Emergency Handover Protocol) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Part A: Unassigned / Waiting Jobs */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
              <UserX className="w-4 h-4 text-rose-600" />
              A. Unassigned / Waiting Jobs ({waitingJobs.length})
            </h2>
            <span className="text-[10px] font-bold text-slate-400 uppercase">SLA Escalation Queue</span>
          </div>

          <div className="space-y-3">
            {waitingJobs.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">All current jobs are assigned. Zero pending handovers in queue.</div>
            ) : (
              waitingJobs.map(job => (
                <div key={job.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-xs text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
                      #{job.jobNo}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded">
                        Wait: Active
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                        {job.priority} Priority
                      </span>
                    </div>
                  </div>

                  <div className="font-extrabold text-slate-900 text-xs">{job.serviceName}</div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-slate-400" />
                      {job.customerName} • {job.customerAddress}
                    </span>
                    <span className="font-bold text-slate-700">${job.estimate}</span>
                  </div>

                  <div className="text-[11px] text-amber-700 font-medium bg-amber-50/50 p-2 rounded-lg border border-amber-100">
                    Pending technician dispatch confirmation or manual assignment.
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2">
                    <button
                      onClick={() => openAssignModal(job)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <UserCheck className="w-3 h-3" />
                      Assign Pro
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Part C: Emergency Job Handover Protocol */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
              <RotateCcw className="w-4 h-4 text-rose-600" />
              C. Emergency Job Handover Protocol
            </h2>
            <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded">
              High Safeguard
            </span>
          </div>

          <p className="text-xs text-slate-500">
            When an assigned technician cannot complete a job due to illness, emergency, or vehicle breakdown:
          </p>

          {/* Handover Form */}
          <div className="space-y-3 text-xs">
            {/* Step 1: Booking */}
            <div>
              <label className="font-bold text-slate-700 block mb-1">1. Select Ongoing Booking:</label>
              <select
                value={handoverBookingId}
                onChange={e => setHandoverBookingId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-slate-800 focus:outline-none"
              >
                {bookings.filter(b => b.technicianName !== 'Unassigned').length === 0 ? (
                  <option value="">No assigned bookings currently in progress</option>
                ) : (
                  bookings.filter(b => b.technicianName !== 'Unassigned').map(b => (
                    <option key={b.id} value={b.id}>
                      #{b.jobNo} — {b.serviceName} (Current: {b.technicianName})
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Step 2: Reason */}
            <div>
              <label className="font-bold text-slate-700 block mb-1">2. Handover Reason (Mandatory Audit):</label>
              <select
                value={handoverReason}
                onChange={e => setHandoverReason(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-slate-800 focus:outline-none"
              >
                <option value="Technician vehicle breakdown en route">Technician vehicle breakdown en route</option>
                <option value="Technician medical emergency / sudden illness">Technician medical emergency / sudden illness</option>
                <option value="Missing specialized tooling / high-voltage hazard">Missing specialized tooling / high-voltage hazard</option>
                <option value="Severe weather / localized road closure">Severe weather / localized road closure</option>
              </select>
            </div>

            {/* Step 3: New Tech */}
            <div>
              <label className="font-bold text-slate-700 block mb-1">3. Select Qualified Replacement Technician:</label>
              <select
                value={selectedNewTechId}
                onChange={e => setSelectedNewTechId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-slate-800 focus:outline-none"
              >
                {technicians.filter(t => t.status === 'Available').length === 0 ? (
                  <option value="">No replacement technicians currently available</option>
                ) : (
                  technicians.filter(t => t.status === 'Available').map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} — {t.specialization} (★ {t.rating} • Match: 96%)
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Step 4: Notes */}
            <div>
              <label className="font-bold text-slate-700 block mb-1">4. Supervisor Incident Notes:</label>
              <input
                type="text"
                placeholder="e.g. Dispatched flatbed tow truck; customer alerted of 15m delay."
                value={customReasonNote}
                onChange={e => setCustomReasonNote(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none"
              />
            </div>

            {/* Execute Button */}
            <div className="pt-2">
              <button
                onClick={executeEmergencyHandover}
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <Send className="w-3.5 h-3.5" />
                Execute Handover &amp; Dispatch SMS Notice
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Part D: Assignment Status Tracking Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/60">
          <h2 className="text-sm font-extrabold text-slate-900">D. Assignment Status Lifecycle &amp; Safeguard Tracking</h2>
          <p className="text-xs text-slate-500">Full audit log of manual overrides, dispatch timeouts, and technician acceptances</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Job &amp; Customer</th>
                <th className="py-3 px-4">Technician Handover</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Supervisor Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {auditLogs.filter(log => log.action.toLowerCase().includes('handover') || log.action.toLowerCase().includes('assign')).length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-slate-400">
                    No emergency handovers recorded in system audit logs yet.
                  </td>
                </tr>
              ) : (
                auditLogs.filter(log => log.action.toLowerCase().includes('handover') || log.action.toLowerCase().includes('assign')).map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/60">
                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                        Logged
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{log.action}</div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700">
                      {log.details}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-slate-400">{log.timestamp}</td>
                    <td className="py-3.5 px-4 text-slate-600">{log.user}</td>
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

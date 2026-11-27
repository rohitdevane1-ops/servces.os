import React, { useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import {
  AlertTriangle,
  Clock,
  UserX,
  ShieldAlert,
  ArrowRight,
  MapPin,
  Zap,
} from 'lucide-react';

export const Page04PendingWork: React.FC = () => {
  const { bookings, invoices, openAssignModal, updateBookingStatus, navigateToPage, addToast } = useAdmin();
  const [filterType, setFilterType] = useState<string>('All');

  // Filter pending or unassigned jobs with active filterType
  const pendingJobs = bookings
    .filter(b => b.status === 'Pending' || b.technicianName === 'Unassigned' || b.paymentStatus === 'Pending')
    .filter(b => {
      if (filterType === 'All') return true;
      if (filterType === 'Unassigned') return b.technicianName === 'Unassigned';
      if (filterType === 'Payment') return b.paymentStatus === 'Pending';
      if (filterType === 'Critical Priority') return b.priority === 'Critical';
      return b.category.toLowerCase().includes(filterType.toLowerCase());
    });

  const pendingOnly = bookings.filter(b => b.status === 'Pending');
  const slaRiskCount = pendingOnly.filter(b => b.priority === 'Critical' || b.priority === 'High').length;
  const unassignedCount = bookings.filter(b => b.status === 'Pending' && b.technicianName === 'Unassigned').length;
  const awaitingTechCount = bookings.filter(b => (b.status === 'Pending' || b.status === 'Scheduled') && b.technicianName !== 'Unassigned').length;
  const pendingInvoicesCount = invoices.filter(i => i.status === 'Pending' || i.status === 'Overdue').length
    || bookings.filter(b => b.paymentStatus === 'Pending').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Pending Work Overview</h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
              {pendingJobs.length} Items Require Action
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Operational bottlenecks, unassigned dispatch requests, and SLA breaches requiring dispatch supervisor action</p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={async () => {
              const targets = pendingJobs.filter(job => job.status === 'Pending');
              if (targets.length === 0) {
                addToast('No pending work orders in the active queue to auto-dispatch.', 'info');
                return;
              }
              const results = await Promise.all(targets.map(job => updateBookingStatus(job.id, 'Scheduled')));
              const okCount = results.filter(r => r.ok).length;
              if (okCount > 0) {
                addToast(`Auto-dispatch broadcasted for ${okCount} of ${targets.length} pending work order(s).`, 'success');
              }
            }}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Zap className="w-3.5 h-3.5 fill-current" />
            Batch Auto-Dispatch
          </button>
        </div>
      </div>

      {/* 4 KPI Risk Matrix */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-rose-200/80 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">High / Critical Queue</div>
            <div className="text-xl font-extrabold text-rose-600">{slaRiskCount} {slaRiskCount === 1 ? 'Job' : 'Jobs'}</div>
            <div className="text-[10px] text-rose-500 font-bold mt-0.5">Priority dispatch queue</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-amber-200/80 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <UserX className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Unassigned Jobs</div>
            <div className="text-xl font-extrabold text-amber-700">{unassignedCount} {unassignedCount === 1 ? 'Request' : 'Requests'}</div>
            <div className="text-[10px] text-amber-600 font-bold mt-0.5">Awaiting technician match</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-blue-200/80 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Assigned / Scheduled</div>
            <div className="text-xl font-extrabold text-blue-700">{awaitingTechCount} {awaitingTechCount === 1 ? 'Job' : 'Jobs'}</div>
            <div className="text-[10px] text-blue-600 font-bold mt-0.5">Pending site completion</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Payment Verification</div>
            <div className="text-xl font-extrabold text-slate-900">{pendingInvoicesCount} {pendingInvoicesCount === 1 ? 'Invoice' : 'Invoices'}</div>
            <div className="text-[10px] text-slate-500 font-bold mt-0.5">Escrow hold release</div>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900">Unassigned &amp; Stalled Bookings Queue</h2>
            <p className="text-xs text-slate-500">Dispatch supervisor manual handover and force-assignment tools</p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Filter by:</span>
            {['All', 'Critical Priority', 'Unassigned'].map((f) => (
              <button
                key={f}
                onClick={() => setFilterType(f)}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  filterType === f 
                    ? 'bg-slate-900 text-white' 
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Job &amp; Service</th>
                <th className="py-3 px-4">Customer &amp; Location</th>
                <th className="py-3 px-4">Priority &amp; Wait Time</th>
                <th className="py-3 px-4">Current Assignee</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {pendingJobs.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[11px]">
                        #{b.jobNo}
                      </span>
                      <span className="font-bold text-slate-900">{b.serviceName}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{b.category} • Est: ${b.estimate}</div>
                  </td>

                  <td className="py-3.5 px-4">
                    <div className="font-bold text-slate-800">{b.customerName}</div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 text-slate-400" />
                      {b.customerAddress}
                    </div>
                  </td>

                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-1.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        b.priority === 'Critical' ? 'bg-rose-100 text-rose-800' :
                        b.priority === 'High' ? 'bg-amber-100 text-amber-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {b.priority}
                      </span>
                      <span className="text-[11px] font-mono text-slate-600 font-bold bg-slate-100 px-1.5 py-0.5 rounded">
                        Slot: {b.scheduleTime}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">Booked: {b.scheduleDate} at {b.scheduleTime}</div>
                  </td>

                  <td className="py-3.5 px-4">
                    {b.technicianName === 'Unassigned' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                        <UserX className="w-3 h-3" />
                        Unassigned
                      </span>
                    ) : (
                      <div>
                        <div className="font-bold text-slate-800">{b.technicianName}</div>
                        <div className="text-[10px] text-amber-600 font-bold">Pending Tech Acceptance</div>
                      </div>
                    )}
                  </td>

                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openAssignModal(b)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1"
                      >
                        <Zap className="w-3 h-3 fill-current" />
                        Assign Tech
                      </button>
                      <button
                        onClick={() => navigateToPage(12)}
                        className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors cursor-pointer"
                        title="Handover Options"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

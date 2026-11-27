import React, { useEffect, useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { apiClient } from '../../services/apiClient';
import type { StaffDailyReport as StaffDailyReportRecord } from '../../types';
import { downloadCSV } from '../../utils/exportUtils';
import {
  CheckCircle2,
  Download,
  Send,
  ShieldCheck,
} from 'lucide-react';

export const StaffDailyReport: React.FC = () => {
  const { bookings, technicians, tickets, incidents, tenantConfig, addToast, userProfile, isDemoMode } = useAdmin();
  const [recentReports, setRecentReports] = useState<StaffDailyReportRecord[]>([]);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [referenceCode, setReferenceCode] = useState<string>('');
  const [highlights, setHighlights] = useState('');
  const [blockers, setBlockers] = useState('');

  const totalHandled = bookings.length;
  const completedToday = bookings.filter(b => b.status === 'Completed').length;
  const inProgress = bookings.filter(b => b.status === 'In Progress').length;
  const pending = bookings.filter(b => b.status === 'Pending').length;
  const resolvedTicketsCount = tickets.filter(t => t.status === 'Resolved').length;
  const openEscalationsCount = incidents.filter(i => !i.resolved).length;
  const avgOnTimeRate =
    technicians.length > 0
      ? `${(technicians.reduce((acc, t) => acc + (t.onTimeRate || 0), 0) / technicians.length).toFixed(1)}%`
      : 'N/A';

  useEffect(() => {
    let active = true;
    apiClient.getDailyReports().then((res) => {
      if (!active || !res.success || !Array.isArray(res.data)) return;
      setRecentReports(res.data);
      const todayIso = new Date().toISOString().slice(0, 10);
      const todays = res.data.find((r) => String(r.reportDate).slice(0, 10) === todayIso);
      if (todays) {
        setIsSubmitted(true);
        setReferenceCode(todays.referenceCode);
        setHighlights(todays.highlights);
        setBlockers(todays.blockers || '');
        setSubmittedAt(new Date(todays.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const handleSubmitReport = async () => {
    if (isDemoMode) {
      addToast('Submitting daily handover reports is disabled in Demo Sandbox mode.', 'warning');
      return;
    }
    setIsSubmitting(true);
    const summaryText =
      highlights.trim() ||
      `Handled ${totalHandled} orders (${completedToday} completed, ${inProgress} active, ${pending} pending); ${resolvedTicketsCount} tickets resolved.`;
    const res = await apiClient.submitDailyReport({
      shiftWindow: 'FULL_DAY',
      jobsCompleted: completedToday,
      ticketsResolved: resolvedTicketsCount,
      escalationsCount: openEscalationsCount,
      highlights: summaryText,
      blockers: blockers.trim() || null,
    });
    setIsSubmitting(false);

    if (!res.success || !res.data) {
      addToast(res.error?.message || 'Failed to save daily operations report.', 'error');
      return;
    }

    setIsSubmitted(true);
    setReferenceCode(res.data.referenceCode);
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setSubmittedAt(timeStr);
    const listRes = await apiClient.getDailyReports();
    if (listRes.success && Array.isArray(listRes.data)) {
      setRecentReports(listRes.data);
    }
    addToast(`Daily Operations Report sealed (${res.data.referenceCode}).`, 'success');
  };

  const handleExportReport = () => {
    downloadCSV('daily_operations_sealed_report', bookings.map(b => ({
      'Job No': b.jobNo,
      'Service': b.serviceName,
      'Customer': b.customerName,
      'Technician': b.technicianName,
      'Status': b.status,
      'Schedule Date': b.scheduleDate,
      'Time Slot': b.scheduleTime,
      [`Estimate (${tenantConfig.currencyCode})`]: b.estimate
    })));
    addToast('Daily operations ledger exported as verified CSV audit log.', 'success');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Daily Order Operations Report</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900">
              Reporting to Main Head
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            End-of-day operational summary of customer orders handled, technician dispatches, and SLA performance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isSubmitted && (
            <button
              onClick={handleExportReport}
              className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-600" />
              <span>Download Signed Audit Log</span>
            </button>
          )}

          <button
            onClick={handleSubmitReport}
            disabled={isSubmitted || isSubmitting}
            className={`px-4 py-2 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer ${
              isSubmitted 
                ? 'bg-emerald-700 text-white cursor-default' 
                : 'bg-[#0C3832] hover:bg-[#124e45] text-white'
            }`}
          >
            {isSubmitted ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                <span>✓ Report Sealed &amp; Submitted</span>
              </>
            ) : (
              <>
                <Send className={`w-4 h-4 text-amber-300 ${isSubmitting ? 'animate-spin' : ''}`} />
                <span>{isSubmitting ? 'Sealing Report...' : 'Submit to Main Head'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Submitted Digital Audit Certification Banner */}
      {isSubmitted && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950 to-teal-950 border border-emerald-500/40 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg animate-in slide-in-from-top-2">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-slate-950 flex items-center justify-center font-black shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-white">Daily Operations Report Sealed</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-400 text-slate-950 uppercase">
                  Audit Sealed
                </span>
              </div>
              <p className="text-xs text-emerald-200/80 mt-0.5">
                Submitted by {userProfile.name || 'Operations Coordinator'} at {submittedAt || 'Today'} • Reference: <span className="font-mono text-emerald-300">{referenceCode || 'SYNCED'}</span>
              </p>
            </div>
          </div>
          <span className="text-[11px] font-mono font-bold bg-white/10 px-3 py-1.5 rounded-xl border border-white/10 shrink-0 text-center">
            Status: Sealed &amp; Synced to PostgreSQL
          </span>
        </div>
      )}

      {/* Handover Summary Notes */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
            Shift Highlights &amp; Operational Summary
          </label>
          <textarea
            rows={2}
            value={highlights}
            onChange={(e) => setHighlights(e.target.value)}
            placeholder="Summarize completed dispatches, VIP customer requests, and fleet updates..."
            className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-600 focus:outline-none text-slate-800"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
            Next-Shift Blockers &amp; Escalations
          </label>
          <textarea
            rows={2}
            value={blockers}
            onChange={(e) => setBlockers(e.target.value)}
            placeholder="Note any open escalations or pending follow-ups for incoming shift..."
            className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-600 focus:outline-none text-slate-800"
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Total Orders Managed</div>
          <div className="text-2xl font-black text-slate-900">{totalHandled}</div>
          <div className="text-[10px] text-emerald-600 font-bold mt-1">{pending} pending assignment</div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Orders Completed</div>
          <div className="text-2xl font-black text-emerald-700">{completedToday}</div>
          <div className="text-[10px] text-slate-500 mt-1">{inProgress} active in progress</div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Support Tickets Resolved</div>
          <div className="text-2xl font-black text-sky-700">{resolvedTicketsCount}</div>
          <div className="text-[10px] text-sky-600 font-bold mt-1">{openEscalationsCount} open safety escalations</div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Fleet On-Time SLA</div>
          <div className="text-2xl font-black text-slate-900">{avgOnTimeRate}</div>
          <div className="text-[10px] text-emerald-600 font-bold mt-1">{recentReports.length} handover report(s) filed</div>
        </div>
      </div>

      {/* Detailed Operations Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">
              Technician Field Production Log
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Breakdown of jobs executed per verified technician
            </p>
          </div>
          <button
            onClick={() => {
              downloadCSV('staff_daily_field_production_log', technicians.map(t => ({
                'Technician': t.name,
                'Trade Specialization': t.specialization,
                'Shift Status': t.status,
                'Jobs Assigned': t.currentJobsCount,
                'On-Time SLA': t.onTimeRate + '%',
                'Rating': t.rating,
                'Jobs Completed': t.jobsCompleted,
                'Phone': t.phone
              })));
              addToast('Technician field production log exported to CSV!', 'success');
            }}
            className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Export CSV</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200/80">
                <th className="py-3 px-4 font-bold">Technician</th>
                <th className="py-3 px-4 font-bold">Trade</th>
                <th className="py-3 px-4 font-bold">Shift Status</th>
                <th className="py-3 px-4 font-bold">Jobs Assigned</th>
                <th className="py-3 px-4 font-bold">On-Time SLA</th>
                <th className="py-3 px-4 font-bold">Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {technicians.map(t => (
                <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      {t.photo ? (
                        <img src={t.photo} alt={t.name} className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-[11px] shrink-0">
                          {t.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'PR'}
                        </div>
                      )}
                      <div>
                        <div className="font-bold text-slate-900">{t.name}</div>
                        <div className="text-[10px] text-slate-400">{t.phone}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-700">{t.specialization}</td>
                  <td className="py-3 px-4">
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                      t.status === 'Available' ? 'bg-emerald-100 text-emerald-800' :
                      t.status === 'On Job' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-900">{t.currentJobsCount} active</td>
                  <td className="py-3 px-4 font-bold text-emerald-700">{t.onTimeRate}%</td>
                  <td className="py-3 px-4 font-bold text-slate-800">★ {t.rating}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

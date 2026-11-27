import React from 'react';
import { useAdmin } from '../../context/adminContextCore';
import {
  Navigation,
  MapPin,
  ShieldCheck,
  RotateCcw,
  CheckCircle,
  Eye
} from 'lucide-react';

export const Page08ActiveBookings: React.FC = () => {
  const { bookings, navigateToPage, updateBookingStatus, setSelectedBookingId, formatCurrency } = useAdmin();

  // Active bookings are In Progress or Scheduled
  const activeList = bookings.filter(b => b.status === 'In Progress' || b.status === 'Scheduled');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Active Bookings</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
              {activeList.length} In-Flight Jobs
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Monitor real-time technician progress, ETA telemetry, safety verification PINs, and job status</p>
        </div>

        <button
          onClick={() => navigateToPage(2)} // Jump to Live Operations
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
        >
          <Navigation className="w-3.5 h-3.5" />
          Open Radar Map
        </button>
      </div>

      {/* Active Jobs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {activeList.map((job) => (
          <div key={job.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
            {/* Top row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-xs text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded">
                  #{job.jobNo}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-blue-100 text-blue-800">
                  {job.status === 'In Progress' ? '● On-Site Working' : '● En Route'}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  {job.safetyPin ? (
                    <>PIN: <strong>{job.safetyPin}</strong></>
                  ) : (
                    <strong>{job.status === 'In Progress' ? 'PIN Verified' : 'PIN Protected'}</strong>
                  )}
                </span>
              </div>
            </div>

            {/* Service & Customer Info */}
            <div>
              <h3 className="text-base font-extrabold text-slate-900">{job.serviceName}</h3>
              <p className="text-xs text-slate-500">{job.category} • Estimate: {formatCurrency(job.estimate)}</p>
            </div>

            {/* Technician & Telemetry card */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-700 text-white font-bold flex items-center justify-center text-sm shadow-xs">
                  {job.technicianName.charAt(0)}
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">{job.technicianName}</div>
                  <div className="text-[11px] text-emerald-700 font-bold flex items-center gap-1 mt-0.5">
                    <Navigation className="w-3 h-3" />
                    {job.status === 'In Progress' ? 'On-Site Active' : 'En Route / Scheduled'} • {job.scheduleTime}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-[10px] uppercase font-bold text-slate-400">Customer</div>
                <div className="text-xs font-bold text-slate-800">{job.customerName}</div>
                <div className="text-[11px] text-slate-400">{job.customerPhone}</div>
              </div>
            </div>

            {/* Location */}
            <div className="flex items-start gap-1.5 text-xs text-slate-600">
              <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <span>{job.customerAddress}</span>
            </div>

            {/* Actions Bar */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <button
                onClick={() => {
                  setSelectedBookingId(job.id);
                  navigateToPage(12); // Emergency Handover
                }}
                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                Handover Job
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setSelectedBookingId(job.id);
                    navigateToPage(9); // View details
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Eye className="w-3.5 h-3.5" />
                  View Dossier
                </button>

                <button
                  onClick={() => void updateBookingStatus(job.id, 'Completed')}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Complete Job
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

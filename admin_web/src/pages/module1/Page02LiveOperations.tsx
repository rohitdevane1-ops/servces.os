import React, { useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { 
  Compass, 
  CheckCircle2, 
  Clock, 
  Calendar, 
  Radio, 
} from 'lucide-react';
import { RealDispatchMap } from '../../components/common/RealDispatchMap';
import { RevealSection, StaggerCard, AnimatedNumber } from '../../components/common/MotionPrimitives';

export const Page02LiveOperations: React.FC = () => {
  const { technicians, bookings, navigateToPage } = useAdmin();
  const [selectedTech] = useState(technicians[0] || null);
  const activeBooking = bookings.find(b => b.status === 'In Progress' && b.technicianId && b.technicianId !== 'unassigned');
  const hasActiveRoute = Boolean(activeBooking && selectedTech);

  const activeFieldCount = technicians.filter(t => t.status === 'Available' || t.status === 'On Job').length;
  const completedCount = bookings.filter(b => b.status === 'Completed').length;
  const inProgressCount = bookings.filter(b => b.status === 'In Progress').length;
  const scheduledCount = bookings.filter(b => b.status === 'Scheduled').length;

  return (
    <div className="space-y-6">
      {/* 1. Header with Breadcrumbs & Action */}
      <RevealSection className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Live Operations & Dispatch Radar</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">Real-time GPS tracking of field workforce, ongoing routes and arrival SLA telemetry</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigateToPage(12)}
            className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Manual Dispatch Console</span>
          </button>
        </div>
      </RevealSection>

      {/* 2. KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StaggerCard index={0} className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs serviceos-card-glow flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-indigo-500/20">
            <Radio className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active In Field</div>
            <div className="text-2xl font-black text-slate-900 mt-0.5">
              <AnimatedNumber value={activeFieldCount} formatter={(n) => String(Math.round(n)).padStart(2, '0')} />
            </div>
            <div className="text-[10px] font-bold text-emerald-600">Active Field Pros Synced</div>
          </div>
        </StaggerCard>

        <StaggerCard index={1} className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs serviceos-card-glow flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-emerald-500/20">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Completed Today</div>
            <div className="text-2xl font-black text-slate-900 mt-0.5">
              <AnimatedNumber value={completedCount} formatter={(n) => String(Math.round(n)).padStart(2, '0')} />
            </div>
            <div className="text-[10px] font-bold text-emerald-600">Actual confirmed SLA</div>
          </div>
        </StaggerCard>

        <StaggerCard index={2} className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs serviceos-card-glow flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white flex items-center justify-center shrink-0 shadow-sm shadow-amber-500/20">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">In Progress</div>
            <div className="text-2xl font-black text-slate-900 mt-0.5">
              <AnimatedNumber value={inProgressCount} formatter={(n) => String(Math.round(n)).padStart(2, '0')} />
            </div>
            <div className="text-[10px] font-bold text-amber-600">Live field execution</div>
          </div>
        </StaggerCard>

        <StaggerCard index={3} className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs serviceos-card-glow flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-violet-500/20">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Scheduled Next</div>
            <div className="text-2xl font-black text-slate-900 mt-0.5">
              <AnimatedNumber value={scheduledCount} formatter={(n) => String(Math.round(n)).padStart(2, '0')} />
            </div>
            <div className="text-[10px] font-bold text-emerald-600">Pending arrival queue</div>
          </div>
        </StaggerCard>
      </div>

      {/* 3. Main Live Dispatch Map & Right Status Column */}
      <RevealSection delay={0.08} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 8 Cols: Real Interactive Map */}
        <div className="lg:col-span-8">
          <RealDispatchMap 
            height="520px" 
            hasActiveRoute={hasActiveRoute}
            technicianName={selectedTech ? selectedTech.name : undefined}
            customerName={activeBooking ? activeBooking.customerName : undefined}
            customerAddress={activeBooking ? activeBooking.customerAddress : undefined}
          />
        </div>

        {/* Right 4 Cols: Technician Status & Operations on Track matching Screenshot 02 */}
        <div className="lg:col-span-4 space-y-4">
          {/* Technician Status List */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900">Technician Status</h2>
              <button 
                onClick={() => navigateToPage(22)} 
                className="text-xs font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer"
              >
                View All →
              </button>
            </div>

            <div className="space-y-3">
              {technicians.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400">No technicians registered in fleet yet.</div>
              ) : (
                technicians.map((t) => (
                  <div key={t.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      {t.photo ? (
                        <img
                          src={t.photo}
                          alt={t.name}
                          className="w-9 h-9 rounded-full object-cover border-2 border-white shadow-2xs"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs border-2 border-white shadow-2xs">
                          {t.name ? t.name.charAt(0).toUpperCase() : 'T'}
                        </div>
                      )}
                      <div>
                        <div className="text-xs font-bold text-slate-900">{t.name}</div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${
                            t.status === 'Available' ? 'bg-emerald-500' : t.status === 'On Job' ? 'bg-blue-500' : 'bg-amber-500'
                          }`}></span>
                          <span>{t.status}</span>
                        </div>
                      </div>
                    </div>

                    <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      {t.currentJobsCount} Job{t.currentJobsCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Operations On Track Banner matching Screenshot 02 */}
          <div className="bg-gradient-to-br from-emerald-600 to-teal-800 text-white p-5 rounded-2xl shadow-md space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Operations On Track</h3>
                <p className="text-[11px] text-emerald-100">All systems are running smoothly</p>
              </div>
            </div>
            <div className="text-[11px] text-emerald-100/90 leading-relaxed border-t border-white/20 pt-2">
              Current peak response time: <strong>48 seconds</strong>. Zero unassigned emergency jobs currently overdue.
            </div>
          </div>
        </div>
      </RevealSection>
    </div>
  );
};

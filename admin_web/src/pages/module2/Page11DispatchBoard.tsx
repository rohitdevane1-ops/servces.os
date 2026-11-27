import React, { useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { RevealSection, StaggerCard } from '../../components/common/MotionPrimitives';
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Zap
} from 'lucide-react';

export const Page11DispatchBoard: React.FC = () => {
  const { technicians, bookings, navigateToPage, addToast, setSelectedBookingId } = useAdmin();
  const [boardDate, setBoardDate] = useState<Date>(() => new Date());
  const [filterDept] = useState<string>('All');

  const formatDateDisplay = (d: Date) => {
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  const handlePrevDay = () => {
    setBoardDate(prev => {
      const next = new Date(prev);
      next.setDate(next.getDate() - 1);
      addToast(`Showing dispatch roster for ${formatDateDisplay(next)}`, 'info');
      return next;
    });
  };

  const handleNextDay = () => {
    setBoardDate(prev => {
      const next = new Date(prev);
      next.setDate(next.getDate() + 1);
      addToast(`Showing dispatch roster for ${formatDateDisplay(next)}`, 'info');
      return next;
    });
  };

  const handleToday = () => {
    const today = new Date();
    setBoardDate(today);
    addToast(`Reset dispatch board to Today (${formatDateDisplay(today)})`, 'info');
  };

  const HOURS = ['08:00 AM', '10:00 AM', '12:00 PM', '02:00 PM', '04:00 PM', '06:00 PM'];

  // Map technician schedule blocks with department filter
  const filteredTechs = technicians.filter(t => filterDept === 'All' || t.specialization.includes(filterDept));
  const techSchedules = filteredTechs.map(tech => {
    const techBookings = bookings.filter(b => b.technicianName === tech.name);
    return {
      tech,
      bookings: techBookings
    };
  });

  return (
    <div className="space-y-6">
      {/* Top Header matching FieldServicely Schedule Board */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Dispatch Board</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
              Field Resource Timeline
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Gantt schedule matrix of field technicians, active time blocks, and dispatch capacity</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-2xs">
              <button 
                onClick={handlePrevDay}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 cursor-pointer"
                title="Previous Day"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 text-xs font-extrabold text-slate-800">{formatDateDisplay(boardDate)}</span>
              <button 
                onClick={handleNextDay}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 cursor-pointer"
                title="Next Day"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={handleToday}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Today
            </button>
          </div>

          <button
            onClick={() => navigateToPage(12)} // Manual dispatch
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Zap className="w-3.5 h-3.5 fill-current" />
            Manual Dispatch
          </button>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StaggerCard index={0} className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs serviceos-card-glow">
          <div className="text-[10px] uppercase font-bold text-slate-400">Scheduled Techs</div>
          <div className="text-lg font-extrabold text-slate-900 mt-0.5">
            {technicians.filter(t => t.status !== 'Offline').length} of {technicians.length} Online
          </div>
        </StaggerCard>
        <StaggerCard index={1} className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs serviceos-card-glow">
          <div className="text-[10px] uppercase font-bold text-slate-400">Capacity Load</div>
          <div className="text-lg font-extrabold text-emerald-600 mt-0.5">
            {technicians.length > 0
              ? Math.min(100, Math.round((bookings.filter(b => b.status === 'In Progress' || b.status === 'Scheduled').length / technicians.length) * 100))
              : 0}% Utilized
          </div>
        </StaggerCard>
        <StaggerCard index={2} className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs serviceos-card-glow">
          <div className="text-[10px] uppercase font-bold text-slate-400">Total Booked Hours</div>
          <div className="text-lg font-extrabold text-slate-900 mt-0.5">
            {(bookings.filter(b => b.status === 'In Progress' || b.status === 'Scheduled').length * 2).toFixed(1)} Hours
          </div>
        </StaggerCard>
        <StaggerCard index={3} className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs serviceos-card-glow">
          <div className="text-[10px] uppercase font-bold text-slate-400">Unassigned Backlog</div>
          <div className="text-lg font-extrabold text-rose-600 mt-0.5">
            {bookings.filter(b => b.status === 'Pending' || b.technicianName === 'Unassigned').length} Jobs Pending
          </div>
        </StaggerCard>
      </div>

      {/* Gantt Timeline Board */}
      <RevealSection delay={0.08} className="bg-white rounded-2xl border border-slate-200/80 shadow-xs serviceos-card-glow overflow-x-auto thin-scrollbar">
        <div className="min-w-[760px]">
        {/* Timeline Header */}
        <div className="grid grid-cols-12 border-b border-slate-200 bg-slate-50/70 text-xs font-bold text-slate-600 divide-x divide-slate-200">
          <div className="col-span-3 p-3 text-slate-500 uppercase tracking-wider text-[11px]">
            Field Technician / Pro
          </div>
          <div className="col-span-9 grid grid-cols-6 divide-x divide-slate-200">
            {HOURS.map((hr, idx) => (
              <div key={idx} className="p-3 text-center text-[11px] font-mono font-bold text-slate-500">
                {hr}
              </div>
            ))}
          </div>
        </div>

        {/* Technician Timeline Rows */}
        <div className="divide-y divide-slate-100">
          {techSchedules.map(({ tech, bookings: techJobs }) => (
            <div key={tech.id} className="grid grid-cols-12 divide-x divide-slate-100 min-h-[76px] hover:bg-slate-50/40 transition-colors">
              {/* Tech Info (Col span 3) */}
              <div className="col-span-3 p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-900 text-white font-extrabold flex items-center justify-center text-xs shrink-0">
                    {tech.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-xs">{tech.name}</div>
                    <div className="text-[11px] text-slate-400">{tech.specialization}</div>
                    <div className="text-[10px] font-bold text-emerald-600 flex items-center gap-1 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      ★ {tech.rating} ({tech.jobsCompleted})
                    </div>
                  </div>
                </div>

                <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                  tech.status === 'Available' ? 'bg-emerald-100 text-emerald-800' :
                  tech.status === 'On Job' ? 'bg-blue-100 text-blue-800' :
                  'bg-slate-100 text-slate-600'
                }`}>
                  {tech.status}
                </span>
              </div>

              {/* Hourly Slot Cells (Col span 9 total, 6 columns across) */}
              <div className="col-span-9 p-2 relative flex items-center">
                {techJobs.length > 0 ? (
                  techJobs.map(job => (
                    <div
                      key={job.id}
                      onClick={() => {
                        setSelectedBookingId(job.id);
                        navigateToPage(9);
                      }}
                      className="w-full bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-300 rounded-xl p-2.5 shadow-2xs cursor-pointer hover:shadow-xs transition-shadow"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-emerald-800 text-[11px]">#{job.jobNo}</span>
                        <span className="text-[10px] font-bold text-slate-600">{job.scheduleTime}</span>
                      </div>
                      <div className="text-xs font-extrabold text-slate-900 truncate mt-0.5">{job.serviceName}</div>
                      <div className="text-[11px] text-slate-500 truncate flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        {job.customerName} • {job.customerAddress}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[11px] text-slate-300 font-medium border border-dashed border-slate-200 rounded-xl py-3">
                    Open Slot (Click to dispatch)
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        </div>
      </RevealSection>
    </div>
  );
};

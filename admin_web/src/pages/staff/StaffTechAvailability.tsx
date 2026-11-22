import React, { useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { 
  Search, 
  ShieldCheck, 
  Phone, 
} from 'lucide-react';

export const StaffTechAvailability: React.FC = () => {
  const { technicians, addToast, openUserDossier, updateTechnician } = useAdmin();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('All');

  const filtered = technicians.filter(t => {
    const matchStatus = filterStatus === 'All' || t.status === filterStatus;
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) ||
                        t.specialization.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Technician Shift Availability</h1>
          <p className="text-xs text-slate-500 mt-1">
            Monitor real-time field status, duty toggles, active work loads, and shift schedules.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl">
            {technicians.filter(t => t.status === 'Available').length} Available for Dispatch
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search technician by name or trade specialization..."
            className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 text-slate-800"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-semibold focus:outline-none cursor-pointer"
          >
            <option value="All">All Shift Statuses</option>
            <option value="Available">Available</option>
            <option value="On Job">On Job</option>
            <option value="Busy">Busy</option>
            <option value="On Leave">On Leave</option>
            <option value="Offline">Offline</option>
          </select>
        </div>
      </div>

      {/* Tech Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(tech => (
          <div key={tech.id} className="bg-white rounded-2xl p-4.5 border border-slate-200/80 shadow-xs hover:border-emerald-500/50 transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <img
                      src={tech.photo}
                      alt={tech.name}
                      className="w-12 h-12 rounded-2xl object-cover ring-2 ring-slate-100"
                    />
                    <span className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white ${
                      tech.status === 'Available' ? 'bg-emerald-500' :
                      tech.status === 'On Job' ? 'bg-amber-500' : 'bg-slate-400'
                    }`}></span>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-extrabold text-slate-900">{tech.name}</span>
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="text-xs text-slate-500 font-medium mt-0.5">
                      {tech.specialization} Pro â€¢ â˜… {tech.rating}
                    </div>
                  </div>
                </div>

                <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full ${
                  tech.status === 'Available' ? 'bg-emerald-100 text-emerald-800' :
                  tech.status === 'On Job' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                }`}>
                  {tech.status}
                </span>
              </div>

              <div className="space-y-1.5 text-xs text-slate-600 bg-slate-50 p-3 rounded-2xl mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Working Hours:</span>
                  <span className="font-bold text-slate-800">{tech.workingHours}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Active Jobs Assigned:</span>
                  <span className="font-bold text-slate-800">{tech.currentJobsCount} active</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">On-Time Arrival Rate:</span>
                  <span className="font-bold text-emerald-700">{tech.onTimeRate}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Completed All-Time:</span>
                  <span className="font-bold text-slate-800">{tech.jobsCompleted} orders</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => openUserDossier('technician', tech.id)}
                className="px-3 py-1.5 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 font-bold text-xs hover:bg-emerald-100 flex items-center gap-1 cursor-pointer"
              >
                <span>Pro Dossier</span>
              </button>

              <button
                onClick={() => {
                  window.open(`tel:${tech.phone.replace(/[^0-9+]/g, '')}`);
                  addToast(`Calling ${tech.name} (${tech.phone})...`, 'info');
                }}
                className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span>Call</span>
              </button>

              <button
                onClick={() => {
                  const newStatus = tech.status === 'Available' ? 'Offline' : 'Available';
                  updateTechnician(tech.id, { status: newStatus as any });
                  addToast(`${tech.name}'s duty status updated to ${newStatus}!`, 'success');
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors cursor-pointer"
              >
                Toggle Duty
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

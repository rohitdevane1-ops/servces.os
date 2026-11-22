import React, { useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { downloadCSV } from '../../utils/exportUtils';
import { 
  Search, 
  UserPlus, 
  Star, 
  Eye, 
  Download
} from 'lucide-react';

export const Page22AllTechnicians: React.FC = () => {
  const { technicians, navigateToPage, addToast, setSelectedTechnicianId, setIsCreateTechnicianModalOpen } = useAdmin();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterTrade, setFilterTrade] = useState<string>('All');

  const filteredTechs = technicians.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          t.specialization.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          t.phone.includes(searchQuery);
    const matchesTrade = filterTrade === 'All' || t.specialization.includes(filterTrade);
    return matchesSearch && matchesTrade;
  });

  return (
    <div className="space-y-6">
      {/* Top Header matching Screenshot 03 Top Right */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">All Technicians</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
              {technicians.length} Field Pros
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Manage field technician roster, trade certifications, live status, and dispatch assignments</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              downloadCSV('technician_fleet_roster', ['ID', 'Name', 'Trade Specialization', 'Phone', 'Rating', 'Jobs Completed', 'On-Time Arrival Rate (%)', 'Duty Status', 'Shift Hours'], technicians.map(t => [t.id, t.name, t.specialization, t.phone, t.rating, t.jobsCompleted, t.onTimeRate, t.status, t.workingHours]));
              addToast('Technician fleet roster exported to CSV spreadsheet!', 'success');
            }}
            className="px-3.5 py-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-bold text-xs rounded-xl shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>

          <button
            onClick={() => setIsCreateTechnicianModalOpen(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
          >
            <UserPlus className="w-4 h-4" />
            Add Technician
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active Field Force</div>
          <div className="text-2xl font-extrabold text-slate-900 mt-0.5">
            {technicians.filter(t => t.status !== 'Offline').length} Active
          </div>
          <div className="text-[10px] text-emerald-600 font-bold mt-0.5">
            {technicians.filter(t => t.status === 'Available' || t.status === 'On Job').length} Currently Online
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Average Customer Rating</div>
          <div className="text-2xl font-extrabold text-amber-600 mt-0.5">
            {technicians.length > 0 ? `â˜… ${(technicians.reduce((a, t) => a + (t.rating || 0), 0) / technicians.length).toFixed(2)} / 5.0` : 'â˜… 0.00 / 5.0'}
          </div>
          <div className="text-[10px] text-slate-400 font-bold mt-0.5">
            {technicians.length > 0 ? `${technicians.reduce((a, t) => a + (t.jobsCompleted || 0), 0)} verified jobs` : '0 verified jobs'}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">On-Time Arrival Rate</div>
          <div className="text-2xl font-extrabold text-emerald-600 mt-0.5">
            {technicians.length > 0 ? `${(technicians.reduce((a, t) => a + (t.onTimeRate || 0), 0) / technicians.length).toFixed(1)}%` : '0.0%'}
          </div>
          <div className="text-[10px] text-emerald-600 font-bold mt-0.5">SLA performance tier</div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Completed Jobs</div>
          <div className="text-2xl font-extrabold text-purple-700 mt-0.5">
            {technicians.reduce((a, t) => a + (t.jobsCompleted || 0), 0)}
          </div>
          <div className="text-[10px] text-slate-400 font-bold mt-0.5">Platform lifetime</div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Search & Trade filter */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div className="relative w-full max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name, trade specialization, phone..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center gap-1.5">
            {['All', 'HVAC', 'Electrician', 'Plumber', 'Cleaning'].map(trade => (
              <button
                key={trade}
                onClick={() => setFilterTrade(trade)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  filterTrade === trade
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {trade}
              </button>
            ))}
          </div>
        </div>

        {/* Technician Roster Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Technician</th>
                <th className="py-3 px-4">Specialization</th>
                <th className="py-3 px-4">Rating &amp; Jobs</th>
                <th className="py-3 px-4">On-Time %</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Working Hours</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTechs.map(t => (
                <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-900 text-white font-extrabold flex items-center justify-center text-xs">
                        {t.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-extrabold text-slate-900">{t.name}</div>
                        <div className="text-[11px] text-slate-400">{t.phone}</div>
                      </div>
                    </div>
                  </td>

                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-800">
                      {t.specialization}
                    </span>
                  </td>

                  <td className="py-3.5 px-4">
                    <div className="font-extrabold text-amber-600 flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-current" />
                      â˜… {t.rating}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{t.jobsCompleted} completed</div>
                  </td>

                  <td className="py-3.5 px-4 font-extrabold text-emerald-700">
                    {t.onTimeRate}%
                  </td>

                  <td className="py-3.5 px-4">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      t.status === 'Available' ? 'bg-emerald-100 text-emerald-800' :
                      t.status === 'On Job' ? 'bg-blue-100 text-blue-800' :
                      t.status === 'Busy' ? 'bg-amber-100 text-amber-800' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {t.status}
                    </span>
                  </td>

                  <td className="py-3.5 px-4 text-slate-600 font-mono text-[11px]">
                    {t.workingHours}
                  </td>

                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={() => {
                        setSelectedTechnicianId(t.id);
                        navigateToPage(23);
                      }}
                      className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                      title={`View ${t.name} Pro Dossier`}
                    >
                      <Eye className="w-4 h-4" />
                    </button>
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

import React, { useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { downloadCSV } from '../../utils/exportUtils';
import { 
  Clock, 
  CheckCircle2, 
  DollarSign, 
  UserCheck, 
  Download, 
  RefreshCw,
  Search,
  ExternalLink
} from 'lucide-react';

interface ActivityItem {
  id: string;
  time: string;
  category: 'Assignment' | 'Completion' | 'Payment' | 'Alert' | 'Dispatch';
  title: string;
  description: string;
  actor: string;
  actorRole: string;
  jobNo?: string;
  badgeColor: string;
}

export const Page03TodayActivity: React.FC = () => {
  const { navigateToPage, addToast, bookings, technicians, auditLogs } = useAdmin();
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Derive dynamic activities strictly from live audit logs and real bookings
  const dynamicActivities: ActivityItem[] = React.useMemo(() => {
    const list: ActivityItem[] = [];

    auditLogs.forEach(log => {
      const cat: ActivityItem['category'] = 
        log.action.toLowerCase().includes('payment') ? 'Payment' :
        log.action.toLowerCase().includes('complete') ? 'Completion' :
        log.action.toLowerCase().includes('alert') ? 'Alert' :
        log.action.toLowerCase().includes('dispatch') ? 'Dispatch' : 'Assignment';

      list.push({
        id: log.id,
        time: log.timestamp || 'Recent',
        category: cat,
        title: log.action,
        description: log.details,
        actor: log.user,
        actorRole: log.user.toLowerCase().includes('system') ? 'Automated Engine' : 'Operations Desk',
        badgeColor: cat === 'Completion' ? 'emerald' : cat === 'Payment' ? 'blue' : 'indigo'
      });
    });

    bookings.forEach(b => {
      const cat: ActivityItem['category'] = 
        b.status === 'Completed' ? 'Completion' :
        b.paymentStatus === 'Paid' ? 'Payment' :
        b.status === 'In Progress' ? 'Dispatch' : 'Assignment';

      list.push({
        id: `job-act-${b.id}`,
        time: b.scheduleTime || 'Today',
        category: cat,
        title: `${b.serviceName} (${b.status})`,
        description: `Customer: ${b.customerName} â€¢ Assigned: ${b.technicianName} â€¢ ${b.customerAddress || 'On-site'}`,
        actor: b.technicianName || 'Central Dispatch',
        actorRole: b.technicianName !== 'Unassigned' ? 'Field Pro' : 'Dispatcher',
        jobNo: b.jobNo.replace('#', ''),
        badgeColor: cat === 'Completion' ? 'emerald' : 'blue'
      });
    });

    return list;
  }, [auditLogs, bookings]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setIsRefreshing(false);
    addToast(`Activity audit stream synchronized (${dynamicActivities.length} events).`, 'info');
  };

  const filteredActivities = dynamicActivities.filter(item => {
    const matchesCat = filterCategory === 'All' || item.category === filterCategory;
    const matchesSearch = item.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
                          item.description.toLowerCase().includes(searchFilter.toLowerCase()) ||
                          item.actor.toLowerCase().includes(searchFilter.toLowerCase()) ||
                          (item.jobNo && item.jobNo.toLowerCase().includes(searchFilter.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  const totalGrossSettled = bookings
    .filter(b => b.paymentStatus === 'Paid')
    .reduce((acc, b) => acc + (b.estimate || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Today's Activity</h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Feed
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Real-time audit log of all technician updates, dispatch events and customer interactions</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-slate-600 shadow-2xs transition-all cursor-pointer"
            title="Refresh Activity"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
          <button
            onClick={() => {
              downloadCSV('daily_activity_audit_log', dynamicActivities.map(a => ({
                'Time': a.time,
                'Category': a.category,
                'Title': a.title,
                'Description': a.description,
                'Actor': a.actor,
                'Role': a.actorRole,
                'Job No': a.jobNo || 'N/A'
              })));
              addToast('Today\'s activity log downloaded as CSV!', 'success');
            }}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export Log
          </button>
        </div>
      </div>

      {/* 4 Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Events Today</div>
            <div className="text-xl font-extrabold text-slate-900">{dynamicActivities.length} Events</div>
            <div className="text-[10px] text-slate-500 font-bold mt-0.5">Live system log</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Completed Jobs</div>
            <div className="text-xl font-extrabold text-slate-900">
              {bookings.filter(b => b.status === 'Completed').length} Jobs
            </div>
            <div className="text-[10px] text-emerald-600 font-bold mt-0.5">Confirmed delivery</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active Techs</div>
            <div className="text-xl font-extrabold text-slate-900">{technicians.filter(t => t.status === 'Available' || t.status === 'On Job').length} Online</div>
            <div className="text-[10px] text-slate-500 font-bold mt-0.5">Field workforce synced</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Gross Settled</div>
            <div className="text-xl font-extrabold text-slate-900">${totalGrossSettled.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div className="text-[10px] text-emerald-600 font-bold mt-0.5">Paid transactions</div>
          </div>
        </div>
      </div>

      {/* Main Content: Chronological Stream & Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Filter bar */}
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex flex-wrap items-center gap-1.5">
            {['All', 'Assignment', 'Completion', 'Payment', 'Alert', 'Dispatch'].map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  filterCategory === cat
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/70'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search activity stream..."
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Activity Stream List */}
        <div className="divide-y divide-slate-100">
          {filteredActivities.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center">
              <Clock className="w-10 h-10 text-slate-300 mb-2" />
              <p className="font-bold text-slate-700 text-sm">No Activity Events Recorded Today</p>
              <p className="text-slate-400 text-xs max-w-sm mt-1">Operational events, job dispatches, completions, and customer transactions will stream here in real-time as field work occurs.</p>
            </div>
          ) : (
            filteredActivities.map((act) => (
              <div key={act.id} className="p-4 hover:bg-slate-50/70 transition-colors flex items-start gap-4">
                <div className="shrink-0 pt-0.5">
                  <span className="text-[11px] font-mono font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
                    {act.time}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${
                      act.category === 'Completion' ? 'bg-emerald-100 text-emerald-800' :
                      act.category === 'Payment' ? 'bg-blue-100 text-blue-800' :
                      act.category === 'Alert' ? 'bg-rose-100 text-rose-800' :
                      act.category === 'Dispatch' ? 'bg-purple-100 text-purple-800' :
                      'bg-indigo-100 text-indigo-800'
                    }`}>
                      {act.category}
                    </span>

                    <h3 className="text-xs font-bold text-slate-900 truncate">{act.title}</h3>

                    {act.jobNo && (
                      <button
                        onClick={() => navigateToPage(9)} // Navigate to Booking Details
                        className="text-[11px] font-mono font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors cursor-pointer"
                        title="View Job Details"
                      >
                        #{act.jobNo}
                        <ExternalLink className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 mt-1">{act.description}</p>

                  <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1 font-medium text-slate-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                      Actor: <strong className="text-slate-700">{act.actor}</strong> ({act.actorRole})
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

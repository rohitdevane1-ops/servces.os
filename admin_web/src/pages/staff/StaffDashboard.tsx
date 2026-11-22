import React, { useMemo } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import {
  Inbox,
  Clock,
  CheckCircle2,
  ArrowRight,
  UserCheck,
  Phone,
  MapPin,
  ArrowRightLeft,
  Calendar,
  TrendingUp,
} from 'lucide-react';

export const StaffDashboard: React.FC = () => {
  const {
    bookings,
    technicians,
    reviews,
    openAssignModal,
    navigateToStaffPage,
    openSMSModal,
    formatCurrency,
  } = useAdmin();

  const pendingBookings = bookings.filter((b) => b.status === 'Pending');
  const inProgressBookings = bookings.filter((b) => b.status === 'In Progress');
  const scheduledBookings = bookings.filter((b) => b.status === 'Scheduled');
  const completedBookings = bookings.filter((b) => b.status === 'Completed');
  const availableTechs = technicians.filter((t) => t.status === 'Available');

  const avgCsat = useMemo(() => {
    if (reviews.length === 0) return 'No reviews yet';
    const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    return `Customer CSAT: ${avg.toFixed(2)} / 5.0`;
  }, [reviews]);

  // Truthful time-bucket dispatch distribution derived strictly from live bookings
  const hourlyDispatchSeries = useMemo(() => {
    if (bookings.length === 0) return [];
    const slots = [
      { label: '08:00 AM', startHour: 0, endHour: 9, incoming: 0, completed: 0 },
      { label: '10:00 AM', startHour: 10, endHour: 11, incoming: 0, completed: 0 },
      { label: '12:00 PM', startHour: 12, endHour: 13, incoming: 0, completed: 0 },
      { label: '02:00 PM', startHour: 14, endHour: 15, incoming: 0, completed: 0 },
      { label: '04:00 PM', startHour: 16, endHour: 17, incoming: 0, completed: 0 },
      { label: '06:00 PM', startHour: 18, endHour: 23, incoming: 0, completed: 0 },
    ];

    for (const b of bookings) {
      let hour = 12;
      if (b.scheduledStartIso) {
        const d = new Date(b.scheduledStartIso);
        if (!Number.isNaN(d.getTime())) hour = d.getHours();
      }
      const bucket =
        slots.find((s) => hour >= s.startHour && hour <= s.endHour) || slots[2];
      bucket.incoming += 1;
      if (b.status === 'Completed') {
        bucket.completed += 1;
      }
    }

    return slots.map((s) => ({
      time: s.label,
      incoming: s.incoming,
      completed: s.completed,
    }));
  }, [bookings]);

  return (
    <div className="space-y-6">
      {/* Top Welcome / Operations Header */}
      <div className="bg-gradient-to-r from-[#0C3832] to-[#124e45] rounded-2xl p-5 text-white shadow-xs relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-400 text-slate-950 tracking-wider">
                Staff Operations Hub
              </span>
              <span className="text-emerald-300 text-xs font-semibold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Live Dispatch Console
              </span>
            </div>
            <h1 className="text-xl lg:text-2xl font-extrabold tracking-tight text-white">
              Order Dispatch &amp; Operations Desk
            </h1>
            <p className="text-emerald-100/80 text-xs mt-0.5 max-w-2xl">
              Handle incoming customer requests, assign verified technicians based on spatial distance and trade category, and supervise active field execution.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => navigateToStaffPage(104)}
              className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <UserCheck className="w-3.5 h-3.5 text-white" />
              <span>Assign Orders ({pendingBookings.length})</span>
            </button>
            <button
              onClick={() => navigateToStaffPage(107)}
              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/20 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-emerald-300" />
              <span>Emergency Handover</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4 Operations KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => navigateToStaffPage(102)}
          className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:border-amber-400 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Unassigned Queue</span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <Inbox className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-black text-slate-900">{String(pendingBookings.length).padStart(2, '0')}</div>
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              Needs Assignment
            </span>
          </div>
          <div className="text-[10px] text-slate-500 mt-2 flex items-center justify-between font-medium">
            <span>{pendingBookings.length > 0 ? `${pendingBookings.length} awaiting pro` : 'Queue clear'}</span>
            <ArrowRight className="w-3 h-3 text-slate-400" />
          </div>
        </div>

        <div
          onClick={() => navigateToStaffPage(109)}
          className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:border-emerald-500 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Dispatched Orders</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-black text-slate-900">
              {String(scheduledBookings.length).padStart(2, '0')}
            </div>
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              Techs Assigned
            </span>
          </div>
          <div className="text-[10px] text-slate-500 mt-2 flex items-center justify-between font-medium">
            <span>{scheduledBookings.length} scheduled visits</span>
            <ArrowRight className="w-3 h-3 text-slate-400" />
          </div>
        </div>

        <div
          onClick={() => navigateToStaffPage(108)}
          className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:border-sky-500 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">On-Site Working</span>
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-600 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-black text-slate-900">
              {String(inProgressBookings.length).padStart(2, '0')}
            </div>
            <span className="text-[10px] font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
              Live Field Work
            </span>
          </div>
          <div className="text-[10px] text-slate-500 mt-2 flex items-center justify-between font-medium">
            <span>PIN Verified &amp; Active</span>
            <ArrowRight className="w-3 h-3 text-slate-400" />
          </div>
        </div>

        <div
          onClick={() => navigateToStaffPage(111)}
          className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:border-emerald-600 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Completed Orders</span>
            <div className="w-9 h-9 rounded-xl bg-teal-500/10 text-teal-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-black text-slate-900">
              {String(completedBookings.length).padStart(2, '0')}
            </div>
            <span className="text-[10px] font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
              Proofs Logged
            </span>
          </div>
          <div className="text-[10px] text-slate-500 mt-2 flex items-center justify-between font-medium">
            <span>{avgCsat}</span>
            <ArrowRight className="w-3 h-3 text-slate-400" />
          </div>
        </div>
      </div>

      {/* Live Dispatch Velocity Chart */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                Dispatch Velocity &amp; Order Distribution
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Live Bookings Feed
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Aggregated from active database bookings across time slots
            </p>
          </div>
        </div>

        <div className="h-56 w-full pt-1">
          {hourlyDispatchSeries.length === 0 ? (
            <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/50">
              <TrendingUp className="w-6 h-6 text-slate-300 mb-2" />
              <div className="text-xs font-bold text-slate-700">No Active Orders Recorded</div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Dispatch velocity curves populate automatically as orders enter the system.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyDispatchSeries} margin={{ top: 10, right: 15, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="time" stroke="#94A3B8" fontSize={11} fontWeight={600} tickLine={false} />
                <YAxis stroke="#94A3B8" fontSize={11} fontWeight={600} tickLine={false} axisLine={false} />
                <Tooltip />
                <Area type="monotone" dataKey="incoming" stroke="#3B82F6" strokeWidth={2.5} fill="#DBEAFE" />
                <Area type="monotone" dataKey="completed" stroke="#10B981" strokeWidth={3} fill="#D1FAE5" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Unassigned Orders + Technician Roster */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">Incoming Orders Awaiting Assignment</h2>
              <p className="text-xs text-slate-500 mt-0.5">Assign verified technician to pending bookings</p>
            </div>
            <button
              onClick={() => navigateToStaffPage(104)}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
            >
              <span>Open Assignment Desk</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-100 overflow-x-auto">
            {pendingBookings.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                All incoming orders have been assigned to technicians.
              </div>
            ) : (
              pendingBookings.map((order) => (
                <div
                  key={order.id}
                  className="p-4 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                        {order.jobNo}
                      </span>
                      <span className="text-xs font-bold text-slate-900">{order.serviceName}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          order.priority === 'Critical'
                            ? 'bg-rose-100 text-rose-700'
                            : order.priority === 'High'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {order.priority}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span className="truncate max-w-[200px]">{order.customerAddress}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span>{order.customerPhone}</span>
                      </span>
                      <span className="font-bold text-slate-700">{formatCurrency(order.estimate)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => openAssignModal(order)}
                      className="px-3.5 py-1.5 rounded-xl bg-[#0C3832] hover:bg-[#124e45] text-white font-bold text-xs transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <UserCheck className="w-3.5 h-3.5 text-amber-300" />
                      <span>Assign Pro</span>
                    </button>
                    <button
                      onClick={() =>
                        openSMSModal({
                          name: order.customerName,
                          phone: order.customerPhone || '',
                          type: 'customer',
                        })
                      }
                      className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 text-xs font-semibold hover:bg-slate-100 transition-all cursor-pointer"
                    >
                      Notify SMS
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Technician Roster */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col justify-between">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-slate-900">Technician Roster</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                {availableTechs.length} Available
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">Current duty status of field technicians</p>
          </div>

          <div className="divide-y divide-slate-100 p-2 overflow-y-auto max-h-[360px] thin-scrollbar">
            {technicians.slice(0, 6).map((tech) => (
              <div
                key={tech.id}
                className="p-3 hover:bg-slate-50 rounded-2xl transition-colors flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-xs shrink-0">
                    {tech.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 truncate">{tech.name}</div>
                    <div className="text-[10px] text-slate-500 font-medium">
                      {tech.specialization} â€¢ â˜… {tech.rating} ({tech.jobsCompleted} jobs)
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span
                    className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                      tech.status === 'Available'
                        ? 'bg-emerald-100 text-emerald-800'
                        : tech.status === 'On Job'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {tech.status}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-slate-100 bg-slate-50/50">
            <button
              onClick={() => navigateToStaffPage(106)}
              className="w-full py-2 rounded-xl bg-white border border-slate-200 hover:border-emerald-500 text-xs font-bold text-slate-700 hover:text-emerald-700 shadow-2xs transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Manage Shift Availability</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { 
  Activity, 
  Clock, 
  CheckCircle2, 
  MapPin, 
  AlertTriangle, 
  UserCheck, 
  DollarSign, 
  RefreshCw
} from 'lucide-react';

interface StreamEvent {
  id: string | number;
  type: string;
  title: string;
  time: string;
  desc: string;
  icon: any;
  color: string;
}

export const StaffActivityStream: React.FC = () => {
  const { bookings, auditLogs, addToast } = useAdmin();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Dynamically derive live stream events from audit logs and real bookings
  const streamEvents: StreamEvent[] = React.useMemo(() => {
    const events: StreamEvent[] = [];

    auditLogs.forEach(log => {
      events.push({
        id: log.id,
        type: 'audit',
        title: log.action,
        time: log.timestamp || 'Today',
        desc: `${log.details} • Logged by ${log.user}`,
        icon: log.action.toLowerCase().includes('complete') ? CheckCircle2 :
              log.action.toLowerCase().includes('payment') ? DollarSign :
              log.action.toLowerCase().includes('alert') ? AlertTriangle : Activity,
        color: log.action.toLowerCase().includes('complete') ? 'text-emerald-600 bg-emerald-50' :
               log.action.toLowerCase().includes('alert') ? 'text-rose-600 bg-rose-50' :
               'text-sky-600 bg-sky-50'
      });
    });

    bookings.forEach(b => {
      events.push({
        id: `job-evt-${b.id}`,
        type: b.status.toLowerCase(),
        title: `Order ${b.jobNo}: ${b.serviceName} (${b.status})`,
        time: b.scheduleTime || 'Today',
        desc: `Customer: ${b.customerName} • Pro: ${b.technicianName} • Address: ${b.customerAddress || 'Client Location'}`,
        icon: b.status === 'Completed' ? CheckCircle2 :
              b.status === 'In Progress' ? MapPin :
              b.technicianName === 'Unassigned' ? Clock : UserCheck,
        color: b.status === 'Completed' ? 'text-emerald-600 bg-emerald-50' :
               b.status === 'In Progress' ? 'text-blue-600 bg-blue-50' :
               b.technicianName === 'Unassigned' ? 'text-amber-600 bg-amber-50' :
               'text-teal-600 bg-teal-50'
      });
    });

    return events;
  }, [auditLogs, bookings]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setIsRefreshing(false);
    addToast(`Activity stream synchronized (${streamEvents.length} records).`, 'info');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Today's Work Activity & SLA Monitor</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              Live Feed
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time operational stream of technician dispatch events, geofence handshakes, and customer order updates.
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl shadow-2xs transition-all flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`} />
          <span>{isRefreshing ? 'Syncing...' : 'Refresh Stream'}</span>
        </button>
      </div>

      {/* Activity Timeline */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
        <div className="space-y-6">
          {streamEvents.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center">
              <Activity className="w-10 h-10 text-slate-300 mb-2" />
              <p className="font-bold text-slate-700 text-sm">No Activity Events Recorded Today</p>
              <p className="text-slate-400 text-xs max-w-sm mt-1">
                Technician arrivals, booking intake, order handshakes, and SLA timer telemetry will stream here in real-time.
              </p>
            </div>
          ) : (
            streamEvents.map((evt, idx) => {
            const Icon = evt.icon;
            return (
              <div key={evt.id} className="flex items-start gap-4 relative">
                {idx !== streamEvents.length - 1 && (
                  <div className="absolute left-5 top-10 bottom-0 w-0.5 bg-slate-100"></div>
                )}

                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border border-slate-100 ${evt.color}`}>
                  <Icon className="w-5 h-5" />
                </div>

                <div className="flex-1 bg-slate-50/70 p-4 rounded-2xl border border-slate-100">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h3 className="text-xs font-bold text-slate-900">{evt.title}</h3>
                    <span className="text-[10px] text-slate-400 font-medium">{evt.time}</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    {evt.desc}
                  </p>
                </div>
              </div>
            );
          }))}
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { 
  Navigation, 
  MapPin, 
  Phone, 
  ArrowRightLeft, 
  ExternalLink,
  Radio
} from 'lucide-react';
import { RealDispatchMap } from '../../components/common/RealDispatchMap';

export const StaffLiveDispatch: React.FC = () => {
  const { 
    bookings, 
    technicians, 
    navigateToStaffPage,
    addToast
  } = useAdmin();

  const [isPinging, setIsPinging] = useState(false);
  const [lastPingTelemetry, setLastPingTelemetry] = useState('Awaiting live technician telemetry');

  const handleRefreshPing = () => {
    setIsPinging(true);
    const activeCount = technicians.filter(t => t.status === 'Available' || t.status === 'Busy').length;
    const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setIsPinging(false);
    setLastPingTelemetry(
      activeCount > 0
        ? `${activeCount} active technician${activeCount === 1 ? '' : 's'} synced at ${time}`
        : `No active technician beacons online (${time})`
    );
    addToast(`Telemetry refreshed (${activeCount} active technician${activeCount === 1 ? '' : 's'}).`, 'info');
  };

  const activeBookings = bookings.filter(b => (b.status === 'In Progress' || b.status === 'Scheduled') && b.technicianId && b.technicianId !== 'unassigned');
  const primaryBooking = activeBookings.find(b => b.status === 'In Progress') || activeBookings[0];
  const hasActiveRoute = Boolean(primaryBooking && primaryBooking.status === 'In Progress');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Live Dispatch Radar</h1>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1 ${
              hasActiveRoute ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
            }`}>
              <span className={`w-2 h-2 rounded-full ${hasActiveRoute ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'}`}></span>
              {hasActiveRoute ? 'Live GPS Feeds' : 'Radar Standby'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time interactive GPS map tracking technician locations, live Google Maps sharing, arrival ETAs, and active order routes.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Radar Telemetry</span>
            <span className="text-[11px] font-mono font-bold text-slate-700">{hasActiveRoute ? lastPingTelemetry : 'Transponder Idle (0 active)'}</span>
          </div>

          <button
            onClick={handleRefreshPing}
            disabled={isPinging}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Radio className={`w-3.5 h-3.5 ${isPinging ? 'animate-ping text-emerald-600' : 'text-slate-500'}`} />
            <span>{isPinging ? 'Pinging GPS...' : 'Refresh GPS Ping'}</span>
          </button>
          <button
            onClick={() => navigateToStaffPage(107)}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>Emergency Handover</span>
          </button>
        </div>
      </div>

      {/* Map & Live Radar Canvas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Real Interactive Map */}
        <div className="lg:col-span-2">
          <RealDispatchMap 
            height="540px" 
            hasActiveRoute={hasActiveRoute}
            technicianName={primaryBooking?.technicianName}
            customerName={primaryBooking?.customerName}
            customerAddress={primaryBooking?.customerAddress}
          />
        </div>

        {/* Right 1 Col: Active Order Dispatches */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4.5 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide mb-1">
              Active Field Dispatches
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Real-time progression of scheduled orders
            </p>

            <div className="space-y-3 overflow-y-auto max-h-[420px] thin-scrollbar pr-1">
              {activeBookings.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Navigation className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                  <p className="text-xs font-bold text-slate-700">No Active Dispatches in Progress</p>
                  <p className="text-[11px] text-slate-400 mt-1">Dispatches appear when orders are accepted and technicians navigate to work sites.</p>
                </div>
              ) : (
                activeBookings.map(b => (
                  <div key={b.id} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 hover:border-emerald-500/50 transition-all">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-mono font-bold text-slate-800">{b.jobNo}</span>
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                        b.status === 'In Progress' ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'
                      }`}>
                        {b.status}
                      </span>
                    </div>

                    <div className="text-xs font-bold text-slate-900 truncate">
                      {b.serviceName}
                    </div>

                    <div className="text-[11px] text-slate-600 mt-1 flex items-center gap-1 truncate">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{b.customerAddress}</span>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs">
                      <span className="font-bold text-emerald-700">Pro: {b.technicianName}</span>
                      <div className="flex items-center gap-2">
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${b.lat},${b.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                          title="Open technician in Google Maps"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Google Map</span>
                        </a>
                        <button
                          onClick={() => {
                            const tech = technicians.find(t => t.name === b.technicianName);
                            const phone = tech?.phone || b.customerPhone || '';
                            if (!phone) {
                              addToast(`No phone contact found for ${b.technicianName}`, 'error');
                              return;
                            }
                            window.open(`tel:${phone.replace(/[^0-9+]/g, '')}`);
                            addToast(`Placing call to technician ${b.technicianName} (${phone})...`, 'info');
                          }}
                          className="text-[11px] font-bold text-slate-700 hover:text-emerald-700 flex items-center gap-1 cursor-pointer"
                        >
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>Call</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-100">
            <button
              onClick={() => navigateToStaffPage(108)}
              className="w-full py-2.5 rounded-xl bg-[#0C3832] text-white font-bold text-xs hover:bg-[#124e45] shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>View In-Progress Order Details</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

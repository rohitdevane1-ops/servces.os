import React, { useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { 
  AlertOctagon, 
  AlertTriangle, 
  ShieldAlert, 
  RotateCcw, 
  CheckCircle, 
  MapPin, 
  BellRing,
  PhoneCall,
  Clock,
  Send,
  CheckCircle2,
  ShieldCheck,
  Search,
  Eye,
  X,
} from 'lucide-react';
import { Incident } from '../../types';

export const Page05CriticalAlerts: React.FC = () => {
  const { 
    incidents, 
    resolveIncident, 
    acknowledgeAllIncidents, 
    setSelectedBookingId, 
    navigateToPage, 
    openSMSModal, 
    bookings, 
    technicians,
    addToast 
  } = useAdmin();

  const [filterSeverity, setFilterSeverity] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeModalIncident, setActiveModalIncident] = useState<Incident | null>(null);

  const criticalCount = incidents.filter(i => i.severity === 'Critical' && !i.resolved).length;
  const highCount = incidents.filter(i => i.severity === 'High' && !i.resolved).length;
  const slaCount = incidents.filter(i => i.category === 'SLA' && !i.resolved).length;
  const resolvedCount = incidents.filter(i => i.resolved).length;

  const filteredIncidents = incidents.filter(inc => {
    const matchesFilter = 
      filterSeverity === 'All' ? true :
      filterSeverity === 'Active' ? !inc.resolved :
      filterSeverity === 'Resolved' ? inc.resolved :
      inc.severity === filterSeverity;

    const matchesSearch = 
      inc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inc.bookingNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inc.technicianName && inc.technicianName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (inc.customerName && inc.customerName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (inc.address && inc.address.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesFilter && matchesSearch;
  });

  const handleTriggerEmergencyHandover = (inc: Incident) => {
    const matchingBooking = bookings.find(b => b.jobNo.includes(inc.bookingNo.replace('#', '')) || b.customerName === inc.customerName);
    if (matchingBooking) {
      setSelectedBookingId(matchingBooking.id);
    }
    navigateToPage(12); // Navigate to Manual Dispatch & Job Handover
    addToast(`Transferred incident context to Manual Handover console for ${inc.bookingNo}`, 'info');
  };

  return (
    <div className="space-y-6">
      {/* 1. Top Header with Live Safeguard Indicator matching Page 01 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Critical Alerts &amp; Safety Desk</h1>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1.5 ${
              criticalCount > 0 
                ? 'bg-rose-100 text-rose-800' 
                : 'bg-emerald-100 text-emerald-800'
            }`}>
              <span className={`w-2 h-2 rounded-full ${criticalCount > 0 ? 'bg-rose-500 animate-ping' : 'bg-emerald-500'}`}></span>
              {criticalCount > 0 ? `${criticalCount} Unresolved Critical` : 'All Systems Operational'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time field safety safeguards, technician vehicle breakdowns, escrow payment holds, and dispatch SLA breaches
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={acknowledgeAllIncidents}
            className="px-3.5 py-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-bold text-xs rounded-xl shadow-2xs transition-colors cursor-pointer"
          >
            Acknowledge All
          </button>
          <button
            onClick={() => {
              const targetTech = technicians[0];
              openSMSModal({
                name: targetTech ? targetTech.name : 'Field Operations Fleet',
                phone: targetTech?.phone || '',
                type: 'technician'
              });
            }}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
          >
            <BellRing className="w-3.5 h-3.5" />
            Trigger SOS Broadcast
          </button>
        </div>
      </div>

      {/* 2. 4-KPI Metric Strip strictly matching Master Design System on Page 01 & Page 04 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Critical */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
            <AlertOctagon className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Level 1: Critical</div>
            <div className="text-2xl font-black text-rose-600 mt-0.5">
              {String(criticalCount).padStart(2, '0')}
            </div>
            <div className="text-[10px] text-rose-500 font-bold mt-0.5">Immediate intervention</div>
          </div>
        </div>

        {/* Metric 2: High Warning */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Level 2: Major Warning</div>
            <div className="text-2xl font-black text-amber-600 mt-0.5">
              {String(highCount).padStart(2, '0')}
            </div>
            <div className="text-[10px] text-amber-600 font-bold mt-0.5">SLA timeout imminent</div>
          </div>
        </div>

        {/* Metric 3: SLA Escalation */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">SLA Thresholds</div>
            <div className="text-2xl font-black text-blue-600 mt-0.5">
              {String(slaCount).padStart(2, '0')}
            </div>
            <div className="text-[10px] text-blue-500 font-bold mt-0.5">&lt;15m remaining window</div>
          </div>
        </div>

        {/* Metric 4: Resolved Today */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Resolved Today</div>
            <div className="text-2xl font-black text-emerald-600 mt-0.5">
              {String(resolvedCount).padStart(2, '0')}
            </div>
            <div className="text-[10px] text-emerald-600 font-bold mt-0.5">100% audit compliant</div>
          </div>
        </div>
      </div>

      {/* 3. Main Master Incident Table Card matching Page 04 & Page 06 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Search & Filter Toolbar */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div className="relative w-full max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Job #, technician, customer, address..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-rose-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Filter view:</span>
            {['All', 'Active', 'Critical', 'Resolved'].map(tab => (
              <button
                key={tab}
                onClick={() => setFilterSeverity(tab)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  filterSeverity === tab 
                    ? 'bg-slate-900 text-white shadow-xs' 
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Incident Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3.5 px-4">Incident &amp; Job</th>
                <th className="py-3.5 px-4">Severity &amp; Category</th>
                <th className="py-3.5 px-4">Incident Details &amp; Location</th>
                <th className="py-3.5 px-4">Affected Pro &amp; Customer</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Triage Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredIncidents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2.5" />
                    <h3 className="text-sm font-bold text-slate-800">No Incidents in this View</h3>
                    <p className="text-xs text-slate-400 mt-1">All operational safety metrics are within compliant parameters.</p>
                  </td>
                </tr>
              ) : (
                filteredIncidents.map(inc => (
                  <tr key={inc.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Column 1: Incident & Job # */}
                    <td className="py-3.5 px-4">
                      <div className="font-mono font-bold text-slate-900">
                        #{inc.bookingNo}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{inc.timestamp}</span>
                      </div>
                    </td>

                    {/* Column 2: Severity & Category */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${
                          inc.severity === 'Critical' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                          inc.severity === 'High' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {inc.severity}
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600">
                          {inc.category}
                        </span>
                      </div>
                    </td>

                    {/* Column 3: Incident Details & Address */}
                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="font-bold text-slate-900 leading-snug">{inc.title}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{inc.description}</div>
                      <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">{inc.address || 'Service Territory'}</span>
                      </div>
                    </td>

                    {/* Column 4: Pro & Customer */}
                    <td className="py-3.5 px-4">
                      <div className="text-slate-800 font-bold">
                        {inc.technicianName ? (
                          <span>Pro: <strong className="text-slate-900">{inc.technicianName}</strong></span>
                        ) : (
                          <span className="text-amber-600">Pro: Unassigned</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Client: <span className="font-semibold text-slate-700">{inc.customerName || 'N/A'}</span>
                      </div>
                    </td>

                    {/* Column 5: Status */}
                    <td className="py-3.5 px-4">
                      {inc.resolved ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1 w-fit">
                          <CheckCircle className="w-3 h-3 text-emerald-600" />
                          Resolved
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 flex items-center gap-1 w-fit">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
                          Action Req
                        </span>
                      )}
                    </td>

                    {/* Column 6: Quick Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {!inc.resolved && (
                          <button
                            onClick={() => handleTriggerEmergencyHandover(inc)}
                            className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-lg border border-rose-200 transition-colors cursor-pointer flex items-center gap-1"
                            title="Execute Emergency Handover on Page 12"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Handover</span>
                          </button>
                        )}

                        <button
                          onClick={() => setActiveModalIncident(inc)}
                          className="px-2.5 py-1 bg-slate-900 hover:bg-black text-white font-bold text-xs rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                          title="Open Triage Console"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Triage</span>
                        </button>

                        {!inc.resolved && (
                          <button
                            onClick={() => resolveIncident(inc.id)}
                            className="p-1 text-slate-400 hover:text-emerald-700 rounded-lg hover:bg-emerald-50 transition-colors cursor-pointer"
                            title="Quick Resolve"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Full Incident Triage & Safety Dossier Modal */}
      {activeModalIncident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-600" />
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">Incident Triage Dossier</h3>
                  <div className="text-[11px] text-slate-400 font-mono">Job #{activeModalIncident.bookingNo} • {activeModalIncident.timestamp}</div>
                </div>
              </div>

              <button
                onClick={() => setActiveModalIncident(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4 overflow-y-auto text-xs">
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase ${
                  activeModalIncident.severity === 'Critical' ? 'bg-rose-100 text-rose-800' :
                  activeModalIncident.severity === 'High' ? 'bg-amber-100 text-amber-800' :
                  'bg-slate-100 text-slate-700'
                }`}>
                  {activeModalIncident.severity} Alert
                </span>
                <span className="px-2 py-0.5 rounded-md font-bold bg-slate-100 text-slate-600">
                  {activeModalIncident.category}
                </span>
              </div>

              <div>
                <h4 className="text-base font-extrabold text-slate-900">{activeModalIncident.title}</h4>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-200/70">
                  {activeModalIncident.description}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Service Address</span>
                  <div className="font-bold text-slate-800 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{activeModalIncident.address || 'Service Territory'}</span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Assigned Technician</span>
                  <div className="font-bold text-slate-800">
                    {activeModalIncident.technicianName || 'Unassigned / Pending'}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Customer</span>
                  <div className="font-bold text-slate-800">
                    {activeModalIncident.customerName || 'N/A'}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Audit Status</span>
                  <div className="font-bold">
                    {activeModalIncident.resolved ? (
                      <span className="text-emerald-700">✓ Resolved &amp; Recorded</span>
                    ) : (
                      <span className="text-rose-600">⚠ Open Incident</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-5 border-t border-slate-100 bg-slate-50/70 space-y-2">
              {!activeModalIncident.resolved ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        handleTriggerEmergencyHandover(activeModalIncident);
                        setActiveModalIncident(null);
                      }}
                      className="py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Execute Emergency Handover</span>
                    </button>

                    <button
                      onClick={() => {
                        resolveIncident(activeModalIncident.id);
                        setActiveModalIncident(null);
                      }}
                      className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>Mark Incident as Resolved</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        const matchedTech = technicians.find(t => t.name === activeModalIncident.technicianName);
                        openSMSModal({
                          name: activeModalIncident.technicianName || 'Field Technician',
                          phone: matchedTech?.phone || '',
                          role: 'Technician',
                          type: 'technician'
                        });
                        setActiveModalIncident(null);
                      }}
                      className="py-2 px-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5 text-blue-600" />
                      <span>SMS Tech</span>
                    </button>

                    <button
                      onClick={() => {
                        const matchedTech = technicians.find(t => t.name === activeModalIncident.technicianName);
                        const phone = matchedTech?.phone || '';
                        if (phone) {
                          window.open(`tel:${phone.replace(/[^0-9+]/g, '')}`);
                          addToast(`Calling technician for #${activeModalIncident.bookingNo}...`, 'info');
                        } else {
                          addToast('No phone number configured for technician', 'error');
                        }
                      }}
                      className="py-2 px-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <PhoneCall className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Direct Call</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-800">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Incident Resolved &amp; Recorded in Safety Ledger</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { Modal } from '../common/Modal';
import { 
  Search, 
  User, 
  Wrench, 
  Briefcase, 
  Phone, 
  Mail, 
  MapPin, 
  Star, 
  CheckCircle2, 
  ExternalLink,
  ChevronRight
} from 'lucide-react';

export const UniversalUserDossierModal: React.FC = () => {
  const { 
    isDossierModalOpen, 
    closeUserDossier, 
    dossierUser, 
    customers, 
    technicians, 
    staffMembers, 
    bookings,
    addToast,
    navigateToPage,
    setSelectedCustomerId,
    setSelectedTechnicianId,
    navigateToFacebookProfile,
    openSMSModal,
    formatCurrency
  } = useAdmin();

  const [activeTab, setActiveTab] = useState<'customer' | 'technician' | 'staff'>('customer');
  const [selectedId, setSelectedId] = useState<string>('');
  const [searchFilter, setSearchFilter] = useState('');
  const [activeCall, setActiveCall] = useState<{ name: string; phone: string; duration: number } | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (activeCall) {
      timer = setInterval(() => {
        setActiveCall(prev => prev ? { ...prev, duration: prev.duration + 1 } : null);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [activeCall]);

  useEffect(() => {
    if (!(isDossierModalOpen && dossierUser)) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setActiveTab(dossierUser.type);
      setSelectedId(dossierUser.id);
    });
    return () => {
      active = false;
    };
  }, [isDossierModalOpen, dossierUser]);

  if (!isDossierModalOpen) return null;

  const handleStartCall = (name: string, phone: string) => {
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    window.open(`tel:${cleanPhone}`);
    setActiveCall({ name, phone, duration: 0 });
    addToast(`Connected live audio session to ${name} (${phone})`, 'success');
  };

  const handleEndCall = () => {
    if (activeCall) {
      addToast(`Call with ${activeCall.name} ended (${activeCall.duration}s).`, 'info');
      setActiveCall(null);
    }
  };

  const selectedCustomer = customers.find(c => c.id === selectedId) || customers[0];
  const selectedTech = technicians.find(t => t.id === selectedId) || technicians[0];
  const selectedStaff = staffMembers.find(s => s.id === selectedId) || staffMembers[0];

  const customerBookings = bookings.filter(b =>
    selectedCustomer &&
    ((b.customerId && b.customerId === selectedCustomer.id) ||
      b.customerName.toLowerCase() === selectedCustomer.name.toLowerCase())
  );

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchFilter.toLowerCase()) || 
    c.city.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const filteredTechs = technicians.filter(t => 
    t.name.toLowerCase().includes(searchFilter.toLowerCase()) || 
    t.specialization.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const filteredStaff = staffMembers.filter(s => 
    s.name.toLowerCase().includes(searchFilter.toLowerCase()) || 
    s.role.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <Modal
      isOpen={isDossierModalOpen}
      onClose={closeUserDossier}
      title="Enterprise User Directory & Dossier"
      maxWidth="max-w-4xl"
    >
      <div className="px-6 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
        <div className="flex items-center bg-slate-200/80 p-0.5 rounded-xl text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              setActiveTab('customer');
              setSelectedId(customers[0]?.id || '');
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === 'customer' ? 'bg-[#0C3832] text-white shadow-xs' : 'text-slate-700 hover:text-slate-950'
            }`}
          >
            <User className="w-3.5 h-3.5 text-emerald-400" />
            <span>Customers ({customers.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('technician');
              setSelectedId(technicians[0]?.id || '');
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === 'technician' ? 'bg-[#0C3832] text-white shadow-xs' : 'text-slate-700 hover:text-slate-950'
            }`}
          >
            <Wrench className="w-3.5 h-3.5 text-emerald-400" />
            <span>Technicians ({technicians.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('staff');
              setSelectedId(staffMembers[0]?.id || '');
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === 'staff' ? 'bg-[#0C3832] text-white shadow-xs' : 'text-slate-700 hover:text-slate-950'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5 text-emerald-400" />
            <span>Staff ({staffMembers.length})</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            closeUserDossier();
            if (activeTab === 'customer') {
              setSelectedCustomerId(selectedId);
              navigateToPage(19);
            } else if (activeTab === 'technician') {
              setSelectedTechnicianId(selectedId);
              navigateToPage(23);
            } else {
              navigateToFacebookProfile({ type: activeTab, id: selectedId });
            }
          }}
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>View Full Profile Page â†’</span>
        </button>
      </div>

      {activeCall && (
        <div className="mx-6 my-2 p-3 bg-emerald-950 text-white rounded-2xl border border-emerald-500/40 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center animate-pulse">
              <Phone className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-black text-white">Live Call Active: {activeCall.name}</div>
              <div className="text-[11px] text-emerald-200 font-mono">
                {activeCall.phone} â€¢ {Math.floor(activeCall.duration / 60).toString().padStart(2, '0')}:{(activeCall.duration % 60).toString().padStart(2, '0')}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleEndCall}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-extrabold cursor-pointer"
          >
            End &amp; Log Call
          </button>
        </div>
      )}

      <div className="flex h-[520px] overflow-hidden">
        {/* Left Roster */}
        <div className="w-72 border-r border-slate-200/80 flex flex-col bg-slate-50/50 shrink-0">
          <div className="p-3 border-b border-slate-200/60">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                placeholder={`Search ${activeTab}s...`}
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto thin-scrollbar p-2 space-y-1">
            {activeTab === 'customer' && filteredCustomers.map(cust => (
              <button
                key={cust.id}
                onClick={() => setSelectedId(cust.id)}
                className={`w-full text-left p-2.5 rounded-xl transition-all flex items-center justify-between cursor-pointer ${
                  selectedCustomer?.id === cust.id ? 'bg-emerald-600 text-white shadow-xs' : 'hover:bg-slate-100 text-slate-800'
                }`}
              >
                <div className="min-w-0">
                  <div className="font-bold text-xs truncate">{cust.name}</div>
                  <div className={`text-[10px] truncate ${selectedCustomer?.id === cust.id ? 'text-emerald-100' : 'text-slate-400'}`}>
                    {cust.city || 'Service Area'} â€¢ {cust.totalBookings} orders
                  </div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            ))}

            {activeTab === 'technician' && filteredTechs.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`w-full text-left p-2.5 rounded-xl transition-all flex items-center justify-between cursor-pointer ${
                  selectedTech?.id === t.id ? 'bg-emerald-600 text-white shadow-xs' : 'hover:bg-slate-100 text-slate-800'
                }`}
              >
                <div className="min-w-0">
                  <div className="font-bold text-xs truncate">{t.name}</div>
                  <div className={`text-[10px] truncate ${selectedTech?.id === t.id ? 'text-emerald-100' : 'text-slate-400'}`}>
                    {t.specialization} â€¢ {t.status}
                  </div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            ))}

            {activeTab === 'staff' && filteredStaff.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className={`w-full text-left p-2.5 rounded-xl transition-all flex items-center justify-between cursor-pointer ${
                  selectedStaff?.id === s.id ? 'bg-emerald-600 text-white shadow-xs' : 'hover:bg-slate-100 text-slate-800'
                }`}
              >
                <div className="min-w-0">
                  <div className="font-bold text-xs truncate">{s.name}</div>
                  <div className={`text-[10px] truncate ${selectedStaff?.id === s.id ? 'text-emerald-100' : 'text-slate-400'}`}>
                    {s.role}
                  </div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* Right Detail Panel */}
        <div className="flex-1 p-6 overflow-y-auto thin-scrollbar">
          {activeTab === 'customer' && selectedCustomer && (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-gradient-to-r from-[#0C3832] to-[#134E45] text-white flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black">{selectedCustomer.name}</h3>
                  <div className="text-xs text-emerald-200 mt-0.5 flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{selectedCustomer.address || selectedCustomer.city}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleStartCall(selectedCustomer.name, selectedCustomer.phone)}
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Call</span>
                  </button>
                  <button
                    onClick={() => openSMSModal({ name: selectedCustomer.name, phone: selectedCustomer.phone, role: 'Customer', type: 'customer' })}
                    className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>SMS</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 text-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Lifetime Spend</span>
                  <span className="text-base font-black text-emerald-700">{formatCurrency(selectedCustomer.lifetimeSpend)}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 text-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Completed Orders</span>
                  <span className="text-base font-black text-slate-900">{selectedCustomer.totalBookings} Jobs</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 text-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Customer Rating</span>
                  <span className="text-base font-black text-amber-600 flex items-center justify-center gap-1">
                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                    {selectedCustomer.rating}
                  </span>
                </div>
              </div>

              <div className="p-4 bg-white rounded-2xl border border-slate-200/80 space-y-2 text-xs">
                <span className="font-extrabold text-slate-900 block">Contact Information</span>
                <div className="grid grid-cols-2 gap-2 text-slate-700">
                  <div>Email: <span className="font-mono font-bold text-slate-900">{selectedCustomer.email || 'â€”'}</span></div>
                  <div>Phone: <span className="font-mono font-bold text-slate-900">{selectedCustomer.phone || 'â€”'}</span></div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide mb-2">
                  Order History ({customerBookings.length} Logged)
                </h4>
                <div className="space-y-2">
                  {customerBookings.map(b => (
                    <div key={b.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-slate-900">{b.jobNo} â€¢ {b.serviceName}</div>
                        <div className="text-[11px] text-slate-500">Tech: {b.technicianName} â€¢ {b.scheduleDate} at {b.scheduleTime}</div>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-slate-900 block">{formatCurrency(b.estimate)}</span>
                        <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          {b.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'technician' && selectedTech && (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-gradient-to-r from-[#0C3832] to-[#134E45] text-white flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black">{selectedTech.name}</h3>
                  <div className="text-xs text-emerald-200 mt-0.5">
                    {selectedTech.specialization} â€¢ Shift: {selectedTech.workingHours}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleStartCall(selectedTech.name, selectedTech.phone)}
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Call</span>
                  </button>
                  <button
                    onClick={() => openSMSModal({ name: selectedTech.name, phone: selectedTech.phone, role: selectedTech.specialization, type: 'technician' })}
                    className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>SMS</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 text-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Jobs Done</span>
                  <span className="text-base font-black text-slate-900">{selectedTech.jobsCompleted}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 text-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">On-Time SLA</span>
                  <span className="text-base font-black text-emerald-700">{selectedTech.onTimeRate}%</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 text-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Pro Rating</span>
                  <span className="text-base font-black text-amber-600">â˜… {selectedTech.rating}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 text-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Active Load</span>
                  <span className="text-base font-black text-slate-900">{selectedTech.currentJobsCount} Jobs</span>
                </div>
              </div>

              <div className="p-4 bg-white rounded-2xl border border-slate-200/80 space-y-3 text-xs">
                <span className="font-extrabold text-slate-900 block">Credentials &amp; Assigned Fleet</span>
                <div className="grid grid-cols-2 gap-2 text-slate-700">
                  <div>Trade License: <span className="font-mono font-bold text-slate-900">{selectedTech.licenseNumber || 'Verified Pro'}</span></div>
                  <div>Hourly Rate: <span className="font-mono font-bold text-emerald-700">{formatCurrency(selectedTech.hourlyRate || 85)}/hr</span></div>
                  <div>Service Vehicle: <span className="font-bold text-slate-900">{selectedTech.vehicleMakeModel || 'Service Fleet Vehicle'}</span></div>
                  <div>License Plate: <span className="font-mono font-bold text-slate-900">{selectedTech.vehicleLicensePlate || 'â€”'}</span></div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'staff' && selectedStaff && (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-gradient-to-r from-[#0C3832] to-[#134E45] text-white flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black">{selectedStaff.name}</h3>
                  <div className="text-xs text-emerald-200 mt-0.5">
                    {selectedStaff.role} â€¢ {selectedStaff.department}
                  </div>
                </div>
                <span className="px-3 py-1 rounded-xl text-xs font-extrabold bg-emerald-400 text-slate-950">
                  {selectedStaff.status}
                </span>
              </div>

              <div className="p-4 bg-white rounded-2xl border border-slate-200/80 space-y-2 text-xs">
                <span className="font-extrabold text-slate-900 block">Operator Credentials</span>
                <div className="grid grid-cols-2 gap-2 text-slate-700">
                  <div>Email: <span className="font-mono font-bold text-slate-900">{selectedStaff.email}</span></div>
                  <div>Phone: <span className="font-mono font-bold text-slate-900">{selectedStaff.phone}</span></div>
                  <div>Daily Shift: <span className="font-bold text-slate-900">{selectedStaff.shiftHours}</span></div>
                  <div>Territory Hub: <span className="font-bold text-slate-900">{selectedStaff.territory}</span></div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs text-slate-700 space-y-1.5">
                <span className="font-bold text-slate-900 block">Assigned Workspaces &amp; Authority:</span>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Customer Intake Queue Triage &amp; SLA Management</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Technician Order Assignment &amp; Emergency Handover Desk</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

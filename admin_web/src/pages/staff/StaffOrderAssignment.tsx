import React, { useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { 
  UserCheck, 
  Search, 
  MapPin, 
  ShieldCheck, 
  Phone
} from 'lucide-react';
import { Booking } from '../../types';

export const StaffOrderAssignment: React.FC = () => {
  const { 
    bookings, 
    technicians, 
    assignTechnician, 
    addToast
  } = useAdmin();

  const pendingBookings = bookings.filter(b => b.status === 'Pending');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(
    pendingBookings.length > 0 ? pendingBookings[0] : null
  );
  const [searchTech, setSearchTech] = useState<string>('');
  const [tradeFilter, setTradeFilter] = useState<string>('All');

  const filteredTechnicians = technicians.filter(tech => {
    const matchTrade = tradeFilter === 'All' || tech.specialization.toLowerCase().includes(tradeFilter.toLowerCase());
    const matchSearch = tech.name.toLowerCase().includes(searchTech.toLowerCase()) ||
                        tech.phone.includes(searchTech);
    return matchTrade && matchSearch;
  });

  const handleAssign = (techId: string, techName: string) => {
    if (!selectedBooking) {
      addToast('Please select an order to assign first', 'warning');
      return;
    }
    assignTechnician(selectedBooking.id, techId);
    addToast(`Order ${selectedBooking.jobNo} assigned to ${techName}! Dispatch SMS sent.`, 'success');
    
    const remaining = pendingBookings.filter(b => b.id !== selectedBooking.id);
    setSelectedBooking(remaining.length > 0 ? remaining[0] : null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Order Assignment Board</h1>
          <p className="text-xs text-slate-500 mt-1">
            Match unassigned incoming orders with available, qualified field technicians.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold rounded-xl">
            {pendingBookings.length} Orders Awaiting Assignment
          </span>
        </div>
      </div>

      {/* Main Grid: Orders on Left (1 col), Techs on Right (2 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Select Order to Assign */}
        <div className="bg-white rounded-2xl p-4.5 border border-slate-200/80 shadow-xs flex flex-col h-full">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">
              Orders Queue
            </h2>
            <span className="text-xs text-slate-500 font-semibold">
              Select order to assign
            </span>
          </div>

          <div className="space-y-3 overflow-y-auto max-h-[600px] thin-scrollbar pr-1">
            {pendingBookings.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No unassigned orders at this time!
              </div>
            ) : (
              pendingBookings.map(order => {
                const isSelected = selectedBooking?.id === order.id;
                return (
                  <div
                    key={order.id}
                    onClick={() => setSelectedBooking(order)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/40 ring-2 ring-emerald-500/20'
                        : 'border-slate-200/80 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                        {order.jobNo}
                      </span>
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                        order.priority === 'Critical' ? 'bg-rose-100 text-rose-800' :
                        order.priority === 'High' ? 'bg-amber-100 text-amber-800' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {order.priority}
                      </span>
                    </div>

                    <div className="text-xs font-bold text-slate-900 truncate">
                      {order.serviceName}
                    </div>

                    <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1 truncate">
                      <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{order.customerAddress}</span>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-2 mt-2 border-t border-slate-100">
                      <span className="font-semibold text-slate-600">{order.customerName}</span>
                      <span className="font-bold text-slate-900">${order.estimate}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right 2 Columns: Available Technicians Grid */}
        <div className="lg:col-span-2 space-y-4">
          {/* Active Order Context Bar */}
          {selectedBooking ? (
            <div className="bg-[#0C3832] text-white p-4 rounded-2xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase font-extrabold text-amber-300 tracking-wider">
                  Target Order for Assignment:
                </div>
                <div className="text-sm font-black flex items-center gap-2 mt-0.5">
                  <span>{selectedBooking.jobNo}</span>
                  <span>â€¢</span>
                  <span>{selectedBooking.serviceName}</span>
                </div>
                <div className="text-xs text-emerald-100/80 mt-0.5">
                  Customer: {selectedBooking.customerName} ({selectedBooking.customerAddress})
                </div>
              </div>

              <div className="shrink-0 flex items-center gap-2">
                <span className="text-xs font-bold bg-white/10 px-3 py-1.5 rounded-xl border border-white/20">
                  Target Trade: {selectedBooking.category}
                </span>
              </div>
            </div>
          ) : (
            <div className="bg-slate-100 p-4 rounded-2xl text-slate-600 text-xs font-semibold">
              Select an order from the left column to view smart technician matching.
            </div>
          )}

          {/* Search & Filter */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTech}
                onChange={(e) => setSearchTech(e.target.value)}
                placeholder="Search technician by name or phone..."
                className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 text-slate-800"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={tradeFilter}
                onChange={(e) => setTradeFilter(e.target.value)}
                className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-semibold focus:outline-none cursor-pointer"
              >
                <option value="All">All Trades</option>
                <option value="HVAC">HVAC</option>
                <option value="Electrical">Electrical</option>
                <option value="Plumbing">Plumbing</option>
                <option value="Cleaning">Cleaning</option>
              </select>
            </div>
          </div>

          {/* Tech Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredTechnicians.map((tech) => {
              const isTradeMatch = selectedBooking && tech.specialization.toLowerCase().includes(selectedBooking.category.toLowerCase());
              return (
                <div 
                  key={tech.id} 
                  className={`bg-white rounded-2xl p-4.5 border shadow-xs transition-all flex flex-col justify-between ${
                    isTradeMatch ? 'border-emerald-500/50 bg-emerald-50/10' : 'border-slate-200/80'
                  }`}
                >
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

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 bg-slate-50 p-3 rounded-2xl mb-4">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Active Jobs</span>
                        <span className="font-bold text-slate-800">{tech.currentJobsCount} In Progress</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">On-Time SLA</span>
                        <span className="font-bold text-emerald-700">{tech.onTimeRate}%</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Distance to Order</span>
                        <span className="font-bold text-slate-800">~2.4 km</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Shift Hours</span>
                        <span className="font-bold text-slate-800">{tech.workingHours}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                    <button
                      onClick={() => {
                        window.open(`tel:${tech.phone.replace(/[^0-9+]/g, '')}`);
                        addToast(`Placing call to technician ${tech.name} (${tech.phone})...`, 'info');
                      }}
                      className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
                      title="Call Technician"
                    >
                      <Phone className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => handleAssign(tech.id, tech.name)}
                      disabled={!selectedBooking}
                      className={`flex-1 py-2 rounded-xl font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                        selectedBooking
                          ? 'bg-[#0C3832] hover:bg-[#124e45] text-white'
                          : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      <UserCheck className="w-3.5 h-3.5 text-amber-300" />
                      <span>Assign to Order</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

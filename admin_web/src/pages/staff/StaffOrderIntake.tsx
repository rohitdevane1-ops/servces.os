import React, { useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { 
  Inbox, 
  Search, 
  MapPin, 
  Phone, 
  Calendar, 
  Clock, 
  UserCheck, 
} from 'lucide-react';

export const StaffOrderIntake: React.FC = () => {
  const { 
    bookings, 
    openAssignModal, 
    addToast,
    navigateToStaffPage
  } = useAdmin();

  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');
  const [search, setSearch] = useState<string>('');

  const pendingOrders = bookings.filter(b => b.status === 'Pending');

  const filteredOrders = pendingOrders.filter(b => {
    const matchCat = categoryFilter === 'All' || b.category.toLowerCase().includes(categoryFilter.toLowerCase());
    const matchPri = priorityFilter === 'All' || b.priority === priorityFilter;
    const matchSearch = b.customerName.toLowerCase().includes(search.toLowerCase()) ||
                        b.serviceName.toLowerCase().includes(search.toLowerCase()) ||
                        b.jobNo.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchPri && matchSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Order Intake Queue</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-amber-100 text-amber-800">
              {pendingOrders.length} Pending
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Review and triage incoming service orders from customer mobile app before technician assignment.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateToStaffPage(104)}
            className="px-4 py-2 bg-[#0C3832] hover:bg-[#124e45] text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
          >
            <UserCheck className="w-4 h-4 text-amber-300" />
            <span>Open Assignment Board</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Order ID, Customer name, or Service..."
            className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 text-slate-800"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-semibold focus:outline-none cursor-pointer"
          >
            <option value="All">All Categories</option>
            <option value="HVAC">HVAC & AC</option>
            <option value="Plumbing">Plumbing</option>
            <option value="Electrical">Electrical</option>
            <option value="Cleaning">Deep Cleaning</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-semibold focus:outline-none cursor-pointer"
          >
            <option value="All">All Priorities</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
      </div>

      {/* Orders List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredOrders.length === 0 ? (
          <div className="col-span-full bg-white rounded-2xl p-10 text-center border border-slate-200/80">
            <Inbox className="w-10 h-10 text-slate-300 mx-auto mb-2.5" />
            <h3 className="text-sm font-bold text-slate-700">No Orders in Intake Queue</h3>
            <p className="text-xs text-slate-400 mt-1">All current incoming orders have been assigned to technicians.</p>
          </div>
        ) : (
          filteredOrders.map((order) => (
            <div key={order.id} className="bg-white rounded-2xl p-4.5 border border-slate-200/80 shadow-xs hover:border-emerald-500/50 transition-all flex flex-col justify-between">
              <div>
                {/* Header line */}
                <div className="flex items-start justify-between gap-3 mb-2.5">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                        {order.jobNo}
                      </span>
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                        order.priority === 'Critical' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                        order.priority === 'High' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {order.priority}
                      </span>
                    </div>
                    <h3 className="text-xs font-black text-slate-900 mt-1.5 leading-snug">
                      {order.serviceName}
                    </h3>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-sm font-black text-slate-900">${order.estimate}</span>
                    <div className="text-[9px] text-emerald-600 font-bold">Escrow Verified</div>
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-1 text-xs text-slate-600 mb-3 bg-slate-50/70 p-2.5 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-2 font-semibold text-slate-800">
                    <span className="truncate">{order.customerName}</span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-500 text-[11px] shrink-0">{order.customerPhone}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-slate-500">
                    <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="truncate">{order.customerAddress}</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[10px] text-slate-500 pt-0.5">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span>{order.scheduleDate}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{order.scheduleTime}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-slate-100">
                <button
                  onClick={() => {
                    window.open(`tel:${order.customerPhone.replace(/[^0-9+]/g, '')}`);
                    addToast(`Placing call to customer ${order.customerName} (${order.customerPhone})...`, 'info');
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold text-xs flex items-center gap-1 cursor-pointer"
                >
                  <Phone className="w-3 h-3 text-slate-400" />
                  <span>Call</span>
                </button>

                <button
                  onClick={() => openAssignModal(order)}
                  className="px-3 py-1.5 rounded-lg bg-[#0C3832] hover:bg-[#124e45] text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1 cursor-pointer"
                >
                  <UserCheck className="w-3.5 h-3.5 text-amber-300" />
                  <span>Assign Pro</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

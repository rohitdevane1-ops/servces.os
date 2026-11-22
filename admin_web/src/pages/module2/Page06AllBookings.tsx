import React, { useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { downloadCSV } from '../../utils/exportUtils';
import {
  Search,
  Download,
  Plus,
  MapPin,
  Clock,
  Eye,
  UserCheck,
} from 'lucide-react';

export const Page06AllBookings: React.FC = () => {
  const { bookings, navigateToPage, openAssignModal, setIsCreateJobModalOpen, updateBookingStatus, addToast, setSelectedBookingId, formatCurrency } = useAdmin();
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedBookings, setSelectedBookings] = useState<string[]>([]);

  const filteredBookings = bookings.filter(b => {
    const matchesStatus = selectedStatus === 'All' || b.status === selectedStatus;
    const matchesSearch = 
      b.jobNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.serviceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.technicianName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.customerAddress.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const toggleSelectAll = () => {
    if (selectedBookings.length === filteredBookings.length) {
      setSelectedBookings([]);
    } else {
      setSelectedBookings(filteredBookings.map(b => b.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedBookings(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      {/* Header matching Screenshot 02 Top Right */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">All Bookings</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
              {bookings.length} Total Jobs
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Manage, filter, and monitor all customer service requests across all territories</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              downloadCSV('all_bookings_master', bookings.map(b => ({
                'Job No': b.jobNo,
                'Customer': b.customerName,
                'Phone': b.customerPhone,
                'Address': b.customerAddress,
                'Service': b.serviceName,
                'Date': b.scheduleDate,
                'Time': b.scheduleTime,
                'Technician': b.technicianName,
                'Status': b.status,
                'Estimate': formatCurrency(b.estimate)
              })));
              addToast('All bookings exported to CSV spreadsheet!', 'success');
            }}
            className="px-3.5 py-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-bold text-xs rounded-xl shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>

          <button
            onClick={() => setIsCreateJobModalOpen(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            New Booking
          </button>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 gap-2 overflow-x-auto pb-1">
        <div className="flex items-center gap-1">
          {['All', 'In Progress', 'Pending', 'Scheduled', 'Completed', 'Cancelled'].map((status) => {
            const count = status === 'All' ? bookings.length : bookings.filter(b => b.status === status).length;
            const isActive = selectedStatus === status;
            return (
              <button
                key={status}
                onClick={() => setSelectedStatus(status)}
                className={`px-3.5 py-2 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
                  isActive
                    ? 'border-emerald-600 text-emerald-800'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>{status}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Search & Bulk Operations bar */}
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/50">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Job #, customer, address, service..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {selectedBookings.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">{selectedBookings.length} selected</span>
              <button
                onClick={async () => {
                  const targets = [...selectedBookings];
                  const results = await Promise.all(targets.map(id => updateBookingStatus(id, 'Completed')));
                  const okCount = results.filter(r => r.ok).length;
                  setSelectedBookings([]);
                  if (okCount > 0) {
                    addToast(`Completed ${okCount} of ${targets.length} selected job(s).`, 'success');
                  }
                }}
                className="px-2.5 py-1 bg-emerald-100 text-emerald-800 font-bold text-xs rounded-lg hover:bg-emerald-200 cursor-pointer"
              >
                Mark Completed
              </button>
              <button
                onClick={() => setSelectedBookings([])}
                className="text-xs text-slate-500 hover:text-slate-700 underline cursor-pointer"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Table matching Screenshot 02 */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4 w-10">
                  <input
                    type="checkbox"
                    checked={selectedBookings.length === filteredBookings.length && filteredBookings.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                </th>
                <th className="py-3 px-4">Job ID &amp; Service</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Technician</th>
                <th className="py-3 px-4">Date &amp; Slot</th>
                <th className="py-3 px-4">Est. &amp; Payment</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredBookings.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 px-4">
                    <input
                      type="checkbox"
                      checked={selectedBookings.includes(b.id)}
                      onChange={() => toggleSelect(b.id)}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                  </td>

                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[11px]">
                        #{b.jobNo}
                      </span>
                      <span className="font-bold text-slate-900">{b.serviceName}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{b.category}</div>
                  </td>

                  <td className="py-3.5 px-4">
                    <div className="font-bold text-slate-800">{b.customerName}</div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5 truncate max-w-[180px]">
                      <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                      {b.customerAddress}
                    </div>
                  </td>

                  <td className="py-3.5 px-4">
                    {b.technicianName === 'Unassigned' ? (
                      <button
                        onClick={() => openAssignModal(b)}
                        className="text-[11px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-0.5 rounded cursor-pointer"
                      >
                        + Assign Tech
                      </button>
                    ) : (
                      <div>
                        <div className="font-bold text-slate-800">{b.technicianName}</div>
                        <div className="text-[10px] text-slate-400">Assigned Pro</div>
                      </div>
                    )}
                  </td>

                  <td className="py-3.5 px-4">
                    <div className="font-bold text-slate-800">{b.scheduleDate}</div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {b.scheduleTime}
                    </div>
                  </td>

                  <td className="py-3.5 px-4">
                    <div className="font-extrabold text-slate-900">{formatCurrency(b.estimate)}</div>
                    <span className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-bold mt-0.5 ${
                      b.paymentStatus === 'Paid' ? 'bg-emerald-100 text-emerald-800' :
                      b.paymentStatus === 'Pending' ? 'bg-amber-100 text-amber-800' :
                      'bg-rose-100 text-rose-800'
                    }`}>
                      {b.paymentStatus}
                    </span>
                  </td>

                  <td className="py-3.5 px-4">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                      b.status === 'Completed' ? 'bg-emerald-100 text-emerald-800' :
                      b.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                      b.status === 'Scheduled' ? 'bg-purple-100 text-purple-800' :
                      b.status === 'Pending' ? 'bg-amber-100 text-amber-800' :
                      'bg-rose-100 text-rose-800'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        b.status === 'Completed' ? 'bg-emerald-500' :
                        b.status === 'In Progress' ? 'bg-blue-500 animate-pulse' :
                        b.status === 'Scheduled' ? 'bg-purple-500' :
                        b.status === 'Pending' ? 'bg-amber-500' :
                        'bg-rose-500'
                      }`}></span>
                      {b.status}
                    </span>
                  </td>

                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => {
                          setSelectedBookingId(b.id);
                          navigateToPage(9); // View Details
                        }}
                        className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {b.technicianName === 'Unassigned' && (
                        <button
                          onClick={() => openAssignModal(b)}
                          className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                          title="Assign Technician"
                        >
                          <UserCheck className="w-4 h-4" />
                        </button>
                      )}
                    </div>
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

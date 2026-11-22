import React, { useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { 
  MapPin, 
  Plus, 
} from 'lucide-react';

export const StaffScheduleCalendar: React.FC = () => {
  const { bookings, navigateToStaffPage, setIsCreateJobModalOpen } = useAdmin();

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const [selectedDay, setSelectedDay] = useState(() => {
    const todayIdx = new Date().getDay();
    return days[todayIdx === 0 ? 6 : todayIdx - 1];
  });

  const dayIndexMap: Record<string, number> = {
    'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6, 'Sunday': 0
  };

  const dayOrders = bookings.filter((order) => {
    if (order.scheduleDate.toLowerCase().includes(selectedDay.toLowerCase().substring(0, 3))) {
      return true;
    }
    const parsed = new Date(order.scheduleDate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getDay() === dayIndexMap[selectedDay];
    }
    return false;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Order Schedule & Calendar</h1>
          <p className="text-xs text-slate-500 mt-1">
            Weekly technician shift roster and scheduled customer appointment slots.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateToStaffPage(110)}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-all cursor-pointer"
          >
            Rescheduling Desk
          </button>
          <button
            onClick={() => setIsCreateJobModalOpen(true)}
            className="px-4 py-2 bg-[#0C3832] text-white font-bold text-xs rounded-xl shadow-xs hover:bg-[#124e45] transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Schedule Slot</span>
          </button>
        </div>
      </div>

      {/* Days Ribbon */}
      <div className="bg-white rounded-2xl p-2 border border-slate-200/80 shadow-xs flex items-center gap-2 overflow-x-auto thin-scrollbar">
        {days.map(day => {
          const isActive = day === selectedDay;
          return (
            <button
              key={day}
              onClick={() => setSelectedDay(day)}
              className={`flex-1 min-w-[100px] py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer text-center ${
                isActive
                  ? 'bg-[#0C3832] text-white shadow-xs'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* Calendar Slots Grid */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
        <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide mb-4 pb-2 border-b border-slate-100 flex items-center justify-between">
          <span>Scheduled Orders for {selectedDay}</span>
          <span className="text-xs text-slate-500 font-normal">Active Shifts: 6 Pros</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {dayOrders.length === 0 ? (
            <div className="col-span-full p-8 text-center bg-slate-50 rounded-2xl border border-slate-100 text-slate-400 text-xs">
              No orders scheduled for {selectedDay}. Click Schedule Slot above to book an appointment.
            </div>
          ) : (
            dayOrders.map(order => (
              <div key={order.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 hover:border-emerald-500/50 transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-mono font-bold text-slate-800">#{order.jobNo}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      {order.scheduleTime}
                    </span>
                  </div>

                  <div className="text-xs font-bold text-slate-900 mt-1">
                    {order.serviceName}
                  </div>

                  <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1 truncate">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{order.customerAddress}</span>
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs">
                  <span className="text-slate-600 font-medium">Customer: {order.customerName}</span>
                  <span className="font-bold text-emerald-700">{order.technicianName}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

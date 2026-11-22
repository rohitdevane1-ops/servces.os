import React, { useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { buildScheduledStartIso } from '../../utils/formatters';
import { Calendar, CheckCircle, MessageSquare } from 'lucide-react';

export const Page10BookingRescheduling: React.FC = () => {
  const { bookings, navigateToPage, rescheduleBooking } = useAdmin();

  const [upcomingDays] = useState(() =>
    Array.from({ length: 4 }, (_, idx) => {
      const d = new Date(Date.now() + (idx + 1) * 24 * 60 * 60 * 1000);
      return {
        isoDate: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      };
    })
  );

  const [selectedBookingId, setSelectedBookingId] = useState<string>(() => bookings[0]?.id || '');
  const [selectedDate, setSelectedDate] = useState<string>(() => upcomingDays[0].isoDate);
  const [selectedSlot, setSelectedSlot] = useState<string>('02:00 PM - 04:00 PM');
  const [reason, setReason] = useState<string>('Customer requested afternoon slot due to office hours');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const selectedBooking = bookings.find((b) => b.id === selectedBookingId) || bookings[0] || null;

  const handleReschedule = async () => {
    if (!selectedBooking) return;
    setIsSaving(true);
    const iso = buildScheduledStartIso(selectedDate, selectedSlot);
    const res = await rescheduleBooking(selectedBooking.id, iso, reason);
    setIsSaving(false);
    if (res.ok) {
      navigateToPage(6);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Booking Rescheduling</h1>
          <p className="text-xs text-slate-500 mt-1">
            Adjust appointment windows in PostgreSQL (`PATCH /api/v1/bookings/:id/reschedule`)
          </p>
        </div>

        <button
          disabled={!selectedBooking || isSaving}
          onClick={() => void handleReschedule()}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
        >
          <CheckCircle className="w-3.5 h-3.5" />
          {isSaving ? 'Saving Schedule...' : 'Confirm & Update Schedule'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3">
            <h2 className="text-sm font-extrabold text-slate-900">1. Select Booking to Reschedule</h2>
            <select
              value={selectedBooking?.id || ''}
              onChange={(e) => setSelectedBookingId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              {bookings.length === 0 ? (
                <option value="">No bookings available to reschedule</option>
              ) : (
                bookings.map((b) => (
                  <option key={b.id} value={b.id}>
                    #{b.jobNo} â€” {b.customerName} ({b.serviceName}) â€¢ Currently {b.scheduleDate} at {b.scheduleTime}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
            <h2 className="text-sm font-extrabold text-slate-900">2. Choose New Date &amp; Available Slot</h2>

            <div>
              <div className="text-xs font-bold text-slate-600 mb-2">Select Target Date:</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {upcomingDays.map((d) => (
                  <button
                    key={d.isoDate}
                    type="button"
                    onClick={() => setSelectedDate(d.isoDate)}
                    className={`p-3 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                      selectedDate === d.isoDate
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Calendar className="w-4 h-4 mx-auto mb-1 opacity-80" />
                    <div>{d.label}</div>
                    <div className="text-[10px] opacity-75 font-mono">{d.isoDate}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-bold text-slate-600 mb-2">Select Time Slot:</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  '08:00 AM - 10:00 AM',
                  '10:00 AM - 12:00 PM',
                  '12:00 PM - 02:00 PM',
                  '02:00 PM - 04:00 PM',
                  '04:00 PM - 06:00 PM',
                  '06:00 PM - 08:00 PM',
                ].map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className={`p-2.5 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                      selectedSlot === slot
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div>{slot}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3">
            <h2 className="text-sm font-extrabold text-slate-900">3. Reason for Reschedule (Recorded in Audit Trail)</h2>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
              placeholder="Explain reason for schedule modification..."
            />
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">Reschedule Summary</h3>
            </div>

            <div className="p-4 bg-emerald-50/70 border border-emerald-200/60 rounded-xl text-xs space-y-2">
              <div className="font-bold text-emerald-900">
                {selectedBooking
                  ? `${selectedBooking.customerName} (Order #${selectedBooking.jobNo})`
                  : 'No Booking Selected'}
              </div>
              <p className="text-slate-700 leading-relaxed font-mono text-[11px]">
                {selectedBooking
                  ? `New ISO Window: ${buildScheduledStartIso(selectedDate, selectedSlot)} (${selectedSlot})`
                  : 'Select an active booking to preview the updated timestamp.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { apiClient } from '../../services/apiClient';
import { formatCoordinates } from '../../utils/formatters';
import {
  ArrowLeft,
  Printer,
  MapPin,
  FileText,
  RotateCcw,
  RefreshCw,
} from 'lucide-react';

export const Page09BookingDetails: React.FC = () => {
  const {
    navigateToPage,
    addToast,
    bookings,
    selectedBookingId,
    setSelectedBookingId,
    technicians,
    formatCurrency,
    formatCurrencyCents,
  } = useAdmin();

  const summaryBooking = bookings.find((b) => b.id === selectedBookingId) || bookings[0] || null;
  const [dossier, setDossier] = useState<{
    booking: any;
    timeline: any[];
    proofs: any | null;
    invoiceItems: any[];
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    if (!summaryBooking?.id) {
      queueMicrotask(() => {
        if (active) setDossier(null);
      });
      return () => {
        active = false;
      };
    }
    apiClient
      .getBooking(summaryBooking.id)
      .then((res) => {
        if (!active) return;
        if (res.success && res.data) {
          setDossier(res.data);
        } else {
          setDossier(null);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setDossier(null);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [summaryBooking?.id]);

  if (!summaryBooking) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigateToPage(6)}
            className="p-2 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-slate-600 shadow-2xs transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Booking Dossier</h1>
            <p className="text-xs text-slate-500 mt-1">
              Full service dossier, verification check-ins, itemized invoice, and GPS coordinates
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-12 border border-slate-200/80 shadow-xs text-center flex flex-col items-center justify-center max-w-xl mx-auto my-12">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-4">
            <FileText className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">No Booking Selected</h2>
          <p className="text-xs text-slate-500 mt-2 max-w-sm">
            Select an order from All Bookings to inspect its authoritative server dossier.
          </p>
        </div>
      </div>
    );
  }

  const serverBooking = dossier?.booking;
  const timeline = Array.isArray(dossier?.timeline) ? dossier!.timeline : [];
  const invoiceItems = Array.isArray(dossier?.invoiceItems) ? dossier!.invoiceItems : [];
  const safetyPinDisplay = serverBooking?.customer_safety_pin || summaryBooking.safetyPin || 'Protected (Admin/Customer Only)';
  const assignedTech = technicians.find(
    (t) => t.id === summaryBooking.technicianId || t.name === summaryBooking.technicianName
  );
  const lat = Number(serverBooking?.latitude ?? summaryBooking.lat);
  const lng = Number(serverBooking?.longitude ?? summaryBooking.lng);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigateToPage(6)}
            className="p-2 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-slate-600 shadow-2xs transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Booking #{summaryBooking.jobNo}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                {summaryBooking.status}
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-800">
                {summaryBooking.priority} Priority
              </span>
              {loading && <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Authoritative service dossier, timeline audit events, itemized invoice, and spatial coordinates
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              window.print();
              addToast(`Work Order #${summaryBooking.jobNo} prepared for printing.`, 'info');
            }}
            className="px-3.5 py-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-bold text-xs rounded-xl shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Work Order
          </button>

          <button
            onClick={() => {
              setSelectedBookingId(summaryBooking.id);
              navigateToPage(12);
            }}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reassign Pro
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Service Summary Card */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
            <h2 className="text-base font-extrabold text-slate-900">Service Specifications</h2>
            <div className="text-sm font-bold text-slate-800">{summaryBooking.serviceName}</div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {serverBooking?.service_desc ||
                summaryBooking.notes ||
                'Certified field service work order managed under platform escrow and PostGIS arrival verification.'}
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="text-[10px] uppercase font-bold text-slate-400">Category</div>
                <div className="text-xs font-bold text-slate-800 mt-0.5">{summaryBooking.category}</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="text-[10px] uppercase font-bold text-slate-400">Schedule Date</div>
                <div className="text-xs font-bold text-slate-800 mt-0.5">{summaryBooking.scheduleDate}</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="text-[10px] uppercase font-bold text-slate-400">Scheduled Time</div>
                <div className="text-xs font-bold text-slate-800 mt-0.5">{summaryBooking.scheduleTime}</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="text-[10px] uppercase font-bold text-slate-400">Customer Safety PIN</div>
                <div className="text-xs font-mono font-bold text-emerald-700 mt-0.5">{safetyPinDisplay}</div>
              </div>
            </div>
          </div>

          {/* Authoritative Audit Timeline Tracker */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
            <h2 className="text-base font-extrabold text-slate-900">Job Progression Audit Trail</h2>
            {timeline.length === 0 ? (
              <p className="text-xs text-slate-400 py-4">
                Status transition events recorded in `booking_timeline_events` appear here.
              </p>
            ) : (
              <div className="space-y-4">
                {timeline.map((step: any) => (
                  <div key={step.id} className="flex items-start gap-3.5">
                    <div className="shrink-0 mt-0.5">
                      <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                        ✓
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold text-slate-900">{step.event_title}</div>
                        <span className="text-[11px] font-mono font-bold text-slate-400">
                          {step.created_at ? new Date(step.created_at).toLocaleString() : ''}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{step.event_details}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Itemized Billing Breakdown */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold text-slate-900">Itemized Financial Invoice</h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  summaryBooking.paymentStatus === 'Paid'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                Payment {summaryBooking.paymentStatus}
              </span>
            </div>

            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase">
                  <th className="py-2">Item Description</th>
                  <th className="py-2 text-center">Type</th>
                  <th className="py-2 text-center">Qty</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoiceItems.length > 0 ? (
                  invoiceItems.map((item: any, idx: number) => (
                    <tr key={idx}>
                      <td className="py-2.5 font-bold text-slate-800">{item.description}</td>
                      <td className="py-2.5 text-center font-mono text-[10px] text-slate-500">{item.item_type}</td>
                      <td className="py-2.5 text-center text-slate-600">{item.quantity}</td>
                      <td className="py-2.5 text-right font-bold text-slate-900">
                        {formatCurrencyCents(item.total_cents)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="py-2.5 font-bold text-slate-800">
                      {summaryBooking.serviceName || 'On-Demand Service'}
                    </td>
                    <td className="py-2.5 text-center font-mono text-[10px] text-slate-500">SERVICE</td>
                    <td className="py-2.5 text-center text-slate-600">1</td>
                    <td className="py-2.5 text-right font-bold text-slate-900">
                      {formatCurrency(summaryBooking.estimate)}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200">
                  <td colSpan={3} className="py-3 text-right font-extrabold text-slate-900 text-sm">
                    Total:
                  </td>
                  <td className="py-3 text-right font-extrabold text-emerald-700 text-base">
                    {serverBooking?.total_amount_cents != null
                      ? formatCurrencyCents(serverBooking.total_amount_cents)
                      : formatCurrency(summaryBooking.estimate)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Customer Dossier</h3>
            <div className="flex items-center gap-3 pt-1">
              <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white font-extrabold flex items-center justify-center text-base">
                {summaryBooking.customerName.charAt(0)}
              </div>
              <div>
                <div className="font-extrabold text-slate-900 text-sm">{summaryBooking.customerName}</div>
                <div className="text-xs text-slate-500">
                  {serverBooking?.customer_phone || summaryBooking.customerPhone || 'No phone on file'}
                </div>
                {serverBooking?.customer_email && (
                  <div className="text-[11px] text-slate-400">{serverBooking.customer_email}</div>
                )}
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-600 space-y-1">
              <div className="font-bold text-slate-800 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                Service Address:
              </div>
              <p className="text-slate-600 pl-4">{summaryBooking.customerAddress}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Assigned Technician</h3>
            <div className="flex items-center gap-3 pt-1">
              <div className="w-12 h-12 rounded-2xl bg-emerald-700 text-white font-extrabold flex items-center justify-center text-base shadow-xs">
                {summaryBooking.technicianName.charAt(0)}
              </div>
              <div>
                <div className="font-extrabold text-slate-900 text-sm">{summaryBooking.technicianName}</div>
                <div className="text-xs text-slate-500">
                  {serverBooking?.trade_category || assignedTech?.specialization || 'Field Specialist'}
                </div>
                {assignedTech && (
                  <div className="text-[11px] text-emerald-700 font-bold">
                    ★ {assignedTech.rating} • {assignedTech.jobsCompleted} Completed
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center text-xs">
              <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
                <div className="text-[10px] text-slate-400">Order Status</div>
                <div className="font-extrabold text-slate-800">{summaryBooking.status}</div>
              </div>
              <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
                <div className="text-[10px] text-slate-400">Technician Phone</div>
                <div className="font-extrabold text-emerald-700 truncate">
                  {serverBooking?.technician_phone || assignedTech?.phone || 'Not Assigned'}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Service Address Coordinates
            </h3>
            <div className="w-full p-4 bg-slate-900 rounded-xl text-center text-white space-y-1">
              <div className="text-xs font-mono font-bold text-emerald-400">
                {formatCoordinates(lat, lng)}
              </div>
              <div className="text-[10px] text-slate-400">
                PostGIS Arrival Geofence Verified On-Site Check-In
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

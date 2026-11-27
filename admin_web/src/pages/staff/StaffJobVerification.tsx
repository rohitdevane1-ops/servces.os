import React, { useEffect, useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { apiClient } from '../../services/apiClient';
import {
  CheckCircle2,
  Camera,
  FileSignature,
  AlertTriangle,
  Star,
  UserCheck,
  RefreshCw,
} from 'lucide-react';

export const StaffJobVerification: React.FC = () => {
  const { bookings, addToast } = useAdmin();
  const completedJobs = bookings.filter((b) => b.status === 'Completed');
  const [selectedId, setSelectedId] = useState<string>(completedJobs[0]?.id || '');
  const [dossier, setDossier] = useState<{
    booking: any;
    timeline: any[];
    proofs: any | null;
    invoiceItems: any[];
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [flagging, setFlagging] = useState<boolean>(false);

  const selectedOrder = completedJobs.find((b) => b.id === selectedId) || completedJobs[0] || null;

  useEffect(() => {
    let active = true;
    if (!selectedOrder?.id) {
      queueMicrotask(() => {
        if (active) setDossier(null);
      });
      return () => {
        active = false;
      };
    }
    apiClient
      .getBooking(selectedOrder.id)
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
  }, [selectedOrder?.id]);

  const handleReportQualityIssue = async () => {
    if (!selectedOrder) return;
    setFlagging(true);
    const res = await apiClient.createTicket({
      subject: `Quality Audit Flag: Order #${selectedOrder.jobNo}`,
      category: 'Quality Audit',
      priority: 'HIGH',
      bookingId: selectedOrder.id,
      initialMessage: `Staff quality audit flagged work order #${selectedOrder.jobNo} (${selectedOrder.serviceName}) assigned to ${selectedOrder.technicianName} for photo/signature inspection.`,
    });
    setFlagging(false);
    if (res.success) {
      addToast(`Quality review ticket opened for Order #${selectedOrder.jobNo}.`, 'warning');
    } else {
      addToast(res.error?.message || 'Unable to open quality review ticket.', 'error');
    }
  };

  const beforePhotos: string[] = Array.isArray(dossier?.proofs?.before_photos_urls)
    ? dossier!.proofs.before_photos_urls
    : [];
  const afterPhotos: string[] = Array.isArray(dossier?.proofs?.after_photos_urls)
    ? dossier!.proofs.after_photos_urls
    : [];
  const signatureUrl: string | null = dossier?.proofs?.customer_signature_url || null;
  const summaryNotes: string =
    dossier?.proofs?.work_summary_notes ||
    selectedOrder?.notes ||
    'No technician completion summary submitted yet.';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          Job Completion &amp; Proof Quality Review
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Inspect technician before/after photo proofs and customer sign-off retrieved from `work_order_proofs`. Escrow settlement and technician payouts are enforced by the backend ledger and Admin Finance portal.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 1 Col: Completed Orders List */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-2.5">
          <h2 className="text-xs font-black text-slate-900 uppercase tracking-wide pb-2 border-b border-slate-100">
            Completed Orders ({completedJobs.length})
          </h2>

          {completedJobs.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">No completed jobs to inspect.</div>
          ) : (
            completedJobs.map((job) => {
              const isSelected = selectedOrder?.id === job.id;
              return (
                <div
                  key={job.id}
                  onClick={() => setSelectedId(job.id)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-emerald-600 bg-emerald-50/40 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-mono font-bold text-slate-800">{job.jobNo}</span>
                    <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                      {job.paymentStatus}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-slate-900">{job.serviceName}</div>
                  <div className="text-[11px] text-slate-500 mt-1">Tech: {job.technicianName}</div>
                </div>
              );
            })
          )}
        </div>

        {/* Right 2 Cols: Proof Inspection */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          {selectedOrder ? (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                    Read-Only Proof Audit • {selectedOrder.jobNo}
                  </span>
                  <h2 className="text-lg font-black text-slate-900 mt-1">{selectedOrder.serviceName}</h2>
                  <p className="text-xs text-slate-500">
                    Technician: <strong className="text-slate-800">{selectedOrder.technicianName}</strong> • Customer:{' '}
                    <strong className="text-slate-800">{selectedOrder.customerName}</strong>
                  </p>
                </div>

                {loading && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                    <span>Loading proofs...</span>
                  </div>
                )}
              </div>

              {/* Photo Proof Comparison */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-slate-400" />
                      Before Work Photos ({beforePhotos.length})
                    </span>
                  </div>
                  {beforePhotos.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {beforePhotos.map((url, idx) => (
                        <img
                          key={idx}
                          src={url}
                          alt={`Before proof ${idx + 1}`}
                          className="h-28 w-full object-cover rounded-xl border border-slate-200"
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="h-32 rounded-xl bg-slate-200/70 flex flex-col items-center justify-center text-slate-500 text-xs border border-dashed border-slate-300">
                      <Camera className="w-5 h-5 text-slate-400 mb-1" />
                      <span>No before-work photos uploaded</span>
                    </div>
                  )}
                </div>

                <div className="bg-emerald-50/40 rounded-2xl p-4 border border-emerald-200 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-emerald-900">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      After Work Photos ({afterPhotos.length})
                    </span>
                  </div>
                  {afterPhotos.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {afterPhotos.map((url, idx) => (
                        <img
                          key={idx}
                          src={url}
                          alt={`After proof ${idx + 1}`}
                          className="h-28 w-full object-cover rounded-xl border border-emerald-200"
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="h-32 rounded-xl bg-emerald-100/50 flex flex-col items-center justify-center text-emerald-800 text-xs border border-dashed border-emerald-300">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 mb-1" />
                      <span>No after-work photos uploaded</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Customer Signature & Technician Summary */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <FileSignature className="w-4 h-4 text-emerald-600" />
                    <span>Customer Sign-Off &amp; Completion Summary</span>
                  </div>
                  <p className="text-[11px] text-slate-600">{summaryNotes}</p>
                  {signatureUrl && (
                    <img
                      src={signatureUrl}
                      alt="Customer digital signature"
                      className="h-14 mt-2 bg-white border border-slate-200 rounded-lg p-1"
                    />
                  )}
                </div>

                <div className="flex items-center gap-1 text-amber-500 font-bold text-xs bg-white px-3 py-1.5 rounded-xl border border-slate-200 shrink-0">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span>Payment: {selectedOrder.paymentStatus}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <button
                  disabled={flagging}
                  onClick={() => void handleReportQualityIssue()}
                  className="px-4 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 text-rose-700 font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{flagging ? 'Opening Ticket...' : 'Flag Quality Issue (Open Support Ticket)'}</span>
                </button>

                <span className="text-[11px] text-slate-500 flex items-center gap-1.5 font-semibold">
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                  <span>Escrow capture &amp; payouts are managed by Admin Finance</span>
                </span>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-400 text-xs">
              Select a completed order from the left list to inspect work proofs.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

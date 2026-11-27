import React, { useState, useEffect } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { Modal } from '../common/Modal';
import { 
  Send, 
  AlertTriangle, 
  MapPin, 
  Clock, 
  ShieldAlert
} from 'lucide-react';

export const ManualDispatchModal: React.FC = () => {
  const { 
    isAssignModalOpen, 
    closeAssignModal, 
    selectedBookingForAssign, 
    technicians, 
    assignTechnician, 
    emergencyHandover 
  } = useAdmin();

  const [activeTab, setActiveTab] = useState<'assign' | 'handover'>('assign');
  const [selectedTechId, setSelectedTechId] = useState<string>('');
  const [handoverReason, setHandoverReason] = useState<string>('Vehicle Breakdown & Puncture on Highway');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!(isAssignModalOpen && technicians.length > 0 && !selectedTechId)) return;
    let active = true;
    queueMicrotask(() => {
      if (active) setSelectedTechId(technicians[0].id);
    });
    return () => {
      active = false;
    };
  }, [isAssignModalOpen, technicians, selectedTechId]);

  if (!isAssignModalOpen || !selectedBookingForAssign) return null;

  const handleAssign = async () => {
    if (!selectedTechId) return;
    setIsSubmitting(true);
    await assignTechnician(selectedBookingForAssign.id, selectedTechId);
    setIsSubmitting(false);
  };

  const handleHandover = async () => {
    if (!selectedTechId) return;
    setIsSubmitting(true);
    await emergencyHandover(selectedBookingForAssign.id, selectedTechId, handoverReason);
    setIsSubmitting(false);
  };

  return (
    <Modal
      isOpen={isAssignModalOpen}
      onClose={closeAssignModal}
      title={`${activeTab === 'assign' ? 'Manual Technician Assignment' : 'Emergency Job Handover'} (${selectedBookingForAssign.jobNo})`}
      maxWidth="max-w-2xl"
    >
      <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-3 gap-6 text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveTab('assign')}
          className={`pb-3 border-b-2 transition-all cursor-pointer ${
            activeTab === 'assign'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          A. Standard Assignment
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('handover')}
          className={`pb-3 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'handover'
              ? 'border-rose-600 text-rose-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          B. Emergency Transfer / Handover
        </button>
      </div>

      <div className="p-6 overflow-y-auto max-h-[70vh] thin-scrollbar space-y-6">
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase">Customer &amp; Service</span>
              <div className="text-sm font-bold text-slate-900 mt-0.5">{selectedBookingForAssign.serviceName}</div>
              <div className="text-xs text-slate-600 font-medium">
                {selectedBookingForAssign.customerName} ({selectedBookingForAssign.customerPhone})
              </div>
            </div>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
              selectedBookingForAssign.priority === 'Critical'
                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}>
              {selectedBookingForAssign.priority} Priority
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs text-slate-600 border-t border-slate-200/60">
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">{selectedBookingForAssign.customerAddress}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>Schedule: {selectedBookingForAssign.scheduleDate} at {selectedBookingForAssign.scheduleTime}</span>
            </div>
          </div>
        </div>

        {activeTab === 'handover' && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-3">
            <div className="flex items-center gap-2 text-rose-800 text-xs font-bold">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              <span>Safeguarded Emergency Reassignment Protocol</span>
            </div>
            <p className="text-[11px] text-rose-700 leading-relaxed">
              Current technician <strong>{selectedBookingForAssign.technicianName}</strong> will be relieved of this booking. An instant transfer notification will be dispatched to the newly assigned technician.
            </p>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Reason for Emergency Handover:</label>
              <select
                value={handoverReason}
                onChange={(e) => setHandoverReason(e.target.value)}
                className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-rose-600 text-slate-800"
              >
                <option>Vehicle Breakdown &amp; Puncture on Highway</option>
                <option>Technician Medical Emergency / Sudden Illness</option>
                <option>Missing Specialized Diagnostic Equipment on Site</option>
                <option>Customer Requested Reassignment</option>
                <option>Severe Weather / Access Blocked</option>
              </select>
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Ranked Best Matches Available Now
            </span>
            <span className="text-[11px] text-emerald-600 font-semibold">PostGIS Spatial Match</span>
          </div>

          <div className="space-y-2.5">
            {technicians.map((tech) => {
              const isSelected = selectedTechId === tech.id;
              return (
                <div
                  key={tech.id}
                  onClick={() => setSelectedTechId(tech.id)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                    isSelected
                      ? 'border-emerald-600 bg-emerald-50/50 shadow-xs ring-1 ring-emerald-500/20'
                      : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {tech.photo ? (
                      <img
                        src={tech.photo}
                        alt={tech.name}
                        className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-2xs"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-emerald-700 text-white font-bold text-xs flex items-center justify-center">
                        {tech.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">{tech.name}</span>
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                          {tech.matchScore}% Match
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                        <span>{tech.specialization}</span>
                        <span>•</span>
                        <span className="text-amber-500 font-semibold">★ {tech.rating}</span>
                        <span>•</span>
                        <span>{tech.currentJobsCount} active jobs</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      tech.status === 'Available'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : tech.status === 'On Job'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {tech.status}
                    </span>
                    <div className="text-[10px] text-slate-400 mt-1 font-mono">{tech.workingHours}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="p-4 px-6 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
        <button
          type="button"
          onClick={closeAssignModal}
          className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl transition-all cursor-pointer"
        >
          Cancel
        </button>

        {activeTab === 'assign' ? (
          <button
            type="button"
            disabled={isSubmitting || !selectedTechId}
            onClick={handleAssign}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>{isSubmitting ? 'Dispatching...' : 'Assign & Dispatch Technician'}</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={isSubmitting || !selectedTechId}
            onClick={handleHandover}
            className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
          >
            <AlertTriangle className="w-4 h-4" />
            <span>{isSubmitting ? 'Transferring...' : 'Execute Emergency Handover'}</span>
          </button>
        )}
      </div>
    </Modal>
  );
};

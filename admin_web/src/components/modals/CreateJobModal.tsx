import React, { useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { Modal } from '../common/Modal';
import { Plus, Clock, MapPin, User } from 'lucide-react';

export const CreateJobModal: React.FC = () => {
  const {
    isCreateJobModalOpen,
    setIsCreateJobModalOpen,
    createBooking,
    services,
    technicians,
    formatCurrency
  } = useAdmin();

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [serviceName, setServiceName] = useState(services[0]?.name || 'Standard Service Call');
  const [technicianId, setTechnicianId] = useState('');
  const [priority, setPriority] = useState<'Critical' | 'High' | 'Medium' | 'Low'>('Medium');
  const [scheduleTime, setScheduleTime] = useState('11:00 AM');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isCreateJobModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const assignedTech = technicians.find(t => t.id === technicianId);
    const selectedSvc = services.find(s => s.name === serviceName);

    await createBooking({
      customerName,
      customerPhone,
      customerAddress,
      serviceName,
      serviceId: selectedSvc?.id,
      technicianId: assignedTech?.id || '',
      technicianName: assignedTech?.name || 'Unassigned',
      priority,
      scheduleTime,
      estimate: selectedSvc?.basePrice || 120,
      paymentStatus: 'Pending',
      status: assignedTech ? 'Scheduled' : 'Pending'
    });

    setIsSubmitting(false);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
    setIsCreateJobModalOpen(false);
  };

  return (
    <Modal
      isOpen={isCreateJobModalOpen}
      onClose={() => setIsCreateJobModalOpen(false)}
      title="Create New Service Job"
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
        <div>
          <label className="font-bold text-slate-700 block mb-1">Customer Full Name *</label>
          <div className="relative">
            <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Enter customer full name..."
              className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white text-slate-800"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Customer Phone *</label>
            <input
              type="tel"
              required
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="+971 50 000 0000"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white text-slate-800"
            />
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Schedule Window *</label>
            <div className="relative">
              <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                placeholder="e.g. 11:30 AM"
                className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white text-slate-800"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="font-bold text-slate-700 block mb-1">Service Address &amp; Geofence Site *</label>
          <div className="relative">
            <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              required
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
              placeholder="Enter service street address..."
              className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white text-slate-800"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Select Service *</label>
            <select
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 text-slate-800"
            >
              {services.length === 0 ? (
                <option value="Standard Service Call">Standard Service Call (Catalogue Empty)</option>
              ) : (
                services.map(s => (
                  <option key={s.id} value={s.name}>
                    {s.name} ({formatCurrency(s.basePrice)})
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Job Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as 'Critical' | 'High' | 'Medium' | 'Low')}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 text-slate-800"
            >
              <option value="Low">Low Priority</option>
              <option value="Medium">Medium Priority</option>
              <option value="High">High Priority</option>
              <option value="Critical">Critical (Emergency)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="font-bold text-slate-700 block mb-1">Assign Pro (Optional — or leave for Auto-Dispatch)</label>
          <select
            value={technicianId}
            onChange={(e) => setTechnicianId(e.target.value)}
            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 text-slate-800"
          >
            <option value="">Leave Unassigned (Auto-Dispatch Queue)</option>
            {technicians.map(t => (
              <option key={t.id} value={t.id}>{t.name} • {t.specialization} ({t.status})</option>
            ))}
          </select>
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setIsCreateJobModalOpen(false)}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{isSubmitting ? 'Creating...' : 'Create & Dispatch Job'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};

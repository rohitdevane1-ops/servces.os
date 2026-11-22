import React, { useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { Modal } from '../common/Modal';
import { Save } from 'lucide-react';

export const CreateTechnicianDrawer: React.FC = () => {
  const { 
    currentRole,
    isCreateTechnicianModalOpen, 
    setIsCreateTechnicianModalOpen, 
    addTechnician,
    tenantConfig
  } = useAdmin();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [specialization, setSpecialization] = useState('HVAC & Refrigeration');
  const [hourlyRate, setHourlyRate] = useState<number>(85);
  const [location, setLocation] = useState('');
  const [vanPlate, setVanPlate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isCreateTechnicianModalOpen || currentRole !== 'ADMIN') return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    await addTechnician({
      name,
      email,
      phone,
      specialization,
      hourlyRate,
      vehicleLicensePlate: vanPlate,
      photo: ''
    });
    setIsSubmitting(false);
    setName('');
    setEmail('');
    setPhone('');
    setVanPlate('');
    setLocation('');
    setIsCreateTechnicianModalOpen(false);
  };

  return (
    <Modal
      isOpen={isCreateTechnicianModalOpen}
      onClose={() => setIsCreateTechnicianModalOpen(false)}
      title="Onboard Field Technician"
      maxWidth="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Technician Full Name</label>
            <input 
              type="text" 
              required 
              value={name} 
              onChange={e => setName(e.target.value)} 
              placeholder="Enter technician full name..."
              className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Primary Trade Specialization</label>
            <select 
              value={specialization} 
              onChange={e => setSpecialization(e.target.value)} 
              className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-amber-500 focus:outline-none"
            >
              <option value="HVAC & Refrigeration">HVAC &amp; Refrigeration</option>
              <option value="Master Plumber">Master Plumber</option>
              <option value="Commercial Electrical">Commercial Electrical</option>
              <option value="Smart Home & Automation">Smart Home &amp; Automation</option>
              <option value="Solar & Clean Energy">Solar &amp; Clean Energy</option>
              <option value="General Handyman & Carpentry">General Handyman</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Direct Mobile Phone</label>
            <input 
              type="text" 
              required 
              value={phone} 
              onChange={e => setPhone(e.target.value)} 
              placeholder="+971 50 000 0000"
              className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Internal Ops Email</label>
            <input 
              type="email" 
              required 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              placeholder="technician@company.com"
              className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Hourly Billing Rate ({tenantConfig.currencyCode}/hr)
            </label>
            <input 
              type="number" 
              required 
              value={hourlyRate} 
              onChange={e => setHourlyRate(Number(e.target.value))} 
              className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Assigned Fleet Vehicle Plate</label>
            <input 
              type="text" 
              value={vanPlate} 
              onChange={e => setVanPlate(e.target.value)} 
              placeholder="e.g. DXB A-41892"
              className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-amber-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Dispatch Operating Territory</label>
          <input 
            type="text" 
            required 
            value={location} 
            onChange={e => setLocation(e.target.value)} 
            placeholder="e.g. Dubai Marina & Downtown"
            className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-amber-500 focus:outline-none"
          />
        </div>

        <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setIsCreateTechnicianModalOpen(false)}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-2 text-xs font-extrabold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{isSubmitting ? 'Onboarding...' : 'Onboard Pro to Fleet'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};

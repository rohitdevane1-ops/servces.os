import React, { useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { Modal } from '../common/Modal';
import { Save } from 'lucide-react';

export const CreateCustomerDrawer: React.FC = () => {
  const { 
    isCreateCustomerModalOpen, 
    setIsCreateCustomerModalOpen, 
    addCustomer 
  } = useAdmin();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [tier, setTier] = useState<'Standard' | 'VIP' | 'Commercial'>('Standard');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isCreateCustomerModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    await addCustomer({
      name,
      email,
      phone,
      address,
      city: address.split(',')[1]?.trim() || 'Metro Area',
      photo: ''
    });
    setIsSubmitting(false);
    setName('');
    setEmail('');
    setPhone('');
    setAddress('');
    setNotes('');
    setIsCreateCustomerModalOpen(false);
  };

  return (
    <Modal
      isOpen={isCreateCustomerModalOpen}
      onClose={() => setIsCreateCustomerModalOpen(false)}
      title="New Customer Registration"
      maxWidth="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Customer Full Name</label>
            <input 
              type="text" 
              required 
              value={name} 
              onChange={e => setName(e.target.value)} 
              placeholder="e.g. Rachel Adams"
              className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Account Tier</label>
            <select 
              value={tier} 
              onChange={e => setTier(e.target.value as 'Standard' | 'VIP' | 'Commercial')} 
              className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 focus:outline-none"
            >
              <option value="Standard">Standard Residential</option>
              <option value="VIP">VIP Priority Care (Annual Plan)</option>
              <option value="Commercial">Commercial Property Portfolio</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Primary Phone Number</label>
            <input 
              type="text" 
              required 
              value={phone} 
              onChange={e => setPhone(e.target.value)} 
              placeholder="+971 50 000 0000"
              className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Billing / Dispatch Email</label>
            <input 
              type="email" 
              required 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              placeholder="customer@example.com"
              className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Property Service Address</label>
          <input 
            type="text" 
            required 
            value={address} 
            onChange={e => setAddress(e.target.value)} 
            placeholder="Street address, district, city"
            className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Dispatch Notes &amp; Access Instructions</label>
          <textarea 
            rows={2} 
            value={notes} 
            onChange={e => setNotes(e.target.value)} 
            className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setIsCreateCustomerModalOpen(false)}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-2 text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{isSubmitting ? 'Registering...' : 'Register Customer'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};

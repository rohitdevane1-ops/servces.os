import React, { useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { Modal } from '../common/Modal';
import { Save } from 'lucide-react';

export const CreateCategoryDrawer: React.FC = () => {
  const { 
    currentRole,
    isCreateCategoryModalOpen, 
    setIsCreateCategoryModalOpen, 
    addCategory 
  } = useAdmin();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('Flame');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isCreateCategoryModalOpen || currentRole !== 'ADMIN') return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    await addCategory({
      name,
      iconName: icon,
      color: 'emerald'
    });
    setIsSubmitting(false);
    setName('');
    setDescription('');
    setIsCreateCategoryModalOpen(false);
  };

  return (
    <Modal
      isOpen={isCreateCategoryModalOpen}
      onClose={() => setIsCreateCategoryModalOpen(false)}
      title="New Service Category"
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Category Name</label>
          <input 
            type="text" 
            required 
            value={name} 
            onChange={e => setName(e.target.value)} 
            placeholder="e.g. Solar Energy & Battery Storage"
            className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Icon Representation</label>
          <select 
            value={icon} 
            onChange={e => setIcon(e.target.value)} 
            className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none"
          >
            <option value="Flame">Flame (HVAC / Heating)</option>
            <option value="Droplets">Droplets (Plumbing)</option>
            <option value="Zap">Zap (Electrical / Solar)</option>
            <option value="Shield">Shield (Security &amp; Alarms)</option>
            <option value="Home">Home (Carpentry &amp; Roofing)</option>
            <option value="Sparkles">Sparkles (Deep Cleaning)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Description / Customer Scope</label>
          <textarea 
            rows={3} 
            required
            value={description} 
            onChange={e => setDescription(e.target.value)} 
            placeholder="Comprehensive installation, certified maintenance, and 24/7 emergency repair..."
            className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setIsCreateCategoryModalOpen(false)}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-2 text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{isSubmitting ? 'Creating...' : 'Create Category'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};

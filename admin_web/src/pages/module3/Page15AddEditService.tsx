import React, { useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { 
  ArrowLeft, 
  Save, 
  CheckCircle, 
  Clock
} from 'lucide-react';

export const Page15AddEditService: React.FC = () => {
  const {
    navigateToPage,
    addToast,
    categories,
    services,
    selectedServiceId,
    addService,
    updateService,
    tenantConfig
  } = useAdmin();

  const existingService = services.find(s => s.id === selectedServiceId);

  const [serviceName, setServiceName] = useState<string>(existingService?.name || '');
  const [categoryId, setCategoryId] = useState<string>(
    existingService?.categoryId ||
    categories.find(c => c.name === existingService?.category)?.id ||
    categories[0]?.id ||
    ''
  );
  const [basePrice, setBasePrice] = useState<number>(existingService?.basePrice || 100);
  const [duration, setDuration] = useState<number>(existingService?.durationMinutes || 60);
  const [description, setDescription] = useState<string>(existingService?.description || '');
  const [checklist, setChecklist] = useState<string[]>([]);
  const [newChecklistItem, setNewChecklistItem] = useState<string>('');
  const [isSurgeEligible, setIsSurgeEligible] = useState<boolean>(true);
  const [requiresPin, setRequiresPin] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const addCheckItem = () => {
    if (!newChecklistItem.trim()) return;
    setChecklist([...checklist, newChecklistItem.trim()]);
    setNewChecklistItem('');
  };

  const handleSave = async () => {
    if (!serviceName.trim()) {
      addToast('Please enter a service name', 'warning');
      return;
    }

    const selectedCategory = categories.find(c => c.id === categoryId) || categories[0];
    const resolvedCategoryName = selectedCategory?.name || 'General Services';
    const resolvedCategoryId = selectedCategory?.id;

    setIsSaving(true);
    if (existingService) {
      await updateService(existingService.id, {
        name: serviceName.trim(),
        category: resolvedCategoryName,
        categoryId: resolvedCategoryId,
        basePrice,
        durationMinutes: duration,
        description
      });
    } else {
      await addService({
        name: serviceName.trim(),
        category: resolvedCategoryName,
        categoryId: resolvedCategoryId,
        basePrice,
        durationMinutes: duration,
        description,
        status: 'Active'
      });
    }
    setIsSaving(false);
    navigateToPage(13);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigateToPage(13)}
            className="p-2 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-slate-600 shadow-2xs transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {existingService ? `Edit Service: ${existingService.name}` : 'Add New Service'}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Configure service definitions, checklists, pricing tiers, and duration
            </p>
          </div>
        </div>

        <button
          disabled={isSaving}
          onClick={handleSave}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
        >
          <Save className="w-3.5 h-3.5" />
          <span>{isSaving ? 'Saving...' : 'Save & Publish Service'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
            <h2 className="text-sm font-extrabold text-slate-900">1. Basic Service Information</h2>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Service Title</label>
                <input
                  type="text"
                  placeholder="Enter service title (e.g. Premium Home Deep Sanitization)..."
                  value={serviceName}
                  onChange={e => setServiceName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Primary Category</label>
                  <select
                    value={categoryId}
                    onChange={e => setCategoryId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:outline-none"
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Base Price ({tenantConfig.currencyCode})
                  </label>
                  <input
                    type="number"
                    value={basePrice}
                    onChange={e => setBasePrice(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Detailed Service Description</label>
                <textarea
                  rows={4}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
            <h2 className="text-sm font-extrabold text-slate-900">2. Service Inclusion Checklist (Shown to Customer)</h2>

            {checklist.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2">
                No checklist items added yet. Add items below to outline the scope of service for customers.
              </p>
            ) : (
              <div className="space-y-2">
                {checklist.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="text-slate-800 font-medium flex-1">{item}</span>
                    <button
                      onClick={() => setChecklist(checklist.filter((_, i) => i !== idx))}
                      className="text-slate-400 hover:text-rose-600 text-xs cursor-pointer"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <input
                type="text"
                placeholder="Add checklist item (e.g. Inspect wire insulation)..."
                value={newChecklistItem}
                onChange={e => setNewChecklistItem(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCheckItem()}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none"
              />
              <button
                type="button"
                onClick={addCheckItem}
                className="px-3.5 py-2.5 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-black transition-colors cursor-pointer"
              >
                + Add
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Duration &amp; Buffer</h3>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Standard Duration (Minutes)</label>
              <div className="relative">
                <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  value={duration}
                  onChange={e => setDuration(Number(e.target.value))}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Recommended appointment blocking time</p>
            </div>

            <div className="pt-3 border-t border-slate-100 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                <input 
                  type="checkbox" 
                  checked={isSurgeEligible} 
                  onChange={e => setIsSurgeEligible(e.target.checked)} 
                  className="rounded text-emerald-600" 
                />
                <span>Eligible for Dynamic Surge Multipliers</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                <input 
                  type="checkbox" 
                  checked={requiresPin} 
                  onChange={e => setRequiresPin(e.target.checked)} 
                  className="rounded text-emerald-600" 
                />
                <span>Require Customer Verification on Completion</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

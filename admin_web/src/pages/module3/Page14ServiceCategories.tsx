import React, { useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { 
  Layers, 
  Edit2, 
  Plus, 
  Wrench, 
  X,
  Check
} from 'lucide-react';
import { ServiceCategory } from '../../types';

export const Page14ServiceCategories: React.FC = () => {
  const { categories, addToast, setIsCreateCategoryModalOpen, updateCategory, pricingConfig } = useAdmin();
  const [editingCategory, setEditingCategory] = useState<ServiceCategory | null>(null);
  const [editName, setEditName] = useState('');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Service Categories</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
              {categories.length} Categories Active
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Configure service classification taxonomy, icons, commission take-rates, and display order</p>
        </div>

        <button
          onClick={() => setIsCreateCategoryModalOpen(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          Add Category
        </button>
      </div>

      {/* Grid of Categories */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {categories.map((cat, idx) => (
          <div key={cat.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 hover:shadow-md transition-shadow space-y-4">
            <div className="flex items-center justify-between">
              <div className={`w-12 h-12 rounded-2xl ${cat.color} flex items-center justify-center font-bold text-lg`}>
                <Wrench className="w-6 h-6 text-slate-800" />
              </div>
              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                Order #{idx + 1}
              </span>
            </div>

            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">{cat.name}</h3>
              <p className="text-xs text-slate-400 mt-0.5">{cat.serviceCount} active services in catalogue</p>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Commission: <strong className="text-slate-800">{pricingConfig.commissionRate}%</strong></span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    setEditingCategory(cat);
                    setEditName(cat.name);
                  }}
                  className="p-1.5 text-slate-400 hover:text-emerald-700 rounded-lg hover:bg-emerald-50 transition-colors cursor-pointer"
                  title="Edit Category"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Category Modal */}
      {editingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-md overflow-hidden flex flex-col p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-600" />
                <h3 className="font-extrabold text-slate-900 text-sm">Edit Service Category</h3>
              </div>
              <button
                onClick={() => setEditingCategory(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Category Title</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-600 font-medium"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Active Services Count</label>
                <input
                  type="text"
                  disabled
                  value={`${editingCategory.serviceCount} services currently catalogued`}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 font-medium cursor-not-allowed"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setEditingCategory(null)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!editName.trim()) {
                    addToast('Please enter category title', 'warning');
                    return;
                  }
                  updateCategory(editingCategory.id, { name: editName.trim() });
                  addToast(`Category updated to "${editName.trim()}"!`, 'success');
                  setEditingCategory(null);
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

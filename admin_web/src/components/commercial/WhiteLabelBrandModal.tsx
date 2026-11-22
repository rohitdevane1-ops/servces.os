import React, { useState, useEffect } from 'react';
import { 
  Palette, 
  DollarSign, 
  Globe, 
  Building2, 
  Check, 
  Percent, 
  FileText,
  Sparkles
} from 'lucide-react';
import { useAdmin } from '../../context/adminContextCore';
import { Modal } from '../common/Modal';

interface WhiteLabelBrandModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CURRENCIES = [
  { code: 'AED', symbol: 'AED ', name: 'UAE Dirham (AED)', flag: 'ðŸ‡¦ðŸ‡ª' },
  { code: 'USD', symbol: '$', name: 'US Dollar (USD)', flag: 'ðŸ‡ºðŸ‡¸' },
  { code: 'EUR', symbol: 'â‚¬', name: 'Euro (EUR)', flag: 'ðŸ‡ªðŸ‡º' },
  { code: 'GBP', symbol: 'Â£', name: 'British Pound (GBP)', flag: 'ðŸ‡¬ðŸ‡§' },
  { code: 'SAR', symbol: 'SAR ', name: 'Saudi Riyal (SAR)', flag: 'ðŸ‡¸ðŸ‡¦' },
  { code: 'CAD', symbol: '$', name: 'Canadian Dollar (CAD)', flag: 'ðŸ‡¨ðŸ‡¦' },
  { code: 'AUD', symbol: '$', name: 'Australian Dollar (AUD)', flag: 'ðŸ‡¦ðŸ‡º' },
  { code: 'INR', symbol: 'â‚¹', name: 'Indian Rupee (INR)', flag: 'ðŸ‡®ðŸ‡³' }
];

const ACCENT_COLORS = [
  { name: 'Royal Purple (Default)', value: '#6366F1', class: 'bg-[#6366F1]' },
  { name: 'Vivid Violet', value: '#7C3AED', class: 'bg-[#7C3AED]' },
  { name: 'Emerald Green', value: '#059669', class: 'bg-[#059669]' },
  { name: 'Electric Cyan', value: '#0284C7', class: 'bg-[#0284C7]' },
  { name: 'Sunset Amber', value: '#D97706', class: 'bg-[#D97706]' },
  { name: 'Crimson Slate', value: '#E11D48', class: 'bg-[#E11D48]' }
];

export const WhiteLabelBrandModal: React.FC<WhiteLabelBrandModalProps> = ({ isOpen, onClose }) => {
  const { 
    currentRole,
    agencyName, 
    agencyTagline, 
    pricingConfig, 
    updatePricingConfig,
    tenantConfig,
    updateSystemConfig
  } = useAdmin();

  const [name, setName] = useState(agencyName || tenantConfig.name || 'ServiceOS');
  const [tagline, setTagline] = useState(agencyTagline || 'Your Service Our Priority');
  const [selectedCurrency, setSelectedCurrency] = useState(tenantConfig.currencyCode || 'AED');
  const [selectedColor, setSelectedColor] = useState(tenantConfig.primaryColor || '#6366F1');
  const [commissionRate, setCommissionRate] = useState((pricingConfig?.commissionRate ?? 15.0).toString());
  const [minFee, setMinFee] = useState((pricingConfig?.minCalloutFee ?? 49.0).toString());
  const [surgeMultiplier, setSurgeMultiplier] = useState((pricingConfig?.surgeMultiplier ?? 1.25).toString());
  const [supportPhone, setSupportPhone] = useState(tenantConfig.supportPhone || '');
  const [taxName, setTaxName] = useState(tenantConfig.taxName || 'VAT');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setName(agencyName || tenantConfig.name || 'ServiceOS');
      setTagline(agencyTagline || 'Your Service Our Priority');
      setSelectedCurrency(tenantConfig.currencyCode || 'AED');
      setSelectedColor(tenantConfig.primaryColor || '#6366F1');
      setCommissionRate((pricingConfig?.commissionRate ?? 15.0).toString());
      setMinFee((pricingConfig?.minCalloutFee ?? 49.0).toString());
      setSurgeMultiplier((pricingConfig?.surgeMultiplier ?? 1.25).toString());
      setSupportPhone(tenantConfig.supportPhone || '');
      setTaxName(tenantConfig.taxName || 'VAT');
    });
    return () => {
      active = false;
    };
  }, [isOpen, agencyName, agencyTagline, tenantConfig, pricingConfig]);

  if (!isOpen || currentRole !== 'ADMIN') return null;

  const handleSave = async () => {
    setIsSaving(true);
    const curr = CURRENCIES.find(c => c.code === selectedCurrency) || CURRENCIES[0];
    const parsedCommission = parseFloat(commissionRate) || 15.0;
    const res = await updateSystemConfig({
      name: name.trim(),
      currencyCode: curr.code,
      currencySymbol: curr.symbol,
      primaryColor: selectedColor,
      commissionBps: Math.round(parsedCommission * 100),
      supportPhone: supportPhone.trim() || null,
      taxName: taxName.trim() || 'VAT'
    });
    await updatePricingConfig({
      commissionRate: parsedCommission,
      minCalloutFee: parseFloat(minFee) || 49.0,
      surgeMultiplier: parseFloat(surgeMultiplier) || 1.25
    });
    setIsSaving(false);
    if (res.ok) {
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="White-Label & Multi-Currency Engine"
      maxWidth="max-w-2xl"
    >
      <div className="p-6 space-y-5 bg-slate-900 text-white">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
          <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl text-indigo-400">
            <Palette className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">Platform Branding &amp; Take-Rate Configuration</span>
              <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full">
                Database Persisted
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Changes persist directly to PostgreSQL tenant configuration across all apps.
            </p>
          </div>
        </div>

        {/* Section 1: Brand Identity */}
        <div className="space-y-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5" /> Company &amp; Software Identity
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">Company / Platform Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. ServiceOS Dubai"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">Brand Tagline</label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="e.g. Your Service Our Priority"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Accent Color */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-300 block">Brand Accent Color</label>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {ACCENT_COLORS.map(c => (
              <button
                key={c.value}
                type="button"
                onClick={() => setSelectedColor(c.value)}
                className={`p-2 rounded-xl border flex flex-col items-center gap-1.5 text-[10px] font-bold cursor-pointer transition-all ${
                  selectedColor === c.value
                    ? 'border-indigo-500 bg-indigo-500/10 text-white'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className={`w-5 h-5 rounded-full ${c.class} shadow-xs`}></div>
                <span className="truncate max-w-[70px]">{c.name.split(' ')[0]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Section 3: Currency & Commission */}
        <div className="space-y-3 pt-2 border-t border-slate-800">
          <h3 className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5" /> International Currency &amp; Take-Rate
          </h3>

          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1">Active Currency Format</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CURRENCIES.map(curr => (
                <button
                  key={curr.code}
                  type="button"
                  onClick={() => setSelectedCurrency(curr.code)}
                  className={`p-2 rounded-xl border flex items-center justify-between text-xs font-bold cursor-pointer transition-all ${
                    selectedCurrency === curr.code
                      ? 'border-emerald-500 bg-emerald-500/10 text-white'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <span>{curr.flag} {curr.code}</span>
                  <span className="text-emerald-400 text-[11px]">{curr.symbol}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">Platform Take-Rate (%)</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  value={commissionRate}
                  onChange={(e) => setCommissionRate(e.target.value)}
                  className="w-full pl-3 pr-8 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                />
                <Percent className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">Min Callout Fee</label>
              <div className="relative">
                <input
                  type="number"
                  value={minFee}
                  onChange={(e) => setMinFee(e.target.value)}
                  className="w-full pl-3 pr-8 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                />
                <DollarSign className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">Emergency Surge</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.05"
                  value={surgeMultiplier}
                  onChange={(e) => setSurgeMultiplier(e.target.value)}
                  className="w-full pl-3 pr-8 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                />
                <span className="text-xs text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 font-bold">x</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: Compliance & Support */}
        <div className="space-y-3 pt-2 border-t border-slate-800">
          <h3 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" /> Support &amp; Tax Jurisdiction
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">24/7 Operations Hotline</label>
              <input
                type="text"
                value={supportPhone}
                placeholder="e.g. +971 4 000 0000"
                onChange={(e) => setSupportPhone(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">Indirect Tax Label (VAT / GST)</label>
              <input
                type="text"
                value={taxName}
                placeholder="e.g. VAT"
                onChange={(e) => setTaxName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span>Persists to database across Web &amp; Mobile</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold text-xs shadow-md flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : 'Apply White-Label Settings'}</span>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

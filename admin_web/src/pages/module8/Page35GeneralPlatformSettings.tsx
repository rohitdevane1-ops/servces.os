import React, { useEffect, useRef, useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { apiClient } from '../../services/apiClient';
import {
  Save,
  Globe,
  Clock,
  Shield,
  Palette,
  User,
  Lock,
  Upload,
  ShieldCheck,
  MapPin,
} from 'lucide-react';

export const Page35GeneralPlatformSettings: React.FC = () => {
  const {
    tenantConfig,
    updateSystemConfig,
    addToast,
    userProfile,
    openProfileModal,
    currentRole,
    isDemoMode,
  } = useAdmin();

  const [name, setName] = useState(tenantConfig.name);
  const [primaryColor, setPrimaryColor] = useState(tenantConfig.primaryColor || '#6366F1');
  const [currencyCode, setCurrencyCode] = useState(tenantConfig.currencyCode || 'AED');
  const [currencySymbol, setCurrencySymbol] = useState(tenantConfig.currencySymbol || 'AED ');
  const [timezone, setTimezone] = useState(tenantConfig.timezone || 'Asia/Dubai');
  const [commissionPercent, setCommissionPercent] = useState(
    ((tenantConfig.commissionBps ?? 1500) / 100).toString()
  );
  const [taxPercent, setTaxPercent] = useState(((tenantConfig.taxRateBps ?? 500) / 100).toString());
  const [taxName, setTaxName] = useState(tenantConfig.taxName || 'VAT');
  const [countryCode, setCountryCode] = useState(tenantConfig.countryCode || 'AE');
  const [distanceUnit, setDistanceUnit] = useState<'km' | 'mi'>(tenantConfig.distanceUnit || 'km');
  const [supportPhone, setSupportPhone] = useState(tenantConfig.supportPhone || '');
  const [supportWhatsapp, setSupportWhatsapp] = useState(tenantConfig.supportWhatsapp || '');
  const [emergencyPhone, setEmergencyPhone] = useState(tenantConfig.emergencyPhone || '');
  const [defaultLocale, setDefaultLocale] = useState(tenantConfig.defaultLocale || 'en');
  const [defaultMapLat, setDefaultMapLat] = useState(String(tenantConfig.defaultMapLat ?? 25.2048));
  const [defaultMapLng, setDefaultMapLng] = useState(String(tenantConfig.defaultMapLng ?? 55.2708));
  const [logoUrl, setLogoUrl] = useState<string | null>(tenantConfig.logoUrl || null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setName(tenantConfig.name);
      setPrimaryColor(tenantConfig.primaryColor || '#6366F1');
      setCurrencyCode(tenantConfig.currencyCode || 'AED');
      setCurrencySymbol(tenantConfig.currencySymbol || 'AED ');
      setTimezone(tenantConfig.timezone || 'Asia/Dubai');
      setCommissionPercent(((tenantConfig.commissionBps ?? 1500) / 100).toString());
      setTaxPercent(((tenantConfig.taxRateBps ?? 500) / 100).toString());
      setTaxName(tenantConfig.taxName || 'VAT');
      setCountryCode(tenantConfig.countryCode || 'AE');
      setDistanceUnit(tenantConfig.distanceUnit || 'km');
      setSupportPhone(tenantConfig.supportPhone || '');
      setSupportWhatsapp(tenantConfig.supportWhatsapp || '');
      setEmergencyPhone(tenantConfig.emergencyPhone || '');
      setDefaultLocale(tenantConfig.defaultLocale || 'en');
      setDefaultMapLat(String(tenantConfig.defaultMapLat ?? 25.2048));
      setDefaultMapLng(String(tenantConfig.defaultMapLng ?? 55.2708));
      setLogoUrl(tenantConfig.logoUrl || null);
    });
    return () => {
      active = false;
    };
  }, [tenantConfig]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingLogo(true);
    const res = await apiClient.uploadFile(file);
    setIsUploadingLogo(false);
    if (res.success && res.data?.url) {
      setLogoUrl(res.data.url);
      addToast('Brand logo uploaded with HMAC-signed URL. Click Save All Settings to persist.', 'success');
    } else {
      addToast(res.error?.message || 'Logo upload failed.', 'error');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    const commBps = Math.max(0, Math.min(5000, Math.round((parseFloat(commissionPercent) || 0) * 100)));
    const taxBps = Math.max(0, Math.min(5000, Math.round((parseFloat(taxPercent) || 0) * 100)));

    await updateSystemConfig({
      name: name.trim() || 'ServicePro OS',
      primaryColor,
      currencyCode: currencyCode.trim().toUpperCase(),
      currencySymbol: currencySymbol || currencyCode,
      timezone,
      commissionBps: commBps,
      taxRateBps: taxBps,
      taxName: taxName.trim() || 'VAT',
      countryCode: countryCode.trim().toUpperCase(),
      distanceUnit,
      supportPhone: supportPhone.trim() || null,
      supportWhatsapp: supportWhatsapp.trim() || null,
      emergencyPhone: emergencyPhone.trim() || null,
      defaultLocale,
      defaultMapLat: Number.isFinite(parseFloat(defaultMapLat)) ? parseFloat(defaultMapLat) : 25.2048,
      defaultMapLng: Number.isFinite(parseFloat(defaultMapLng)) ? parseFloat(defaultMapLng) : 55.2708,
      logoUrl,
    });
    setIsSaving(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">General Platform Settings</h1>
          <p className="text-xs text-slate-500 mt-1">
            Authoritative tenant configuration persisted in PostgreSQL (`PUT /api/v1/system/config`)
          </p>
        </div>

        <button
          disabled={isSaving || isDemoMode}
          onClick={() => void handleSave()}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
        >
          <Save className="w-3.5 h-3.5" />
          {isSaving ? 'Saving to PostgreSQL...' : 'Save All Settings'}
        </button>
      </div>

      {isDemoMode && (
        <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-2xl text-xs text-indigo-900 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>
            <strong>Interactive Sandbox Guard:</strong> Tenant system configuration updates are read-only in Demo Mode.
          </span>
        </div>
      )}

      {/* Personal Operator Profile Card */}
      <div className="bg-gradient-to-r from-[#0C3832] to-[#134E45] rounded-2xl p-6 text-white shadow-sm flex flex-col md:flex-row items-center justify-between gap-5">
        <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center font-black text-2xl text-emerald-300">
            {userProfile.name ? userProfile.name.charAt(0).toUpperCase() : 'A'}
          </div>
          <div>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h2 className="text-lg font-black">{userProfile.name || userProfile.email}</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-400 text-slate-950 uppercase">
                {currentRole}
              </span>
            </div>
            <p className="text-xs text-emerald-200/90 mt-0.5">
              {userProfile.title} • {userProfile.email}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => openProfileModal('view')}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl border border-white/20 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <User className="w-3.5 h-3.5" />
            <span>View Profile</span>
          </button>
          <button
            onClick={() => openProfileModal('edit')}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Security &amp; 2FA</span>
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Brand & Contact */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
          <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
            <Palette className="w-4 h-4 text-emerald-600" />
            1. White-Label Brand Identity &amp; Support Contacts
          </h2>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Organization / Brand Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Brand Primary Hex Color</label>
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  placeholder="#6366F1"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-mono font-bold text-slate-800 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Default UI Locale</label>
                <select
                  value={defaultLocale}
                  onChange={(e) => setDefaultLocale(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:outline-none"
                >
                  <option value="en">English (en)</option>
                  <option value="ar">Arabic RTL (ar)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Support Hotline</label>
                <input
                  type="text"
                  value={supportPhone}
                  onChange={(e) => setSupportPhone(e.target.value)}
                  placeholder="+971 4 000 0000"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">WhatsApp Support</label>
                <input
                  type="text"
                  value={supportWhatsapp}
                  onChange={(e) => setSupportWhatsapp(e.target.value)}
                  placeholder="+971 50 000 0000"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Emergency Dispatch</label>
                <input
                  type="text"
                  value={emergencyPhone}
                  onChange={(e) => setEmergencyPhone(e.target.value)}
                  placeholder="999 / +971..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <div className="text-xs text-slate-500">
                Brand Logo:{' '}
                <span className="font-mono text-slate-700">{logoUrl ? 'Uploaded' : 'Default Letter Emblem'}</span>
              </div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleLogoUpload}
              />
              <button
                type="button"
                disabled={isUploadingLogo || isDemoMode}
                onClick={() => logoInputRef.current?.click()}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{isUploadingLogo ? 'Uploading...' : 'Upload Brand Logo'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Card 2: Currency, Tax, Commission & Geospatial Hub */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
          <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
            <Globe className="w-4 h-4 text-purple-600" />
            2. International Currency, Tax &amp; Spatial Hub
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">ISO Currency Code</label>
              <select
                value={currencyCode}
                onChange={(e) => {
                  const code = e.target.value;
                  setCurrencyCode(code);
                  const symMap: Record<string, string> = {
                    AED: 'AED ',
                    USD: '$',
                    EUR: '€',
                    GBP: '£',
                    SAR: 'SAR ',
                    INR: '₹',
                  };
                  setCurrencySymbol(symMap[code] || `${code} `);
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:outline-none"
              >
                <option value="AED">AED (UAE Dirham)</option>
                <option value="USD">USD (US Dollar)</option>
                <option value="EUR">EUR (Euro)</option>
                <option value="GBP">GBP (British Pound)</option>
                <option value="SAR">SAR (Saudi Riyal)</option>
                <option value="INR">INR (Indian Rupee)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Tax Name (VAT / GST)</label>
              <input
                type="text"
                value={taxName}
                onChange={(e) => setTaxName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Statutory Tax Rate (%)</label>
              <input
                type="number"
                step="0.25"
                min="0"
                max="50"
                value={taxPercent}
                onChange={(e) => setTaxPercent(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Commission Take-Rate (%)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="50"
                value={commissionPercent}
                onChange={(e) => setCommissionPercent(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Country ISO-2</label>
              <input
                type="text"
                maxLength={2}
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-mono font-bold text-slate-800 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Distance Unit</label>
              <select
                value={distanceUnit}
                onChange={(e) => setDistanceUnit(e.target.value as 'km' | 'mi')}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:outline-none"
              >
                <option value="km">Kilometers (km)</option>
                <option value="mi">Miles (mi)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1 flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-400" /> Timezone
              </label>
              <input
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-mono text-slate-800 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-slate-400" /> Map Center Lat
              </label>
              <input
                type="number"
                step="0.0001"
                value={defaultMapLat}
                onChange={(e) => setDefaultMapLat(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-mono text-slate-800 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-slate-400" /> Map Center Lng
              </label>
              <input
                type="number"
                step="0.0001"
                value={defaultMapLng}
                onChange={(e) => setDefaultMapLng(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-mono text-slate-800 focus:outline-none"
              />
            </div>
          </div>

          <div className="p-3 bg-emerald-50 border border-emerald-200/80 rounded-xl text-[11px] text-emerald-900 flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              All settings synchronize immediately with Web, Mobile Apps, PostGIS Radar, and double-entry invoicing.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

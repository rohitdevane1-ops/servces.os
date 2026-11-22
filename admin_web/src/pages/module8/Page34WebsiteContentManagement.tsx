import React, { useEffect, useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { Save, Globe, Sparkles, Tag, ShieldCheck } from 'lucide-react';

export const Page34WebsiteContentManagement: React.FC = () => {
  const { navigateToPage, cmsConfig, updateCmsConfig, isDemoMode } = useAdmin();
  const [heroHeading, setHeroHeading] = useState(cmsConfig.heroHeading);
  const [heroSubheading, setHeroSubheading] = useState(cmsConfig.heroSubheading);
  const [searchPlaceholder, setSearchPlaceholder] = useState(
    cmsConfig.searchPlaceholder || 'Search certified home services...'
  );
  const [promoCoupon, setPromoCoupon] = useState(cmsConfig.promoCoupon);
  const [promoDiscount, setPromoDiscount] = useState(cmsConfig.promoDiscount);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setHeroHeading(cmsConfig.heroHeading);
      setHeroSubheading(cmsConfig.heroSubheading);
      setSearchPlaceholder(cmsConfig.searchPlaceholder || 'Search certified home services...');
      setPromoCoupon(cmsConfig.promoCoupon);
      setPromoDiscount(cmsConfig.promoDiscount);
    });
    return () => {
      active = false;
    };
  }, [cmsConfig]);

  const handlePublish = async () => {
    setIsSaving(true);
    await updateCmsConfig({
      heroHeading,
      heroSubheading,
      searchPlaceholder,
      promoCoupon,
      promoDiscount,
    });
    setIsSaving(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Website &amp; App Content Management (CMS)
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage customer app hero banners, search placeholders, and active promo codes in PostgreSQL (`tenant_cms_configs`)
          </p>
        </div>

        <button
          disabled={isSaving || isDemoMode}
          onClick={() => void handlePublish()}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
        >
          <Save className="w-3.5 h-3.5" />
          {isSaving ? 'Publishing to Server...' : 'Publish Live to Mobile & Web'}
        </button>
      </div>

      {isDemoMode && (
        <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-2xl text-xs text-indigo-900 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>
            <strong>Interactive Sandbox Guard:</strong> CMS configuration updates are read-only in Demo Mode.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-600" />
              1. Customer Mobile App Hero Banner
            </h2>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Hero Main Headline</label>
                <input
                  type="text"
                  value={heroHeading}
                  onChange={(e) => setHeroHeading(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Hero Supporting Subheadline</label>
                <textarea
                  rows={2}
                  value={heroSubheading}
                  onChange={(e) => setHeroSubheading(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-700 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Search Bar Placeholder Text</label>
                <input
                  type="text"
                  value={searchPlaceholder}
                  onChange={(e) => setSearchPlaceholder(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <Tag className="w-4 h-4 text-emerald-600" />
              2. Active Promo Coupon Banner
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Active Promo Code</label>
                <input
                  type="text"
                  value={promoCoupon}
                  onChange={(e) => setPromoCoupon(e.target.value.toUpperCase())}
                  placeholder="e.g. WELCOME20"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-mono font-bold text-emerald-700 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Discount Percentage (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={promoDiscount}
                  onChange={(e) => setPromoDiscount(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-900 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Live Mobile Preview */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-blue-600" /> Live Customer App Preview
            </h3>

            <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 border border-purple-100 space-y-3">
              {promoCoupon && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-600 text-white uppercase">
                  Use Code: {promoCoupon} ({promoDiscount}% OFF)
                </span>
              )}
              <div className="text-base font-extrabold text-slate-900 leading-snug">{heroHeading}</div>
              <p className="text-xs text-slate-600 leading-relaxed">{heroSubheading}</p>
              <div className="px-3 py-2 bg-white/90 rounded-xl border border-purple-200 text-[11px] text-slate-400">
                {searchPlaceholder}
              </div>
              <button
                onClick={() => navigateToPage(13)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer transition-colors"
              >
                Explore Services â†’
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

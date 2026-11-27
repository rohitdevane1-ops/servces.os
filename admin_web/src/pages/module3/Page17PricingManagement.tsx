import React, { useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { 
  Save, 
  Zap, 
} from 'lucide-react';

export const Page17PricingManagement: React.FC = () => {
  const { pricingConfig, updatePricingConfig } = useAdmin();

  const [commissionRate, setCommissionRate] = useState<number>(pricingConfig.commissionRate);
  const [surgeMultiplier, setSurgeMultiplier] = useState<number>(pricingConfig.surgeMultiplier);
  const [minCalloutFee, setMinCalloutFee] = useState<number>(pricingConfig.minCalloutFee);
  const [nightSurcharge, setNightSurcharge] = useState<number>(pricingConfig.nightSurcharge);
  const [surgeActive] = useState<boolean>(pricingConfig.surgeActive);

  const handleSave = () => {
    updatePricingConfig({
      commissionRate,
      surgeMultiplier,
      minCalloutFee,
      nightSurcharge,
      surgeActive
    });
  };

  const QUICK_RATES = [10, 12.5, 15, 18, 20, 25];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Pricing &amp; Commission Management</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 fill-current" />
              Dynamic Margin Active ({commissionRate}% Take-Rate)
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Configure dynamic platform commission rates, automatic surge multipliers, and minimum callout fees across all service territories
          </p>
        </div>

        <button
          onClick={handleSave}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
        >
          <Save className="w-3.5 h-3.5" />
          Save Pricing Rules
        </button>
      </div>

      {/* 4 Configuration Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Dynamic Platform Commission Take-Rate (Fully Configurable) */}
        <div className="bg-white rounded-2xl p-5 border border-emerald-200/90 shadow-xs space-y-3 ring-1 ring-emerald-50">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Platform Take-Rate</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">Custom Margin</span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-700">{commissionRate}%</span>
            <span className="text-xs text-slate-500 font-bold">Admin Share</span>
          </div>

          <input
            type="range"
            min="5"
            max="40"
            step="0.5"
            value={commissionRate}
            onChange={e => setCommissionRate(parseFloat(e.target.value))}
            className="w-full accent-emerald-600 cursor-pointer"
          />

          {/* Quick presets */}
          <div className="flex flex-wrap items-center gap-1 pt-1">
            {QUICK_RATES.map(rate => (
              <button
                key={rate}
                type="button"
                onClick={() => setCommissionRate(rate)}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                  commissionRate === rate
                    ? 'bg-emerald-700 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {rate}%
              </button>
            ))}
          </div>

          <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-100">
            Technician receives: <strong className="text-slate-800">{(100 - commissionRate).toFixed(1)}%</strong> of gross booking total.
          </div>
        </div>

        {/* 2. Dynamic Surge Multiplier */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Surge Multiplier</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">Peak Demand</span>
          </div>
          <div className="text-2xl font-extrabold text-slate-900">{surgeMultiplier}x</div>
          <input
            type="range"
            min="1.0"
            max="2.5"
            step="0.05"
            value={surgeMultiplier}
            onChange={e => setSurgeMultiplier(parseFloat(e.target.value))}
            className="w-full accent-amber-500 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-400 font-bold">
            <span>1.0x Base</span>
            <span>2.5x Max Peak</span>
          </div>
        </div>

        {/* 3. Min Diagnostic Visit Fee */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Minimum Visit Fee</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">Guaranteed</span>
          </div>
          <div className="text-2xl font-extrabold text-slate-900">${minCalloutFee}.00</div>
          <input
            type="range"
            min="25"
            max="120"
            step="5"
            value={minCalloutFee}
            onChange={e => setMinCalloutFee(parseFloat(e.target.value))}
            className="w-full accent-blue-600 cursor-pointer"
          />
          <div className="text-xs text-slate-500">Charged if customer cancels at door or diagnostic check is completed</div>
        </div>

        {/* 4. Night-Owl Surcharge */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Night-Owl Surcharge</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">8 PM - 6 AM</span>
          </div>
          <div className="text-2xl font-extrabold text-slate-900">+${nightSurcharge}.00</div>
          <input
            type="range"
            min="15"
            max="75"
            step="5"
            value={nightSurcharge}
            onChange={e => setNightSurcharge(parseFloat(e.target.value))}
            className="w-full accent-purple-600 cursor-pointer"
          />
          <div className="text-xs text-slate-500">100% passed through directly to on-call technician payout</div>
        </div>
      </div>

      {/* Regional Zone Surge Matrix */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900">Regional Territory Surge Density</h2>
            <p className="text-xs text-slate-500">Live demand-supply calibration across active service clusters</p>
          </div>
          <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
            Active Take-Rate: {commissionRate}%
          </span>
        </div>

        <div className="divide-y divide-slate-100 text-xs">
          {[
            { zone: 'Downtown & Central Metro Zone', demand: 'High Demand (18 requests / hr)', techCount: '4 Available', multiplier: `${(surgeMultiplier * 1.15).toFixed(2)}x`, status: 'High Surge' },
            { zone: 'North Commercial Corridor', demand: 'Moderate Demand (12 requests / hr)', techCount: '6 Available', multiplier: `${(surgeMultiplier).toFixed(2)}x`, status: 'Moderate Surge' },
            { zone: 'West Hills Residential District', demand: 'Normal Equilibrium (6 requests / hr)', techCount: '7 Available', multiplier: '1.00x', status: 'Normal Base' },
            { zone: 'East Suburbs & Industrial Zone', demand: 'Low Demand (3 requests / hr)', techCount: '5 Available', multiplier: '1.00x', status: 'Normal Base' }
          ].map((z, i) => (
            <div key={i} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50">
              <div>
                <div className="font-extrabold text-slate-900 text-sm">{z.zone}</div>
                <div className="text-slate-500 text-[11px] mt-0.5">{z.demand} • {z.techCount}</div>
              </div>

              <div className="flex items-center gap-3">
                <span className="font-mono font-extrabold text-slate-800 text-sm">{z.multiplier}</span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                  z.status.includes('High') ? 'bg-rose-100 text-rose-800' :
                  z.status.includes('Moderate') ? 'bg-amber-100 text-amber-800' :
                  'bg-emerald-100 text-emerald-800'
                }`}>
                  {z.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

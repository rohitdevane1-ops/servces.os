import React, { useState, useEffect } from 'react';
import { 
  X, 
  Smartphone, 
  Moon, 
  Sun, 
  MapPin, 
  Star, 
  ShieldCheck, 
  ArrowRight, 
  CheckCircle2, 
  Camera, 
  Radio, 
  Wrench, 
  Zap, 
  Wind, 
  Sparkles, 
  Check, 
} from 'lucide-react';
import { useAdmin } from '../../context/adminContextCore';

interface MobileSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MobileSimulatorModal: React.FC<MobileSimulatorModalProps> = ({ isOpen, onClose }) => {
  const { services, categories } = useAdmin();
  const [activePersona, setActivePersona] = useState<'customer' | 'technician'>('customer');
  const [isNightMode, setIsNightMode] = useState(false);

  // Customer App State
  const [customerStep, setCustomerStep] = useState<'home' | 'service_detail' | 'booking_confirm' | 'live_radar'>('home');
  const [selectedCategory, setSelectedCategory] = useState(categories[0]?.name || 'Plumbing');
  const firstService = services[0];
  const [selectedService] = useState({
    name: firstService ? firstService.name : 'Field Service Order',
    price: firstService ? firstService.basePrice : 0,
    rating: 5.0,
    reviews: 0,
    time: firstService ? `${firstService.durationMinutes} mins` : '45 mins'
  });
  const [pricingTier, setPricingTier] = useState<'standard' | 'premium'>('standard');

  // Technician App State
  const [techOnline, setTechOnline] = useState(true);
  const [techStep, setTechStep] = useState<'dashboard' | 'broadcast' | 'en_route' | 'on_site' | 'complete'>('dashboard');
  const [broadcastSeconds, setBroadcastSeconds] = useState(48);
  const [beforePhotoUploaded, setBeforePhotoUploaded] = useState(false);
  const [afterPhotoUploaded, setAfterPhotoUploaded] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (techStep === 'broadcast' && broadcastSeconds > 0) {
      timer = setTimeout(() => setBroadcastSeconds(prev => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [techStep, broadcastSeconds]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-5xl w-full p-6 shadow-2xl flex flex-col my-auto max-h-[95vh]">
        {/* Header Bar */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl text-indigo-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Live Flutter Mobile Simulator</h2>
                <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full">
                  Interactive Turnkey Preview
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Experience the identical iOS & Android mobile UX built with Flutter and Day/Night Vision.
              </p>
            </div>
          </div>

          {/* Controls: Persona Switcher, Day/Night Vision Toggle, Close */}
          <div className="flex items-center gap-3">
            {/* Persona Switch */}
            <div className="bg-slate-800/80 p-1 rounded-xl flex items-center border border-slate-700/60 text-xs">
              <button
                onClick={() => { setActivePersona('customer'); setCustomerStep('home'); }}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  activePersona === 'customer'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Customer App
              </button>
              <button
                onClick={() => { setActivePersona('technician'); setTechStep('dashboard'); }}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  activePersona === 'technician'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Technician App
              </button>
            </div>

            {/* Vision Mode Toggle */}
            <button
              onClick={() => setIsNightMode(!isNightMode)}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition-colors cursor-pointer"
              title="Toggle Day / Night Vision"
            >
              {isNightMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
            </button>

            {/* Close Modal */}
            <button
              onClick={onClose}
              className="p-2 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-xl border border-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body: Left Control Panel + Right Phone Frame */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-6 items-center flex-1 overflow-y-auto">
          {/* Left Explainer & Quick Action Triggers (5 Cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4">
              <h3 className="text-xs font-black uppercase tracking-wider text-indigo-400 mb-1">
                Active Architecture Persona
              </h3>
              <p className="text-sm font-bold text-white mb-2">
                {activePersona === 'customer' ? 'Customer On-Demand Mobile Experience' : 'Technician Field Execution Console'}
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                {activePersona === 'customer'
                  ? 'Demonstrates instant service discovery, upfront package pricing, automated address geofencing, escrow authorization, and live radial GPS tracking.'
                  : 'Demonstrates 60-second broadcast acceptance, GPS arrival geofence check-in, photo proof upload, extra parts add-on, and customer signature on glass.'}
              </p>
            </div>

            {/* Quick Scenario Jumps */}
            <div className="bg-slate-800/30 border border-slate-700/40 rounded-2xl p-4">
              <h4 className="text-xs font-bold text-slate-300 mb-2">Interactive Quick Actions:</h4>
              {activePersona === 'customer' ? (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    onClick={() => setCustomerStep('home')}
                    className={`p-2 rounded-xl border font-bold text-left transition-all ${
                      customerStep === 'home' ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    1. Discovery Feed
                  </button>
                  <button
                    onClick={() => setCustomerStep('service_detail')}
                    className={`p-2 rounded-xl border font-bold text-left transition-all ${
                      customerStep === 'service_detail' ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    2. Tiered Pricing
                  </button>
                  <button
                    onClick={() => setCustomerStep('booking_confirm')}
                    className={`p-2 rounded-xl border font-bold text-left transition-all ${
                      customerStep === 'booking_confirm' ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    3. Escrow Checkout
                  </button>
                  <button
                    onClick={() => setCustomerStep('live_radar')}
                    className={`p-2 rounded-xl border font-bold text-left transition-all ${
                      customerStep === 'live_radar' ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    4. Live Radar Track
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    onClick={() => setTechStep('dashboard')}
                    className={`p-2 rounded-xl border font-bold text-left transition-all ${
                      techStep === 'dashboard' ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    1. Duty Dashboard
                  </button>
                  <button
                    onClick={() => { setTechStep('broadcast'); setBroadcastSeconds(48); }}
                    className={`p-2 rounded-xl border font-bold text-left transition-all ${
                      techStep === 'broadcast' ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    2. Broadcast Alert
                  </button>
                  <button
                    onClick={() => setTechStep('en_route')}
                    className={`p-2 rounded-xl border font-bold text-left transition-all ${
                      techStep === 'en_route' ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    3. En-Route Radar
                  </button>
                  <button
                    onClick={() => setTechStep('complete')}
                    className={`p-2 rounded-xl border font-bold text-left transition-all ${
                      techStep === 'complete' ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    4. Sign-Off & Escrow
                  </button>
                </div>
              )}
            </div>

            {/* Commercial Highlights Chip */}
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="text-xs">
                <span className="font-bold text-white block">Ready to Publish on App Store & Google Play</span>
                <span className="text-slate-400">Standard Flutter codebase in <code>serviceos/lib/</code> with zero internal mock strings.</span>
              </div>
            </div>
          </div>

          {/* Right: Realistic Phone Frame (7 Cols) */}
          <div className="lg:col-span-7 flex justify-center py-2">
            <div className="relative w-[360px] h-[700px] bg-slate-950 rounded-[48px] p-3 shadow-2xl border-4 border-slate-700 ring-1 ring-slate-800/80 select-none flex flex-col overflow-hidden">
              {/* Dynamic Island Pill */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-24 h-5 bg-black rounded-full z-30 flex items-center justify-between px-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500/80"></div>
                <div className="w-2 h-2 rounded-full bg-indigo-500/40"></div>
              </div>

              {/* Phone Status Bar */}
              <div className={`pt-2 px-6 flex justify-between items-center text-[10px] font-bold z-20 ${
                isNightMode ? 'text-white' : 'text-slate-900'
              }`}>
                <span>09:41</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px]">5G</span>
                  <div className="w-4 h-2 border border-current rounded-xs p-0.5 flex items-center">
                    <div className="w-full h-full bg-current rounded-xs"></div>
                  </div>
                </div>
              </div>

              {/* Screen Body Viewport */}
              <div className={`mt-2 flex-1 rounded-[36px] overflow-y-auto flex flex-col transition-colors ${
                isNightMode ? 'bg-[#060B14] text-white' : 'bg-[#F8FAFC] text-slate-900'
              }`}>
                {/* ============================================================== */}
                {/* CUSTOMER APP FLOW */}
                {/* ============================================================== */}
                {activePersona === 'customer' && (
                  <>
                    {/* CUSTOMER 1: HOME FEED */}
                    {customerStep === 'home' && (
                      <div className="p-4 space-y-4 flex-1">
                        {/* Top Location Bar */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-4 h-4 text-indigo-600" />
                            <div>
                              <span className="text-[10px] text-slate-400 font-bold uppercase block leading-none">Service Address</span>
                              <span className="text-xs font-bold truncate max-w-[170px] block">Primary Service Location</span>
                            </div>
                          </div>
                          <div className="w-7 h-7 rounded-full bg-indigo-600/10 border border-indigo-600/20 flex items-center justify-center text-xs font-bold text-indigo-600">
                            CL
                          </div>
                        </div>

                        {/* Master Hero Banner ("Your Service Our Priority") */}
                        <div className="rounded-2xl p-4 bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 text-white relative overflow-hidden shadow-md">
                          <div className="relative z-10 space-y-1 max-w-[210px]">
                            <span className="px-2 py-0.5 bg-white/20 text-[9px] font-black rounded-full uppercase tracking-wider inline-block">
                              24/7 Verified Dispatch
                            </span>
                            <h3 className="text-sm font-black leading-tight">
                              Your Service Our Priority
                            </h3>
                            <p className="text-[10px] text-indigo-100">
                              Average technician arrival in 14 minutes with escrow protection.
                            </p>
                          </div>
                          <div className="absolute -right-3 -bottom-4 w-28 h-28 bg-white/10 rounded-full blur-xl"></div>
                        </div>

                        {/* Search Pill */}
                        <div className={`p-2.5 rounded-xl border flex items-center gap-2 text-xs ${
                          isNightMode ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-500 shadow-2xs'
                        }`}>
                          <Wrench className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Search 340+ certified home services...</span>
                        </div>

                        {/* Category Pills */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-400">Categories</span>
                            <span className="text-[10px] font-bold text-indigo-600">17 Available</span>
                          </div>
                          <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-bold">
                            {[
                              { name: 'Plumbing', icon: Wrench, color: 'text-indigo-600 bg-indigo-500/10' },
                              { name: 'Electrical', icon: Zap, color: 'text-amber-500 bg-amber-500/10' },
                              { name: 'HVAC', icon: Wind, color: 'text-blue-500 bg-blue-500/10' },
                              { name: 'Cleaning', icon: Sparkles, color: 'text-emerald-500 bg-emerald-500/10' },
                            ].map(c => (
                              <button
                                key={c.name}
                                onClick={() => setSelectedCategory(c.name)}
                                className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                                  selectedCategory === c.name
                                    ? 'border-indigo-600 bg-indigo-500/10 text-indigo-600 font-extrabold shadow-xs'
                                    : (isNightMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 text-slate-600')
                                }`}
                              >
                                <c.icon className={`w-4 h-4 ${c.color.split(' ')[0]}`} />
                                <span className="truncate">{c.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Curated Service Card */}
                        <div>
                          <span className="text-xs font-black uppercase tracking-wider text-slate-400 block mb-2">Featured On-Demand</span>
                          <div className={`p-3.5 rounded-2xl border transition-all ${
                            isNightMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
                          }`}>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="px-1.5 py-0.5 bg-indigo-500/10 text-indigo-600 text-[9px] font-bold rounded-md">
                                  Top Booked
                                </span>
                                <h4 className="text-xs font-bold mt-1">{selectedService.name}</h4>
                                <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                                  <span className="flex items-center gap-0.5 text-amber-500 font-bold">
                                    <Star className="w-3 h-3 fill-amber-500" /> {selectedService.rating}
                                  </span>
                                  <span>â€¢</span>
                                  <span>{selectedService.time}</span>
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="text-xs font-black text-indigo-600 block">${selectedService.price}</span>
                                <span className="text-[9px] text-slate-400">Upfront Price</span>
                              </div>
                            </div>

                            <button
                              onClick={() => setCustomerStep('service_detail')}
                              className="mt-3 w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <span>Configure & Book</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* CUSTOMER 2: SERVICE DETAIL & TIER CONFIGURATOR */}
                    {customerStep === 'service_detail' && (
                      <div className="p-4 space-y-4 flex-1">
                        <button
                          onClick={() => setCustomerStep('home')}
                          className="text-xs font-bold text-indigo-600 flex items-center gap-1"
                        >
                          â† Back to Catalogue
                        </button>

                        <div>
                          <h3 className="text-sm font-extrabold">{selectedService.name}</h3>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Standardized professional diagnostics, snaking, camera inspection, and clean-up.
                          </p>
                        </div>

                        {/* Tier Selector */}
                        <div className="space-y-2">
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Select Package Tier</span>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div
                              onClick={() => setPricingTier('standard')}
                              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                                pricingTier === 'standard'
                                  ? 'border-indigo-600 bg-indigo-600/10'
                                  : (isNightMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200')
                              }`}
                            >
                              <div className="flex justify-between items-center mb-1">
                                <span className="font-bold">Standard</span>
                                <span className="text-xs font-black text-indigo-600">${selectedService.price}</span>
                              </div>
                              <p className="text-[9px] text-slate-400">Standard service delivery with customer satisfaction guarantee.</p>
                            </div>

                            <div
                              onClick={() => setPricingTier('premium')}
                              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                                pricingTier === 'premium'
                                  ? 'border-indigo-600 bg-indigo-600/10'
                                  : (isNightMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200')
                              }`}
                            >
                              <div className="flex justify-between items-center mb-1">
                                <span className="font-bold">Pro Heavy-Duty</span>
                                <span className="text-xs font-black text-indigo-600">${Math.round(selectedService.price * 1.45)}</span>
                              </div>
                              <p className="text-[9px] text-slate-400">Full heavy-duty overhaul with extended warranty coverage.</p>
                            </div>
                          </div>
                        </div>

                        {/* Escrow Guarantee Pill */}
                        <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl space-y-1 text-[10px]">
                          <div className="flex items-center gap-1.5 font-bold text-indigo-400">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>100% Escrow Guarantee</span>
                          </div>
                          <p className="text-slate-400">
                            Payment is held safely in escrow. Released to technician only after you inspect and sign.
                          </p>
                        </div>

                        <button
                          onClick={() => setCustomerStep('booking_confirm')}
                          className="w-full py-2.5 bg-indigo-600 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <span>Proceed to Escrow Checkout (${selectedService.price})</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    )}

                    {/* CUSTOMER 3: ESCROW CHECKOUT */}
                    {customerStep === 'booking_confirm' && (
                      <div className="p-4 space-y-4 flex-1">
                        <button
                          onClick={() => setCustomerStep('service_detail')}
                          className="text-xs font-bold text-indigo-600 flex items-center gap-1"
                        >
                          â† Modify Package
                        </button>

                        <div className="text-center py-2">
                          <span className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto mb-2">
                            <ShieldCheck className="w-5 h-5" />
                          </span>
                          <h3 className="text-sm font-bold">Authorize Escrow Pre-Auth</h3>
                          <p className="text-[10px] text-slate-400">Funds held securely. Zero charge until work order sign-off.</p>
                        </div>

                        <div className={`p-3.5 rounded-xl border space-y-2 text-xs ${
                          isNightMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                        }`}>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Base Service Package</span>
                            <span className="font-bold">${selectedService.price.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Diagnostic Callout</span>
                            <span className="font-bold">$0.00</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Platform Escrow Fee</span>
                            <span className="font-bold">$0.00</span>
                          </div>
                          <div className="border-t border-slate-700/60 pt-2 flex justify-between font-extrabold text-indigo-500">
                            <span>Total Authorized</span>
                            <span>${selectedService.price.toFixed(2)}</span>
                          </div>
                        </div>

                        <button
                          onClick={() => setCustomerStep('live_radar')}
                          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <span>Confirm & Broadcast Live Dispatch</span>
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {/* CUSTOMER 4: LIVE GPS RADAR */}
                    {customerStep === 'live_radar' && (
                      <div className="p-4 space-y-4 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                              <Radio className="w-3 h-3 animate-pulse" /> Live Radar Active
                            </span>
                            <span className="text-xs font-black text-indigo-400">ETA 12 MINS</span>
                          </div>

                          {/* Pulsing Radar Visual */}
                          <div className="h-40 rounded-2xl bg-gradient-to-b from-indigo-950/60 to-slate-950 border border-indigo-500/30 flex items-center justify-center relative overflow-hidden">
                            <div className="absolute w-28 h-28 rounded-full border border-indigo-500/40 animate-ping"></div>
                            <div className="absolute w-20 h-20 rounded-full border border-indigo-500/60"></div>
                            <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white shadow-lg z-10 font-bold text-xs">
                              ðŸš—
                            </div>
                            <span className="absolute bottom-2 text-[9px] text-slate-400 font-bold">
                              Certified Technician is en route in Fleet Vehicle
                            </span>
                          </div>

                          {/* Safety PIN Verification */}
                          <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between">
                            <div>
                              <span className="text-[9px] font-bold text-amber-400 block uppercase">Your Safety Arrival PIN</span>
                              <span className="text-[10px] text-slate-400">Ask technician to verify this PIN</span>
                            </div>
                            <span className="text-lg font-black tracking-widest text-amber-400">4892</span>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => setCustomerStep('home')}
                            className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl border border-slate-700"
                          >
                            Return to Feed
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* ============================================================== */}
                {/* TECHNICIAN APP FLOW */}
                {/* ============================================================== */}
                {activePersona === 'technician' && (
                  <>
                    {/* TECH 1: DASHBOARD */}
                    {techStep === 'dashboard' && (
                      <div className="p-4 space-y-4 flex-1">
                        {/* Status Toggle Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-white">
                              PRO
                            </div>
                            <div>
                              <span className="text-xs font-bold block">Field Technician</span>
                              <span className="text-[9px] text-slate-400">Master Service Pro â€¢ Tier Platinum</span>
                            </div>
                          </div>
                          <button
                            onClick={() => setTechOnline(!techOnline)}
                            className={`px-2.5 py-1 text-[10px] font-black rounded-full border transition-all ${
                              techOnline ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'
                            }`}
                          >
                            {techOnline ? 'â— ONLINE' : 'â—‹ OFFLINE'}
                          </button>
                        </div>

                        {/* Today Earnings Card */}
                        <div className="p-3.5 rounded-2xl bg-gradient-to-br from-slate-900 to-indigo-950 border border-indigo-500/20 text-white">
                          <span className="text-[9px] font-black uppercase text-indigo-300">Today Payout (Released)</span>
                          <h3 className="text-xl font-black mt-1">$0.00</h3>
                          <div className="flex justify-between items-center mt-2 text-[10px] text-slate-300">
                            <span>0 Completed Jobs</span>
                            <span className="text-emerald-400 font-bold">100% CSAT â˜… 5.0</span>
                          </div>
                        </div>

                        {/* Trigger Simulated Broadcast Alert */}
                        <div className="p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-xl space-y-2">
                          <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold">
                            <Radio className="w-4 h-4 animate-pulse" />
                            <span>Simulate Incoming Work Order</span>
                          </div>
                          <p className="text-[10px] text-slate-400">
                            Test the 60-second high-priority radar broadcast prompt received by technicians on duty.
                          </p>
                          <button
                            onClick={() => { setTechStep('broadcast'); setBroadcastSeconds(48); }}
                            className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs"
                          >
                            Trigger 60s Dispatch Offer Alert âš¡
                          </button>
                        </div>
                      </div>
                    )}

                    {/* TECH 2: 60S BROADCAST ALERT */}
                    {techStep === 'broadcast' && (
                      <div className="p-4 space-y-4 flex-1 flex flex-col justify-between bg-slate-950 text-white">
                        <div className="space-y-3">
                          <div className="text-center py-2">
                            <div className="w-16 h-16 rounded-full border-4 border-indigo-500 border-t-amber-400 animate-spin mx-auto flex items-center justify-center mb-2">
                              <span className="text-sm font-black text-white">{broadcastSeconds}s</span>
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                              Priority Dispatch Match
                            </span>
                            <h3 className="text-sm font-bold mt-1">{selectedService.name}</h3>
                            <span className="text-xs text-indigo-400 font-bold">Proximity match â€¢ Live dispatch</span>
                          </div>

                          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1.5 text-xs">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Customer:</span>
                              <span className="font-bold">Verified Customer (â˜… 5.0)</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Net Tech Payout:</span>
                              <span className="font-black text-emerald-400">${(selectedService.price * 0.85).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Address:</span>
                              <span className="font-bold truncate max-w-[170px]">Primary Service Location</span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <button
                            onClick={() => setTechStep('en_route')}
                            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer"
                          >
                            Accept Dispatch Broadcast (${(selectedService.price * 0.85).toFixed(2)})
                          </button>
                          <button
                            onClick={() => setTechStep('dashboard')}
                            className="w-full py-2 bg-slate-800 text-slate-400 text-xs rounded-xl font-bold cursor-pointer"
                          >
                            Pass / Decline
                          </button>
                        </div>
                      </div>
                    )}

                    {/* TECH 3: EN-ROUTE & ARRIVAL GEOFENCE */}
                    {techStep === 'en_route' && (
                      <div className="p-4 space-y-4 flex-1 flex flex-col justify-between">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-indigo-400">Active Work Order</span>
                            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded-md font-bold text-[10px]">
                              EN ROUTE
                            </span>
                          </div>

                          <div className={`p-3 rounded-xl border text-xs space-y-1 ${
                            isNightMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                          }`}>
                            <span className="text-[10px] text-slate-400 font-bold uppercase">Destination</span>
                            <h4 className="font-bold">Primary Service Location</h4>
                            <p className="text-[10px] text-slate-400">Notes: Gate Code #4892. Ring intercom on arrival.</p>
                          </div>

                          {/* Geofence Check */}
                          <div className="p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-xl space-y-2">
                            <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold">
                              <MapPin className="w-4 h-4" />
                              <span>250m Geofence Check-In</span>
                            </div>
                            <p className="text-[10px] text-slate-400">
                              Arrival requires GPS distance verification against the booking coordinates.
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => setTechStep('complete')}
                          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Confirm Arrival & Open Work Order</span>
                        </button>
                      </div>
                    )}

                    {/* TECH 4: JOB COMPLETION & ESCROW RELEASE */}
                    {techStep === 'complete' && (
                      <div className="p-4 space-y-3 flex-1 flex flex-col justify-between overflow-y-auto">
                        <div className="space-y-3 text-xs">
                          <div className="flex items-center justify-between">
                            <h4 className="font-bold">Work Order Completion</h4>
                            <span className="text-emerald-500 font-bold">On Site</span>
                          </div>

                          {/* Step 1: Photos */}
                          <div className={`p-3 rounded-xl border space-y-2 ${
                            isNightMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                          }`}>
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Dual Photo Proof</span>
                            <div className="grid grid-cols-2 gap-2 text-[10px]">
                              <button
                                onClick={() => setBeforePhotoUploaded(!beforePhotoUploaded)}
                                className={`p-2 rounded-lg border flex items-center justify-center gap-1 font-bold ${
                                  beforePhotoUploaded ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-dashed border-slate-600 text-slate-400'
                                }`}
                              >
                                <Camera className="w-3 h-3" />
                                {beforePhotoUploaded ? 'âœ“ Before Added' : '+ Add Before'}
                              </button>
                              <button
                                onClick={() => setAfterPhotoUploaded(!afterPhotoUploaded)}
                                className={`p-2 rounded-lg border flex items-center justify-center gap-1 font-bold ${
                                  afterPhotoUploaded ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-dashed border-slate-600 text-slate-400'
                                }`}
                              >
                                <Camera className="w-3 h-3" />
                                {afterPhotoUploaded ? 'âœ“ After Added' : '+ Add After'}
                              </button>
                            </div>
                          </div>

                          {/* Step 2: Signature on Glass */}
                          <div className={`p-3 rounded-xl border space-y-2 ${
                            isNightMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                          }`}>
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Customer Sign-off on Glass</span>
                            <div
                              onClick={() => setHasSignature(!hasSignature)}
                              className="h-16 rounded-lg border-2 border-dashed border-slate-600 flex items-center justify-center cursor-pointer"
                            >
                              {hasSignature ? (
                                <span className="font-serif italic text-base text-indigo-400 font-bold">Authorized Customer âœ“</span>
                              ) : (
                                <span className="text-[10px] text-slate-500">Tap to simulate finger signature</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            setTechStep('dashboard');
                            setBeforePhotoUploaded(false);
                            setAfterPhotoUploaded(false);
                            setHasSignature(false);
                          }}
                          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Release Escrow & Complete Payout</span>
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

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
  Search,
  Home,
  Calendar,
  User,
  Wallet,
  Clock,
  Phone,
  MessageSquare,
  ChevronRight
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
  const [selectedService, setSelectedService] = useState({
    name: firstService ? firstService.name : 'Master HVAC Diagnostic & Deep Clean',
    price: firstService && firstService.basePrice > 0 ? firstService.basePrice : 249,
    rating: 4.9,
    reviews: 128,
    time: firstService ? `${firstService.durationMinutes} mins` : '60 mins',
    category: 'HVAC Cooling'
  });
  const [pricingTier, setPricingTier] = useState<'standard' | 'premium'>('standard');

  // Technician App State
  const [techOnline, setTechOnline] = useState(true);
  const [techStep, setTechStep] = useState<'dashboard' | 'broadcast' | 'en_route' | 'complete'>('dashboard');
  const [broadcastSeconds, setBroadcastSeconds] = useState(48);
  const [beforePhotoUploaded, setBeforePhotoUploaded] = useState(false);
  const [afterPhotoUploaded, setAfterPhotoUploaded] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  const curatedServices = [
    {
      name: 'Master HVAC Diagnostic & Deep Clean',
      category: 'HVAC',
      price: 249,
      rating: 4.9,
      reviews: 142,
      time: '60 mins',
      gradient: 'from-indigo-600 via-violet-600 to-purple-700',
      badge: 'Verified Pro'
    },
    {
      name: 'Emergency Leak Isolation & Pipe Repair',
      category: 'Plumbing',
      price: 189,
      rating: 4.8,
      reviews: 98,
      time: '45 mins',
      gradient: 'from-sky-600 via-blue-600 to-indigo-700',
      badge: '15 Min Arrival'
    }
  ];

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (techStep === 'broadcast' && broadcastSeconds > 0) {
      timer = setTimeout(() => setBroadcastSeconds(prev => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [techStep, broadcastSeconds]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xl flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-[#0A101D] border border-slate-800/90 rounded-3xl max-w-6xl w-full p-6 shadow-2xl flex flex-col my-auto max-h-[95vh]">
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 bg-gradient-to-tr from-indigo-600 to-violet-600 rounded-2xl text-white shadow-lg shadow-indigo-500/25">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-white tracking-tight">ServiceOS Dual-Vision Mobile Suite</h2>
                <span className="px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full">
                  Figma 1:1 Interactive Preview
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Identical iOS/Android Flutter (`serviceos/`) and Native Jetpack Compose (`serviceos_android/`) UX.
              </p>
            </div>
          </div>

          {/* Controls: Persona Switcher, Day/Night Vision Toggle, Close */}
          <div className="flex items-center gap-3">
            {/* Persona Switch */}
            <div className="bg-slate-900 p-1 rounded-2xl flex items-center border border-slate-800 text-xs">
              <button
                onClick={() => { setActivePersona('customer'); setCustomerStep('home'); }}
                className={`px-3.5 py-1.5 rounded-xl font-black transition-all cursor-pointer ${
                  activePersona === 'customer'
                    ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/25'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Customer App
              </button>
              <button
                onClick={() => { setActivePersona('technician'); setTechStep('dashboard'); }}
                className={`px-3.5 py-1.5 rounded-xl font-black transition-all cursor-pointer ${
                  activePersona === 'technician'
                    ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/25'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Technician App
              </button>
            </div>

            {/* Vision Mode Toggle */}
            <button
              onClick={() => setIsNightMode(!isNightMode)}
              className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded-xl border border-slate-700/80 transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold"
              title="Toggle Day / Night Vision"
            >
              {isNightMode ? (
                <>
                  <Sun className="w-4 h-4 text-amber-400" />
                  <span className="hidden sm:inline">Day Vision</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-indigo-400" />
                  <span className="hidden sm:inline">Night Vision</span>
                </>
              )}
            </button>

            {/* Close Modal */}
            <button
              onClick={onClose}
              className="p-2 bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-xl border border-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body: Left Control Panel + Right Phone Frame */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-6 items-center flex-1 overflow-y-auto">
          {/* Left Explainer & Quick Action Triggers (5 Cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">
                  Strictly 2 Mobile User Personas
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  {isNightMode ? 'Night Vision #060B14' : 'Day Vision #F8FAFC'}
                </span>
              </div>
              <p className="text-base font-black text-white">
                {activePersona === 'customer' ? '1. Customer On-Demand Marketplace' : '2. Field Technician Radar & Wallet'}
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                {activePersona === 'customer'
                  ? 'Features the pastel indigo hero banner ("Your Service Our Priority"), floating search pill, circular category icon badges, ★ 4.9 rating pills, and live PostGIS arrival radar.'
                  : 'Features real-time online/offline duty switch, 60-second broadcast locks with 85% net split calculation, 500m arrival geofence + 4-digit Safety PIN, and signature on glass.'}
              </p>
            </div>

            {/* Quick Scenario Jumps */}
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3">
                Click to Jump Across Live Mobile Screens:
              </h4>
              {activePersona === 'customer' ? (
                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <button
                    onClick={() => setCustomerStep('home')}
                    className={`p-3 rounded-xl border font-bold text-left transition-all cursor-pointer ${
                      customerStep === 'home'
                        ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    1. Discovery Feed
                  </button>
                  <button
                    onClick={() => setCustomerStep('service_detail')}
                    className={`p-3 rounded-xl border font-bold text-left transition-all cursor-pointer ${
                      customerStep === 'service_detail'
                        ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    2. Tiered Pricing
                  </button>
                  <button
                    onClick={() => setCustomerStep('booking_confirm')}
                    className={`p-3 rounded-xl border font-bold text-left transition-all cursor-pointer ${
                      customerStep === 'booking_confirm'
                        ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    3. Escrow Checkout
                  </button>
                  <button
                    onClick={() => setCustomerStep('live_radar')}
                    className={`p-3 rounded-xl border font-bold text-left transition-all cursor-pointer ${
                      customerStep === 'live_radar'
                        ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    4. Live Radar Track
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <button
                    onClick={() => setTechStep('dashboard')}
                    className={`p-3 rounded-xl border font-bold text-left transition-all cursor-pointer ${
                      techStep === 'dashboard'
                        ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    1. Duty Dashboard
                  </button>
                  <button
                    onClick={() => { setTechStep('broadcast'); setBroadcastSeconds(48); }}
                    className={`p-3 rounded-xl border font-bold text-left transition-all cursor-pointer ${
                      techStep === 'broadcast'
                        ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    2. 60s Broadcast
                  </button>
                  <button
                    onClick={() => setTechStep('en_route')}
                    className={`p-3 rounded-xl border font-bold text-left transition-all cursor-pointer ${
                      techStep === 'en_route'
                        ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    3. En-Route Radar
                  </button>
                  <button
                    onClick={() => setTechStep('complete')}
                    className={`p-3 rounded-xl border font-bold text-left transition-all cursor-pointer ${
                      techStep === 'complete'
                        ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    4. On-Site Signoff
                  </button>
                </div>
              )}
            </div>

            {/* Commercial Highlights Chip */}
            <div className="p-4 bg-gradient-to-r from-indigo-950/60 to-violet-950/60 border border-indigo-500/30 rounded-2xl flex items-center gap-3.5">
              <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" />
              <div className="text-xs">
                <span className="font-black text-white block">22 Screens Implemented Across Flutter &amp; Kotlin</span>
                <span className="text-slate-300">100% wired to Fastify 5 REST API with BIGINT-safe repositories.</span>
              </div>
            </div>
          </div>

          {/* Right: Realistic iPhone 16 Pro Frame (7 Cols) */}
          <div className="lg:col-span-7 flex justify-center py-2">
            <div className="relative w-[375px] h-[740px] bg-slate-950 rounded-[52px] p-3 shadow-2xl border-[5px] border-slate-800 ring-1 ring-white/10 select-none flex flex-col overflow-hidden">
              {/* Dynamic Island Pill */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-24 h-5 bg-black rounded-full z-30 flex items-center justify-between px-2.5 border border-white/5">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-indigo-950 border border-indigo-500/40"></div>
              </div>

              {/* Phone Status Bar */}
              <div className={`pt-2 px-6 flex justify-between items-center text-[10px] font-extrabold z-20 ${
                isNightMode ? 'text-white' : 'text-slate-900'
              }`}>
                <span>09:41</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-black">5G</span>
                  <div className="w-4 h-2.5 border border-current rounded-xs p-0.5 flex items-center">
                    <div className="w-full h-full bg-emerald-500 rounded-2xs"></div>
                  </div>
                </div>
              </div>

              {/* Screen Body Viewport */}
              <div className={`mt-2 flex-1 rounded-[40px] overflow-hidden flex flex-col transition-colors duration-300 ${
                isNightMode ? 'bg-[#060B14] text-white' : 'bg-[#F8FAFC] text-slate-900'
              }`}>
                {/* ============================================================== */}
                {/* CUSTOMER APP FLOW */}
                {/* ============================================================== */}
                {activePersona === 'customer' && (
                  <>
                    {/* CUSTOMER 1: HOME DISCOVERY FEED */}
                    {customerStep === 'home' && (
                      <div className="p-4 space-y-3.5 flex-1 overflow-y-auto thin-scrollbar">
                        {/* AppHeader */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600">
                              <MapPin className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider block leading-none">
                                Service Location
                              </span>
                              <span className="text-xs font-black truncate max-w-[175px] block mt-0.5">
                                Downtown Marina • Tower 4
                              </span>
                            </div>
                          </div>
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-[11px] font-black text-white shadow-sm">
                            JD
                          </div>
                        </div>

                        {/* Master Hero Banner ("Your Service Our Priority") */}
                        <div className="relative pb-4">
                          <div className="rounded-3xl p-4 pb-7 bg-gradient-to-br from-[#4F46E5] via-[#6366F1] to-[#7C3AED] text-white relative overflow-hidden shadow-lg shadow-indigo-500/25">
                            <div className="relative z-10 space-y-1.5 max-w-[205px]">
                              <span className="px-2 py-0.5 bg-white/20 backdrop-blur-md text-[9px] font-black rounded-full uppercase tracking-wider inline-flex items-center gap-1">
                                <Sparkles className="w-2.5 h-2.5 text-amber-300" />
                                24/7 Verified Pros
                              </span>
                              <h3 className="text-base font-black leading-tight tracking-tight">
                                Your Service, Our Priority
                              </h3>
                              <p className="text-[10px] text-indigo-100 leading-relaxed">
                                Certified technicians at your door with 100% escrow protection.
                              </p>
                            </div>
                            {/* Smiling Woman / Pro Avatar Graphic Badge */}
                            <div className="absolute right-3 top-3 w-16 h-16 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 flex flex-col items-center justify-center p-1 shadow-inner">
                              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-amber-300 to-pink-300 flex items-center justify-center text-slate-900 font-black text-xs">
                                ★ 4.9
                              </div>
                              <span className="text-[8px] font-extrabold text-white mt-0.5">Top Rated</span>
                            </div>
                          </div>

                          {/* Floating Overlapping White Pill Search Bar */}
                          <div className={`mx-3 -mt-5 relative z-20 p-2 pl-3.5 rounded-full border flex items-center justify-between text-xs shadow-lg ${
                            isNightMode ? 'bg-[#0C1523] border-slate-800 text-slate-300' : 'bg-white border-slate-200/90 text-slate-500'
                          }`}>
                            <div className="flex items-center gap-2 truncate">
                              <Search className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                              <span className="text-[11px] truncate">Search AC, plumbing, electrical...</span>
                            </div>
                            <div className="w-7 h-7 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                              <ArrowRight className="w-3.5 h-3.5" />
                            </div>
                          </div>
                        </div>

                        {/* Circular Category Icon Badges */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Categories</span>
                            <span className="text-[10px] font-extrabold text-indigo-500">View All →</span>
                          </div>
                          <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-bold">
                            {[
                              { name: 'Plumbing', icon: Wrench, bg: 'bg-indigo-500/15 text-indigo-600' },
                              { name: 'Electrical', icon: Zap, bg: 'bg-amber-500/15 text-amber-600' },
                              { name: 'HVAC', icon: Wind, bg: 'bg-sky-500/15 text-sky-600' },
                              { name: 'Cleaning', icon: Sparkles, bg: 'bg-emerald-500/15 text-emerald-600' },
                            ].map(c => (
                              <button
                                key={c.name}
                                onClick={() => setSelectedCategory(c.name)}
                                className={`p-2 rounded-2xl border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                                  selectedCategory === c.name
                                    ? 'border-indigo-600 bg-indigo-500/10 text-indigo-600 font-black shadow-xs'
                                    : (isNightMode ? 'bg-[#0C1523] border-slate-800 text-slate-300' : 'bg-white border-slate-200/80 text-slate-700')
                                }`}
                              >
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${c.bg}`}>
                                  <c.icon className="w-4 h-4" />
                                </div>
                                <span className="truncate text-[10px]">{c.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* TrustVerificationStrip */}
                        <div className="p-2.5 px-3 rounded-2xl bg-gradient-to-r from-[#0C3832] to-[#114b43] text-white flex items-center justify-between shadow-sm">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shrink-0">
                              <ShieldCheck className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="text-[10px] font-black">Trusted &amp; Verified Professionals</div>
                              <div className="text-[9px] text-emerald-200/90">Background checked • Safety PIN verified</div>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-emerald-300 shrink-0" />
                        </div>

                        {/* Popular Services Cards */}
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Popular Services</span>
                            <span className="text-[10px] font-extrabold text-indigo-500">See All →</span>
                          </div>

                          {curatedServices.map((svc, idx) => (
                            <div
                              key={idx}
                              onClick={() => {
                                setSelectedService(svc);
                                setCustomerStep('service_detail');
                              }}
                              className={`rounded-2xl border overflow-hidden transition-all cursor-pointer ${
                                isNightMode ? 'bg-[#0C1523] border-slate-800' : 'bg-white border-slate-200/90 shadow-sm'
                              }`}
                            >
                              {/* Landscape Photo Header with Floating Rating Pill */}
                              <div className={`h-20 bg-gradient-to-r ${svc.gradient} p-3 relative flex flex-col justify-between`}>
                                <div className="flex items-center justify-between">
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[9px] font-black uppercase tracking-wider shadow-xs">
                                    ✓ {svc.badge}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full bg-white text-slate-900 text-[10px] font-black flex items-center gap-1 shadow-xs">
                                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                    {svc.rating}
                                  </span>
                                </div>
                                <span className="text-[10px] text-white/90 font-bold">{svc.category} • {svc.time}</span>
                              </div>

                              <div className="p-3 flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <h4 className="text-xs font-black truncate">{svc.name}</h4>
                                  <div className="text-[11px] font-extrabold text-indigo-600 mt-0.5">
                                    AED {svc.price} <span className="text-[9px] text-slate-400 font-normal">• Upfront</span>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[10px] shrink-0 shadow-xs cursor-pointer"
                                >
                                  Book Now →
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* CUSTOMER 2: SERVICE DETAIL & TIER CONFIGURATOR */}
                    {customerStep === 'service_detail' && (
                      <div className="p-4 space-y-4 flex-1 overflow-y-auto">
                        <button
                          onClick={() => setCustomerStep('home')}
                          className="text-xs font-extrabold text-indigo-500 flex items-center gap-1 cursor-pointer"
                        >
                          ← Back to Discovery
                        </button>

                        <div className="rounded-3xl p-4 bg-gradient-to-br from-indigo-600 to-violet-700 text-white space-y-1.5 shadow-md">
                          <div className="flex items-center justify-between">
                            <span className="px-2 py-0.5 rounded-full bg-white/20 text-[9px] font-black uppercase">
                              Verified Package
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black">
                              ★ {selectedService.rating} ({selectedService.reviews})
                            </span>
                          </div>
                          <h3 className="text-sm font-black">{selectedService.name}</h3>
                          <p className="text-[10px] text-indigo-100">
                            Includes full multi-point diagnostic, chemical coil wash, pressure check, and 30-day warranty.
                          </p>
                        </div>

                        {/* Tier Selector */}
                        <div className="space-y-2">
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Select Service Tier</span>
                          <div className="grid grid-cols-2 gap-2.5 text-xs">
                            <div
                              onClick={() => setPricingTier('standard')}
                              className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                                pricingTier === 'standard'
                                  ? 'border-indigo-600 bg-indigo-600/10 ring-2 ring-indigo-500/20'
                                  : (isNightMode ? 'bg-[#0C1523] border-slate-800' : 'bg-white border-slate-200')
                              }`}
                            >
                              <div className="flex justify-between items-center mb-1">
                                <span className="font-black">Standard</span>
                                <span className="text-xs font-black text-indigo-600">AED {selectedService.price}</span>
                              </div>
                              <p className="text-[9px] text-slate-400">Certified technician &amp; standard 30-day labor warranty.</p>
                            </div>

                            <div
                              onClick={() => setPricingTier('premium')}
                              className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                                pricingTier === 'premium'
                                  ? 'border-indigo-600 bg-indigo-600/10 ring-2 ring-indigo-500/20'
                                  : (isNightMode ? 'bg-[#0C1523] border-slate-800' : 'bg-white border-slate-200')
                              }`}
                            >
                              <div className="flex justify-between items-center mb-1">
                                <span className="font-black">Priority Pro</span>
                                <span className="text-xs font-black text-indigo-600">AED {Math.round(selectedService.price * 1.35)}</span>
                              </div>
                              <p className="text-[9px] text-slate-400">Immediate 15-min dispatch + 90-day extended guarantee.</p>
                            </div>
                          </div>
                        </div>

                        {/* Escrow Guarantee Pill */}
                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl space-y-1 text-[10px]">
                          <div className="flex items-center gap-1.5 font-black text-emerald-500">
                            <ShieldCheck className="w-4 h-4" />
                            <span>100% Escrow Payment Protection</span>
                          </div>
                          <p className="text-slate-400 leading-relaxed">
                            Your payment is held safely in escrow and only released after you verify the 4-digit Safety PIN and sign off.
                          </p>
                        </div>

                        <button
                          onClick={() => setCustomerStep('booking_confirm')}
                          className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-black text-xs rounded-2xl shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <span>Proceed to Book (AED {pricingTier === 'standard' ? selectedService.price : Math.round(selectedService.price * 1.35)})</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {/* CUSTOMER 3: ESCROW CHECKOUT */}
                    {customerStep === 'booking_confirm' && (
                      <div className="p-4 space-y-4 flex-1 overflow-y-auto">
                        <button
                          onClick={() => setCustomerStep('service_detail')}
                          className="text-xs font-extrabold text-indigo-500 flex items-center gap-1 cursor-pointer"
                        >
                          ← Modify Package
                        </button>

                        <div className="text-center py-2">
                          <span className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500 mx-auto mb-2 shadow-xs">
                            <ShieldCheck className="w-6 h-6" />
                          </span>
                          <h3 className="text-base font-black">Escrow Pre-Authorization</h3>
                          <p className="text-[10px] text-slate-400 mt-0.5">Funds held in Account 2010 until job completion sign-off.</p>
                        </div>

                        <div className={`p-4 rounded-2xl border space-y-2.5 text-xs ${
                          isNightMode ? 'bg-[#0C1523] border-slate-800' : 'bg-white border-slate-200 shadow-xs'
                        }`}>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Service Package</span>
                            <span className="font-bold">AED {selectedService.price.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Dispatch Callout Fee</span>
                            <span className="font-bold text-emerald-500">FREE</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">UAE VAT (5% — Account 2030)</span>
                            <span className="font-bold">AED {(selectedService.price * 0.05).toFixed(2)}</span>
                          </div>
                          <div className="border-t border-slate-200/60 pt-2.5 flex justify-between font-black text-indigo-600 text-sm">
                            <span>Total Escrow Hold</span>
                            <span>AED {(selectedService.price * 1.05).toFixed(2)}</span>
                          </div>
                        </div>

                        <button
                          onClick={() => setCustomerStep('live_radar')}
                          className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs rounded-2xl shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Check className="w-4 h-4" />
                          <span>Authorize &amp; Broadcast Live Radar</span>
                        </button>
                      </div>
                    )}

                    {/* CUSTOMER 4: LIVE GPS RADAR */}
                    {customerStep === 'live_radar' && (
                      <div className="p-4 space-y-3.5 flex-1 flex flex-col justify-between overflow-y-auto">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-500 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5">
                              <Radio className="w-3 h-3 animate-pulse" /> PostGIS Radar Live
                            </span>
                            <span className="text-xs font-black text-indigo-500 font-mono">ETA 11 MINS</span>
                          </div>

                          {/* Pulsing Radar Visual */}
                          <div className="h-44 rounded-3xl bg-gradient-to-b from-[#0A1224] to-[#060B14] border border-indigo-500/30 flex items-center justify-center relative overflow-hidden shadow-inner">
                            <div className="absolute inset-0 bg-[radial-gradient(#6366F1_1px,transparent_1px)] [background-size:16px_16px] opacity-20" />
                            <div className="absolute w-32 h-32 rounded-full border border-indigo-500/40 animate-ping"></div>
                            <div className="absolute w-24 h-24 rounded-full border border-indigo-500/60"></div>
                            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-xl z-10 font-black text-xs">
                              PRO
                            </div>
                            <span className="absolute bottom-2.5 text-[10px] text-indigo-200 font-bold bg-slate-900/80 px-2.5 py-0.5 rounded-full border border-indigo-500/30">
                              Tariq Al-Mansoor • 1.4 km away
                            </span>
                          </div>

                          {/* Safety PIN Verification */}
                          <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-between">
                            <div>
                              <span className="text-[10px] font-black text-amber-500 block uppercase tracking-wider">
                                4-Digit Arrival Safety PIN
                              </span>
                              <span className="text-[10px] text-slate-400">Share with technician at your door</span>
                            </div>
                            <span className="text-xl font-mono font-black tracking-widest text-amber-500 bg-amber-500/10 px-3 py-1 rounded-xl border border-amber-500/30">
                              4892
                            </span>
                          </div>

                          {/* Direct Contact Bar */}
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <button className="py-2 px-3 rounded-xl bg-indigo-500/10 text-indigo-500 font-bold flex items-center justify-center gap-1.5 border border-indigo-500/20">
                              <Phone className="w-3.5 h-3.5" /> Call Pro
                            </button>
                            <button className="py-2 px-3 rounded-xl bg-violet-500/10 text-violet-500 font-bold flex items-center justify-center gap-1.5 border border-violet-500/20">
                              <MessageSquare className="w-3.5 h-3.5" /> In-App Chat
                            </button>
                          </div>
                        </div>

                        <button
                          onClick={() => setCustomerStep('home')}
                          className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl cursor-pointer"
                        >
                          Back to Home Feed
                        </button>
                      </div>
                    )}

                    {/* Customer Bottom Navigation Bar */}
                    <div className={`px-5 py-2.5 border-t flex items-center justify-between text-[10px] font-bold ${
                      isNightMode ? 'bg-[#0C1523] border-slate-800 text-slate-400' : 'bg-white border-slate-200/80 text-slate-400'
                    }`}>
                      <button onClick={() => setCustomerStep('home')} className={`flex flex-col items-center gap-0.5 cursor-pointer ${customerStep === 'home' ? 'text-indigo-600 font-black' : ''}`}>
                        <Home className="w-4 h-4" />
                        <span>Discover</span>
                      </button>
                      <button onClick={() => setCustomerStep('service_detail')} className={`flex flex-col items-center gap-0.5 cursor-pointer ${customerStep === 'service_detail' ? 'text-indigo-600 font-black' : ''}`}>
                        <Search className="w-4 h-4" />
                        <span>Search</span>
                      </button>
                      <button onClick={() => setCustomerStep('live_radar')} className={`flex flex-col items-center gap-0.5 cursor-pointer ${customerStep === 'live_radar' ? 'text-indigo-600 font-black' : ''}`}>
                        <Calendar className="w-4 h-4" />
                        <span>Bookings</span>
                      </button>
                      <button className="flex flex-col items-center gap-0.5 cursor-pointer">
                        <User className="w-4 h-4" />
                        <span>Profile</span>
                      </button>
                    </div>
                  </>
                )}

                {/* ============================================================== */}
                {/* TECHNICIAN APP FLOW */}
                {/* ============================================================== */}
                {activePersona === 'technician' && (
                  <>
                    {/* TECH 1: DASHBOARD */}
                    {techStep === 'dashboard' && (
                      <div className="p-4 space-y-4 flex-1 overflow-y-auto">
                        {/* Status Toggle Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-xs font-black text-white shadow-sm">
                              PRO
                            </div>
                            <div>
                              <span className="text-xs font-black block">Tariq Al-Mansoor</span>
                              <span className="text-[10px] text-emerald-500 font-bold">✓ Verified HVAC Specialist</span>
                            </div>
                          </div>
                          <button
                            onClick={() => setTechOnline(!techOnline)}
                            className={`px-3 py-1 text-[10px] font-black rounded-full border transition-all cursor-pointer flex items-center gap-1.5 ${
                              techOnline
                                ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                                : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full ${techOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                            {techOnline ? 'ON DUTY' : 'OFFLINE'}
                          </button>
                        </div>

                        {/* Today Earnings Card */}
                        <div className="p-4 rounded-3xl bg-gradient-to-br from-[#0A1224] via-[#111C38] to-[#1E1B4B] border border-indigo-500/30 text-white shadow-lg space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300">Net Ledger Earnings (85% Split)</span>
                            <Wallet className="w-4 h-4 text-indigo-400" />
                          </div>
                          <h3 className="text-2xl font-black font-mono">AED 1,420.50</h3>
                          <div className="flex justify-between items-center pt-1 text-[10px] text-slate-300 border-t border-white/10">
                            <span>6 Completed Work Orders</span>
                            <span className="text-amber-400 font-black">★ 4.98 CSAT</span>
                          </div>
                        </div>

                        {/* Trigger Simulated Broadcast Alert */}
                        <div className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl space-y-2.5">
                          <div className="flex items-center gap-2 text-indigo-500 text-xs font-black">
                            <Radio className="w-4 h-4 animate-pulse" />
                            <span>Live Spatial Dispatch Queue</span>
                          </div>
                          <p className="text-[11px] text-slate-400 leading-relaxed">
                            Simulate an incoming 60-second PostGIS proximity broadcast with guaranteed escrow lock.
                          </p>
                          <button
                            onClick={() => { setTechStep('broadcast'); setBroadcastSeconds(48); }}
                            className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-black text-xs rounded-xl shadow-md shadow-indigo-500/20 cursor-pointer"
                          >
                            Simulate 60s Broadcast Offer ⚡
                          </button>
                        </div>
                      </div>
                    )}

                    {/* TECH 2: 60S BROADCAST ALERT */}
                    {techStep === 'broadcast' && (
                      <div className="p-4 space-y-4 flex-1 flex flex-col justify-between bg-[#060B14] text-white overflow-y-auto">
                        <div className="space-y-3.5">
                          <div className="text-center py-2">
                            <div className="w-20 h-20 rounded-full border-4 border-indigo-500 border-t-amber-400 mx-auto flex flex-col items-center justify-center mb-2 shadow-lg shadow-indigo-500/20">
                              <span className="text-lg font-mono font-black text-white">{broadcastSeconds}s</span>
                              <span className="text-[8px] uppercase text-indigo-300 font-bold">Lock Timer</span>
                            </div>
                            <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-black uppercase tracking-wider">
                              Priority Proximity Match • 1.4 km
                            </span>
                            <h3 className="text-sm font-black mt-2">{selectedService.name}</h3>
                          </div>

                          <div className="p-3.5 bg-[#0C1523] border border-slate-800 rounded-2xl space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Net Tech Payout (85%):</span>
                              <span className="font-mono font-black text-emerald-400">AED {(selectedService.price * 0.85).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Escrow Status:</span>
                              <span className="font-bold text-indigo-400">✓ Pre-Authorized</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Location:</span>
                              <span className="font-bold truncate max-w-[165px]">Downtown Marina • Tower 4</span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <button
                            onClick={() => setTechStep('en_route')}
                            className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black text-xs rounded-2xl shadow-lg shadow-emerald-500/25 cursor-pointer"
                          >
                            Accept &amp; Lock Work Order →
                          </button>
                          <button
                            onClick={() => setTechStep('dashboard')}
                            className="w-full py-2 bg-slate-900 text-slate-400 text-xs rounded-xl font-bold cursor-pointer"
                          >
                            Decline Offer
                          </button>
                        </div>
                      </div>
                    )}

                    {/* TECH 3: EN-ROUTE & ARRIVAL GEOFENCE */}
                    {techStep === 'en_route' && (
                      <div className="p-4 space-y-4 flex-1 flex flex-col justify-between overflow-y-auto">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-black text-indigo-500">Order #BK-9042</span>
                            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-500 rounded-full font-black text-[10px]">
                              EN ROUTE
                            </span>
                          </div>

                          <div className={`p-3.5 rounded-2xl border text-xs space-y-1 ${
                            isNightMode ? 'bg-[#0C1523] border-slate-800' : 'bg-white border-slate-200'
                          }`}>
                            <span className="text-[10px] text-slate-400 font-black uppercase">Customer Destination</span>
                            <h4 className="font-black">Downtown Marina • Tower 4</h4>
                            <p className="text-[10px] text-slate-400">Gate Access Verified • Customer waiting on site.</p>
                          </div>

                          {/* Geofence & Safety PIN */}
                          <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl space-y-2">
                            <div className="flex items-center justify-between text-indigo-500 text-xs font-black">
                              <span className="flex items-center gap-1.5">
                                <MapPin className="w-4 h-4" /> 500m Geofence Verified
                              </span>
                              <span className="font-mono text-emerald-500">42m</span>
                            </div>
                            <p className="text-[10px] text-slate-400">
                              Customer Safety PIN <strong className="text-indigo-500 font-mono">4892</strong> matched. Ready to start billable work.
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => setTechStep('complete')}
                          className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-black text-xs rounded-2xl shadow-lg flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Verify PIN &amp; Start Execution</span>
                        </button>
                      </div>
                    )}

                    {/* TECH 4: JOB COMPLETION & ESCROW RELEASE */}
                    {techStep === 'complete' && (
                      <div className="p-4 space-y-3 flex-1 flex flex-col justify-between overflow-y-auto">
                        <div className="space-y-3 text-xs">
                          <div className="flex items-center justify-between">
                            <h4 className="font-black">On-Site Evidence &amp; Sign-Off</h4>
                            <span className="text-emerald-500 font-black text-[10px] uppercase">PIN Verified ✓</span>
                          </div>

                          {/* Step 1: Photos */}
                          <div className={`p-3.5 rounded-2xl border space-y-2 ${
                            isNightMode ? 'bg-[#0C1523] border-slate-800' : 'bg-white border-slate-200'
                          }`}>
                            <span className="text-[10px] font-black text-slate-400 uppercase">Before &amp; After Photo Proof</span>
                            <div className="grid grid-cols-2 gap-2 text-[10px]">
                              <button
                                onClick={() => setBeforePhotoUploaded(!beforePhotoUploaded)}
                                className={`p-2.5 rounded-xl border flex items-center justify-center gap-1 font-black cursor-pointer ${
                                  beforePhotoUploaded ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500' : 'border-dashed border-slate-400 text-slate-400'
                                }`}
                              >
                                <Camera className="w-3.5 h-3.5" />
                                {beforePhotoUploaded ? '✓ Before Photo' : '+ Before Photo'}
                              </button>
                              <button
                                onClick={() => setAfterPhotoUploaded(!afterPhotoUploaded)}
                                className={`p-2.5 rounded-xl border flex items-center justify-center gap-1 font-black cursor-pointer ${
                                  afterPhotoUploaded ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500' : 'border-dashed border-slate-400 text-slate-400'
                                }`}
                              >
                                <Camera className="w-3.5 h-3.5" />
                                {afterPhotoUploaded ? '✓ After Photo' : '+ After Photo'}
                              </button>
                            </div>
                          </div>

                          {/* Step 2: Signature on Glass */}
                          <div className={`p-3.5 rounded-2xl border space-y-2 ${
                            isNightMode ? 'bg-[#0C1523] border-slate-800' : 'bg-white border-slate-200'
                          }`}>
                            <span className="text-[10px] font-black text-slate-400 uppercase">Customer Signature on Glass</span>
                            <div
                              onClick={() => setHasSignature(!hasSignature)}
                              className="h-16 rounded-xl border-2 border-dashed border-indigo-500/40 bg-indigo-500/5 flex items-center justify-center cursor-pointer"
                            >
                              {hasSignature ? (
                                <span className="font-serif italic text-base text-indigo-500 font-black">Customer Signed ✓</span>
                              ) : (
                                <span className="text-[10px] text-slate-400 font-semibold">Tap to capture customer signature</span>
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
                          className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black text-xs rounded-2xl shadow-lg flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Check className="w-4 h-4" />
                          <span>Settle Ledger &amp; Release Payout</span>
                        </button>
                      </div>
                    )}

                    {/* Technician Bottom Navigation Bar */}
                    <div className={`px-5 py-2.5 border-t flex items-center justify-between text-[10px] font-bold ${
                      isNightMode ? 'bg-[#0C1523] border-slate-800 text-slate-400' : 'bg-white border-slate-200/80 text-slate-400'
                    }`}>
                      <button onClick={() => setTechStep('dashboard')} className={`flex flex-col items-center gap-0.5 cursor-pointer ${techStep === 'dashboard' ? 'text-indigo-600 font-black' : ''}`}>
                        <Home className="w-4 h-4" />
                        <span>Duty</span>
                      </button>
                      <button onClick={() => { setTechStep('broadcast'); setBroadcastSeconds(48); }} className={`flex flex-col items-center gap-0.5 cursor-pointer ${techStep === 'broadcast' ? 'text-indigo-600 font-black' : ''}`}>
                        <Radio className="w-4 h-4" />
                        <span>Radar</span>
                      </button>
                      <button onClick={() => setTechStep('complete')} className={`flex flex-col items-center gap-0.5 cursor-pointer ${techStep === 'complete' ? 'text-indigo-600 font-black' : ''}`}>
                        <Clock className="w-4 h-4" />
                        <span>Active Job</span>
                      </button>
                      <button className="flex flex-col items-center gap-0.5 cursor-pointer">
                        <Wallet className="w-4 h-4" />
                        <span>Wallet</span>
                      </button>
                    </div>
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

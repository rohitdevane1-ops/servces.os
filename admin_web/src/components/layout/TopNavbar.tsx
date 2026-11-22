import React, { useState, useRef, useEffect } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { useLocale } from '../../i18n/localeCore';
import { 
  Menu, 
  Search, 
  Bell, 
  Plus, 
  User,
  Settings,
  LogOut,
  ChevronDown,
  Lock,
  Smartphone,
  Radio,
  Palette,
  Server
} from 'lucide-react';

export const TopNavbar: React.FC = () => {
  const { 
    currentRole,
    logout,
    searchQuery, 
    setSearchQuery, 
    toggleSidebar, 
    setIsCreateJobModalOpen, 
    addToast,
    navigateToPage,
    navigateToStaffPage,
    userProfile,
    openProfileModal,
    navigateToFacebookProfile,
    lockSession,
    incidents,
    isDemoMode,
    setIsMobileSimulatorOpen,
    setIsDispatchSimulatorOpen,
    setIsWhiteLabelModalOpen
  } = useAdmin();

  const { locale, toggleLocale, t } = useLocale();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeIncidentsCount = incidents.filter(i => !i.resolved).length;
  const displayName = userProfile.name || (currentRole === 'ADMIN' ? 'Administrator' : 'Operations Staff');
  const roleTitle = userProfile.title || (currentRole === 'ADMIN' ? 'Platform Administrator' : 'Operations Coordinator');

  return (
    <header className="h-18 px-6 bg-white border-b border-slate-200/80 flex items-center justify-between sticky top-0 z-20 shadow-xs">
      {/* 1. Left: Hamburger & Global Search */}
      <div className="flex items-center gap-4 flex-1 max-w-xl">
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
          title="Toggle Navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              currentRole === 'ADMIN' 
                ? "Search across all bookings, technicians, customers, invoices..."
                : "Search active orders, assigned technicians, customer phone..."
            }
            className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-full focus:outline-none focus:border-emerald-600 focus:bg-white text-slate-800 transition-all placeholder:text-slate-400 shadow-2xs"
          />
        </div>
      </div>

      {/* 2. Right: Action Buttons & Clean Profile Menu */}
      <div className="flex items-center gap-2.5">
        {/* Bilingual English (LTR) / Arabic (RTL) Switcher */}
        <button
          onClick={toggleLocale}
          className="px-2.5 py-1.5 rounded-xl font-bold text-xs border border-indigo-200 bg-indigo-50/70 text-indigo-700 hover:bg-indigo-100 transition-all cursor-pointer"
          title={locale === 'en' ? 'Switch to Arabic (RTL)' : 'Switch to English (LTR)'}
        >
          {t('switchLang')}
        </button>

        {/* Demo Sandbox Indicators & Simulators — strictly visible ONLY when connected to the Demo Sandbox */}
        {isDemoMode && currentRole === 'ADMIN' && (
          <>
            <div
              className="px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 border bg-emerald-500/10 border-emerald-500/30 text-emerald-700 shadow-2xs"
              title="Connected to Isolated Demo Sandbox Database"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="hidden sm:inline font-extrabold text-[11px]">
                DEMO SANDBOX
              </span>
            </div>

            <button
              onClick={() => setIsMobileSimulatorOpen(true)}
              className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 font-bold text-xs rounded-xl shadow-2xs transition-all flex items-center gap-1 cursor-pointer"
              title="Open In-Browser Live Flutter Mobile Simulator"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span className="hidden md:inline text-[11px]">Mobile Apps</span>
            </button>

            <button
              onClick={() => setIsDispatchSimulatorOpen(true)}
              className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/80 font-bold text-xs rounded-xl shadow-2xs transition-all flex items-center gap-1 cursor-pointer"
              title="Open Tri-Party Live Dispatch & Escrow Simulator"
            >
              <Radio className="w-3.5 h-3.5" />
              <span className="hidden lg:inline text-[11px]">Radar Sim</span>
            </button>
          </>
        )}

        {/* Create Booking CTA */}
        <button
          onClick={() => setIsCreateJobModalOpen(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Order</span>
        </button>

        {/* Notifications Bell */}
        <div className="relative">
          <button
            onClick={() => {
              if (currentRole === 'ADMIN') {
                navigateToPage(5);
              } else {
                navigateToStaffPage(103);
              }
              addToast('Opening Operational Alerts & Event Center', 'info');
            }}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors relative cursor-pointer"
            title="Operational Alerts"
          >
            <Bell className="w-5 h-5" />
            {activeIncidentsCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-rose-500 text-white rounded-full text-[9px] font-extrabold flex items-center justify-center shadow-xs">
                {activeIncidentsCount}
              </span>
            )}
          </button>
        </div>

        {/* User Profile Avatar & Interactive Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(prev => !prev)}
            className="flex items-center gap-2.5 p-1.5 pr-3 rounded-full hover:bg-slate-100 transition-all cursor-pointer border border-transparent hover:border-slate-200"
            title="User Profile & Settings"
          >
            {userProfile.avatar ? (
              <img
                src={userProfile.avatar}
                alt={displayName}
                className="w-8 h-8 rounded-full object-cover ring-2 ring-emerald-500/40"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center ring-2 ring-emerald-500/40">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="hidden md:block text-left text-xs leading-tight">
              <div className="font-extrabold text-slate-800 flex items-center gap-1.5">
                <span>{displayName}</span>
                <span className={`text-[9px] px-1.5 py-0.2 rounded font-extrabold uppercase ${
                  currentRole === 'ADMIN' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {currentRole === 'ADMIN' ? 'Admin' : 'Staff'}
                </span>
              </div>
              <div className="text-[10px] text-slate-500 font-medium truncate max-w-[140px]">
                {roleTitle}
              </div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
          </button>

          {/* Sleek Profile Dropdown Menu */}
          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200/80 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              {/* Profile Header Summary */}
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
                {userProfile.avatar ? (
                  <img
                    src={userProfile.avatar}
                    alt={displayName}
                    className="w-10 h-10 rounded-full object-cover ring-2 ring-emerald-500/40"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-emerald-700 text-white font-extrabold text-sm flex items-center justify-center ring-2 ring-emerald-500/40">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-extrabold text-xs text-slate-900 truncate">{displayName}</div>
                  <div className="text-[11px] text-slate-500 truncate">{userProfile.email || 'Configure email in settings'}</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <span className="text-[10px] text-emerald-700 font-bold">{roleTitle}</span>
                  </div>
                </div>
              </div>

              {/* Profile Actions */}
              <div className="p-1 space-y-1 text-xs">
                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    navigateToFacebookProfile({ type: currentRole === 'ADMIN' ? 'admin' : 'staff' });
                    addToast('Opening full operator profile screen', 'info');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-emerald-900 bg-emerald-50 hover:bg-emerald-100 font-bold transition-all cursor-pointer text-left border border-emerald-200/80 shadow-2xs"
                >
                  <User className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-xs">View Full Profile</div>
                    <div className="text-[10px] text-emerald-700/80 font-medium truncate">Overview, credentials &amp; setup</div>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-950 font-black uppercase">FULL</span>
                </button>

                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    openProfileModal('edit');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-100 font-semibold transition-colors cursor-pointer text-left"
                >
                  <Settings className="w-4 h-4 text-emerald-600" />
                  <span>Edit Profile &amp; Security</span>
                </button>

                {currentRole === 'ADMIN' && (
                  <>
                    <button
                      onClick={() => {
                        setIsDropdownOpen(false);
                        setIsWhiteLabelModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-indigo-700 hover:text-indigo-900 hover:bg-indigo-50 font-semibold transition-colors cursor-pointer text-left"
                    >
                      <Palette className="w-4 h-4 text-indigo-600" />
                      <span>White-Label &amp; Currency</span>
                    </button>

                    <button
                      onClick={() => {
                        setIsDropdownOpen(false);
                        window.location.hash = '#/installer';
                        addToast('Opening System Health & Installer Suite', 'info');
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-100 font-semibold transition-colors cursor-pointer text-left"
                    >
                      <Server className="w-4 h-4 text-emerald-600" />
                      <span>System Installer &amp; Health</span>
                    </button>
                  </>
                )}

                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    lockSession();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-amber-700 hover:text-amber-900 hover:bg-amber-50 font-semibold transition-colors cursor-pointer text-left"
                >
                  <Lock className="w-4 h-4 text-amber-600" />
                  <span>Lock Console Session</span>
                </button>

                <div className="my-1 border-t border-slate-100" />

                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-semibold transition-colors cursor-pointer text-left"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

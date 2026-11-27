import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useAdmin } from '../../context/adminContextCore';
import { useTheme } from '../../context/themeContextCore';
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
  Server,
  Sun,
  Moon
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
  const { isDark, toggleTheme } = useTheme();
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
    <header className="h-16 sm:h-18 px-3 sm:px-6 serviceos-glass border-b border-slate-200/80 flex items-center justify-between gap-2 sticky top-0 z-20 shadow-xs transition-colors duration-200">
      {/* 1. Left: Hamburger & Global Search */}
      <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0 max-w-xl">
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-xl text-slate-500 hover:text-indigo-600 hover:bg-indigo-50/70 transition-colors cursor-pointer shrink-0"
          title="Toggle Navigation"
          aria-label="Toggle Navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="relative w-full min-w-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              currentRole === 'ADMIN' 
                ? "Search bookings, pros, invoices..."
                : "Search active orders, pros..."
            }
            className="w-full pl-8 sm:pl-10 pr-3 sm:pr-4 py-2 text-xs bg-slate-50/90 border border-slate-200 rounded-full focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 focus:bg-white text-slate-800 transition-all placeholder:text-slate-400 shadow-2xs"
          />
        </div>
      </div>

      {/* 2. Right: Action Buttons & Clean Profile Menu */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        {/* Day Vision / Night Vision Instant Toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          className="p-2 rounded-xl border border-slate-200/80 bg-slate-50/80 text-slate-600 hover:text-indigo-600 hover:border-indigo-200 hover:scale-105 transition-all cursor-pointer"
          title={isDark ? 'Switch to Day Vision (Light Mode)' : 'Switch to Night Vision (OLED Dark Mode)'}
        >
          {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
        </button>

        {/* Bilingual English (LTR) / Arabic (RTL) Switcher */}
        <button
          onClick={toggleLocale}
          className="px-2.5 py-1.5 rounded-xl font-bold text-xs border border-indigo-200 bg-indigo-50/70 text-indigo-700 hover:bg-indigo-100 transition-all cursor-pointer"
          title={locale === 'en' ? 'Switch to Arabic (RTL)' : 'Switch to English (LTR)'}
        >
          {t('switchLang')}
        </button>

        {/* Live Mobile & Dispatch Simulators — visible on md+, accessible in profile dropdown on mobile */}
        {currentRole === 'ADMIN' && (
          <>
            {isDemoMode && (
              <div
                className="hidden xl:flex px-2.5 py-1.5 rounded-xl font-bold text-xs items-center gap-1.5 border bg-emerald-500/10 border-emerald-500/30 text-emerald-700 shadow-2xs"
                title="Connected to Isolated Demo Sandbox Database"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="font-extrabold text-[10px]">
                  SANDBOX
                </span>
              </div>
            )}

            <button
              onClick={() => setIsMobileSimulatorOpen(true)}
              className="hidden md:flex px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 font-extrabold text-xs rounded-xl shadow-2xs transition-all items-center gap-1.5 cursor-pointer"
              title="Open In-Browser Live Flutter & Android Mobile Simulator"
            >
              <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
              <span className="text-[11px]">Mobile Apps</span>
            </button>

            <button
              onClick={() => setIsDispatchSimulatorOpen(true)}
              className="hidden lg:flex px-2.5 py-1.5 bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200/80 font-extrabold text-xs rounded-xl shadow-2xs transition-all items-center gap-1 cursor-pointer"
              title="Open Tri-Party Live Dispatch & Escrow Simulator"
            >
              <Radio className="w-3.5 h-3.5 text-violet-600" />
              <span className="text-[11px]">Radar Sim</span>
            </button>
          </>
        )}

        {/* Create Booking CTA */}
        <button
          onClick={() => setIsCreateJobModalOpen(true)}
          aria-label="New Order"
          className="px-2.5 sm:px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-extrabold text-xs rounded-xl shadow-md shadow-indigo-500/20 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">New Order</span>
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
            className="p-2 rounded-xl text-slate-500 hover:text-indigo-600 hover:bg-indigo-50/70 transition-colors relative cursor-pointer"
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
            className="flex items-center gap-2.5 p-1 sm:p-1.5 md:pr-3 rounded-full hover:bg-slate-100 transition-all cursor-pointer border border-transparent hover:border-slate-200"
            title="User Profile & Settings"
          >
            {userProfile.avatar ? (
              <img
                src={userProfile.avatar}
                alt={displayName}
                className="w-8 h-8 rounded-full object-cover ring-2 ring-indigo-500/40"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 text-white font-black text-xs flex items-center justify-center ring-2 ring-indigo-500/30 shadow-xs">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="hidden md:block text-left text-xs leading-tight">
              <div className="font-extrabold text-slate-800 flex items-center gap-1.5">
                <span>{displayName}</span>
                <span className={`text-[9px] px-1.5 py-0.2 rounded font-extrabold uppercase ${
                  currentRole === 'ADMIN' ? 'bg-indigo-100 text-indigo-800' : 'bg-sky-100 text-sky-800'
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
          <AnimatePresence>
          {isDropdownOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200/80 py-2 z-50"
            >
              {/* Profile Header Summary */}
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
                {userProfile.avatar ? (
                  <img
                    src={userProfile.avatar}
                    alt={displayName}
                    className="w-10 h-10 rounded-full object-cover ring-2 ring-indigo-500/40"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 text-white font-black text-sm flex items-center justify-center ring-2 ring-indigo-500/30">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-extrabold text-xs text-slate-900 truncate">{displayName}</div>
                  <div className="text-[11px] text-slate-500 truncate">{userProfile.email || 'admin@servicepro.com'}</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <span className="text-[10px] text-indigo-700 font-bold">{roleTitle}</span>
                  </div>
                </div>
              </div>

              {/* Profile Actions */}
              <div className="p-1.5 space-y-1 text-xs">
                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    navigateToFacebookProfile({ type: currentRole === 'ADMIN' ? 'admin' : 'staff' });
                    addToast('Opening full operator profile screen', 'info');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-indigo-900 bg-indigo-50/80 hover:bg-indigo-100 font-bold transition-all cursor-pointer text-left border border-indigo-200/80 shadow-2xs"
                >
                  <User className="w-4 h-4 text-indigo-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-xs">View Full Profile</div>
                    <div className="text-[10px] text-indigo-700/80 font-medium truncate">Overview, credentials &amp; setup</div>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-200 text-indigo-950 font-black uppercase">FULL</span>
                </button>

                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    openProfileModal('edit');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-100 font-semibold transition-colors cursor-pointer text-left"
                >
                  <Settings className="w-4 h-4 text-indigo-600" />
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
                      <Server className="w-4 h-4 text-violet-600" />
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
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
};

import React, { useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Compass,
  HardHat,
  HelpCircle,
  Landmark,
  Layers,
  LayoutDashboard,
  LogOut,
  Navigation,
  Settings,
  Shield,
  Users,
} from 'lucide-react';
import { useAdmin } from '../../context/adminContextCore';
import { MODULES_8 } from '../../data/pagesMaster';
import { STAFF_MODULES } from '../../data/staffPagesMaster';

export const NavigationSidebar: React.FC = () => {
  const {
    currentRole,
    agencyName,
    agencyTagline,
    activeModuleId,
    currentPageId,
    navigateToPage,
    navigateToModule,
    currentStaffPageId,
    activeStaffModuleId,
    navigateToStaffPage,
    navigateToStaffModule,
    isSidebarCollapsed,
    toggleSidebar,
    isDemoMode,
    logout,
    tickets,
    bookings,
  } = useAdmin();

  const [expandedModules, setExpandedModules] = useState<number[]>([1, 2]);
  const isAdmin = currentRole === 'ADMIN';

  const toggleExpand = (modId: number) => {
    setExpandedModules((prev) =>
      prev.includes(modId) ? prev.filter((id) => id !== modId) : [...prev, modId]
    );
  };

  const getAdminModuleIcon = (id: number) => {
    switch (id) {
      case 1: return LayoutDashboard;
      case 2: return Compass;
      case 3: return Layers;
      case 4: return Users;
      case 5: return HardHat;
      case 6: return Landmark;
      case 7: return HelpCircle;
      case 8: return Settings;
      default: return LayoutDashboard;
    }
  };

  const getStaffModuleIcon = (id: number) => {
    switch (id) {
      case 1: return LayoutDashboard;
      case 2: return Navigation;
      case 3: return Clock;
      case 4: return CheckCircle2;
      default: return LayoutDashboard;
    }
  };

  const pendingBookingsCount = bookings.filter((b) => b.status === 'Pending').length;
  const inProgressCount = bookings.filter((b) => b.status === 'In Progress').length;
  const openTicketsCount = tickets.filter((t) => t.status === 'Open').length;

  const modules = isAdmin ? MODULES_8 : STAFF_MODULES;
  const currentActiveMod = isAdmin ? activeModuleId : activeStaffModuleId;
  const currentActivePage = isAdmin ? currentPageId : currentStaffPageId;

  return (
    <>
      {!isSidebarCollapsed && (
        <div
          onClick={toggleSidebar}
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-slate-950/65 backdrop-blur-xs lg:hidden"
        />
      )}
      <aside
        className={`shrink-0 h-full select-none flex-col justify-between transition-all duration-300 servicepro-sidebar border-r border-slate-800/80 ${
          isSidebarCollapsed
            ? 'hidden lg:flex lg:w-20'
            : 'fixed inset-y-0 left-0 z-40 flex w-[264px] max-w-[85vw] lg:static lg:w-64 xl:w-[264px] shadow-2xl lg:shadow-none'
        }`}
      >
        <div>
          {/* Brand Header */}
          <div className="h-16 px-4 flex items-center gap-3 border-b border-slate-800/80">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 p-0.5 shrink-0 shadow-lg shadow-indigo-500/25">
              <div className="w-full h-full bg-[#0A101F] rounded-[10px] flex items-center justify-center text-indigo-400">
                <Shield className="w-4 h-4" />
              </div>
            </div>
            {!isSidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="font-extrabold text-white text-sm tracking-tight leading-tight truncate">
                    {agencyName || (isAdmin ? 'ServiceOS' : 'Dispatch Desk')}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider shrink-0 border ${
                      isAdmin
                        ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                        : 'bg-violet-500/20 text-violet-300 border-violet-500/30'
                    }`}
                  >
                    {isAdmin ? 'ADMIN' : 'STAFF'}
                  </span>
                </div>
                <div className="text-[10.5px] text-slate-400 font-medium truncate">
                  {agencyTagline || (isAdmin ? 'Executive Control Portal' : 'Field Service Operations')}
                </div>
              </div>
            )}
          </div>

          {/* Navigation Modules */}
          <div className="p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-220px)] thin-scrollbar">
            {!isSidebarCollapsed && (
              <div className="px-3 pt-2 pb-1.5 text-[10px] font-black text-indigo-400/70 uppercase tracking-widest flex items-center justify-between">
                <span>{isAdmin ? 'Executive Modules' : 'Operations Workspaces'}</span>
              </div>
            )}

            {modules.map((item) => {
              const Icon = isAdmin ? getAdminModuleIcon(item.id) : getStaffModuleIcon(item.id);
              const isActive = currentActiveMod === item.id;
              const isExpanded = expandedModules.includes(item.id) || isActive;

              const badge = isAdmin
                ? item.id === 2 && pendingBookingsCount > 0
                  ? `${pendingBookingsCount} Pending`
                  : item.id === 7 && openTicketsCount > 0
                    ? `${openTicketsCount} Open`
                    : null
                : item.id === 1 && pendingBookingsCount > 0
                  ? `${pendingBookingsCount} Queue`
                  : item.id === 3 && inProgressCount > 0
                    ? `${inProgressCount} Field`
                    : null;

              return (
                <div key={item.id} className="space-y-0.5">
                  <button
                    onClick={() => {
                      if (isAdmin) {
                        navigateToModule(item.id);
                      } else {
                        navigateToStaffModule(item.id);
                      }
                      toggleExpand(item.id);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-indigo-600/15 text-white border border-indigo-500/40 shadow-sm'
                        : 'text-slate-300 hover:bg-white/[0.04] hover:text-white'
                    } ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}
                    title={item.name}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                      {!isSidebarCollapsed && <span className="truncate font-bold text-xs">{item.name}</span>}
                    </div>

                    {!isSidebarCollapsed && (
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {badge && (
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${
                              item.id === 2 || item.id === 1
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                                : item.id === 3
                                  ? 'bg-sky-500/20 text-sky-300 border border-sky-400/30'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-400/30'
                            }`}
                          >
                            {badge}
                          </span>
                        )}
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        )}
                      </div>
                    )}
                  </button>

                  {!isSidebarCollapsed && isExpanded && (
                    <div className="pl-5 pr-1 py-1 space-y-1 border-l-2 border-indigo-500/30 ml-4">
                      {item.pages.map((page) => {
                        const isPageActive = currentActivePage === page.id;
                        const label = page.tabName || page.name;
                        return (
                          <button
                            key={page.id}
                            onClick={() => {
                              if (isAdmin) navigateToPage(page.id);
                              else navigateToStaffPage(page.id);
                              if (typeof window !== 'undefined' && window.innerWidth < 1024 && !isSidebarCollapsed) {
                                toggleSidebar();
                              }
                            }}
                            className={`w-full text-left px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all flex items-center justify-between cursor-pointer ${
                              isPageActive
                                ? 'servicepro-nav-active text-white font-bold'
                                : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                            }`}
                          >
                            <span className="truncate">{label}</span>
                            {isPageActive && <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom Operational Status & Sign Out */}
        <div className="p-3 border-t border-slate-800/80">
          {!isSidebarCollapsed && (
            <div className="mb-2.5 p-2.5 rounded-xl bg-white/[0.03] border border-white/10 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-white truncate">
                  {isDemoMode ? 'Interactive Demo Node' : 'Systems Operational'}
                </div>
                <div className="text-[10px] text-emerald-400/90 font-medium truncate">
                  {isDemoMode ? 'Sandbox Database Active' : 'PostGIS Engine Online'}
                </div>
              </div>
            </div>
          )}

          <button
            onClick={logout}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-rose-500/15 hover:border-rose-500/30 border border-transparent transition-all cursor-pointer ${
              isSidebarCollapsed ? 'justify-center' : ''
            }`}
            title="Sign Out"
          >
            <LogOut className="w-4 h-4 text-rose-400 shrink-0" />
            {!isSidebarCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>
    </>
  );
};

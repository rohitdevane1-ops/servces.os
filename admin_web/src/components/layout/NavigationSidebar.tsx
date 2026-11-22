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
    <aside
      className={`shrink-0 h-full select-none flex flex-col justify-between transition-all duration-300 servicepro-sidebar border-r border-[#092b26] ${
        isSidebarCollapsed ? 'w-20' : 'w-80 min-w-[320px]'
      }`}
    >
      <div>
        {/* Brand Header */}
        <div className="h-18 px-5 flex items-center gap-3 border-b border-[#11423b]">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 shrink-0 shadow-sm">
            <span className="font-extrabold text-xl tracking-tight">
              {agencyName ? agencyName.charAt(0).toUpperCase() : isAdmin ? 'A' : 'S'}
            </span>
          </div>
          {!isSidebarCollapsed && (
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-white text-base tracking-tight truncate">
                  {agencyName || (isAdmin ? 'Admin Console' : 'Operations Desk')}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-emerald-400 text-slate-950 uppercase tracking-wider shrink-0">
                  {isAdmin ? 'ADMIN' : 'STAFF'}
                </span>
              </div>
              <div className="text-[11px] text-emerald-300/80 font-medium truncate">
                {agencyTagline || (isAdmin ? 'Executive Operations Portal' : 'Field Service Operations')}
              </div>
            </div>
          )}
        </div>

        {/* Navigation Modules */}
        <div className="p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-220px)] thin-scrollbar">
          {!isSidebarCollapsed && (
            <div className="px-3 pt-2 pb-1 text-[10px] font-extrabold text-emerald-300/50 uppercase tracking-wider flex items-center justify-between">
              <span>{isAdmin ? 'Management Modules' : 'Operations Workspaces'}</span>
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
                      ? 'bg-[#11423b] text-white border border-emerald-500/40'
                      : 'text-slate-200 hover:bg-[#11423b]/60'
                  } ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}
                  title={item.name}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-emerald-400' : 'text-emerald-400/80'}`} />
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
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                    </div>
                  )}
                </button>

                {!isSidebarCollapsed && isExpanded && (
                  <div className="pl-6 pr-1 py-1 space-y-0.5 border-l-2 border-emerald-500/30 ml-4">
                    {item.pages.map((page) => {
                      const isPageActive = currentActivePage === page.id;
                      const label = page.tabName || page.name;
                      return (
                        <button
                          key={page.id}
                          onClick={() => (isAdmin ? navigateToPage(page.id) : navigateToStaffPage(page.id))}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all flex items-center justify-between cursor-pointer ${
                            isPageActive
                              ? 'servicepro-nav-active text-white font-bold shadow-xs'
                              : 'text-slate-300 hover:text-white hover:bg-white/5'
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
      <div className="p-3 border-t border-[#11423b]">
        {!isSidebarCollapsed && (
          <div className="mb-2 p-2.5 rounded-xl bg-[#082622] border border-[#144d44] flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-white truncate">
                {isDemoMode ? 'Interactive Demo Mode' : 'Systems Operational'}
              </div>
              <div className="text-[10px] text-emerald-400/80 truncate">
                {isDemoMode ? 'Sandbox Database Connected' : 'Fastify PostgreSQL API Connected'}
              </div>
            </div>
          </div>
        )}

        <button
          onClick={logout}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-[#11423b] transition-all cursor-pointer ${
            isSidebarCollapsed ? 'justify-center' : ''
          }`}
          title="Sign Out"
        >
          <LogOut className="w-4 h-4 text-emerald-400/70 shrink-0" />
          {!isSidebarCollapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
};

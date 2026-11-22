import React from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { MODULES_8 } from '../../data/pagesMaster';
import { STAFF_MODULES } from '../../data/staffPagesMaster';

export const ModuleSubnav: React.FC = () => {
  const { 
    currentRole,
    currentPageId, 
    activeModuleId, 
    navigateToPage,
    currentStaffPageId,
    activeStaffModuleId,
    navigateToStaffPage
  } = useAdmin();

  if (currentRole === 'STAFF') {
    const currentStaffModule = STAFF_MODULES.find(m => m.id === activeStaffModuleId);
    if (!currentStaffModule) return null;

    return (
      <div className="bg-white rounded-2xl p-2 px-3 border border-slate-200/80 shadow-xs mb-3 overflow-x-auto thin-scrollbar">
        <div className="flex items-center gap-1.5 min-w-max">
          {currentStaffModule.pages.map((p) => {
            const isActive = p.id === currentStaffPageId;
            const displayName = p.tabName || p.name;

            return (
              <button
                key={p.id}
                onClick={() => navigateToStaffPage(p.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                  isActive
                    ? 'bg-[#0C3832] text-white shadow-xs'
                    : 'bg-slate-50 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200/60'
                }`}
              >
                <span>{displayName}</span>
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Admin Panel Horizontal Navigation Buttons
  const currentModule = MODULES_8.find(m => m.id === activeModuleId);
  if (!currentModule) return null;

  return (
    <div className="bg-white rounded-2xl p-2 px-3 border border-slate-200/80 shadow-xs mb-3 overflow-x-auto thin-scrollbar">
      <div className="flex items-center gap-1.5 min-w-max">
        {currentModule.pages.map((p) => {
          const isActive = p.id === currentPageId;
          const displayName = p.tabName || p.name;

          return (
            <button
              key={p.id}
              onClick={() => navigateToPage(p.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                isActive
                  ? 'bg-[#0C3832] text-white shadow-xs'
                  : 'bg-slate-50 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200/60'
              }`}
            >
              <span>{displayName}</span>
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

import React from 'react';
import { motion } from 'motion/react';
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
      <div className="border-b border-slate-200/80 pb-3 mb-2 overflow-x-auto thin-scrollbar">
        <div className="flex items-center gap-1.5 min-w-max">
          {currentStaffModule.pages.map((p) => {
            const isActive = p.id === currentStaffPageId;
            const displayName = p.tabName || p.name;

            return (
              <button
                key={p.id}
                onClick={() => navigateToStaffPage(p.id)}
                className={`relative px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-2 ${
                  isActive
                    ? 'text-white'
                    : 'text-slate-600 hover:bg-white hover:text-indigo-700 border border-transparent hover:border-slate-200/80'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="serviceos-subnav-pill"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className="absolute inset-0 rounded-xl bg-indigo-600 shadow-xs"
                  />
                )}
                <span className="relative z-10">{displayName}</span>
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
    <div className="border-b border-slate-200/80 pb-3 mb-2 overflow-x-auto thin-scrollbar">
      <div className="flex items-center gap-1.5 min-w-max">
        {currentModule.pages.map((p) => {
          const isActive = p.id === currentPageId;
          const displayName = p.tabName || p.name;

          return (
            <button
              key={p.id}
              onClick={() => navigateToPage(p.id)}
              className={`relative px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-2 ${
                isActive
                  ? 'text-white'
                  : 'text-slate-600 hover:bg-white hover:text-indigo-700 border border-transparent hover:border-slate-200/80'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="serviceos-subnav-pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="absolute inset-0 rounded-xl bg-indigo-600 shadow-xs"
                />
              )}
              <span className="relative z-10">{displayName}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

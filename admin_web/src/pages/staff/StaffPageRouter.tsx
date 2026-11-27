import React, { Suspense, lazy } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { useAdmin } from '../../context/adminContextCore';
import { EASE_CINEMATIC } from '../../components/common/motionTokens';

const StaffDashboard = lazy(() => import('./StaffDashboard').then((m) => ({ default: m.StaffDashboard })));
const StaffOrderIntake = lazy(() => import('./StaffOrderIntake').then((m) => ({ default: m.StaffOrderIntake })));
const StaffActivityStream = lazy(() => import('./StaffActivityStream').then((m) => ({ default: m.StaffActivityStream })));
const StaffOrderAssignment = lazy(() => import('./StaffOrderAssignment').then((m) => ({ default: m.StaffOrderAssignment })));
const StaffLiveDispatch = lazy(() => import('./StaffLiveDispatch').then((m) => ({ default: m.StaffLiveDispatch })));
const StaffTechAvailability = lazy(() => import('./StaffTechAvailability').then((m) => ({ default: m.StaffTechAvailability })));
const StaffEmergencyHandover = lazy(() => import('./StaffEmergencyHandover').then((m) => ({ default: m.StaffEmergencyHandover })));
const StaffActiveOrders = lazy(() => import('./StaffActiveOrders').then((m) => ({ default: m.StaffActiveOrders })));
const StaffScheduleCalendar = lazy(() => import('./StaffScheduleCalendar').then((m) => ({ default: m.StaffScheduleCalendar })));
const StaffRescheduleDesk = lazy(() => import('./StaffRescheduleDesk').then((m) => ({ default: m.StaffRescheduleDesk })));
const StaffJobVerification = lazy(() => import('./StaffJobVerification').then((m) => ({ default: m.StaffJobVerification })));
const StaffCustomerComm = lazy(() => import('./StaffCustomerComm').then((m) => ({ default: m.StaffCustomerComm })));
const StaffDailyReport = lazy(() => import('./StaffDailyReport').then((m) => ({ default: m.StaffDailyReport })));
const FacebookProfilePage = lazy(() => import('../shared/FacebookProfilePage').then((m) => ({ default: m.FacebookProfilePage })));

const StaffLoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center py-20 text-slate-500 text-xs gap-2">
    <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
    <span>Loading dispatch workspace...</span>
  </div>
);

export const StaffPageRouter: React.FC = () => {
  const { currentStaffPageId } = useAdmin();

  const renderStaffPage = () => {
    switch (currentStaffPageId) {
      case 101: return <StaffDashboard />;
      case 102: return <StaffOrderIntake />;
      case 103: return <StaffActivityStream />;
      case 104: return <StaffOrderAssignment />;
      case 105: return <StaffLiveDispatch />;
      case 106: return <StaffTechAvailability />;
      case 107: return <StaffEmergencyHandover />;
      case 108: return <StaffActiveOrders />;
      case 109: return <StaffScheduleCalendar />;
      case 110: return <StaffRescheduleDesk />;
      case 111: return <StaffJobVerification />;
      case 112: return <StaffCustomerComm />;
      case 113: return <StaffDailyReport />;
      case 114: return <FacebookProfilePage />;
      default: return <StaffDashboard />;
    }
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={currentStaffPageId}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.24, ease: EASE_CINEMATIC }}
      >
        <Suspense fallback={<StaffLoadingFallback />}>{renderStaffPage()}</Suspense>
      </motion.div>
    </AnimatePresence>
  );
};

import React, { Suspense, lazy } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { useAdmin } from '../context/adminContextCore';
import { canAccessPage } from '../security/rbac';
import { recordSecurityEvent } from '../security/securityAuditLogger';

const Page01MainDashboard = lazy(() => import('./module1/Page01MainDashboard').then((m) => ({ default: m.Page01MainDashboard })));
const Page02LiveOperations = lazy(() => import('./module1/Page02LiveOperations').then((m) => ({ default: m.Page02LiveOperations })));
const Page03TodayActivity = lazy(() => import('./module1/Page03TodayActivity').then((m) => ({ default: m.Page03TodayActivity })));
const Page04PendingWork = lazy(() => import('./module1/Page04PendingWork').then((m) => ({ default: m.Page04PendingWork })));
const Page05CriticalAlerts = lazy(() => import('./module1/Page05CriticalAlerts').then((m) => ({ default: m.Page05CriticalAlerts })));

const Page06AllBookings = lazy(() => import('./module2/Page06AllBookings').then((m) => ({ default: m.Page06AllBookings })));
const Page07NewBookingRequests = lazy(() => import('./module2/Page07NewBookingRequests').then((m) => ({ default: m.Page07NewBookingRequests })));
const Page08ActiveBookings = lazy(() => import('./module2/Page08ActiveBookings').then((m) => ({ default: m.Page08ActiveBookings })));
const Page09BookingDetails = lazy(() => import('./module2/Page09BookingDetails').then((m) => ({ default: m.Page09BookingDetails })));
const Page10BookingRescheduling = lazy(() => import('./module2/Page10BookingRescheduling').then((m) => ({ default: m.Page10BookingRescheduling })));
const Page11DispatchBoard = lazy(() => import('./module2/Page11DispatchBoard').then((m) => ({ default: m.Page11DispatchBoard })));
const Page12ManualDispatchHandover = lazy(() => import('./module2/Page12ManualDispatchHandover').then((m) => ({ default: m.Page12ManualDispatchHandover })));

const Page13AllServices = lazy(() => import('./module3/Page13AllServices').then((m) => ({ default: m.Page13AllServices })));
const Page14ServiceCategories = lazy(() => import('./module3/Page14ServiceCategories').then((m) => ({ default: m.Page14ServiceCategories })));
const Page15AddEditService = lazy(() => import('./module3/Page15AddEditService').then((m) => ({ default: m.Page15AddEditService })));
const Page16ServiceDetails = lazy(() => import('./module3/Page16ServiceDetails').then((m) => ({ default: m.Page16ServiceDetails })));
const Page17PricingManagement = lazy(() => import('./module3/Page17PricingManagement').then((m) => ({ default: m.Page17PricingManagement })));

const Page18AllCustomers = lazy(() => import('./module4/Page18AllCustomers').then((m) => ({ default: m.Page18AllCustomers })));
const Page19CustomerProfile = lazy(() => import('./module4/Page19CustomerProfile').then((m) => ({ default: m.Page19CustomerProfile })));
const Page20CustomerBookingHistory = lazy(() => import('./module4/Page20CustomerBookingHistory').then((m) => ({ default: m.Page20CustomerBookingHistory })));
const Page21CustomerSupportTickets = lazy(() => import('./module4/Page21CustomerSupportTickets').then((m) => ({ default: m.Page21CustomerSupportTickets })));

const Page22AllTechnicians = lazy(() => import('./module5/Page22AllTechnicians').then((m) => ({ default: m.Page22AllTechnicians })));
const Page23TechnicianProfile = lazy(() => import('./module5/Page23TechnicianProfile').then((m) => ({ default: m.Page23TechnicianProfile })));
const Page24TechnicianAvailability = lazy(() => import('./module5/Page24TechnicianAvailability').then((m) => ({ default: m.Page24TechnicianAvailability })));
const Page25TechnicianPerformance = lazy(() => import('./module5/Page25TechnicianPerformance').then((m) => ({ default: m.Page25TechnicianPerformance })));

const Page26FinancialDashboard = lazy(() => import('./module6/Page26FinancialDashboard').then((m) => ({ default: m.Page26FinancialDashboard })));
const Page27TransactionHistory = lazy(() => import('./module6/Page27TransactionHistory').then((m) => ({ default: m.Page27TransactionHistory })));
const Page28CustomerInvoices = lazy(() => import('./module6/Page28CustomerInvoices').then((m) => ({ default: m.Page28CustomerInvoices })));
const Page29TechnicianPayouts = lazy(() => import('./module6/Page29TechnicianPayouts').then((m) => ({ default: m.Page29TechnicianPayouts })));
const Page30RefundManagement = lazy(() => import('./module6/Page30RefundManagement').then((m) => ({ default: m.Page30RefundManagement })));

const Page31SupportTicketDashboard = lazy(() => import('./module7/Page31SupportTicketDashboard').then((m) => ({ default: m.Page31SupportTicketDashboard })));
const Page32TicketDetailsConversation = lazy(() => import('./module7/Page32TicketDetailsConversation').then((m) => ({ default: m.Page32TicketDetailsConversation })));
const Page33CustomerReviewsManagement = lazy(() => import('./module7/Page33CustomerReviewsManagement').then((m) => ({ default: m.Page33CustomerReviewsManagement })));

const Page34WebsiteContentManagement = lazy(() => import('./module8/Page34WebsiteContentManagement').then((m) => ({ default: m.Page34WebsiteContentManagement })));
const Page35GeneralPlatformSettings = lazy(() => import('./module8/Page35GeneralPlatformSettings').then((m) => ({ default: m.Page35GeneralPlatformSettings })));
const Page36PaymentNotificationConfig = lazy(() => import('./module8/Page36PaymentNotificationConfig').then((m) => ({ default: m.Page36PaymentNotificationConfig })));

const FacebookProfilePage = lazy(() => import('./shared/FacebookProfilePage').then((m) => ({ default: m.FacebookProfilePage })));
const SystemInstallerPage = lazy(() => import('./commercial/SystemInstallerPage').then((m) => ({ default: m.SystemInstallerPage })));

const PageLoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center py-20 text-slate-500 text-xs gap-2">
    <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
    <span>Loading workspace module...</span>
  </div>
);

export const PageRouter: React.FC = () => {
  const { currentPageId, currentRole, session } = useAdmin();
  const isAllowed = canAccessPage(currentRole, currentPageId);

  React.useEffect(() => {
    if (!isAllowed) {
      recordSecurityEvent(
        'PRIVILEGE_ELEVATION_DENIED',
        session?.user?.email || 'staff-session',
        currentRole,
        'CRITICAL',
        `Restricted page access denied for Admin resource #${currentPageId}`
      );
    }
  }, [isAllowed, currentPageId, currentRole, session?.user?.email]);

  if (!isAllowed) {
    return (
      <div className="p-8 my-8 max-w-xl mx-auto bg-rose-50 border-2 border-rose-200 rounded-3xl text-center shadow-lg animate-in fade-in">
        <div className="w-16 h-16 mx-auto mb-4 bg-rose-100 rounded-full flex items-center justify-center">
          <ShieldAlert className="w-8 h-8 text-rose-600" />
        </div>
        <h3 className="text-xl font-black text-rose-950">Administrative Clearance Required</h3>
        <p className="text-sm text-rose-700 mt-2">
          Your current user role (<span className="font-mono font-bold">{currentRole}</span>) is restricted from viewing Page #{currentPageId}.
        </p>
      </div>
    );
  }

  const renderPage = () => {
    switch (currentPageId) {
      case 1: return <Page01MainDashboard />;
      case 2: return <Page02LiveOperations />;
      case 3: return <Page03TodayActivity />;
      case 4: return <Page04PendingWork />;
      case 5: return <Page05CriticalAlerts />;
      case 6: return <Page06AllBookings />;
      case 7: return <Page07NewBookingRequests />;
      case 8: return <Page08ActiveBookings />;
      case 9: return <Page09BookingDetails />;
      case 10: return <Page10BookingRescheduling />;
      case 11: return <Page11DispatchBoard />;
      case 12: return <Page12ManualDispatchHandover />;
      case 13: return <Page13AllServices />;
      case 14: return <Page14ServiceCategories />;
      case 15: return <Page15AddEditService />;
      case 16: return <Page16ServiceDetails />;
      case 17: return <Page17PricingManagement />;
      case 18: return <Page18AllCustomers />;
      case 19: return <Page19CustomerProfile />;
      case 20: return <Page20CustomerBookingHistory />;
      case 21: return <Page21CustomerSupportTickets />;
      case 22: return <Page22AllTechnicians />;
      case 23: return <Page23TechnicianProfile />;
      case 24: return <Page24TechnicianAvailability />;
      case 25: return <Page25TechnicianPerformance />;
      case 26: return <Page26FinancialDashboard />;
      case 27: return <Page27TransactionHistory />;
      case 28: return <Page28CustomerInvoices />;
      case 29: return <Page29TechnicianPayouts />;
      case 30: return <Page30RefundManagement />;
      case 31: return <Page31SupportTicketDashboard />;
      case 32: return <Page32TicketDetailsConversation />;
      case 33: return <Page33CustomerReviewsManagement />;
      case 34: return <Page34WebsiteContentManagement />;
      case 35: return <Page35GeneralPlatformSettings />;
      case 36: return <Page36PaymentNotificationConfig />;
      case 37: return <FacebookProfilePage />;
      case 38: return <SystemInstallerPage />;
      default:
        if (typeof window !== 'undefined' && window.location.hash.includes('installer')) {
          return <SystemInstallerPage />;
        }
        return <Page01MainDashboard />;
    }
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={currentPageId}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      >
        <Suspense fallback={<PageLoadingFallback />}>{renderPage()}</Suspense>
      </motion.div>
    </AnimatePresence>
  );
};

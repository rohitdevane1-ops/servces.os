import React, { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';
import { AdminProvider } from './context/AdminContext';
import { useAdmin } from './context/adminContextCore';
import { LocaleProvider } from './i18n/LocaleContext';
import { useLocale } from './i18n/localeCore';
import { ToastContainer } from './components/common/ToastContainer';

const LoginPage = lazy(() => import('./pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const NavigationSidebar = lazy(() =>
  import('./components/layout/NavigationSidebar').then((m) => ({ default: m.NavigationSidebar }))
);
const TopNavbar = lazy(() =>
  import('./components/layout/TopNavbar').then((m) => ({ default: m.TopNavbar }))
);
const ModuleSubnav = lazy(() =>
  import('./components/layout/ModuleSubnav').then((m) => ({ default: m.ModuleSubnav }))
);
const PageRouter = lazy(() =>
  import('./pages/PageRouter').then((m) => ({ default: m.PageRouter }))
);
const StaffPageRouter = lazy(() =>
  import('./pages/staff/StaffPageRouter').then((m) => ({ default: m.StaffPageRouter }))
);

const ManualDispatchModal = lazy(() =>
  import('./components/modals/ManualDispatchModal').then((m) => ({ default: m.ManualDispatchModal }))
);
const CreateJobModal = lazy(() =>
  import('./components/modals/CreateJobModal').then((m) => ({ default: m.CreateJobModal }))
);
const ProfileModal = lazy(() =>
  import('./components/modals/ProfileModal').then((m) => ({ default: m.ProfileModal }))
);
const UniversalUserDossierModal = lazy(() =>
  import('./components/modals/UniversalUserDossierModal').then((m) => ({ default: m.UniversalUserDossierModal }))
);
const EditUniversalEntityModal = lazy(() =>
  import('./components/modals/EditUniversalEntityModal').then((m) => ({ default: m.EditUniversalEntityModal }))
);
const DirectSMSComposerModal = lazy(() =>
  import('./components/modals/DirectSMSComposerModal').then((m) => ({ default: m.DirectSMSComposerModal }))
);
const CreateCustomerDrawer = lazy(() =>
  import('./components/modals/CreateCustomerDrawer').then((m) => ({ default: m.CreateCustomerDrawer }))
);
const CreateTechnicianDrawer = lazy(() =>
  import('./components/modals/CreateTechnicianDrawer').then((m) => ({ default: m.CreateTechnicianDrawer }))
);
const CreateCategoryDrawer = lazy(() =>
  import('./components/modals/CreateCategoryDrawer').then((m) => ({ default: m.CreateCategoryDrawer }))
);
const CreateInvoiceModal = lazy(() =>
  import('./components/modals/CreateInvoiceModal').then((m) => ({ default: m.CreateInvoiceModal }))
);
const SessionLockModal = lazy(() =>
  import('./components/modals/SessionLockModal').then((m) => ({ default: m.SessionLockModal }))
);
const MobileSimulatorModal = lazy(() =>
  import('./components/commercial/MobileSimulatorModal').then((m) => ({ default: m.MobileSimulatorModal }))
);
const DispatchSimulatorModal = lazy(() =>
  import('./components/commercial/DispatchSimulatorModal').then((m) => ({ default: m.DispatchSimulatorModal }))
);
const WhiteLabelBrandModal = lazy(() =>
  import('./components/commercial/WhiteLabelBrandModal').then((m) => ({ default: m.WhiteLabelBrandModal }))
);

const FullScreenLoader: React.FC<{ label?: string }> = ({ label = 'Initializing secure console...' }) => (
  <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-[#F4F7FB] text-slate-600 gap-3">
    <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
    <span className="text-xs font-semibold tracking-wide">{label}</span>
  </div>
);

const AppContent: React.FC = () => {
  const {
    isAuthenticated,
    isAuthInitializing,
    isDemoMode,
    currentRole,
    isMobileSimulatorOpen,
    setIsMobileSimulatorOpen,
    isDispatchSimulatorOpen,
    setIsDispatchSimulatorOpen,
    isWhiteLabelModalOpen,
    setIsWhiteLabelModalOpen,
  } = useAdmin();

  const { t, dir } = useLocale();

  const demoBanner = isDemoMode ? (
    <div
      dir={dir}
      className="w-full bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 text-white text-xs font-medium py-1.5 px-4 flex items-center justify-center gap-2 shrink-0 z-50 shadow-sm"
    >
      <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-bold tracking-wider uppercase">
        {t('demoBadge')}
      </span>
      <span>{t('demoBanner')}</span>
    </div>
  ) : null;

  if (isAuthInitializing) {
    return <FullScreenLoader label="Restoring verified session..." />;
  }

  if (!isAuthenticated) {
    return (
      <div dir={dir} className="min-h-screen flex flex-col">
        {demoBanner}
        <div className="flex-1">
          <Suspense fallback={<FullScreenLoader label="Loading sign-in portal..." />}>
            <LoginPage />
          </Suspense>
        </div>
        <ToastContainer />
      </div>
    );
  }

  return (
    <div dir={dir} className="flex flex-col h-screen w-screen overflow-hidden bg-[#F4F7FB] text-slate-800 font-sans antialiased">
      {demoBanner}
      <div className="flex flex-1 min-h-0 w-full overflow-hidden">
        <Suspense fallback={<div className="w-20 bg-[#0C3832] shrink-0" />}>
          <NavigationSidebar />
        </Suspense>

        <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
          <Suspense fallback={<div className="h-16 bg-white border-b border-slate-200" />}>
            <TopNavbar />
          </Suspense>

          <div className="px-4 sm:px-6 lg:px-8 pt-4 pb-0 bg-[#F4F7FB]">
            <Suspense fallback={null}>
              <ModuleSubnav />
            </Suspense>
          </div>

          <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 pb-8 bg-[#F4F7FB]">
            <div className="max-w-7xl mx-auto">
              <Suspense fallback={<FullScreenLoader />}>
                {currentRole === 'ADMIN' ? <PageRouter /> : <StaffPageRouter />}
              </Suspense>
            </div>
          </main>
        </div>

        {/* Role-gated Global Modals & Drawers */}
        <Suspense fallback={null}>
          <ManualDispatchModal />
          <CreateJobModal />
          <ProfileModal />
          <UniversalUserDossierModal />
          <EditUniversalEntityModal />
          <DirectSMSComposerModal />
          <CreateCustomerDrawer />
          <SessionLockModal />

          {currentRole === 'ADMIN' && (
            <>
              <CreateTechnicianDrawer />
              <CreateCategoryDrawer />
              <CreateInvoiceModal />
              <WhiteLabelBrandModal
                isOpen={isWhiteLabelModalOpen}
                onClose={() => setIsWhiteLabelModalOpen(false)}
              />
            </>
          )}

          {isDemoMode && (
            <>
              <MobileSimulatorModal
                isOpen={isMobileSimulatorOpen}
                onClose={() => setIsMobileSimulatorOpen(false)}
              />
              <DispatchSimulatorModal
                isOpen={isDispatchSimulatorOpen}
                onClose={() => setIsDispatchSimulatorOpen(false)}
              />
            </>
          )}
        </Suspense>

        <ToastContainer />
      </div>
    </div>
  );
};

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: import.meta.env.PROD
        ? 'An unexpected interface error occurred. Please reload the console.'
        : error?.message || 'Unexpected application error',
    };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AppErrorBoundary]', error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="max-w-md w-full bg-white rounded-2xl border border-rose-200 shadow-sm p-6 text-center space-y-3">
            <h1 className="text-lg font-extrabold text-slate-900">Something went wrong</h1>
            <p className="text-xs text-slate-600">{this.state.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl cursor-pointer"
            >
              Reload Console
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const App: React.FC = () => {
  return (
    <AppErrorBoundary>
      <LocaleProvider>
        <AdminProvider>
          <AppContent />
        </AdminProvider>
      </LocaleProvider>
    </AppErrorBoundary>
  );
};

export default App;

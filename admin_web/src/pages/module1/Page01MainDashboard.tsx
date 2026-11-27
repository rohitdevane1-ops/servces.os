import React, { useState, useEffect } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { downloadCSV } from '../../utils/exportUtils';
import { apiClient } from '../../services/apiClient';
import { RevealSection, StaggerCard } from '../../components/common/MotionPrimitives';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Briefcase,
  CheckCircle2,
  Clock,
  Calendar,
  TrendingUp,
  Plus,
  RefreshCw,
  ShieldCheck,
  Radio,
  Landmark,
  Smartphone,
  ArrowUpRight,
  Download,
  Layers,
} from 'lucide-react';

function resolveBookingDate(b: any): Date | null {
  const candidates = [b.scheduledStartIso, b.scheduledStart, b.createdAt, b.scheduleDate];
  for (const raw of candidates) {
    if (!raw || typeof raw !== 'string') continue;
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

export const Page01MainDashboard: React.FC = () => {
  const {
    isAuthenticated,
    bookings,
    technicians,
    categories,
    services,
    auditLogs,
    navigateToPage,
    addToast,
    pricingConfig,
    setIsCreateJobModalOpen,
    setIsMobileSimulatorOpen,
    isDemoMode,
    agencyName,
    tenantConfig,
    formatCurrency,
  } = useAdmin();
  const [performanceCycle, setPerformanceCycle] = useState<'weekly' | 'monthly'>('weekly');
  const [timeRange, setTimeRange] = useState<string>('Last 30 Days');
  const [refreshTick, setRefreshTick] = useState<number>(0);
  const [serverMetrics, setServerMetrics] = useState<any>(null);
  const [metricsLoading, setMetricsLoading] = useState<boolean>(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [anchorNow] = useState<number>(() => Date.now());

  // Load authoritative financial metrics from Fastify backend with date filtering
  useEffect(() => {
    if (!isAuthenticated) return;
    let isMounted = true;
    Promise.resolve().then(() => {
      if (isMounted) setMetricsLoading(true);
    });

    const now = new Date();
    let startDate: Date;
    if (timeRange === 'This Month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (timeRange === 'This Quarter') {
      const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
      startDate = new Date(now.getFullYear(), quarterMonth, 1);
    } else if (timeRange === 'Year to Date') {
      startDate = new Date(now.getFullYear(), 0, 1);
    } else {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    apiClient
      .getFinancialOverview({ startDate: startDate.toISOString() })
      .then((res) => {
        if (!isMounted) return;
        if (res.success && res.data) {
          setServerMetrics(res.data);
          setMetricsError(null);
        } else {
          setServerMetrics(null);
          setMetricsError(res.error?.message || 'Server financial metrics unavailable');
        }
        setMetricsLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setServerMetrics(null);
        setMetricsError(err?.message || 'Failed to connect to financial metrics API');
        setMetricsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, timeRange, refreshTick]);

  // Filter bookings truthfully based on the selected date range using ISO dates
  const filteredBookings = React.useMemo(() => {
    const now = new Date(anchorNow);
    let startDate: Date;

    if (timeRange === 'This Month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (timeRange === 'This Quarter') {
      const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
      startDate = new Date(now.getFullYear(), quarterMonth, 1);
    } else if (timeRange === 'Year to Date') {
      startDate = new Date(now.getFullYear(), 0, 1);
    } else {
      startDate = new Date(anchorNow - 30 * 24 * 60 * 60 * 1000);
    }

    return bookings.filter((b) => {
      const d = resolveBookingDate(b);
      return d === null || d >= startDate;
    });
  }, [bookings, timeRange, anchorNow]);

  const totalJobs =
    serverMetrics?.totalInvoicesCount != null
      ? Number(serverMetrics.totalInvoicesCount)
      : filteredBookings.length;
  const completedJobs =
    serverMetrics?.paidInvoicesCount != null
      ? Number(serverMetrics.paidInvoicesCount)
      : filteredBookings.filter((b) => b.status === 'Completed').length;
  const inProgressJobs = filteredBookings.filter((b) => b.status === 'In Progress').length;
  const scheduledOrPendingJobs = filteredBookings.filter(
    (b) => b.status === 'Scheduled' || b.status === 'Pending'
  ).length;
  const pendingQueueCount = filteredBookings.filter((b) => b.status === 'Pending').length;
  const activeTechCount = technicians.filter((t) => t.status === 'Available' || t.status === 'On Job').length;

  const grossRevenue =
    serverMetrics?.grossVolumeCents != null ? Number(serverMetrics.grossVolumeCents) / 100 : 0;
  const settledRevenue =
    serverMetrics?.settledVolumeCents != null ? Number(serverMetrics.settledVolumeCents) / 100 : 0;
  const commission = pricingConfig?.commissionRate || 15;
  const netCommission = grossRevenue * (commission / 100);

  // Weekly / Monthly performance curve derived from ISO booking timestamps
  const currentPerformanceData = React.useMemo(() => {
    const source = filteredBookings.length > 0 ? filteredBookings : bookings;
    if (source.length === 0) return [];

    if (performanceCycle === 'monthly') {
      const weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
      const counts = [0, 0, 0, 0];
      const revenues = [0, 0, 0, 0];

      for (const b of source) {
        const d = resolveBookingDate(b);
        if (d) {
          const wk = Math.min(3, Math.floor((d.getDate() - 1) / 8));
          counts[wk] += 1;
          if (b.paymentStatus === 'Paid' || b.status === 'Completed') {
            revenues[wk] += b.estimate || 0;
          }
        }
      }

      return weeks.map((label, idx) => ({
        name: label,
        thisPeriod: counts[idx],
        revenue: revenues[idx],
      }));
    }

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const counts = [0, 0, 0, 0, 0, 0, 0];
    const revenues = [0, 0, 0, 0, 0, 0, 0];

    for (const b of source) {
      const d = resolveBookingDate(b);
      if (d) {
        const dayIdx = d.getDay();
        counts[dayIdx] += 1;
        if (b.paymentStatus === 'Paid' || b.status === 'Completed') {
          revenues[dayIdx] += b.estimate || 0;
        }
      }
    }

    const orderedIndices = [1, 2, 3, 4, 5, 6, 0];
    return orderedIndices.map((idx) => ({
      name: days[idx],
      thisPeriod: counts[idx],
      revenue: revenues[idx],
    }));
  }, [filteredBookings, bookings, performanceCycle]);

  // Service distribution derived from live bookings + category lookup
  const serviceDistribution = React.useMemo(() => {
    if (categories.length === 0) return [];
    const colors = ['#4F46E5', '#7C3AED', '#0EA5E9', '#10B981', '#F59E0B', '#EC4899'];
    const total = Math.max(1, bookings.length);

    return categories.map((cat, idx) => {
      const catLower = cat.name.toLowerCase();
      const catServices = new Set(
        services
          .filter((s) => s.categoryId === cat.id || s.category.toLowerCase() === catLower)
          .map((s) => s.name.toLowerCase())
      );

      const count = bookings.filter((b) => {
        const directCat = (b.category || '').toLowerCase();
        if (directCat && directCat !== 'general' && directCat === catLower) return true;
        return catServices.has((b.serviceName || '').toLowerCase());
      }).length;

      const pct = bookings.length > 0 ? Math.round((count / total) * 100) : 0;
      return {
        name: cat.name,
        value: pct,
        jobs: count,
        color: colors[idx % colors.length],
      };
    });
  }, [categories, services, bookings]);

  const sortedDistribution = React.useMemo(
    () => [...serviceDistribution].sort((a, b) => b.jobs - a.jobs),
    [serviceDistribution]
  );

  return (
    <div className="space-y-6">
      {/* 1. Executive Command Center Hero Header */}
      <RevealSection className="rounded-3xl bg-white border border-slate-200/90 p-5 sm:p-6 shadow-xs relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-indigo-500/[0.06] blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                {agencyName || 'ServiceOS Command'}
              </span>
              {metricsLoading ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Syncing ledger...
                </span>
              ) : !metricsError && serverMetrics ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Ledger Live • Gross {formatCurrency(grossRevenue, serverMetrics?.currency)} • Settled{' '}
                  {formatCurrency(settledRevenue, serverMetrics?.currency)}
                </span>
              ) : (
                <button
                  onClick={() => setRefreshTick((t) => t + 1)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  Sync Ledger
                </button>
              )}
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Executive Overview</h1>
            <p className="text-xs text-slate-500 max-w-2xl">
              Unified dispatch telemetry, double-entry escrow settlement, and workforce performance across{' '}
              {categories.length || 0} service domains.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <select
              value={timeRange}
              onChange={(e) => {
                setTimeRange(e.target.value);
                addToast(`Dashboard metrics recalculated for ${e.target.value}`, 'info');
              }}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option>Last 30 Days</option>
              <option>This Month</option>
              <option>This Quarter</option>
              <option>Year to Date</option>
            </select>

            <button
              onClick={() => {
                downloadCSV(
                  'executive_summary_report',
                  ['Operational Metric', 'Performance Value'],
                  [
                    ['Total Job Orders', String(totalJobs)],
                    ['Completed Jobs', String(completedJobs)],
                    ['Active In-Progress', String(inProgressJobs)],
                    ['Active On-Duty Technicians', String(activeTechCount)],
                    ['Gross Service Revenue', formatCurrency(grossRevenue, serverMetrics?.currency)],
                    [`Platform Net Margin (${commission}%)`, formatCurrency(netCommission, serverMetrics?.currency)],
                  ]
                );
                addToast('Executive Summary Report downloaded as CSV spreadsheet!', 'success');
              }}
              className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={() => setIsCreateJobModalOpen(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm shadow-indigo-500/20 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Order</span>
            </button>
          </div>
        </div>
      </RevealSection>

      {/* 2. Cohesive 4-KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StaggerCard
          index={0}
          className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs serviceos-card-glow flex items-center justify-between gap-4"
        >
          <div className="space-y-1">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Orders</div>
            <div className="text-2xl font-black text-slate-900 tabular-nums">{totalJobs.toLocaleString()}</div>
            <div className="text-[11px] font-semibold text-indigo-600">
              {totalJobs > 0 ? `${filteredBookings.length} in selected window` : 'No orders logged'}
            </div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200/70 flex items-center justify-center shrink-0">
            <Briefcase className="w-5 h-5" />
          </div>
        </StaggerCard>

        <StaggerCard
          index={1}
          className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs serviceos-card-glow flex items-center justify-between gap-4"
        >
          <div className="space-y-1">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Completed &amp; Paid</div>
            <div className="text-2xl font-black text-slate-900 tabular-nums">{completedJobs.toLocaleString()}</div>
            <div className="text-[11px] font-semibold text-emerald-600">
              {totalJobs > 0 ? `${Math.round((completedJobs / totalJobs) * 100)}% completion rate` : '0 verified jobs'}
            </div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/70 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </StaggerCard>

        <StaggerCard
          index={2}
          className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs serviceos-card-glow flex items-center justify-between gap-4"
        >
          <div className="space-y-1">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">In Progress</div>
            <div className="text-2xl font-black text-slate-900 tabular-nums">{inProgressJobs.toLocaleString()}</div>
            <div className="text-[11px] font-semibold text-amber-600">
              {inProgressJobs > 0 ? `${inProgressJobs} active on site` : 'No active field work'}
            </div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 border border-amber-200/70 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
        </StaggerCard>

        <StaggerCard
          index={3}
          className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs serviceos-card-glow flex items-center justify-between gap-4"
        >
          <div className="space-y-1">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Queued &amp; Scheduled</div>
            <div className="text-2xl font-black text-slate-900 tabular-nums">
              {scheduledOrPendingJobs.toLocaleString()}
            </div>
            <div className="text-[11px] font-semibold text-violet-600">
              {pendingQueueCount > 0 ? `${pendingQueueCount} awaiting dispatch` : 'Dispatch queue clear'}
            </div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-violet-50 text-violet-600 border border-violet-200/70 flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
        </StaggerCard>
      </div>

      {/* 3. Structured 3-Column Quick-Action CTA Cards */}
      <RevealSection delay={0.04} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={() => navigateToPage(2)}
          className="group text-left bg-white rounded-2xl p-5 border border-slate-200/90 hover:border-indigo-300 shadow-2xs serviceos-card-glow flex flex-col justify-between gap-4 cursor-pointer"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200/70 flex items-center justify-center shrink-0">
              <Radio className="w-5 h-5" />
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/70">
              {activeTechCount} Pros Online
            </span>
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 group-hover:text-indigo-600 transition-colors">
              Live Dispatch Radar
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Track PostGIS technician routes, geofence arrivals, and broadcast pending orders.
            </p>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs font-bold text-indigo-600">
            <span>Open Radar Console</span>
            <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigateToPage(25)}
          className="group text-left bg-white rounded-2xl p-5 border border-slate-200/90 hover:border-indigo-300 shadow-2xs serviceos-card-glow flex flex-col justify-between gap-4 cursor-pointer"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/70 flex items-center justify-center shrink-0">
              <Landmark className="w-5 h-5" />
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/70">
              {commission}% Margin
            </span>
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 group-hover:text-indigo-600 transition-colors">
              Escrow &amp; Double-Entry Ledger
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Net commission {formatCurrency(netCommission, serverMetrics?.currency)} earned across verified settlements.
            </p>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs font-bold text-indigo-600">
            <span>Inspect Finance Suite</span>
            <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
        </button>

        {isDemoMode ? (
          <button
            type="button"
            onClick={() => setIsMobileSimulatorOpen(true)}
            className="group text-left bg-gradient-to-br from-[#0F172A] via-[#1E1B4B] to-[#312E81] text-white rounded-2xl p-5 border border-indigo-500/30 shadow-md serviceos-card-glow flex flex-col justify-between gap-4 cursor-pointer"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 text-indigo-300 border border-white/15 flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-indigo-200 border border-white/15">
                22 Screens
              </span>
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-white">Interactive Mobile Suite Preview</h3>
              <p className="text-xs text-slate-300 mt-1">
                Test both Customer Discovery and Technician Pro workflows live inside the browser.
              </p>
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-white/10 text-xs font-bold text-indigo-300">
              <span>Launch Mobile Simulator</span>
              <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => navigateToPage(14)}
            className="group text-left bg-white rounded-2xl p-5 border border-slate-200/90 hover:border-indigo-300 shadow-2xs serviceos-card-glow flex flex-col justify-between gap-4 cursor-pointer"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 border border-violet-200/70 flex items-center justify-center shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-200/70">
                {services.length} Services
              </span>
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 group-hover:text-indigo-600 transition-colors">
                Service Catalog &amp; Pricing
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Configure categories, regional base rates, tax rules, and surge pricing controls.
              </p>
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs font-bold text-indigo-600">
              <span>Manage Catalog</span>
              <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
          </button>
        )}
      </RevealSection>

      {/* 4. Business Performance Chart + Service Distribution Donut */}
      <RevealSection delay={0.08} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-2xs serviceos-card-glow space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-slate-900 tracking-tight">Business Performance</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/70">
                  Real-Time Analytics
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Order volume and escrow settlements aggregated across{' '}
                {performanceCycle === 'weekly' ? 'weekdays' : 'monthly weeks'}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center p-0.5 bg-slate-100 rounded-xl">
                <button
                  onClick={() => setPerformanceCycle('weekly')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    performanceCycle === 'weekly'
                      ? 'bg-white text-indigo-700 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Weekly
                </button>
                <button
                  onClick={() => setPerformanceCycle('monthly')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    performanceCycle === 'monthly'
                      ? 'bg-white text-indigo-700 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Monthly
                </button>
              </div>
            </div>
          </div>

          <div className="h-64 w-full pt-2">
            {currentPerformanceData.length === 0 ? (
              <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center border-2 border-dashed border-slate-200/80 rounded-2xl bg-slate-50/50">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-2.5">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-extrabold text-slate-800">No Performance Data Recorded</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  Analytics and revenue curves populate automatically as customer orders are scheduled and completed.
                </p>
                <button
                  onClick={() => setIsCreateJobModalOpen(true)}
                  className="mt-3.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create First Order</span>
                </button>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={currentPerformanceData} margin={{ top: 15, right: 15, left: -15, bottom: 0 }}>
                  <defs>
                    <linearGradient id="realThisPeriodGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.32} />
                      <stop offset="95%" stopColor="#7C3AED" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" strokeOpacity={0.6} />
                  <XAxis
                    dataKey="name"
                    stroke="#94A3B8"
                    fontSize={11}
                    fontWeight={600}
                    tickLine={false}
                    axisLine={{ stroke: '#E2E8F0' }}
                  />
                  <YAxis
                    stroke="#94A3B8"
                    fontSize={11}
                    fontWeight={600}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const current = (payload.find((p: any) => p.dataKey === 'thisPeriod')?.value as number) || 0;
                        const rev = payload[0]?.payload?.revenue || 0;

                        return (
                          <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-xl border border-slate-700/80 text-xs space-y-1.5 min-w-[200px]">
                            <div className="flex items-center justify-between border-b border-slate-700/60 pb-1.5">
                              <span className="font-extrabold text-slate-200">{label}</span>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                                Work Orders
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-slate-200">
                              <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                                Total Orders:
                              </span>
                              <span className="font-extrabold text-white">{current.toLocaleString()} Jobs</span>
                            </div>
                            <div className="pt-1.5 border-t border-slate-800 text-[11px] text-emerald-400 font-bold flex items-center justify-between">
                              <span>Settled Volume:</span>
                              <span>{formatCurrency(rev, serverMetrics?.currency || tenantConfig.currencyCode)}</span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="thisPeriod"
                    stroke="#4F46E5"
                    strokeWidth={3}
                    fill="url(#realThisPeriodGradient)"
                    activeDot={{ r: 6, fill: '#4F46E5', stroke: '#FFFFFF', strokeWidth: 3 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="lg:col-span-4 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-2xs serviceos-card-glow space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight">Service Distribution</h2>
              <p className="text-xs text-slate-500 mt-0.5">Volume share by category</p>
            </div>
            <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/70 px-2.5 py-0.5 rounded-lg">
              {bookings.length} Orders
            </span>
          </div>

          <div className="h-44 w-full relative flex items-center justify-center">
            {sortedDistribution.length === 0 ? (
              <div className="h-full w-full flex flex-col items-center justify-center p-4 text-center border-2 border-dashed border-slate-200/80 rounded-2xl bg-slate-50/50">
                <Briefcase className="w-8 h-8 text-slate-300 mb-1.5" />
                <h4 className="text-xs font-bold text-slate-700">No Categories Found</h4>
                <p className="text-[11px] text-slate-500 mt-0.5 max-w-[200px]">
                  Create service categories in Service Management
                </p>
                <button
                  onClick={() => navigateToPage(14)}
                  className="mt-2.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] rounded-lg cursor-pointer"
                >
                  Configure Services
                </button>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sortedDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={76}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {sortedDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} stroke="var(--so-surface)" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-slate-900/95 backdrop-blur-md text-white p-2.5 rounded-xl shadow-lg border border-slate-700 text-xs">
                              <div className="font-bold text-slate-200">{data.name}</div>
                              <div className="text-indigo-300 font-extrabold mt-0.5">
                                {data.value}% • {data.jobs} Bookings
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-8 text-center">
                  <span className="text-2xl font-black text-slate-900 leading-tight">
                    {sortedDistribution[0]?.value || 0}%
                  </span>
                  <span className="text-[9.5px] font-bold text-indigo-600 uppercase tracking-wider truncate max-w-[84px]">
                    {sortedDistribution[0]?.name || 'Primary'}
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
            {sortedDistribution.length === 0 ? (
              <div className="text-center py-2 text-slate-400 text-[11px]">No category breakdown available.</div>
            ) : (
              sortedDistribution.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-slate-600 font-medium truncate">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }}></span>
                    <span className="truncate">{item.name}</span>
                  </span>
                  <div className="flex items-center gap-2 shrink-0 tabular-nums">
                    <span className="text-[11px] text-slate-400">{item.jobs} jobs</span>
                    <span className="font-extrabold text-slate-900 w-8 text-right">{item.value}%</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </RevealSection>

      {/* 5. Recent Activities + Top Technicians */}
      <RevealSection delay={0.14} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs serviceos-card-glow space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">Recent Activities</h2>
            <button
              onClick={() => navigateToPage(3)}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
            >
              View All →
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {auditLogs.length === 0 && bookings.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No recent activity logged yet. Operational events, dispatches, and job status updates will appear here.
              </div>
            ) : (
              (auditLogs.length > 0
                ? auditLogs
                : bookings.map((b) => ({
                    id: b.id,
                    action: b.status === 'Completed' ? 'Completed Order' : `${b.status} • ${b.jobNo}`,
                    details: `${b.serviceName} for ${b.customerName}`,
                    timestamp: b.scheduleDate || 'Today',
                  }))
              )
                .slice(0, 4)
                .map((log: any) => (
                  <div key={log.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-200/60 shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">{log.action || 'Activity'}</div>
                        <div className="text-[11px] text-slate-500 truncate">{log.details || log.module}</div>
                      </div>
                    </div>
                    <span className="text-[11px] text-slate-400 font-medium shrink-0">{log.timestamp}</span>
                  </div>
                ))
            )}
          </div>
        </div>

        <div className="lg:col-span-5 bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs serviceos-card-glow space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">Top Technicians</h2>
            <button
              onClick={() => navigateToPage(22)}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
            >
              View All →
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {technicians.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No technicians registered. Onboard technicians in Fleet Management to track performance.
              </div>
            ) : (
              technicians.slice(0, 4).map((tech) => (
                <div key={tech.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {tech.photo ? (
                      <img
                        src={tech.photo}
                        alt={tech.name}
                        className="w-10 h-10 rounded-xl object-cover border border-slate-200"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200/70 font-bold flex items-center justify-center text-xs shrink-0">
                        {tech.name.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">{tech.name}</div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {tech.specialization} • {tech.jobsCompleted} Jobs
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs font-bold text-emerald-600">↑ {tech.onTimeRate}%</div>
                    <div className="text-[10px] text-slate-400">On-Time SLA</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </RevealSection>
    </div>
  );
};

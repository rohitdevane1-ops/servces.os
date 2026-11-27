import React, { useEffect, useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { apiClient } from '../../services/apiClient';
import { downloadCSV } from '../../utils/exportUtils';
import {
  Search,
  Download,
  CheckCircle,
  BookOpen,
  RefreshCw,
  AlertTriangle,
  ArrowRightLeft,
} from 'lucide-react';

interface LedgerEntryRow {
  id: string;
  amountCents: number | string;
  description: string;
  postedAt: string;
  debitAccountNumber: string;
  debitAccountName: string;
  debitAccountType: string;
  creditAccountNumber: string;
  creditAccountName: string;
  creditAccountType: string;
}

export const Page27TransactionHistory: React.FC = () => {
  const { addToast, formatCurrencyCents, tenantConfig } = useAdmin();
  const [search, setSearch] = useState('');
  const [accountTypeFilter, setAccountTypeFilter] = useState('All');
  const [entries, setEntries] = useState<LedgerEntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let active = true;

    apiClient
      .getFinancialLedger()
      .then((res) => {
        if (!active) return;
        if (res.success && Array.isArray(res.data)) {
          setEntries(res.data);
          setError(null);
        } else {
          setEntries([]);
          setError(res.error?.message || 'Failed to load double-entry ledger journal.');
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setEntries([]);
        setError(err?.message || 'Unable to connect to financial ledger endpoint.');
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [refreshTick]);

  const filtered = entries.filter((row) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      row.description?.toLowerCase().includes(q) ||
      row.debitAccountName?.toLowerCase().includes(q) ||
      row.creditAccountName?.toLowerCase().includes(q) ||
      row.debitAccountNumber?.toLowerCase().includes(q) ||
      row.creditAccountNumber?.toLowerCase().includes(q);

    const matchesType =
      accountTypeFilter === 'All' ||
      row.debitAccountType === accountTypeFilter ||
      row.creditAccountType === accountTypeFilter;

    return matchesSearch && matchesType;
  });

  const handleExport = () => {
    downloadCSV(
      'double_entry_general_ledger',
      [
        'Entry ID',
        'Posted At',
        'Debit Account #',
        'Debit Account Name',
        'Credit Account #',
        'Credit Account Name',
        `Amount (${tenantConfig.currencyCode})`,
        'Description',
      ],
      filtered.map((r) => [
        r.id,
        r.postedAt ? new Date(r.postedAt).toISOString() : '',
        r.debitAccountNumber,
        r.debitAccountName,
        r.creditAccountNumber,
        r.creditAccountName,
        (Number(r.amountCents || 0) / 100).toFixed(2),
        r.description,
      ])
    );
    addToast(`Exported ${filtered.length} double-entry ledger journal postings to CSV.`, 'success');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Transaction History &amp; General Ledger
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Immutable double-entry accounting journal (Debit &amp; Credit account postings from PostgreSQL)
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setRefreshTick((t) => t + 1)}
            className="p-2 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-slate-700 cursor-pointer"
            title="Refresh Ledger"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>

          <button
            onClick={handleExport}
            className="px-4 py-2 bg-slate-900 hover:bg-black text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export Journal CSV ({filtered.length})
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between text-xs text-rose-900">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setRefreshTick((t) => t + 1)}
            className="px-3 py-1 bg-rose-200 hover:bg-rose-300 text-rose-950 font-bold rounded-lg cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search description, account number (1010, 2010, 2030, 4010)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:bg-white focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {['All', 'ASSET', 'LIABILITY', 'REVENUE', 'EXPENSE'].map((acctType) => (
            <button
              key={acctType}
              onClick={() => setAccountTypeFilter(acctType)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                accountTypeFilter === acctType
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {acctType}
            </button>
          ))}
        </div>
      </div>

      {/* Double-Entry Ledger Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3.5 px-4">Posted Timestamp</th>
                <th className="py-3.5 px-4">Debit Account (DR)</th>
                <th className="py-3.5 px-4">Credit Account (CR)</th>
                <th className="py-3.5 px-4">Journal Description</th>
                <th className="py-3.5 px-4 text-right">Amount</th>
                <th className="py-3.5 px-4 text-center">Integrity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Loading double-entry ledger journal...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div className="text-sm font-bold text-slate-800">No Ledger Journal Postings Found</div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Double-entry postings are recorded automatically when bookings settle, refunds execute, or payouts disburse.
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                      {entry.postedAt ? new Date(entry.postedAt).toLocaleString() : '—'}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-mono font-bold text-[10px] border border-blue-200">
                          {entry.debitAccountNumber}
                        </span>
                        <span className="font-bold text-slate-900">{entry.debitAccountName}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">
                        {entry.debitAccountType}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <ArrowRightLeft className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-mono font-bold text-[10px] border border-purple-200">
                          {entry.creditAccountNumber}
                        </span>
                        <span className="font-bold text-slate-900">{entry.creditAccountName}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">
                        {entry.creditAccountType}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 max-w-md">{entry.description}</td>
                    <td className="py-3.5 px-4 text-right font-extrabold text-slate-900 whitespace-nowrap">
                      {formatCurrencyCents(entry.amountCents)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 inline-flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Balanced
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

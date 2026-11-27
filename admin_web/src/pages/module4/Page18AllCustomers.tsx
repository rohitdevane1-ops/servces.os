import React, { useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { downloadCSV } from '../../utils/exportUtils';
import { 
  Search, 
  UserPlus, 
  MapPin, 
  Eye, 
  Star, 
  Download
} from 'lucide-react';

export const Page18AllCustomers: React.FC = () => {
  const { customers, tenantConfig, formatCurrency, navigateToPage, addToast, setSelectedCustomerId, setIsCreateCustomerModalOpen } = useAdmin();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterTier, setFilterTier] = useState<string>('All');

  const filteredCustomers = customers.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          c.phone.includes(searchQuery) ||
                          c.city.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTier = 
      filterTier === 'All' ? true :
      filterTier === 'VIP' ? c.lifetimeSpend >= 1000 :
      filterTier === 'Frequent' ? c.totalBookings >= 5 :
      c.status === filterTier;

    return matchesSearch && matchesTier;
  });

  return (
    <div className="space-y-6">
      {/* Top Header matching Screenshot 04 Bottom Left */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">All Customers</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
              {customers.length} Verified Accounts
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Manage customer directory, lifetime value metrics, booking frequency, and service addresses</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              downloadCSV('customer_directory', ['ID', 'Name', 'Phone', 'Email', 'Address', 'Total Bookings', `Lifetime Spend (${tenantConfig.currencyCode})`, 'Status'], customers.map(c => [c.id, c.name, c.phone, c.email, c.address, c.totalBookings, c.lifetimeSpend, c.status]));
              addToast('Customer Directory exported to CSV spreadsheet!', 'success');
            }}
            className="px-3.5 py-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-bold text-xs rounded-xl shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>

          <button
            onClick={() => setIsCreateCustomerModalOpen(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
          >
            <UserPlus className="w-4 h-4" />
            Add Customer
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Customer Base</div>
          <div className="text-2xl font-extrabold text-slate-900 mt-0.5">{customers.length}</div>
          <div className="text-[10px] text-emerald-600 font-bold mt-0.5">{customers.length} verified accounts</div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Average Lifetime Value</div>
          <div className="text-2xl font-extrabold text-slate-900 mt-0.5">
            {customers.length > 0 ? formatCurrency(customers.reduce((acc, c) => acc + (c.lifetimeSpend || 0), 0) / customers.length) : formatCurrency(0)}
          </div>
          <div className="text-[10px] text-slate-400 font-bold mt-0.5">
            {customers.length > 0 ? `${(customers.reduce((acc, c) => acc + (c.totalBookings || 0), 0) / customers.length).toFixed(1)} avg bookings` : '0 bookings'}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">VIP Tier Members</div>
          <div className="text-2xl font-extrabold text-purple-700 mt-0.5">
            {customers.filter(c => (c.lifetimeSpend || 0) >= 1000).length} VIPs
          </div>
          <div className="text-[10px] text-purple-600 font-bold mt-0.5">Lifetime spend &gt; {formatCurrency(1000)}</div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Retention Rate</div>
          <div className="text-2xl font-extrabold text-emerald-600 mt-0.5">
            {customers.length > 0 ? `${((customers.filter(c => (c.totalBookings || 0) > 1).length / customers.length) * 100).toFixed(1)}%` : '0.0%'}
          </div>
          <div className="text-[10px] text-emerald-600 font-bold mt-0.5">
            {customers.filter(c => (c.totalBookings || 0) > 1).length} repeat customers
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Search & Filter Bar */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div className="relative w-full max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name, email, phone, city..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center gap-1.5">
            {['All', 'VIP', 'Frequent', 'Active'].map(tier => (
              <button
                key={tier}
                onClick={() => setFilterTier(tier)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  filterTier === tier
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {tier}
              </button>
            ))}
          </div>
        </div>

        {/* Customer Directory Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Contact Info</th>
                <th className="py-3 px-4">Location</th>
                <th className="py-3 px-4">Total Bookings</th>
                <th className="py-3 px-4">Lifetime Spend</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCustomers.map(cust => (
                <tr key={cust.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-900 text-white font-extrabold flex items-center justify-center text-xs">
                        {cust.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-extrabold text-slate-900">{cust.name}</div>
                        <div className="text-[11px] text-amber-600 font-bold flex items-center gap-1 mt-0.5">
                          <Star className="w-3 h-3 fill-current text-amber-500" />
                          ★ {cust.rating}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="py-3.5 px-4">
                    <div className="text-slate-800 font-medium">{cust.email}</div>
                    <div className="text-slate-400 text-[11px] mt-0.5">{cust.phone}</div>
                  </td>

                  <td className="py-3.5 px-4">
                    <div className="text-slate-800 font-medium flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      {cust.city}
                    </div>
                    <div className="text-slate-400 text-[11px] truncate max-w-[150px] mt-0.5">{cust.address}</div>
                  </td>

                  <td className="py-3.5 px-4 font-extrabold text-slate-900">
                    {cust.totalBookings} Jobs
                  </td>

                  <td className="py-3.5 px-4 font-extrabold text-emerald-700 text-sm">
                    ${cust.lifetimeSpend.toLocaleString()}
                  </td>

                  <td className="py-3.5 px-4">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      cust.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {cust.status}
                    </span>
                  </td>

                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={() => {
                        setSelectedCustomerId(cust.id);
                        navigateToPage(19);
                      }}
                      className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                      title={`View ${cust.name} Profile Dossier`}
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

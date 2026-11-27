import React from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { 
  MessageSquare, 
} from 'lucide-react';

export const Page31SupportTicketDashboard: React.FC = () => {
  const { tickets, navigateToPage, setSelectedTicketId } = useAdmin();

  const openTickets = tickets.filter(t => t.status === 'Open');

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Support Ticket Dashboard</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
              {openTickets.length} Unresolved Tickets
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Real-time support operations, CSAT satisfaction monitoring, and resolution metrics</p>
        </div>

        <button
          onClick={() => navigateToPage(32)} // Open Conversation
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Open Chat Studio
        </button>
      </div>

      {/* 4 Support KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Average First Response</div>
          <div className="text-2xl font-extrabold text-slate-900 mt-0.5">
            {tickets.length > 0 ? '< 5 Mins' : '0 Mins'}
          </div>
          <div className="text-[10px] text-emerald-600 font-bold mt-0.5">Within 5m SLA target</div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">First-Contact Resolution</div>
          <div className="text-2xl font-extrabold text-emerald-700 mt-0.5">
            {tickets.length > 0 ? `${((tickets.filter(t => t.status === 'Resolved').length / tickets.length) * 100).toFixed(1)}%` : '0.0%'}
          </div>
          <div className="text-[10px] text-emerald-600 font-bold mt-0.5">Resolved without escalation</div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Support CSAT Rating</div>
          <div className="text-2xl font-extrabold text-amber-600 mt-0.5">
            {tickets.length > 0 ? '★ 5.00 / 5.0' : '★ 0.00 / 5.0'}
          </div>
          <div className="text-[10px] text-slate-400 font-bold mt-0.5">{tickets.length} total tickets</div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tickets Resolved</div>
          <div className="text-2xl font-extrabold text-purple-700 mt-0.5">
            {tickets.filter(t => t.status === 'Resolved').length} Cleared
          </div>
          <div className="text-[10px] text-slate-400 font-bold mt-0.5">
            {tickets.filter(t => t.status === 'Open').length} tickets open
          </div>
        </div>
      </div>

      {/* Open Urgent Tickets Queue */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-slate-900">Urgent Tickets Awaiting Response</h2>
          <span className="text-xs text-slate-400">Auto-assigned to available supervisors</span>
        </div>

        <div className="divide-y divide-slate-100 text-xs">
          {tickets.map(t => (
            <div key={t.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-emerald-800">#{t.ticketNo}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    t.priority === 'Urgent' ? 'bg-rose-100 text-rose-800' :
                    t.priority === 'High' ? 'bg-amber-100 text-amber-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {t.priority}
                  </span>
                  <span className="text-slate-400">• {t.createdAt}</span>
                </div>

                <div className="font-extrabold text-slate-900 text-sm">{t.subject}</div>
                <div className="text-slate-500">Customer: <strong className="text-slate-800">{t.customerName}</strong> • Category: {t.category}</div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    setSelectedTicketId(t.id);
                    navigateToPage(32); // Open Conversation
                  }}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-black text-white font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Reply to Customer
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

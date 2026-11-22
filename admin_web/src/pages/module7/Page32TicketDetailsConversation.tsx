import React, { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { apiClient } from '../../services/apiClient';
import { ArrowLeft, Send, CheckCircle, User, ShieldCheck, RefreshCw } from 'lucide-react';

interface ServerTicketMessage {
  id: string;
  senderId: string;
  senderEmail: string;
  senderRole: string;
  messageBody: string;
  attachmentsUrls: string[];
  createdAt: string;
}

export const Page32TicketDetailsConversation: React.FC = () => {
  const { navigateToPage, addToast, tickets, selectedTicketId, setSelectedTicketId, updateTicketStatus } = useAdmin();
  const activeTicketSummary = tickets.find((t) => t.id === selectedTicketId) || tickets[0];

  const [ticketDetail, setTicketDetail] = useState<any | null>(null);
  const [messages, setMessages] = useState<ServerTicketMessage[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [replyText, setReplyText] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);

  const loadThread = useCallback(async (ticketId: string) => {
    setLoading(true);
    const res = await apiClient.getTicket(ticketId);
    if (res.success && res.data) {
      setTicketDetail(res.data);
      setMessages(Array.isArray(res.data.messages) ? res.data.messages : []);
    } else {
      setTicketDetail(null);
      setMessages([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const ticketId = activeTicketSummary?.id;
    if (!ticketId) return;
    let active = true;
    Promise.resolve().then(() => {
      if (active) void loadThread(ticketId);
    });
    return () => {
      active = false;
    };
  }, [activeTicketSummary?.id, loadThread]);

  if (!activeTicketSummary) {
    return (
      <div className="bg-white rounded-2xl p-12 border border-slate-200/80 text-center space-y-4">
        <div className="text-lg font-extrabold text-slate-900">No Support Ticket Selected</div>
        <p className="text-xs text-slate-500">
          Select an open or resolved support ticket from the Support Ticket Dashboard to view the conversation thread.
        </p>
        <button
          onClick={() => navigateToPage(31)}
          className="px-4 py-2 bg-slate-900 text-white font-bold text-xs rounded-xl cursor-pointer"
        >
          â† Back to Ticket Dashboard
        </button>
      </div>
    );
  }

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    setIsSending(true);
    const res = await apiClient.postTicketMessage(activeTicketSummary.id, replyText.trim());
    setIsSending(false);
    if (!res.success) {
      addToast(res.error?.message || 'Failed to send reply.', 'error');
      return;
    }
    setReplyText('');
    addToast(`Reply posted to Ticket #${activeTicketSummary.ticketNo}.`, 'success');
    await loadThread(activeTicketSummary.id);
  };

  const handleResolveToggle = async () => {
    const nextStatus = activeTicketSummary.status === 'Resolved' ? 'Open' : 'Resolved';
    await updateTicketStatus(activeTicketSummary.id, nextStatus);
    await loadThread(activeTicketSummary.id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigateToPage(31)}
            className="p-2 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-slate-600 shadow-2xs transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Ticket #{activeTicketSummary.ticketNo}
              </h1>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  activeTicketSummary.status === 'Resolved'
                    ? 'bg-emerald-100 text-emerald-800'
                    : activeTicketSummary.status === 'In Progress'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-rose-100 text-rose-800'
                }`}
              >
                {activeTicketSummary.status}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {activeTicketSummary.subject} â€¢ Customer: {activeTicketSummary.customerName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={activeTicketSummary.id}
            onChange={(e) => setSelectedTicketId(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 cursor-pointer"
          >
            {tickets.map((t) => (
              <option key={t.id} value={t.id}>
                #{t.ticketNo} â€” {t.customerName}
              </option>
            ))}
          </select>

          <button
            onClick={() => void loadThread(activeTicketSummary.id)}
            className="p-2 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-slate-600 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>

          <button
            onClick={() => void handleResolveToggle()}
            className={`px-4 py-2 font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTicketSummary.status === 'Resolved'
                ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            <CheckCircle className="w-3.5 h-3.5" />
            {activeTicketSummary.status === 'Resolved' ? 'Reopen Ticket' : 'Mark Ticket as Resolved'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Conversation Feed */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between overflow-hidden">
          <div className="p-6 space-y-4 max-h-[460px] overflow-y-auto">
            {loading ? (
              <div className="py-12 text-center text-xs text-slate-400">
                Loading ticket conversation thread...
              </div>
            ) : messages.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No messages posted on this ticket yet. Send a reply below.
              </div>
            ) : (
              messages.map((msg) => {
                const isSupport = msg.senderRole === 'ADMIN' || msg.senderRole === 'STAFF';
                return (
                  <div key={msg.id} className={`flex flex-col ${isSupport ? 'items-end' : 'items-start'}`}>
                    <div className="text-[11px] font-bold text-slate-400 mb-1 px-1">
                      {msg.senderEmail} ({msg.senderRole}) â€¢{' '}
                      {msg.createdAt ? new Date(msg.createdAt).toLocaleString() : ''}
                    </div>
                    <div
                      className={`max-w-lg p-4 rounded-2xl text-xs leading-relaxed ${
                        isSupport
                          ? 'bg-emerald-600 text-white rounded-br-none shadow-xs'
                          : 'bg-slate-100 text-slate-800 rounded-bl-none border border-slate-200'
                      }`}
                    >
                      {msg.messageBody}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <form onSubmit={handleSendReply} className="p-4 bg-slate-50 border-t border-slate-100 flex items-center gap-3">
            <input
              type="text"
              placeholder={`Write response to ${activeTicketSummary.customerName}...`}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={isSending || !replyText.trim()}
              className="px-4 py-2.5 bg-slate-900 hover:bg-black disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              {isSending ? 'Sending...' : 'Send Reply'}
            </button>
          </form>
        </div>

        {/* Customer Context Card */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Ticket &amp; Customer Context</h3>

            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-slate-900 text-white font-extrabold flex items-center justify-center">
                <User className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-extrabold text-slate-900">{activeTicketSummary.customerName}</div>
                <div className="text-xs text-slate-500">
                  {ticketDetail?.customerEmail || activeTicketSummary.category}
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Ticket Number:</span>
                <span className="font-mono font-bold text-slate-800">#{activeTicketSummary.ticketNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Linked Booking:</span>
                <span className="font-mono font-bold text-slate-800">
                  {ticketDetail?.bookingReference || 'General Inquiry'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Priority Level:</span>
                <span className="font-bold text-rose-700">{activeTicketSummary.priority}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Resolution Status:</span>
                <span className="font-bold text-emerald-700 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> {activeTicketSummary.status}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

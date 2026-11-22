import React, { useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { 
  MessageSquare, 
  Send, 
  Phone, 
  User, 
  CheckCheck
} from 'lucide-react';

interface ChatMsg {
  id: number;
  sender: 'customer' | 'staff';
  text: string;
  time: string;
}

const INITIAL_CONVERSATIONS: Record<string, ChatMsg[]> = {};

export const StaffCustomerComm: React.FC = () => {
  const { customers, addToast, openUserDossier } = useAdmin();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(customers[0]?.id || '');
  const [messageText, setMessageText] = useState('');
  const [conversations, setConversations] = useState<Record<string, ChatMsg[]>>(INITIAL_CONVERSATIONS);

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId) || customers[0] || null;

  const activeMessages = selectedCustomer && conversations[selectedCustomer.id] ? conversations[selectedCustomer.id] : (selectedCustomer ? [
    { 
      id: 1, 
      sender: 'staff' as const, 
      text: `Direct operational channel open with ${selectedCustomer.name}. Type below to dispatch updates to their mobile device or SMS.`, 
      time: 'Ready' 
    }
  ] : []);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !selectedCustomer) return;

    const newMsg: ChatMsg = {
      id: Date.now(),
      sender: 'staff',
      text: messageText.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setConversations(prev => ({
      ...prev,
      [selectedCustomer.id]: [...(prev[selectedCustomer.id] || []), newMsg]
    }));

    setMessageText('');
    addToast(`SMS notification sent to ${selectedCustomer.name}`, 'success');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Customer Communication Desk</h1>
        <p className="text-xs text-slate-500 mt-1">
          Direct operational line with customers regarding order time slots, gate access codes, and technician arrivals.
        </p>
      </div>

      {/* Main Grid: Customer List + Chat Studio */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Customer Roster */}
        <div className="bg-white rounded-2xl p-4.5 border border-slate-200/80 shadow-xs flex flex-col h-[560px]">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide mb-3 pb-2 border-b border-slate-100">
            Active Order Conversations
          </h2>

          <div className="space-y-2 overflow-y-auto thin-scrollbar pr-1 flex-1">
            {customers.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                <MessageSquare className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="font-bold text-slate-700">No Customers Registered</p>
                <p className="text-[11px] text-slate-400 mt-1">Direct communications appear when customer records are created.</p>
              </div>
            ) : (
              customers.map(c => {
                const isSelected = selectedCustomer?.id === c.id;
                const initials = c.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'CU';
                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedCustomerId(c.id)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/40 ring-2 ring-emerald-500/20'
                        : 'border-slate-200/80 hover:border-slate-300 bg-white'
                    }`}
                  >
                    {c.photo ? (
                      <img
                        src={c.photo}
                        alt={c.name}
                        className="w-10 h-10 rounded-full object-cover border border-slate-200"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-xs shrink-0 border border-emerald-200">
                        {initials}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-900 truncate">{c.name}</div>
                      <div className="text-[10px] text-slate-500 truncate">{c.phone || 'No phone recorded'}</div>
                      <div className="text-[10px] text-emerald-700 font-semibold">{c.city || 'Primary Territory'}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Chat Studio */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col h-[560px] overflow-hidden">
          {selectedCustomer ? (
            <>
              {/* Header */}
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  {selectedCustomer.photo ? (
                    <img
                      src={selectedCustomer.photo}
                      alt={selectedCustomer.name}
                      className="w-10 h-10 rounded-full object-cover border border-slate-200"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-xs shrink-0 border border-emerald-200">
                      {selectedCustomer.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'CU'}
                    </div>
                  )}
                  <div>
                    <div className="text-xs font-bold text-slate-900">{selectedCustomer.name}</div>
                    <div className="text-[10px] text-slate-500">{selectedCustomer.phone || 'No phone'} â€¢ {selectedCustomer.address || 'No address specified'}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openUserDossier('customer', selectedCustomer.id)}
                    className="px-3 py-1.5 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 font-bold text-xs hover:bg-emerald-100 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <User className="w-3.5 h-3.5 text-emerald-600" />
                    <span>View Full Profile</span>
                  </button>
                  <button
                    onClick={() => {
                      if (!selectedCustomer.phone) {
                        addToast('Customer has no phone number on file', 'error');
                        return;
                      }
                      window.open(`tel:${selectedCustomer.phone.replace(/[^0-9+]/g, '')}`);
                      addToast(`Initiating direct call to ${selectedCustomer.name} (${selectedCustomer.phone})...`, 'info');
                    }}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-xs hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>Call Phone</span>
                  </button>
                </div>
              </div>

              {/* Messages Feed */}
              <div className="flex-1 p-4 overflow-y-auto thin-scrollbar space-y-3 bg-[#F8FAFC]">
                {activeMessages.map(msg => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.sender === 'staff' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-md p-3.5 rounded-2xl text-xs leading-relaxed ${
                        msg.sender === 'staff'
                          ? 'bg-[#0C3832] text-white rounded-tr-xs'
                          : 'bg-white text-slate-800 border border-slate-200/80 shadow-2xs rounded-tl-xs'
                      }`}
                    >
                      {msg.text}
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 px-1 flex items-center gap-1">
                      <span>{msg.time}</span>
                      {msg.sender === 'staff' && <CheckCheck className="w-3 h-3 text-emerald-600" />}
                    </span>
                  </div>
                ))}
              </div>

              {/* Input Bar */}
              <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-200 bg-white flex items-center gap-2">
                <input
                  type="text"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Type message to customer (dispatched via Twilio SMS & Mobile App)..."
                  className="flex-1 px-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 text-slate-800"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#0C3832] hover:bg-[#124e45] text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5 text-amber-300" />
                  <span>Send</span>
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
              <MessageSquare className="w-12 h-12 text-slate-300 mb-3" />
              <h3 className="text-sm font-bold text-slate-700">No Active Customer Conversation</h3>
              <p className="text-xs text-slate-400 max-w-sm mt-1">
                Select a customer from the roster on the left or wait for new inbound inquiries from the mobile app.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

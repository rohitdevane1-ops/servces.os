import React, { useState, useEffect } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { apiClient } from '../../services/apiClient';
import { Modal } from '../common/Modal';
import { 
  Send, 
  MessageSquare, 
  Sparkles,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';

const QUICK_TEMPLATES = [
  "Technician is currently en route to your property (ETA ~12 mins).",
  "Service visit completed. Your digital signed receipt has been emailed.",
  "Operations Notice: Please reply with your gate access code or arrival instructions.",
  "Emergency Dispatch Notice: A licensed technician has been assigned to your ticket."
];

export const DirectSMSComposerModal: React.FC = () => {
  const { isSMSModalOpen, closeSMSModal, smsRecipient, addToast } = useAdmin();
  const [message, setMessage] = useState(QUICK_TEMPLATES[0]);
  const [isSending, setIsSending] = useState(false);
  const [isTwilioConfigured, setIsTwilioConfigured] = useState(false);

  useEffect(() => {
    let active = true;
    if (isSMSModalOpen) {
      apiClient.getIntegrations().then(res => {
        if (!active) return;
        if (res.success && res.data) {
          const sid = String(res.data.publicSettings?.twilioSid || '');
          setIsTwilioConfigured(Boolean(res.data.twilioEnabled || sid.trim()));
        } else {
          setIsTwilioConfigured(false);
        }
      }).catch(() => {
        if (active) setIsTwilioConfigured(false);
      });
    }
    return () => {
      active = false;
    };
  }, [isSMSModalOpen]);

  if (!isSMSModalOpen || !smsRecipient) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      addToast('Please enter an SMS message body', 'warning');
      return;
    }

    setIsSending(true);
    try {
      const res = await apiClient.sendDirectSms({
        recipientPhone: smsRecipient.phone,
        recipientName: smsRecipient.name,
        message: message.trim(),
      });
      setIsSending(false);
      if (!res.success || !res.data) {
        addToast(res.error?.message || 'SMS dispatch failed on server.', 'error');
        return;
      }
      if (res.data.status === 'SENT') {
        addToast(`SMS delivered to ${smsRecipient.name} (${smsRecipient.phone}).`, 'success');
      } else if (res.data.status === 'FAILED') {
        addToast(`SMS delivery failed: ${res.data.errorMessage || 'Check Twilio configuration in Page 36.'}`, 'error');
        return;
      } else {
        addToast(
          `Twilio SMS gateway is not configured in Page 36 — message queued as PENDING for ${smsRecipient.phone}.`,
          isTwilioConfigured ? 'info' : 'warning'
        );
      }
      closeSMSModal();
    } catch {
      setIsSending(false);
      addToast('SMS transmission failed: Gateway unreachable.', 'error');
    }
  };

  return (
    <Modal
      isOpen={isSMSModalOpen}
      onClose={closeSMSModal}
      title="Direct SMS Dispatch"
      maxWidth="max-w-lg"
    >
      <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <MessageSquare className="w-4 h-4 text-blue-600" />
          <span>
            To: <strong className="text-slate-900">{smsRecipient.name}</strong> • {smsRecipient.phone}
          </span>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
          isTwilioConfigured
            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
            : 'bg-amber-50 text-amber-800 border-amber-200'
        }`}>
          {isTwilioConfigured ? 'Twilio Configured' : 'Gateway Unconfigured'}
        </span>
      </div>

      <form onSubmit={handleSend} className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>One-Click Dispatch Templates</span>
          </label>
          <div className="space-y-1.5">
            {QUICK_TEMPLATES.map((tmpl, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setMessage(tmpl)}
                className={`w-full text-left p-2.5 rounded-xl text-xs transition-all border cursor-pointer ${
                  message === tmpl
                    ? 'bg-blue-50/80 border-blue-400 text-blue-900 font-bold'
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700 font-medium'
                }`}
              >
                {tmpl}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-slate-700">Message Text Body</label>
            <span className="text-[10px] text-slate-400">{message.length}/160 chars</span>
          </div>
          <textarea
            rows={3}
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Type custom text alert..."
            className="w-full text-xs p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none"
          />
        </div>

        {isTwilioConfigured ? (
          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200/80 flex items-center gap-2 text-[11px] text-emerald-800">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Direct cellular delivery via configured Twilio SMS dispatch gateway.</span>
          </div>
        ) : (
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/80 flex items-center gap-2 text-[11px] text-amber-800">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Configure Twilio credentials in Page 36 (Payment &amp; Notification Config) to enable live outbound SMS.</span>
          </div>
        )}

        <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={closeSMSModal}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSending}
            className="px-5 py-2 text-xs font-extrabold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>{isSending ? 'Transmitting...' : 'Send Instant SMS'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};

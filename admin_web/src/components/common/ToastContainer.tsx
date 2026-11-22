import React from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useAdmin();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full select-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`p-3.5 px-4 rounded-2xl shadow-xl border flex items-center justify-between gap-3 text-xs font-semibold animate-slide-up ${
            toast.type === 'success'
              ? 'bg-emerald-950/95 text-emerald-100 border-emerald-500/40'
              : toast.type === 'warning'
              ? 'bg-amber-950/95 text-amber-100 border-amber-500/40'
              : toast.type === 'error'
              ? 'bg-rose-950/95 text-rose-100 border-rose-500/40'
              : 'bg-slate-900/95 text-slate-100 border-slate-700'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
            {toast.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />}
            {toast.type === 'error' && <XCircle className="w-4 h-4 text-rose-400 shrink-0" />}
            {toast.type === 'info' && <Info className="w-4 h-4 text-blue-400 shrink-0" />}
            <span>{toast.title}</span>
          </div>

          <button
            onClick={() => removeToast(toast.id)}
            className="text-white/60 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};

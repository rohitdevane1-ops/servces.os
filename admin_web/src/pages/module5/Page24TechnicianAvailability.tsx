import React, { useEffect, useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { apiClient } from '../../services/apiClient';
import {
  Save,
  UserCheck,
  Sun,
} from 'lucide-react';

interface ShiftDay {
  day: string;
  dayOfWeek: number;
  active: boolean;
  start: string;
  end: string;
}

const DEFAULT_DAYS: ShiftDay[] = [
  { day: 'Monday', dayOfWeek: 1, active: true, start: '08:00', end: '18:00' },
  { day: 'Tuesday', dayOfWeek: 2, active: true, start: '08:00', end: '18:00' },
  { day: 'Wednesday', dayOfWeek: 3, active: true, start: '08:00', end: '18:00' },
  { day: 'Thursday', dayOfWeek: 4, active: true, start: '08:00', end: '18:00' },
  { day: 'Friday', dayOfWeek: 5, active: true, start: '08:00', end: '18:00' },
  { day: 'Saturday', dayOfWeek: 6, active: true, start: '09:00', end: '16:00' },
  { day: 'Sunday', dayOfWeek: 0, active: false, start: '09:00', end: '17:00' },
];

export const Page24TechnicianAvailability: React.FC = () => {
  const { technicians, addToast, navigateToPage } = useAdmin();
  const [selectedTechId, setSelectedTechId] = useState<string>(technicians[0]?.id || '');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const [techSchedules, setTechSchedules] = useState<Record<string, ShiftDay[]>>({});

  const selectedTech = technicians.find(t => t.id === selectedTechId) || technicians[0];
  const currentShifts = selectedTech ? (techSchedules[selectedTech.id] || DEFAULT_DAYS) : DEFAULT_DAYS;

  useEffect(() => {
    if (!selectedTech?.id) return;
    let active = true;
    apiClient.getTechnicianAvailability(selectedTech.id).then((res) => {
      if (!active || !res.success || !res.data) return;
      const rows = res.data.shifts || [];
      if (rows.length === 0) return;
      const merged = DEFAULT_DAYS.map((base) => {
        const match = rows.find((r) => Number(r.dayOfWeek) === base.dayOfWeek);
        if (!match) return { ...base, active: false };
        return {
          ...base,
          active: Boolean(match.isActive),
          start: match.startTime.slice(0, 5) || base.start,
          end: match.endTime.slice(0, 5) || base.end,
        };
      });
      setTechSchedules((prev) => ({ ...prev, [selectedTech.id]: merged }));
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, [selectedTech?.id]);

  const updateShift = (dayIdx: number, updates: Partial<ShiftDay>) => {
    if (!selectedTech) return;
    setTechSchedules(prev => {
      const existing = prev[selectedTech.id] || DEFAULT_DAYS;
      const updated = existing.map((s, i) => i === dayIdx ? { ...s, ...updates } : s);
      return { ...prev, [selectedTech.id]: updated };
    });
  };

  const handleSave = async () => {
    if (!selectedTech) return;
    setIsSaving(true);
    const payload = currentShifts.map((s) => ({
      dayOfWeek: s.dayOfWeek,
      startTime: s.start,
      endTime: s.end,
      isActive: s.active,
    }));
    const res = await apiClient.updateTechnicianAvailability(selectedTech.id, payload);
    setIsSaving(false);
    if (!res.success) {
      addToast(res.error?.message || 'Failed to save shift schedule to PostgreSQL.', 'error');
      return;
    }
    addToast(`Weekly shift roster saved to database for ${selectedTech.name}`, 'success');
  };

  if (!selectedTech) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Technician Shift Availability &amp; Hours</h1>
          <p className="text-xs text-slate-500 mt-1">
            Configure weekly operating shifts, on-call night rotation, and leave approvals for fleet technicians
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center max-w-lg mx-auto shadow-xs">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <UserCheck className="w-6 h-6" />
          </div>
          <h3 className="text-base font-extrabold text-slate-900 mb-1">No Technicians Onboarded</h3>
          <p className="text-xs text-slate-500 mb-6">
            Fleet roster is currently empty. Onboard technicians in Fleet Management to configure operating shifts and working hours.
          </p>
          <button
            onClick={() => navigateToPage(22)}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
          >
            + Onboard First Technician
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Technician Shift Availability &amp; Hours</h1>
          <p className="text-xs text-slate-500 mt-1">
            Configure weekly operating shifts, on-call night rotation, and leave approvals for fleet technicians
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedTechId}
            onChange={e => setSelectedTechId(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 shadow-2xs focus:outline-none cursor-pointer"
          >
            {technicians.map(t => (
              <option key={t.id} value={t.id}>{t.name} ({t.specialization})</option>
            ))}
          </select>

          <button
            disabled={isSaving}
            onClick={() => void handleSave()}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            {isSaving ? 'Saving...' : 'Save Shifts'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <span>Weekly Shift Schedule for {selectedTech.name}</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                {selectedTech.status}
              </span>
            </h2>
            <p className="text-xs text-slate-500">Dispatch engine routes customer jobs during active shift hours</p>
          </div>
          <span className="text-xs font-mono font-bold text-slate-600">
            {selectedTech.workingHours}
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {currentShifts.map((shift, idx) => (
            <div key={idx} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50">
              <div className="flex items-center gap-3 min-w-[140px]">
                <input
                  type="checkbox"
                  checked={shift.active}
                  onChange={e => updateShift(idx, { active: e.target.checked })}
                  className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <span className={`text-xs font-bold ${shift.active ? 'text-slate-900' : 'text-slate-400'}`}>
                  {shift.day}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs">
                {shift.active ? (
                  <div className="flex items-center gap-2 font-mono text-slate-700 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                    <Sun className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <input
                      type="time"
                      value={shift.start}
                      onChange={e => updateShift(idx, { start: e.target.value })}
                      className="bg-transparent text-xs font-mono font-bold text-slate-800 focus:outline-none"
                    />
                    <span className="text-slate-400">to</span>
                    <input
                      type="time"
                      value={shift.end}
                      onChange={e => updateShift(idx, { end: e.target.value })}
                      className="bg-transparent text-xs font-mono font-bold text-slate-800 focus:outline-none"
                    />
                  </div>
                ) : (
                  <span className="text-slate-400 font-bold bg-slate-100 px-3 py-1 rounded-lg">
                    Scheduled Day Off
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

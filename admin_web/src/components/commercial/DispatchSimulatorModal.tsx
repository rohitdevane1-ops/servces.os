import React, { useState, useEffect } from 'react';
import {
  X,
  Play,
  RotateCcw,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Radio,
  User,
  Truck,
} from 'lucide-react';
import { useAdmin } from '../../context/adminContextCore';

interface DispatchSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DispatchSimulatorModal: React.FC<DispatchSimulatorModalProps> = ({ isOpen, onClose }) => {
  const { bookings, pricingConfig } = useAdmin();
  const [activeStep, setActiveStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const sampleBooking = bookings[0];
  const escrowHold = sampleBooking ? sampleBooking.estimate : 0.0;
  const commissionRate = (pricingConfig?.commissionRate || 15) / 100;
  const platformTake = escrowHold * commissionRate;
  const techNet = escrowHold - platformTake;
  const orderNo = sampleBooking ? sampleBooking.jobNo : 'SVC-PENDING';
  const serviceName = sampleBooking ? sampleBooking.serviceName : 'Field Service Order';

  const steps = [
    { title: 'Standby / Ready', desc: 'PostGIS engine listening for broadcast triggers' },
    { title: '1. Customer Escrow Pre-Auth', desc: `Customer books service with $${escrowHold.toFixed(2)} escrow hold` },
    { title: '2. PostGIS Radar Match', desc: 'Nearest certified technician detected on radar' },
    { title: '3. 60s Broadcast Accepted', desc: 'Nearest certified technician accepts dispatch' },
    { title: '4. Arrival & PIN Check', desc: 'Geofence confirmed + 4-digit PIN verified on-site' },
    { title: '5. Escrow Release & Split', desc: 'Work order approved: Escrow release to Tech & Platform' }
  ];

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (isPlaying && activeStep < 5) {
      timer = setTimeout(() => {
        setActiveStep((prev) => {
          const next = prev + 1;
          if (next >= 5) setIsPlaying(false);
          return next;
        });
      }, 2500);
    }
    return () => clearTimeout(timer);
  }, [isPlaying, activeStep]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-6xl w-full p-6 shadow-2xl flex flex-col my-auto max-h-[95vh]">
        {/* Header Bar */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl text-indigo-400">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Tri-Party Live Dispatch & Escrow Simulator</h2>
                <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-full">
                  Real-Time Engine Demo
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Visualizes the synchronized state transitions across Customer App, Staff Radar, and Technician Pro App.
              </p>
            </div>
          </div>

          {/* Action Triggers */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (activeStep >= 5) setActiveStep(0);
                setIsPlaying(!isPlaying);
              }}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                isPlaying
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
              }`}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isPlaying ? 'Pause Auto-Run' : (activeStep >= 5 ? 'Replay Simulation' : 'Auto-Run Simulation')}</span>
            </button>

            <button
              onClick={() => { setActiveStep(0); setIsPlaying(false); }}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl border border-slate-700 cursor-pointer"
              title="Reset Simulator"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="p-1.5 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-xl border border-slate-700 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Lifecycle Progress Bar */}
        <div className="py-4 border-b border-slate-800/80">
          <div className="grid grid-cols-6 gap-2">
            {steps.map((s, idx) => (
              <div
                key={s.title}
                onClick={() => setActiveStep(idx)}
                className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                  activeStep === idx
                    ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-xs'
                    : activeStep > idx
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                    : 'bg-slate-800/40 border-slate-700/50 text-slate-500'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-[11px] truncate">{s.title}</span>
                  {activeStep > idx ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : null}
                </div>
                <p className="text-[9px] text-slate-400 truncate">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 3-Column Synchronized Control Room */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 flex-1 overflow-y-auto">
          {/* COLUMN 1: CUSTOMER APP VIEW */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                <span className="text-xs font-black uppercase text-indigo-400 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" /> Customer Mobile App
                </span>
                <span className="text-[10px] text-slate-400">Client: VIP Account</span>
              </div>

              {activeStep === 0 && (
                <div className="text-center py-12 text-slate-500 text-xs">
                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p>Customer browsing catalogue feed</p>
                  <button
                    onClick={() => setActiveStep(1)}
                    className="mt-4 px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-bold text-xs"
                  >
                    Simulate Booking Tap
                  </button>
                </div>
              )}

              {activeStep >= 1 && (
                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl space-y-1">
                    <span className="text-[9px] font-black uppercase text-indigo-400">Service Order #{orderNo}</span>
                    <h4 className="font-bold text-white">{serviceName}</h4>
                    <span className="text-slate-400 block text-[10px]">Primary Service Location</span>
                  </div>

                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
                    <div className="flex justify-between text-slate-300">
                      <span>Escrow Pre-Auth Hold:</span>
                      <span className="font-bold text-emerald-400">${escrowHold.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400 text-[10px]">
                      <span>Stripe Status:</span>
                      <span className="text-emerald-400">AUTHORIZED_IN_ESCROW</span>
                    </div>
                  </div>

                  {activeStep >= 4 && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between">
                      <div>
                        <span className="text-[9px] font-bold text-amber-400 block uppercase">Arrival PIN</span>
                        <span className="text-[10px] text-slate-400">Present to technician</span>
                      </div>
                      <span className="text-base font-black tracking-widest text-amber-400">4892</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-800/80 text-[10px] text-slate-400 flex items-center justify-between">
              <span>Status:</span>
              <span className="font-bold text-white">
                {activeStep === 0 ? 'Browsing' : activeStep < 4 ? 'Awaiting Arrival' : activeStep === 4 ? 'Tech on Site' : 'Escrow Released'}
              </span>
            </div>
          </div>

          {/* COLUMN 2: STAFF OPERATIONS RADAR */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                <span className="text-xs font-black uppercase text-amber-400 flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5" /> Staff Dispatch Radar
                </span>
                <span className="text-[10px] text-slate-400">PostGIS Engine 16</span>
              </div>

              {activeStep < 2 && (
                <div className="text-center py-12 text-slate-500 text-xs">
                  <Radio className="w-8 h-8 mx-auto mb-2 opacity-40 animate-pulse" />
                  <p>Radar scanning for active requests...</p>
                </div>
              )}

              {activeStep >= 2 && (
                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-1">
                    <span className="text-[9px] font-black uppercase text-amber-400">Radial Match (2.4 miles)</span>
                    <h4 className="font-bold text-white">Matched: Certified Pro #01</h4>
                    <span className="text-slate-400 block text-[10px]">Tier: Platinum Pro • CSAT 4.98 ★</span>
                  </div>

                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1 text-[11px]">
                    <div className="flex justify-between text-slate-300">
                      <span>Broadcast Countdown:</span>
                      <span className="font-bold text-indigo-400">
                        {activeStep === 2 ? '60s Ring Active...' : 'Accepted in 24s ✓'}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400 text-[10px]">
                      <span>Geofence Radius:</span>
                      <span className="text-slate-300">250 meters target</span>
                    </div>
                  </div>

                  {activeStep >= 5 && (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-1 text-[11px]">
                      <span className="text-[9px] font-bold text-emerald-400 uppercase block">Platform Take-Rate ({Math.round(commissionRate * 100)}%)</span>
                      <div className="flex justify-between font-bold text-emerald-400">
                        <span>Net Platform Revenue:</span>
                        <span>+${platformTake.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-800/80 text-[10px] text-slate-400 flex items-center justify-between">
              <span>Status:</span>
              <span className="font-bold text-white">
                {activeStep < 2 ? 'Listening' : activeStep === 2 ? 'Broadcasting' : activeStep < 5 ? 'Tracking Live' : 'Ledger Reconciled'}
              </span>
            </div>
          </div>

          {/* COLUMN 3: TECHNICIAN MOBILE APP */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                <span className="text-xs font-black uppercase text-emerald-400 flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5" /> Technician Pro App
                </span>
                <span className="text-[10px] text-slate-400">Pro: Field Technician</span>
              </div>

              {activeStep < 3 && (
                <div className="text-center py-12 text-slate-500 text-xs">
                  <Truck className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p>Technician online on radar (5 mi)</p>
                </div>
              )}

              {activeStep >= 3 && (
                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-1">
                    <span className="text-[9px] font-black uppercase text-emerald-400">Offer Accepted</span>
                    <h4 className="font-bold text-white">Guaranteed Payout: ${techNet.toFixed(2)}</h4>
                    <span className="text-slate-400 block text-[10px]">Fleet Vehicle • En Route</span>
                  </div>

                  {activeStep >= 4 && (
                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1 text-[11px]">
                      <div className="flex justify-between text-slate-300">
                        <span>Geofence Check:</span>
                        <span className="font-bold text-emerald-400">Verified on-site ✓</span>
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span>Dual Photo Proof:</span>
                        <span className="font-bold text-emerald-400">Uploaded ✓</span>
                      </div>
                    </div>
                  )}

                  {activeStep >= 5 && (
                    <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-center space-y-1">
                      <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
                      <span className="font-extrabold text-white block">Escrow Paid Out</span>
                      <span className="text-xs font-black text-emerald-400">+${techNet.toFixed(2)} Transferred to Tech Wallet</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-800/80 text-[10px] text-slate-400 flex items-center justify-between">
              <span>Status:</span>
              <span className="font-bold text-white">
                {activeStep < 3 ? 'Idle Online' : activeStep === 3 ? 'En Route' : activeStep === 4 ? 'Executing Job' : 'Paid & Complete'}
              </span>
            </div>
          </div>
        </div>

        {/* Footer Summary Strip */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Turnkey Escrow & PostGIS Dispatch Engine • Certified & Ready to Deploy</span>
          </div>
          <button
            onClick={() => setActiveStep(prev => (prev < 5 ? prev + 1 : 0))}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl border border-slate-700 font-bold transition-all cursor-pointer"
          >
            {activeStep >= 5 ? 'Reset Simulation' : 'Next Step →'}
          </button>
        </div>
      </div>
    </div>
  );
};

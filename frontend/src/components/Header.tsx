"use client";

import React, { useState } from "react";
import { Activity, ShieldCheck, Zap, HelpCircle, Database, Globe2, Radio, Camera, RefreshCw } from "lucide-react";

interface HeaderProps {
  backendOnline: boolean;
  activeDatabaseName?: string;
  onRun2017Simulation: () => void;
  isLoadingSimulation: boolean;
  onOpenUploadModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  backendOnline,
  activeDatabaseName,
  onRun2017Simulation,
  isLoadingSimulation,
  onOpenUploadModal,
}) => {
  const [showDocs, setShowDocs] = useState(false);

  return (
    <>
      <header className="border-b border-slate-800 bg-slate-950/85 backdrop-blur-md sticky top-0 z-40 px-4 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Brand & Studio Identity */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-md shadow-emerald-950">
            <Activity className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold tracking-tight text-white flex items-center gap-2">
                GRIDTRACE <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold border border-emerald-500/40 tracking-wider">MULTI-MODAL ENF WORKSTATION</span>
              </h1>
            </div>
            <p className="text-[11px] text-slate-400">
              Acoustic Mains Hum & CMOS Rolling-Shutter Optical Flicker Authenticator (Continental Europe / Morocco ONEE 50 Hz)
            </p>
          </div>
        </div>

        {/* Action Bar & Forensic Controls */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Active Database Badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-slate-900 border border-slate-800 text-slate-300">
            <Globe2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="text-slate-500 text-[11px]">GRID:</span>
            <span className="text-cyan-300 font-semibold truncate max-w-[200px]" title={activeDatabaseName}>
              {activeDatabaseName || "CE / Morocco ONEE 50Hz"}
            </span>
          </div>

          {/* Backend Health Badge */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono border ${
              backendOnline
                ? "bg-emerald-950/40 text-emerald-400 border-emerald-800/50"
                : "bg-rose-950/40 text-rose-400 border-rose-800/50"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                backendOnline ? "bg-emerald-400 animate-ping" : "bg-rose-400"
              }`}
            />
            {backendOnline ? "DSP Engine Ready" : "Connecting..."}
          </div>

          {/* 2017 Zouz Vlogs Simulation Button */}
          <button
            onClick={onRun2017Simulation}
            disabled={isLoadingSimulation || !backendOnline}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white shadow-lg shadow-emerald-950/60 border border-emerald-400/30 transition-all disabled:opacity-50 cursor-pointer"
            title="Runs full 2017-11-09 04:58:19 AM Africa/Casablanca simulation"
          >
            {isLoadingSimulation ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
            )}
            <span>Run 2017 Zouz Vlogs Forensic Simulation</span>
          </button>

          {/* Ingest Historical CSV */}
          <button
            onClick={onOpenUploadModal}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
            title="Ingest Zenodo or custom grid CSV"
          >
            <Database className="w-3.5 h-3.5 text-cyan-400" />
            <span>Grid Data</span>
          </button>

          {/* Specs / Theory Modal */}
          <button
            onClick={() => setShowDocs(true)}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors cursor-pointer"
            title="Forensic Signal Processing & Rolling-Shutter Theory"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Forensic Theory & Mathematical Specs Modal */}
      {showDocs && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full p-6 text-slate-200 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-base">
                <ShieldCheck className="w-5 h-5" />
                <span>Multi-Modal ENF Forensic Theory & DSP Pipeline</span>
              </div>
              <button
                onClick={() => setShowDocs(false)}
                className="text-slate-400 hover:text-white text-sm font-mono px-2 py-1 rounded bg-slate-800 cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            <div className="space-y-4 text-xs leading-relaxed text-slate-300 pt-4">
              <div>
                <h4 className="font-semibold text-emerald-300 text-sm mb-1 flex items-center gap-1.5">
                  <Radio className="w-4 h-4" />
                  1. Acoustic ENF (100 Hz Mains Hum)
                </h4>
                <p>
                  AC power supplies in 50 Hz grids (Europe & Morocco ONEE) utilize full-wave diode bridges that emit acoustic
                  and electromagnetic vibrations at <strong>2f₀ = 100.0 Hz</strong> (or 120.0 Hz in North America). Audio is
                  extracted via FFmpeg, downsampled to <code className="text-cyan-200 font-mono">fs = 1000 Hz</code> via polyphase FIR anti-aliasing
                  filters, filtered with a zero-phase 4th-order Butterworth bandpass filter (<code className="text-cyan-200 font-mono">sosfiltfilt</code>),
                  and analyzed with an 8x zero-padded STFT and quadratic log-magnitude interpolation.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-cyan-300 text-sm mb-1 flex items-center gap-1.5">
                  <Camera className="w-4 h-4" />
                  2. Rolling-Shutter Optical ENF (Video Frames)
                </h4>
                <p>
                  When audio is muted, noisy, or replaced by background music, CMOS sensors act as high-speed line scanners. Because
                  CMOS rows expose sequentially from top to bottom, each video frame samples the 100 Hz light flicker along its vertical
                  axis, giving an effective row sampling rate:
                </p>
                <div className="bg-slate-950 p-2.5 rounded font-mono text-[11px] text-cyan-300 my-1">
                  f_row = Frame_Height × FPS  (e.g., 720 × 30 = 21,600 Hz)
                </div>
                <p>
                  By subtracting the temporal mean row profile across all frames, static room textures (walls, furniture) are removed,
                  isolating the pure 100 Hz illumination flicker wave even in low-light indoor environments.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-amber-300 text-sm mb-1 flex items-center gap-1.5">
                  <Globe2 className="w-4 h-4" />
                  3. Morocco ONEE Synchronous Connection & Timezones
                </h4>
                <p>
                  Morocco's power grid (ONEE) is synchronously connected with Continental Europe (ENTSO-E) via high-voltage AC undersea cables
                  across the Strait of Gibraltar. Every millihertz frequency fluctuation in Morocco is mathematically synchronized with Continental
                  Europe. Timestamps are localized to both <code className="text-emerald-300 font-mono">UTC</code> and{" "}
                  <code className="text-emerald-300 font-mono">Africa/Casablanca</code>, taking into account Morocco's Ramadan shifts and historical DST changes.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-emerald-300 text-sm mb-1">
                  4. Sub-Second Vectorized Parquet Matching (O(N log N))
                </h4>
                <p>
                  We normalize the query vector and compute the sliding Pearson correlation coefficient (r) and sliding Mean Squared Error (MSE)
                  across all 31.5 million seconds of the year using FFT convolution (<code className="text-cyan-200 font-mono">scipy.signal.fftconvolve</code>)
                  and cumulative-sum running statistics, matching months of grid data in milliseconds.
                </p>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setShowDocs(false)}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs cursor-pointer"
              >
                Close Specs
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

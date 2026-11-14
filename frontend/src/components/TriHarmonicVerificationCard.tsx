"use client";

import React, { useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Zap,
  Activity,
  Layers,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { MultiHarmonicVerification } from "../lib/types";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

interface TriHarmonicVerificationCardProps {
  data?: MultiHarmonicVerification;
  nominalGridHz?: number;
}

export const TriHarmonicVerificationCard: React.FC<TriHarmonicVerificationCardProps> = ({
  data,
  nominalGridHz = 50.0,
}) => {
  const [showChart, setShowChart] = useState(true);
  const [visibleHarmonics, setVisibleHarmonics] = useState({
    f1: true,
    f2: true,
    f4: true,
    fused: true,
  });

  if (!data) return null;

  const {
    verified,
    status,
    badge,
    color,
    description,
    cross_harmonic_r,
    mean_discrepancy_mhz,
    h1_snr_db = 0,
    h2_snr_db = 0,
    h4_snr_db = 0,
    r_f1_f2,
    r_f2_f4,
    r_f1_f4,
    diff_f1_f2_mhz,
    diff_f2_f4_mhz,
    diff_f1_f4_mhz,
    comparison_points = [],
  } = data;

  const colorStyles = {
    emerald: {
      border: "border-emerald-500/40",
      bg: "bg-emerald-950/20",
      badge: "bg-emerald-500/20 text-emerald-300 border-emerald-400/40",
      icon: <ShieldCheck className="w-5 h-5 text-emerald-400" />,
      text: "text-emerald-400",
    },
    cyan: {
      border: "border-cyan-500/40",
      bg: "bg-cyan-950/20",
      badge: "bg-cyan-500/20 text-cyan-300 border-cyan-400/40",
      icon: <CheckCircle2 className="w-5 h-5 text-cyan-400" />,
      text: "text-cyan-400",
    },
    amber: {
      border: "border-amber-500/40",
      bg: "bg-amber-950/20",
      badge: "bg-amber-500/20 text-amber-300 border-amber-400/40",
      icon: <AlertCircle className="w-5 h-5 text-amber-400" />,
      text: "text-amber-400",
    },
    rose: {
      border: "border-rose-500/40",
      bg: "bg-rose-950/20",
      badge: "bg-rose-500/20 text-rose-300 border-rose-400/40",
      icon: <ShieldAlert className="w-5 h-5 text-rose-400" />,
      text: "text-rose-400",
    },
  }[color] || {
    border: "border-slate-800",
    bg: "bg-slate-900",
    badge: "bg-slate-800 text-slate-300 border-slate-700",
    icon: <Zap className="w-5 h-5 text-emerald-400" />,
    text: "text-emerald-400",
  };

  const f1Target = nominalGridHz * 1;
  const f2Target = nominalGridHz * 2;
  const f4Target = nominalGridHz * 4;

  return (
    <div
      className={`border ${colorStyles.border} ${colorStyles.bg} rounded-xl p-5 shadow-xl space-y-4 backdrop-blur-md`}
    >
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {colorStyles.icon}
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`text-[10px] uppercase tracking-widest font-mono font-bold px-2 py-0.5 rounded-full border ${colorStyles.badge}`}
              >
                {badge}
              </span>
              <span className="text-xs font-mono text-slate-400">
                Multi-Harmonic Consensus Engine (f₁, f₂, f₄)
              </span>
            </div>
            <h3 className="text-sm font-bold text-white mt-0.5">
              Triple-Harmonic Cross-Verification: Fundamental vs. Mains Hum vs. Rectifier
            </h3>
          </div>
        </div>

        <button
          onClick={() => setShowChart(!showChart)}
          className="self-start sm:self-center flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer transition-colors"
        >
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          <span>{showChart ? "Collapse Harmonics Chart" : "Compare Harmonics Chart"}</span>
          {showChart ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Description */}
      <p className="text-xs text-slate-300 leading-relaxed font-sans bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
        {description}
      </p>

      {/* 3 Harmonic Telemetry Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* f1 Card */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-amber-400 font-bold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
              f₁ ({f1Target} Hz Base)
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800 text-slate-400">
              k = 1
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-xs text-slate-400">Local SNR:</span>
            <span className="text-sm font-mono font-bold text-white">
              {h1_snr_db > 0 ? `+${h1_snr_db.toFixed(1)} dB` : `${h1_snr_db.toFixed(1)} dB`}
            </span>
          </div>
          <p className="text-[10px] text-slate-500">Acoustic fundamental hum</p>
        </div>

        {/* f2 Card */}
        <div className="bg-slate-950/80 border border-emerald-500/30 rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-emerald-400 font-bold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              f₂/2 ({f2Target} Hz Mains Hum)
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-950 border border-emerald-500/40 text-emerald-300">
              Primary (k = 2)
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-xs text-slate-400">Local SNR:</span>
            <span className="text-sm font-mono font-bold text-emerald-400">
              +{h2_snr_db.toFixed(1)} dB
            </span>
          </div>
          <p className="text-[10px] text-slate-500">Dominant magnetostriction & I²R power</p>
        </div>

        {/* f4 Card */}
        <div className="bg-slate-950/80 border border-cyan-500/30 rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-cyan-400 font-bold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" />
              f₄/4 ({f4Target} Hz Rectifier)
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-950 border border-cyan-500/40 text-cyan-300">
              k = 4
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-xs text-slate-400">Local SNR:</span>
            <span className="text-sm font-mono font-bold text-cyan-400">
              +{h4_snr_db.toFixed(1)} dB
            </span>
          </div>
          <p className="text-[10px] text-slate-500">High-pass microphone passband harmonic</p>
        </div>
      </div>

      {/* Correlation & Discrepancy Matrix */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 text-center font-mono">
        <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
          <span className="text-[10px] text-slate-400 block">r(f₂/2, f₄/4)</span>
          <span className="text-base font-bold text-emerald-400">
            {r_f2_f4 !== undefined ? r_f2_f4.toFixed(3) : cross_harmonic_r.toFixed(3)}
          </span>
          <span className="text-[9px] text-slate-500 block">Cross-Harmonic</span>
        </div>

        <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
          <span className="text-[10px] text-slate-400 block">Δ(f₂/2, f₄/4)</span>
          <span className="text-base font-bold text-cyan-400">
            {diff_f2_f4_mhz !== undefined ? `${diff_f2_f4_mhz.toFixed(1)} mHz` : `${mean_discrepancy_mhz.toFixed(1)} mHz`}
          </span>
          <span className="text-[9px] text-slate-500 block">Target &lt; 15 mHz</span>
        </div>

        <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
          <span className="text-[10px] text-slate-400 block">r(f₁, f₂/2)</span>
          <span className="text-base font-bold text-amber-300">
            {r_f1_f2 !== undefined ? r_f1_f2.toFixed(3) : "—"}
          </span>
          <span className="text-[9px] text-slate-500 block">Fundamental Correlation</span>
        </div>

        <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
          <span className="text-[10px] text-slate-400 block">FUSED CONSENSUS</span>
          <span className="text-base font-bold text-emerald-300">ACTIVE</span>
          <span className="text-[9px] text-slate-500 block">Minimum-Variance SNR</span>
        </div>
      </div>

      {/* Interactive Harmonics Comparison Chart */}
      {showChart && comparison_points.length > 0 && (
        <div className="pt-3 border-t border-slate-800/80 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span>Multi-Harmonic Instantaneous Traces Normalized to {nominalGridHz} Hz:</span>
            </span>

            {/* Toggle checkboxes for harmonics */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1 text-[11px] text-amber-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={visibleHarmonics.f1}
                  onChange={(e) => setVisibleHarmonics({ ...visibleHarmonics, f1: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-0"
                />
                <span>f₁</span>
              </label>

              <label className="flex items-center gap-1 text-[11px] text-emerald-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={visibleHarmonics.f2}
                  onChange={(e) => setVisibleHarmonics({ ...visibleHarmonics, f2: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-0"
                />
                <span>f₂/2 (100Hz)</span>
              </label>

              <label className="flex items-center gap-1 text-[11px] text-cyan-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={visibleHarmonics.f4}
                  onChange={(e) => setVisibleHarmonics({ ...visibleHarmonics, f4: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-0"
                />
                <span>f₄/4 (200Hz)</span>
              </label>

              <label className="flex items-center gap-1 text-[11px] text-white font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={visibleHarmonics.fused}
                  onChange={(e) => setVisibleHarmonics({ ...visibleHarmonics, fused: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-950 text-white focus:ring-0"
                />
                <span>Fused Consensus</span>
              </label>
            </div>
          </div>

          <div className="w-full h-56 bg-slate-950/70 border border-slate-800 rounded-lg p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={comparison_points} margin={{ top: 10, right: 15, left: 5, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="second"
                  stroke="#64748b"
                  fontSize={10}
                  tickLine={false}
                  tickFormatter={(s) => `+${s}s`}
                />
                <YAxis
                  stroke="#64748b"
                  fontSize={10}
                  tickLine={false}
                  tickFormatter={(v) => `${v.toFixed(3)}Hz`}
                  domain={["auto", "auto"]}
                  width={62}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const pt = payload[0].payload;
                      return (
                        <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-lg shadow-xl text-xs font-mono space-y-1">
                          <div className="text-slate-400 font-bold border-b border-slate-800 pb-1">
                            Second +{pt.second}s
                          </div>
                          {pt.f1_normalized_hz !== undefined && (
                            <div className="text-amber-400 flex justify-between gap-3">
                              <span>f₁ (50Hz):</span>
                              <span>{pt.f1_normalized_hz.toFixed(5)} Hz</span>
                            </div>
                          )}
                          <div className="text-emerald-400 flex justify-between gap-3">
                            <span>f₂/2 (100Hz):</span>
                            <span>{pt.f2_normalized_hz.toFixed(5)} Hz</span>
                          </div>
                          <div className="text-cyan-400 flex justify-between gap-3">
                            <span>f₄/4 (200Hz):</span>
                            <span>{pt.f4_normalized_hz.toFixed(5)} Hz</span>
                          </div>
                          {pt.fused_hz !== undefined && (
                            <div className="text-white font-bold flex justify-between gap-3 pt-1 border-t border-slate-800">
                              <span>Fused Consensus:</span>
                              <span>{pt.fused_hz.toFixed(5)} Hz</span>
                            </div>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                {visibleHarmonics.f1 && (
                  <Line
                    type="monotone"
                    dataKey="f1_normalized_hz"
                    stroke="#fbbf24"
                    strokeWidth={1.5}
                    dot={false}
                    name="f1 (50Hz)"
                    isAnimationActive={false}
                  />
                )}
                {visibleHarmonics.f2 && (
                  <Line
                    type="monotone"
                    dataKey="f2_normalized_hz"
                    stroke="#10b981"
                    strokeWidth={1.8}
                    dot={false}
                    name="f2/2 (100Hz)"
                    isAnimationActive={false}
                  />
                )}
                {visibleHarmonics.f4 && (
                  <Line
                    type="monotone"
                    dataKey="f4_normalized_hz"
                    stroke="#06b6d4"
                    strokeWidth={1.5}
                    dot={false}
                    name="f4/4 (200Hz)"
                    isAnimationActive={false}
                  />
                )}
                {visibleHarmonics.fused && (
                  <Line
                    type="monotone"
                    dataKey="fused_hz"
                    stroke="#ffffff"
                    strokeWidth={2.2}
                    strokeDasharray="5 3"
                    dot={false}
                    name="Consensus Fused"
                    isAnimationActive={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};

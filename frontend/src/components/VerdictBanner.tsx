"use client";

import React, { useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Award,
  Calendar,
  Clock,
  Globe2,
  Video,
  Sliders,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { MatchCandidate, MatchResponse } from "../lib/types";

interface VerdictBannerProps {
  matchResult: MatchResponse;
  activeCandidate?: MatchCandidate;
  mediaInfo?: import("../lib/types").MediaInfo | null;
}

type TimezoneViewMode = "gmt" | "casablanca" | "cet" | "manual";

export const VerdictBanner: React.FC<VerdictBannerProps> = ({
  matchResult,
  activeCandidate,
  mediaInfo,
}) => {
  const [tzMode, setTzMode] = useState<TimezoneViewMode>("gmt");
  const [manualHourShift, setManualHourShift] = useState<number>(0);

  const candidate = activeCandidate || matchResult.best_match;
  const {
    verdict,
    verdict_badge,
    verdict_color,
    confidence_pct,
    z_score,
    search_window_seconds,
    database_total_seconds,
  } = matchResult;

  // Format timestamp based on selected Timezone and manual hour shift
  const formatShiftedTime = (utcIso: string): { displayTime: string; label: string } => {
    try {
      const dt = new Date(utcIso);
      if (isNaN(dt.getTime())) return { displayTime: utcIso, label: "UTC" };

      let baseOffsetHours = 0;
      let tzTag = "GMT";
      let tzLabel = "GMT / UTC";

      if (tzMode === "casablanca") {
        baseOffsetHours = 1;
        tzTag = "Africa/Casablanca (GMT+1)";
        tzLabel = "Africa/Casablanca Local Time";
      } else if (tzMode === "cet") {
        baseOffsetHours = 2;
        tzTag = "CET";
        tzLabel = "Central European Time (CET)";
      }

      const totalOffsetMs = (baseOffsetHours + manualHourShift) * 3600 * 1000;
      const shifted = new Date(dt.getTime() + totalOffsetMs);

      const y = shifted.getUTCFullYear();
      const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
      const d = String(shifted.getUTCDate()).padStart(2, "0");
      const hh = String(shifted.getUTCHours()).padStart(2, "0");
      const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
      const ss = String(shifted.getUTCSeconds()).padStart(2, "0");

      const shiftTag = manualHourShift !== 0 ? ` (${manualHourShift > 0 ? `+${manualHourShift}` : manualHourShift}h shift)` : "";
      return {
        displayTime: `${y}-${m}-${d} ${hh}:${mm}:${ss} ${tzTag}${shiftTag}`,
        label: tzLabel,
      };
    } catch {
      return { displayTime: utcIso, label: "UTC" };
    }
  };

  const videoStartTime = formatShiftedTime(candidate.video_file_start_utc || candidate.start_timestamp_utc);
  const roiStartTime = formatShiftedTime(candidate.start_timestamp_utc);

  const colorStyles = {
    emerald: {
      border: "border-emerald-500/50",
      bg: "bg-emerald-950/35",
      badgeBg: "bg-emerald-500/20 text-emerald-300 border-emerald-400/40",
      glow: "radar-glow-emerald",
      icon: <ShieldCheck className="w-9 h-9 text-emerald-400 shrink-0" />,
      accentText: "text-emerald-400",
    },
    cyan: {
      border: "border-cyan-500/50",
      bg: "bg-cyan-950/35",
      badgeBg: "bg-cyan-500/20 text-cyan-300 border-cyan-400/40",
      glow: "radar-glow-cyan",
      icon: <Award className="w-9 h-9 text-cyan-400 shrink-0" />,
      accentText: "text-cyan-400",
    },
    amber: {
      border: "border-amber-500/50",
      bg: "bg-amber-950/35",
      badgeBg: "bg-amber-500/20 text-amber-300 border-amber-400/40",
      glow: "",
      icon: <ShieldAlert className="w-9 h-9 text-amber-400 shrink-0" />,
      accentText: "text-amber-400",
    },
    rose: {
      border: "border-rose-500/50",
      bg: "bg-rose-950/35",
      badgeBg: "bg-rose-500/20 text-rose-300 border-rose-400/40",
      glow: "",
      icon: <ShieldAlert className="w-9 h-9 text-rose-400 shrink-0" />,
      accentText: "text-rose-400",
    },
  }[verdict_color] || {
    border: "border-slate-800",
    bg: "bg-slate-900",
    badgeBg: "bg-slate-800 text-slate-200 border-slate-700",
    glow: "",
    icon: <ShieldCheck className="w-9 h-9 text-emerald-400 shrink-0" />,
    accentText: "text-emerald-400",
  };

  return (
    <div
      className={`border ${colorStyles.border} ${colorStyles.bg} ${colorStyles.glow} rounded-2xl p-6 backdrop-blur-xl shadow-2xl relative overflow-hidden space-y-4`}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
        {/* Main Verdict & Timestamp */}
        <div className="space-y-3 flex-1">
          <div className="flex items-center gap-3.5">
            {colorStyles.icon}
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] uppercase tracking-widest font-mono font-bold px-2.5 py-0.5 rounded-full border ${colorStyles.badgeBg}`}
                >
                  {verdict_badge}
                </span>
                <span className="text-xs font-mono text-slate-400">
                  Forensic Confidence: <strong className={colorStyles.accentText}>{confidence_pct}%</strong>
                </span>
              </div>
              <h2 className="text-2xl font-black tracking-tight text-white mt-1 flex items-center gap-2">
                <span>{verdict}</span>
                {candidate.rank > 1 && (
                  <span className="text-xs font-mono font-normal text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                    Inspecting Candidate #{candidate.rank}
                  </span>
                )}
              </h2>
            </div>
          </div>

          {/* Camera Clock / Container Metadata Header Comparison */}
          {mediaInfo?.detected_metadata_time && (
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-xs font-mono flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-[10px] uppercase font-semibold">Video File Header Clock:</span>
                <span className="text-white font-bold">{mediaInfo.detected_metadata_time.gmt_time}</span>
                <span className="text-cyan-400 text-[11px]">({mediaInfo.detected_metadata_time.casablanca_time})</span>
              </div>
              <span className="text-emerald-400 text-[11px]">
                Date Verified: {mediaInfo.detected_metadata_time.year}-{String(mediaInfo.detected_metadata_time.month).padStart(2, "0")}-{String(mediaInfo.detected_metadata_time.day).padStart(2, "0")}
              </span>
            </div>
          )}

          {/* Timing Display Card */}
          <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 space-y-3 font-mono text-xs">
            {/* Top row: Video File Start (t = 0.0s) */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-slate-800/80">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1 text-emerald-400">
                  <Video className="w-3.5 h-3.5" />
                  <span>VIDEO RECORDING START TIME (t = 0.0s)</span>
                </span>
                <span className="text-base font-extrabold text-white flex items-center gap-1.5 mt-0.5">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <span>{videoStartTime.displayTime}</span>
                </span>
              </div>

              {/* Analyzed ROI Sub-interval */}
              <div className="text-right">
                <span className="text-slate-500 block text-[10px] uppercase tracking-wider">
                  ANALYZED ROI INTERVAL
                </span>
                <span className="text-slate-300 block text-xs mt-0.5">
                  {roiStartTime.displayTime} ({search_window_seconds}s span)
                </span>
              </div>
            </div>

            {/* Bottom row: Timezone & Hour Shift Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-slate-400 mr-1 flex items-center gap-1">
                  <Globe2 className="w-3 h-3 text-cyan-400" />
                  <span>Display Clock:</span>
                </span>
                {[
                  { id: "gmt", label: "GMT (UTC+0)" },
                  { id: "casablanca", label: "Casablanca" },
                  { id: "cet", label: "CET (+1h/+2h)" },
                ].map((tz) => (
                  <button
                    key={tz.id}
                    type="button"
                    onClick={() => {
                      setTzMode(tz.id as TimezoneViewMode);
                      setManualHourShift(0);
                    }}
                    className={`px-2 py-0.5 rounded text-[11px] border cursor-pointer transition-colors ${
                      tzMode === tz.id && manualHourShift === 0
                        ? "bg-cyan-500/20 text-cyan-300 border-cyan-500 font-bold"
                        : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
                    }`}
                  >
                    {tz.label}
                  </button>
                ))}
              </div>

              {/* Manual Camera Clock Shift Buttons */}
              <div className="flex items-center gap-1 text-[11px]">
                <span className="text-slate-500 text-[10px]">Hour Shift:</span>
                {[-2, -1, 0, 1, 2].map((shift) => (
                  <button
                    key={shift}
                    type="button"
                    onClick={() => {
                      setTzMode("gmt");
                      setManualHourShift(shift);
                    }}
                    className={`w-6 h-5 rounded text-[10px] font-bold border cursor-pointer transition-colors text-center ${
                      manualHourShift === shift
                        ? "bg-emerald-500/30 text-emerald-300 border-emerald-500"
                        : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
                    }`}
                    title={`Shift displayed time by ${shift >= 0 ? `+${shift}` : shift} hour(s)`}
                  >
                    {shift > 0 ? `+${shift}` : shift}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Statistical Telemetry Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center min-w-[280px]">
          {/* Pearson Correlation & Micro-Wiggles */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3">
            <span className="text-[10px] text-slate-400 block font-mono">PEARSON COEFF (r)</span>
            <span className="text-xl font-black font-mono text-emerald-400 mt-0.5 block">
              {candidate.pearson_r.toFixed(4)}
            </span>
            <span className="text-[9px] text-cyan-400 font-mono">
              {candidate.diff_r !== undefined ? `Δf wiggles: r = ${candidate.diff_r.toFixed(3)}` : "Max: 1.0"}
            </span>
          </div>

          {/* Root Mean Square Error */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3">
            <span className="text-[10px] text-slate-400 block font-mono">RMSE ERROR</span>
            <span className="text-xl font-black font-mono text-cyan-400 mt-0.5 block">
              {candidate.rmse_mhz.toFixed(2)} <span className="text-xs font-normal">mHz</span>
            </span>
            <span className="text-[9px] text-slate-500 font-mono">MSE: {candidate.mse.toExponential(2)}</span>
          </div>

          {/* Z-Score vs Noise Floor */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3">
            <span className="text-[10px] text-slate-400 block font-mono">PEAK Z-SCORE</span>
            <span className="text-xl font-black font-mono text-amber-300 mt-0.5 block">
              +{z_score.toFixed(1)} σ
            </span>
            <span className="text-[9px] text-slate-500 font-mono">vs. Noise Floor</span>
          </div>

          {/* Searched Space */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3">
            <span className="text-[10px] text-slate-400 block font-mono">DATABASE SCAN</span>
            <span className="text-xl font-black font-mono text-slate-200 mt-0.5 block">
              {(database_total_seconds / 3600).toFixed(1)}h
            </span>
            <span className="text-[9px] text-slate-500 font-mono">{database_total_seconds.toLocaleString()}s scanned</span>
          </div>
        </div>
      </div>
    </div>
  );
};

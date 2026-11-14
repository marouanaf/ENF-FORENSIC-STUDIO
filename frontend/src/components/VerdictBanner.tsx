"use client";

import React from "react";
import { ShieldCheck, ShieldAlert, Award, Calendar, Clock, Globe2, BarChart3, Target } from "lucide-react";
import { MatchResponse } from "../lib/types";

interface VerdictBannerProps {
  matchResult: MatchResponse;
}

export const VerdictBanner: React.FC<VerdictBannerProps> = ({ matchResult }) => {
  const {
    verdict,
    verdict_badge,
    verdict_color,
    confidence_pct,
    best_match,
    best_match_timezone,
    z_score,
    search_window_seconds,
    database_total_seconds,
    database_filename,
  } = matchResult;

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
      className={`border ${colorStyles.border} ${colorStyles.bg} ${colorStyles.glow} rounded-2xl p-6 backdrop-blur-xl shadow-2xl relative overflow-hidden`}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
        {/* Main Verdict & Timestamp */}
        <div className="space-y-3">
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
              <h2 className="text-2xl font-black tracking-tight text-white mt-1">
                {verdict}
              </h2>
            </div>
          </div>

          {/* Primary Matched Timestamp Banner (Africa/Casablanca & UTC) */}
          <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center gap-6 text-xs font-mono">
            {/* Africa/Casablanca Time */}
            <div>
              <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">
                AUTHENTICATED CASABLANCA TIME
              </span>
              <span className="text-base font-extrabold text-emerald-400 flex items-center gap-1.5 mt-1">
                <Clock className="w-4 h-4 text-emerald-400" />
                {best_match.casablanca_time || best_match_timezone?.casablanca_formatted}
              </span>
            </div>

            {/* UTC Timestamp */}
            <div className="border-l border-slate-800 pl-6">
              <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">
                UNIVERSAL TIME (UTC)
              </span>
              <span className="text-sm font-semibold text-slate-200 flex items-center gap-1.5 mt-1">
                <Globe2 className="w-4 h-4 text-cyan-400" />
                {best_match.start_timestamp_utc}
              </span>
            </div>

            {/* Timeline Span */}
            <div className="border-l border-slate-800 pl-6 hidden md:block">
              <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">
                WINDOW SPAN
              </span>
              <span className="text-slate-300 mt-1 block">
                {search_window_seconds}s Window ({best_match.start_index}s → {best_match.end_index}s)
              </span>
            </div>
          </div>
        </div>

        {/* Statistical Telemetry Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          {/* Pearson Correlation */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3">
            <span className="text-[10px] text-slate-400 block font-mono">PEARSON COEFF (r)</span>
            <span className="text-xl font-black font-mono text-emerald-400 mt-0.5 block">
              {best_match.pearson_r.toFixed(4)}
            </span>
            <span className="text-[9px] text-slate-500 font-mono">Max Theoretical: 1.0</span>
          </div>

          {/* Root Mean Square Error */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3">
            <span className="text-[10px] text-slate-400 block font-mono">RMSE ERROR</span>
            <span className="text-xl font-black font-mono text-cyan-400 mt-0.5 block">
              {best_match.rmse_mhz.toFixed(2)} <span className="text-xs font-normal">mHz</span>
            </span>
            <span className="text-[9px] text-slate-500 font-mono">MSE: {best_match.mse.toExponential(2)}</span>
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

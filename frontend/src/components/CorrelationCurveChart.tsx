"use client";

import React, { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
} from "recharts";
import { TrendingUp, Target, ZoomIn, Globe2 } from "lucide-react";
import { CorrelationPoint } from "../lib/types";

interface CorrelationCurveChartProps {
  data: CorrelationPoint[];
  globalData?: CorrelationPoint[];
  bestIndex?: number;
}

export const CorrelationCurveChart: React.FC<CorrelationCurveChartProps> = ({
  data,
  globalData,
  bestIndex,
}) => {
  const [viewMode, setViewMode] = useState<"exact_match" | "global">("exact_match");

  const displayData = viewMode === "exact_match" || !globalData || globalData.length === 0
    ? data
    : globalData;

  if (!displayData || displayData.length === 0) return null;

  const bestPt = displayData.find((d) => d.is_best) || displayData[0];
  const isZoomed = viewMode === "exact_match" && displayData.some((d) => d.relative_sec !== undefined);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl space-y-3">
      {/* Header with Title & View Toggles */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-cyan-400" />
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <span>Normalized Cross-Correlation Peak Curve (NCC Apex)</span>
              {isZoomed && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono border border-emerald-500/40">
                  EXACT MATCH PEAK (±120s)
                </span>
              )}
            </h3>
          </div>
        </div>

        {/* View Switcher: Exact Match Peak vs Global Range */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode("exact_match")}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                viewMode === "exact_match"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/60 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Target className="w-3 h-3 text-emerald-400" />
              <span>Exact Match Peak (±120s)</span>
            </button>

            {globalData && globalData.length > 0 && (
              <button
                type="button"
                onClick={() => setViewMode("global")}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                  viewMode === "global"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/60 shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Globe2 className="w-3 h-3 text-cyan-400" />
                <span>Global Database Search</span>
              </button>
            )}
          </div>

          {bestPt && (
            <span className="text-emerald-400 font-bold bg-slate-950 px-2 py-1 rounded border border-slate-800">
              Apex: r = {bestPt.pearson_r.toFixed(4)}
            </span>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        {isZoomed
          ? "Dense second-by-second cross-correlation curve centered tightly on the authenticated second (t_match ± 120s). Observe the correlation climb to its apex at exactly offset 0s."
          : "Sliding Normalized Cross-Correlation curve across the full historical database."}
      </p>

      {/* Cross-Correlation Chart */}
      <div className="w-full h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={displayData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey={isZoomed ? "relative_sec" : "index"}
              stroke="#64748b"
              fontSize={10}
              tickLine={false}
              tickFormatter={(val) => (isZoomed ? (val === 0 ? "★ MATCH" : `${val > 0 ? `+${val}` : val}s`) : `+${val}s`)}
            />
            <YAxis
              domain={isZoomed ? [Math.max(-0.2, (bestPt?.pearson_r || 0.9) - 0.7), 1.0] : [-0.2, 1.0]}
              stroke="#64748b"
              fontSize={10}
              tickLine={false}
              tickFormatter={(val) => val.toFixed(2)}
              width={40}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const pt = payload[0].payload as CorrelationPoint;
                  return (
                    <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg shadow-2xl text-xs font-mono space-y-1">
                      <div className="text-slate-400 font-bold border-b border-slate-800 pb-1 mb-1">
                        {pt.relative_sec !== undefined
                          ? pt.relative_sec === 0
                            ? "★ AUTHENTICATED MATCH (Offset: 0s)"
                            : `Lag Offset: ${pt.relative_sec > 0 ? `+${pt.relative_sec}` : pt.relative_sec}s`
                          : `Index: +${pt.index}s`}
                      </div>
                      <div className="text-emerald-300 font-bold">
                        GMT: <span className="font-semibold">{pt.gmt_time || pt.timestamp_utc}</span>
                      </div>
                      {pt.casablanca_time && (
                        <div className="text-emerald-300">
                          Casablanca: <span className="font-semibold">{pt.casablanca_time}</span>
                        </div>
                      )}
                      <div className="text-cyan-400 flex justify-between gap-4 pt-1 border-t border-slate-800">
                        <span>Pearson r:</span>
                        <span className="font-bold">{pt.pearson_r.toFixed(5)}</span>
                      </div>
                      <div className="text-slate-400 flex justify-between gap-4">
                        <span>MSE:</span>
                        <span>{pt.mse.toExponential(3)}</span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            {isZoomed && (
              <ReferenceLine
                x={0}
                stroke="#10b981"
                strokeDasharray="3 3"
                strokeWidth={1.5}
                label={{ value: "MATCH (0s)", fill: "#10b981", fontSize: 10, position: "top" }}
              />
            )}
            <Line
              type="monotone"
              dataKey="pearson_r"
              stroke="#0ea5e9"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            {bestPt && (
              <ReferenceDot
                x={isZoomed ? 0 : (bestIndex ?? bestPt.index)}
                y={bestPt.pearson_r}
                r={6}
                fill="#10b981"
                stroke="#ffffff"
                strokeWidth={2}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

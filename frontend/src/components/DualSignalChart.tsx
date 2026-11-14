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
  AreaChart,
  Area,
} from "recharts";
import { GitCompare } from "lucide-react";
import { OverlayPoint } from "../lib/types";

interface DualSignalChartProps {
  data: OverlayPoint[];
  title?: string;
}

export const DualSignalChart: React.FC<DualSignalChartProps> = ({
  data,
  title = "Dual-Signal Overlay: Extracted Media ENF vs. Historical Grid Ground Truth",
}) => {
  const [showErrorChart, setShowErrorChart] = useState(true);

  if (!data || data.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-500 text-xs font-mono">
        No matched signal overlay data available. Execute database correlation to view signal alignment.
      </div>
    );
  }

  const allFreqs = data.flatMap((d) => [d.extracted_enf_hz, d.matched_grid_enf_hz]);
  const minF = Math.min(...allFreqs);
  const maxF = Math.max(...allFreqs);
  const margin = Math.max(0.006, (maxF - minF) * 0.15);
  const yDomain = [
    Math.floor((minF - margin) * 1000) / 1000,
    Math.ceil((maxF + margin) * 1000) / 1000,
  ];

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-emerald-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            {title}
          </h3>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5 text-cyan-400">
            <span className="w-3.5 h-0.5 bg-cyan-400 inline-block" />
            <span>Extracted Media ENF (Hz)</span>
          </div>
          <div className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-3.5 h-0.5 bg-emerald-400 border-dashed border-b inline-block" />
            <span>Historical Grid Ground Truth (Hz)</span>
          </div>
          <button
            onClick={() => setShowErrorChart(!showErrorChart)}
            className="text-[11px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
          >
            {showErrorChart ? "Hide Error (mHz)" : "Show Error (mHz)"}
          </button>
        </div>
      </div>

      {/* Primary Overlay Chart */}
      <div className="w-full h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="second"
              stroke="#64748b"
              fontSize={10}
              tickLine={false}
              tickFormatter={(sec) => `+${sec}s`}
            />
            <YAxis
              domain={yDomain}
              stroke="#64748b"
              fontSize={10}
              tickLine={false}
              tickFormatter={(val) => `${val.toFixed(3)}Hz`}
              width={65}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const pt = payload[0].payload as OverlayPoint;
                  return (
                    <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg shadow-2xl text-xs font-mono space-y-1">
                      <div className="text-slate-400 font-bold border-b border-slate-800 pb-1 mb-1">
                        Time: {pt.timestamp_utc} (+{pt.second}s)
                      </div>
                      <div className="text-cyan-400 flex justify-between gap-4">
                        <span>Extracted ENF:</span>
                        <span className="font-bold">{pt.extracted_enf_hz.toFixed(5)} Hz</span>
                      </div>
                      <div className="text-emerald-400 flex justify-between gap-4">
                        <span>Grid Reference:</span>
                        <span className="font-bold">{pt.matched_grid_enf_hz.toFixed(5)} Hz</span>
                      </div>
                      <div className="text-amber-300 flex justify-between gap-4 pt-1 border-t border-slate-800">
                        <span>Discrepancy (Δf):</span>
                        <span className="font-bold">
                          {pt.error_mhz > 0 ? `+${pt.error_mhz.toFixed(2)}` : pt.error_mhz.toFixed(2)} mHz
                        </span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Line
              type="monotone"
              dataKey="extracted_enf_hz"
              name="Extracted Media ENF"
              stroke="#06b6d4"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="matched_grid_enf_hz"
              name="Historical Grid Ground Truth"
              stroke="#10b981"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Residual Error Chart (mHz) */}
      {showErrorChart && (
        <div className="pt-2 border-t border-slate-800/80">
          <div className="flex justify-between items-center text-[11px] font-mono text-slate-400 mb-1">
            <span>Instantaneous Error: |f_media - f_grid| (Millihertz Scale)</span>
            <span className="text-emerald-400 font-bold">
              Mean Absolute Error:{" "}
              {(
                data.reduce((acc, curr) => acc + Math.abs(curr.error_mhz), 0) / data.length
              ).toFixed(2)}{" "}
              mHz
            </span>
          </div>
          <div className="w-full h-24">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 2" stroke="#1e293b" />
                <XAxis dataKey="second" hide />
                <YAxis
                  stroke="#64748b"
                  fontSize={9}
                  tickLine={false}
                  tickFormatter={(val) => `${val.toFixed(0)}mHz`}
                  width={55}
                />
                <Area
                  type="monotone"
                  dataKey="error_mhz"
                  stroke="#f59e0b"
                  fill="#f59e0b"
                  fillOpacity={0.15}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};

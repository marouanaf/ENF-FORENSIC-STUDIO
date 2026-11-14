"use client";

import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceDot,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { CorrelationPoint } from "../lib/types";

interface CorrelationCurveChartProps {
  data: CorrelationPoint[];
  bestIndex?: number;
}

export const CorrelationCurveChart: React.FC<CorrelationCurveChartProps> = ({
  data,
}) => {
  if (!data || data.length === 0) return null;

  const bestPt = data.find((d) => d.is_best) || data[0];

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            Sliding Normalized Cross-Correlation Curve (NCC)
          </h3>
        </div>
        <div className="text-[11px] font-mono text-slate-400 flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
            Peak Correlation: <strong className="text-emerald-400">{bestPt?.pearson_r.toFixed(4)}</strong>
          </span>
          <span className="text-slate-500">
            Windows: {data.length.toLocaleString()}
          </span>
        </div>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        Sliding Normalized Cross-Correlation across the entire Parquet database computed via FFT convolution.
        Observe the distinct correlation spike at the authentic second rising decisively above the background noise floor.
      </p>

      <div className="w-full h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="index"
              stroke="#64748b"
              fontSize={10}
              tickLine={false}
              tickFormatter={(idx) => `+${idx}s`}
            />
            <YAxis
              domain={[-0.2, 1.0]}
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
                    <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-lg shadow-xl text-xs font-mono">
                      <div className="text-slate-400 font-bold mb-1">
                        Offset: +{pt.index}s ({pt.timestamp_utc})
                      </div>
                      <div className="text-cyan-400 flex justify-between gap-4">
                        <span>Pearson r:</span>
                        <span className="font-bold">{pt.pearson_r.toFixed(4)}</span>
                      </div>
                      <div className="text-slate-400 flex justify-between gap-4">
                        <span>MSE:</span>
                        <span>{pt.mse.toExponential(3)}</span>
                      </div>
                      {pt.is_best && (
                        <div className="mt-1 text-emerald-400 font-bold border-t border-slate-800 pt-1">
                          ★ #1 AUTHENTICATED MATCH
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              }}
            />
            <Line
              type="monotone"
              dataKey="pearson_r"
              stroke="#0ea5e9"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
            {bestPt && (
              <ReferenceDot
                x={bestPt.index}
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

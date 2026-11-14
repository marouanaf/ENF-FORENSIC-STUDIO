"use client";

import React, { useState } from "react";
import {
  Activity,
  Zap,
  Radio,
  Sliders,
  Maximize2,
  AlertTriangle,
  Info,
} from "lucide-react";
import { FourierSpectrumData } from "../lib/types";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

interface FourierSpectrumInspectorProps {
  data?: FourierSpectrumData;
  mediaId?: string;
  currentTime?: number;
  onSliceChange?: (sliceSec: number) => void;
}

export const FourierSpectrumInspector: React.FC<FourierSpectrumInspectorProps> = ({
  data,
  mediaId,
  currentTime = 60.0,
  onSliceChange,
}) => {
  const [sliceDuration, setSliceDuration] = useState<number>(data?.slice_duration_sec || 0.5);
  const [zoomRange, setZoomRange] = useState<"full" | "zoom_100">("full");

  if (!data || !data.frequencies || data.frequencies.length === 0) {
    return null;
  }

  const {
    frequencies,
    magnitudes,
    peak_50hz,
    peak_100hz,
    peak_200hz,
    peak_compressor,
    nominal_grid_hz = 50.0,
  } = data;

  // Build chart points
  const chartPoints = frequencies.map((f, i) => ({
    freq: f,
    mag: magnitudes[i] || 0.0,
  }));

  const displayPoints = zoomRange === "zoom_100"
    ? chartPoints.filter((p) => p.freq >= 85.0 && p.freq <= 115.0)
    : chartPoints;

  const handleSelectSlice = (s: number) => {
    setSliceDuration(s);
    if (onSliceChange) onSliceChange(s);
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
      {/* Mathematical Header matching Image 1 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              Discrete Fourier Transform Frequency Spectrum
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/40">
              Morocco 50 Hz Grid &amp; 100 Hz Mains Hum Peak
            </span>
          </div>

          {/* Mathematical Fourier Equation */}
          <div className="flex items-baseline gap-3 pt-1">
            <div className="text-xl sm:text-2xl font-serif text-cyan-300 tracking-wide font-normal">
              <span className="text-cyan-400 font-bold">X(f)</span> ={" "}
              <span className="text-2xl sm:text-3xl font-serif font-light text-slate-300">∫</span>{" "}
              x(t) e<sup className="text-xs text-emerald-400 font-sans font-bold">-2π i f t</sup> dt
            </div>
            <span className="text-xs font-mono text-slate-500 font-bold">
              T = {sliceDuration.toFixed(1)} s
            </span>
          </div>
        </div>

        {/* Slice Window Duration Toggles */}
        <div className="flex items-center gap-2 self-start sm:self-center text-xs font-mono">
          <span className="text-slate-400 text-[11px] hidden md:inline">Window T:</span>
          <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
            {[0.5, 1.0, 2.0, 5.0].map((tVal) => (
              <button
                key={tVal}
                type="button"
                onClick={() => handleSelectSlice(tVal)}
                className={`px-2.5 py-0.5 rounded text-xs transition-colors cursor-pointer ${
                  sliceDuration === tVal
                    ? "bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/60"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {tVal}s
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setZoomRange(zoomRange === "full" ? "zoom_100" : "full")}
            className={`px-2.5 py-1 rounded text-xs border transition-colors cursor-pointer flex items-center gap-1 ${
              zoomRange === "zoom_100"
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/60 font-bold"
                : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
            }`}
          >
            <Maximize2 className="w-3 h-3" />
            <span>{zoomRange === "zoom_100" ? "0 – 450 Hz Full" : "Zoom 100 Hz"}</span>
          </button>
        </div>
      </div>

      {/* Explanatory Banner */}
      <div className="text-xs text-slate-300 leading-relaxed font-sans bg-slate-950/70 p-3 rounded-lg border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="font-bold text-emerald-400">Forensic Identification:</span> Electrical power in Morocco operates at nominal 50 Hz. Due to magnetic attraction and appliance power scaling ($P \propto I^2$), the dominant mains hum frequency appears at its double: <strong className="text-white font-mono">100 Hz</strong>. Notice the sharp peak at ~100 Hz isolating the electricity grid hum from competing mechanical compressor noise (~98.45 Hz).
        </div>
      </div>

      {/* Peak Telemetry Indicators */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
        {/* 100 Hz Primary Peak */}
        <div className="bg-slate-950 border border-emerald-500/50 rounded-lg p-2.5 space-y-0.5">
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-emerald-400 font-bold">★ 100 Hz Mains Hum (f₂)</span>
            <span className="text-[9px] px-1 rounded bg-emerald-950 text-emerald-300">Morocco</span>
          </div>
          <div className="text-base font-bold text-white">
            {peak_100hz?.freq ? `${peak_100hz.freq.toFixed(3)} Hz` : "100.000 Hz"}
          </div>
          <span className="text-[10px] text-slate-500 block">Peak of Mains Induction</span>
        </div>

        {/* 50 Hz Fundamental */}
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 space-y-0.5">
          <span className="text-[10px] text-amber-400 font-bold block">50 Hz Base Grid (f₁)</span>
          <div className="text-base font-bold text-slate-200">
            {peak_50hz?.freq ? `${peak_50hz.freq.toFixed(3)} Hz` : "50.000 Hz"}
          </div>
          <span className="text-[10px] text-slate-500 block">Base Fundamental</span>
        </div>

        {/* 200 Hz Rectifier Harmonic */}
        <div className="bg-slate-950 border border-cyan-500/30 rounded-lg p-2.5 space-y-0.5">
          <span className="text-[10px] text-cyan-400 font-bold block">200 Hz Harmonic (f₄)</span>
          <div className="text-base font-bold text-slate-200">
            {peak_200hz?.freq ? `${peak_200hz.freq.toFixed(3)} Hz` : "200.000 Hz"}
          </div>
          <span className="text-[10px] text-slate-500 block">Rectifier Full-Wave Ripple</span>
        </div>

        {/* 98.45 Hz Mechanical Compressor */}
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 space-y-0.5">
          <span className="text-[10px] text-rose-400 font-bold block">98.45 Hz Mechanical Peak</span>
          <div className="text-base font-bold text-slate-400">
            {peak_compressor?.freq ? `${peak_compressor.freq.toFixed(2)} Hz` : "98.45 Hz"}
          </div>
          <span className="text-[10px] text-slate-500 block">Filtered Motor Noise</span>
        </div>
      </div>

      {/* Primary Area Chart matching Image 1 */}
      <div className="w-full h-64 bg-slate-950/80 border border-slate-800 rounded-lg p-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={displayPoints} margin={{ top: 15, right: 20, left: 10, bottom: 5 }}>
            <defs>
              <linearGradient id="spectrumGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.6} />
                <stop offset="95%" stopColor="#0369a1" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="freq"
              stroke="#64748b"
              fontSize={10}
              tickLine={false}
              tickFormatter={(v) => `${Math.round(v)}`}
              domain={zoomRange === "zoom_100" ? [85, 115] : [15, 450]}
            />
            <YAxis
              stroke="#64748b"
              fontSize={10}
              tickLine={false}
              tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
              domain={[0, 1.05]}
              width={40}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const pt = payload[0].payload;
                  return (
                    <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-lg shadow-2xl text-xs font-mono space-y-1">
                      <div className="text-cyan-400 font-bold border-b border-slate-800 pb-1">
                        Frequency: {pt.freq.toFixed(2)} Hz
                      </div>
                      <div className="text-white flex justify-between gap-4">
                        <span>Normalized Power:</span>
                        <span className="font-bold">{(pt.mag * 100).toFixed(1)}%</span>
                      </div>
                      {Math.abs(pt.freq - 100.0) < 1.0 && (
                        <div className="text-emerald-400 font-semibold pt-1 border-t border-slate-800">
                          ★ 100 Hz Electricity Peak (Morocco)
                        </div>
                      )}
                      {Math.abs(pt.freq - 98.45) < 1.0 && (
                        <div className="text-rose-400 font-semibold pt-1 border-t border-slate-800">
                          ⚠ Mechanical Motor / Compressor Peak
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              }}
            />

            {/* Reference Line for 100 Hz Mains Hum */}
            <ReferenceLine
              x={100.0}
              stroke="#10b981"
              strokeWidth={2}
              strokeDasharray="4 2"
              label={{ value: "100 Hz (f₂)", fill: "#10b981", fontSize: 11, position: "top" }}
            />

            {/* Reference Line for 50 Hz Base */}
            {zoomRange === "full" && (
              <ReferenceLine
                x={50.0}
                stroke="#fbbf24"
                strokeWidth={1.5}
                strokeDasharray="3 3"
                label={{ value: "50 Hz (f₁)", fill: "#fbbf24", fontSize: 10, position: "top" }}
              />
            )}

            {/* Reference Line for 200 Hz Rectifier */}
            {zoomRange === "full" && (
              <ReferenceLine
                x={200.0}
                stroke="#06b6d4"
                strokeWidth={1.5}
                strokeDasharray="3 3"
                label={{ value: "200 Hz (f₄)", fill: "#06b6d4", fontSize: 10, position: "top" }}
              />
            )}

            <Area
              type="monotone"
              dataKey="mag"
              stroke="#38bdf8"
              strokeWidth={2}
              fill="url(#spectrumGradient)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 pt-1">
        <span>f (Hz)</span>
        <span>Fourier Spectral Decomposition across 0 – 450 Hz</span>
        <span>T = {sliceDuration.toFixed(1)} s</span>
      </div>
    </div>
  );
};

"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import { Eye, Layers, Palette, Info, Check } from "lucide-react";
import { SpectrogramData, EnfTrace } from "../lib/types";

interface SpectrogramViewProps {
  spectrogram: SpectrogramData;
  trace: EnfTrace;
}

type ColormapType = "forensic_cyan" | "viridis" | "inferno" | "thermal";

export const SpectrogramView: React.FC<SpectrogramViewProps> = ({
  spectrogram,
  trace,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<{ time: number; freq: number } | null>(null);
  const [colormap, setColormap] = useState<ColormapType>("forensic_cyan");
  const [showTraceOverlay, setShowTraceOverlay] = useState<boolean>(true);

  // Colormaps
  const getColor = useMemo(() => {
    return (val: number, cmap: ColormapType): string => {
      const v = Math.max(0, Math.min(1, val));

      if (cmap === "forensic_cyan") {
        // Deep blue -> teal -> cyan -> emerald -> bright white
        if (v < 0.25) {
          const t = v / 0.25;
          return `rgb(${Math.round(2 + t * 10)}, ${Math.round(6 + t * 40)}, ${Math.round(23 + t * 100)})`;
        } else if (v < 0.55) {
          const t = (v - 0.25) / 0.3;
          return `rgb(${Math.round(12 + t * 6)}, ${Math.round(46 + t * 136)}, ${Math.round(123 + t * 89)})`;
        } else if (v < 0.8) {
          const t = (v - 0.55) / 0.25;
          return `rgb(${Math.round(18 + t * 0)}, ${Math.round(182 + t * 3)}, ${Math.round(212 - t * 83)})`;
        } else {
          const t = (v - 0.8) / 0.2;
          return `rgb(${Math.round(18 + t * 230)}, ${Math.round(185 + t * 70)}, ${Math.round(129 + t * 70)})`;
        }
      } else if (cmap === "viridis") {
        // Deep purple -> blue -> teal -> green -> yellow
        const r = Math.round(255 * Math.sin(v * Math.PI * 0.7));
        const g = Math.round(255 * v);
        const b = Math.round(255 * (1 - v * 0.8));
        return `rgb(${r}, ${g}, ${b})`;
      } else if (cmap === "inferno") {
        // Black -> purple -> orange -> yellow
        const r = Math.round(255 * Math.min(1, v * 1.5));
        const g = Math.round(255 * Math.max(0, (v - 0.3) * 1.4));
        const b = Math.round(255 * Math.max(0, (v - 0.6) * 2.5));
        return `rgb(${r}, ${g}, ${b})`;
      } else {
        // High-contrast thermal grayscale
        const lum = Math.round(v * 255);
        return `rgb(${lum}, ${lum}, ${lum})`;
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !spectrogram.power_norm || spectrogram.power_norm.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const numTimes = spectrogram.power_norm.length;
    const numFreqs = spectrogram.frequencies.length;
    if (numTimes === 0 || numFreqs === 0) return;

    const cellWidth = width / numTimes;
    const cellHeight = height / numFreqs;

    // Render Heatmap Matrix
    for (let t = 0; t < numTimes; t++) {
      const col = spectrogram.power_norm[t];
      if (!col) continue;
      for (let f = 0; f < numFreqs; f++) {
        const val = col[f];
        ctx.fillStyle = getColor(val, colormap);
        const x = t * cellWidth;
        const y = height - (f + 1) * cellHeight;
        ctx.fillRect(x, y, Math.ceil(cellWidth), Math.ceil(cellHeight));
      }
    }

    // Overlay Sub-Bin Parabolic ENF Trace
    if (showTraceOverlay && trace.raw_enf && trace.raw_enf.length > 0) {
      const minF = spectrogram.min_freq;
      const maxF = spectrogram.max_freq;
      const fSpan = maxF - minF;

      // Glow outline
      ctx.shadowColor = "#38bdf8";
      ctx.shadowBlur = 8;
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2.5;
      ctx.beginPath();

      trace.raw_enf.forEach((fVal, idx) => {
        const x = (idx + 0.5) * cellWidth;
        const normY = (fVal - minF) / fSpan;
        const y = height - normY * height;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Crisp inner white core
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }, [spectrogram, trace, colormap, showTraceOverlay, getColor]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !spectrogram.frequencies.length) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const timeFrac = Math.max(0, Math.min(1, x / rect.width));
    const totalTime = spectrogram.times[spectrogram.times.length - 1] || 1;
    const hoverT = timeFrac * totalTime;

    const freqFrac = 1.0 - Math.max(0, Math.min(1, y / rect.height));
    const hoverF = spectrogram.min_freq + freqFrac * (spectrogram.max_freq - spectrogram.min_freq);

    setHoveredPoint({ time: hoverT, freq: hoverF });
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl space-y-3">
      {/* Spectrogram Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            Narrowband Forensic Spectrogram Heatmap
          </h3>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
            [{spectrogram.min_freq.toFixed(2)} Hz – {spectrogram.max_freq.toFixed(2)} Hz]
          </span>
        </div>

        {/* Colormap & Display Toggles */}
        <div className="flex items-center gap-3 text-xs font-mono">
          {/* Colormap Selector */}
          <div className="flex items-center gap-1.5 text-slate-400">
            <Palette className="w-3.5 h-3.5" />
            <select
              value={colormap}
              onChange={(e) => setColormap(e.target.value as ColormapType)}
              className="bg-slate-950 border border-slate-800 rounded px-2 py-0.5 text-slate-200 text-xs cursor-pointer focus:outline-none"
            >
              <option value="forensic_cyan">Cyber / Teal</option>
              <option value="viridis">Viridis</option>
              <option value="inferno">Inferno</option>
              <option value="thermal">Thermal Mono</option>
            </select>
          </div>

          {/* Toggle Ridge Overlay */}
          <button
            onClick={() => setShowTraceOverlay(!showTraceOverlay)}
            className={`flex items-center gap-1 px-2.5 py-0.5 rounded border text-xs cursor-pointer transition-colors ${
              showTraceOverlay
                ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/60"
                : "bg-slate-800 text-slate-400 border-slate-700"
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>ENF Ridge Overlay</span>
          </button>

          {/* Telemetry coordinate readout */}
          {hoveredPoint && (
            <span className="text-emerald-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
              t={hoveredPoint.time.toFixed(1)}s | f={hoveredPoint.freq.toFixed(4)}Hz
            </span>
          )}
        </div>
      </div>

      {/* Canvas Heatmap Area */}
      <div className="relative flex">
        {/* Y-Axis (Frequency) */}
        <div className="w-16 flex flex-col justify-between py-1 text-right pr-2 text-[10px] font-mono text-slate-500 select-none">
          <span>{spectrogram.max_freq.toFixed(2)}Hz</span>
          <span className="text-cyan-400 font-bold">{spectrogram.center_freq.toFixed(1)}Hz</span>
          <span>{spectrogram.min_freq.toFixed(2)}Hz</span>
        </div>

        {/* Heatmap Canvas */}
        <div className="flex-1 relative h-44 rounded-lg overflow-hidden border border-slate-800 bg-slate-950 shadow-inner">
          <canvas
            ref={canvasRef}
            width={760}
            height={176}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoveredPoint(null)}
            className="w-full h-full block cursor-crosshair"
          />
        </div>
      </div>

      {/* X-Axis (Time) */}
      <div className="flex justify-between pl-16 pr-2 text-[10px] font-mono text-slate-500">
        <span>0.00s</span>
        <span>Timeline Offset (Seconds from Start of Selected ROI)</span>
        <span>{(spectrogram.times[spectrogram.times.length - 1] || 0).toFixed(1)}s</span>
      </div>
    </div>
  );
};

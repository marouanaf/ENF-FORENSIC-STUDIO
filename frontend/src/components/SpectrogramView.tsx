"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import { Eye, Layers, Palette, Info, Check, ZoomIn, ZoomOut, Sparkles } from "lucide-react";
import { SpectrogramData, EnfTrace } from "../lib/types";

interface SpectrogramViewProps {
  spectrogram: SpectrogramData;
  widebandSpectrogram?: SpectrogramData;
  trace: EnfTrace;
}

type ColormapType = "forensic_cyan" | "viridis" | "inferno" | "thermal";
type SpectrogramMode = "narrowband" | "wideband";

export const SpectrogramView: React.FC<SpectrogramViewProps> = ({
  spectrogram,
  widebandSpectrogram,
  trace,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<{ time: number; freq: number } | null>(null);
  const [colormap, setColormap] = useState<ColormapType>("forensic_cyan");
  const [showTraceOverlay, setShowTraceOverlay] = useState<boolean>(true);
  const [mode, setMode] = useState<SpectrogramMode>("narrowband");

  const activeSpectrogram = (mode === "wideband" && widebandSpectrogram && widebandSpectrogram.power_norm?.length > 0)
    ? widebandSpectrogram
    : spectrogram;

  // Colormaps
  const getColor = useMemo(() => {
    return (val: number, cmap: ColormapType): string => {
      const v = Math.max(0, Math.min(1, val));

      if (cmap === "forensic_cyan") {
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
        const r = Math.round(255 * Math.sin(v * Math.PI * 0.7));
        const g = Math.round(255 * v);
        const b = Math.round(255 * (1 - v * 0.8));
        return `rgb(${r}, ${g}, ${b})`;
      } else if (cmap === "inferno") {
        const r = Math.round(255 * Math.min(1, v * 1.5));
        const g = Math.round(255 * Math.max(0, (v - 0.3) * 1.4));
        const b = Math.round(255 * Math.max(0, (v - 0.6) * 2.5));
        return `rgb(${r}, ${g}, ${b})`;
      } else {
        const lum = Math.round(v * 255);
        return `rgb(${lum}, ${lum}, ${lum})`;
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeSpectrogram.power_norm || activeSpectrogram.power_norm.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const numTimes = activeSpectrogram.power_norm.length;
    const numFreqs = activeSpectrogram.frequencies.length;
    if (numTimes === 0 || numFreqs === 0) return;

    const cellWidth = width / numTimes;
    const cellHeight = height / numFreqs;

    // Render Heatmap Matrix
    for (let t = 0; t < numTimes; t++) {
      const col = activeSpectrogram.power_norm[t];
      if (!col) continue;
      for (let f = 0; f < numFreqs; f++) {
        const val = col[f];
        ctx.fillStyle = getColor(val, colormap);
        const x = t * cellWidth;
        const y = height - (f + 1) * cellHeight;
        ctx.fillRect(x, y, Math.ceil(cellWidth), Math.ceil(cellHeight));
      }
    }

    // Overlay White Dotted Peak Trajectory Line (Image 3 Style)
    if (showTraceOverlay && trace.raw_enf && trace.raw_enf.length > 0) {
      const minF = activeSpectrogram.min_freq;
      const maxF = activeSpectrogram.max_freq;
      const fSpan = maxF - minF;

      ctx.save();

      // In narrowband mode, render the exact white dotted peak line (Image 3)
      if (mode === "narrowband") {
        // 1. Draw glowing connecting line
        ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let first = true;
        trace.raw_enf.forEach((fVal, idx) => {
          if (fVal >= minF && fVal <= maxF) {
            const x = (idx + 0.5) * cellWidth;
            const normY = (fVal - minF) / fSpan;
            const y = height - normY * height;
            if (first) {
              ctx.moveTo(x, y);
              first = false;
            } else {
              ctx.lineTo(x, y);
            }
          }
        });
        ctx.stroke();

        // 2. Draw crisp white dots for each 1-second instantaneous peak (Image 3)
        trace.raw_enf.forEach((fVal, idx) => {
          if (fVal >= minF && fVal <= maxF) {
            const x = (idx + 0.5) * cellWidth;
            const normY = (fVal - minF) / fSpan;
            const y = height - normY * height;

            ctx.beginPath();
            ctx.arc(x, y, 2.2, 0, 2 * Math.PI);
            ctx.fillStyle = "#ffffff";
            ctx.shadowColor = "#38bdf8";
            ctx.shadowBlur = 4;
            ctx.fill();
          }
        });
      } else {
        // Wideband mode (Image 2): Draw 100 Hz (f2) and 200 Hz (f4) reference lines
        const drawHLine = (freqHz: number, color: string, label: string) => {
          if (freqHz >= minF && freqHz <= maxF) {
            const normY = (freqHz - minF) / fSpan;
            const y = height - normY * height;
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();

            ctx.fillStyle = color;
            ctx.font = "bold 11px monospace";
            ctx.fillText(label, 8, y - 4);
          }
        };

        drawHLine(100.0, "#38bdf8", "f₂ (100 Hz Mains Hum)");
        drawHLine(150.0, "#94a3b8", "150 Hz");
        drawHLine(200.0, "#fbbf24", "f₄ (200 Hz Rectifier Harmonic)");
      }

      ctx.restore();
    }
  }, [activeSpectrogram, trace, colormap, showTraceOverlay, getColor, mode]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !activeSpectrogram.frequencies.length) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const timeFrac = Math.max(0, Math.min(1, x / rect.width));
    const totalTime = activeSpectrogram.times[activeSpectrogram.times.length - 1] || 1;
    const hoverT = timeFrac * totalTime;

    const freqFrac = 1.0 - Math.max(0, Math.min(1, y / rect.height));
    const hoverF = activeSpectrogram.min_freq + freqFrac * (activeSpectrogram.max_freq - activeSpectrogram.min_freq);

    setHoveredPoint({ time: hoverT, freq: hoverF });
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl space-y-3">
      {/* Spectrogram Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            {mode === "narrowband"
              ? "100 Hz Narrowband Peak Ridge Spectrogram"
              : "Wideband Multi-Harmonic Spectrogram (f₂, 150Hz, f₄)"}
          </h3>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
            [{activeSpectrogram.min_freq.toFixed(1)} Hz – {activeSpectrogram.max_freq.toFixed(1)} Hz]
          </span>
        </div>

        {/* View Mode & Colormap Toggles */}
        <div className="flex items-center gap-2.5 text-xs font-mono flex-wrap">
          {/* Mode Switcher: Narrowband (Image 3) vs Wideband (Image 2) */}
          <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => setMode("narrowband")}
              className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer flex items-center gap-1 ${
                mode === "narrowband"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/60 font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <ZoomIn className="w-3 h-3" />
              <span>100 Hz Zoom (Image 3)</span>
            </button>

            {widebandSpectrogram && (
              <button
                type="button"
                onClick={() => setMode("wideband")}
                className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer flex items-center gap-1 ${
                  mode === "wideband"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/60 font-bold"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <ZoomOut className="w-3 h-3" />
                <span>80 – 220 Hz Wide (Image 2)</span>
              </button>
            )}
          </div>

          {/* Colormap Selector */}
          <div className="flex items-center gap-1 text-slate-400">
            <Palette className="w-3 h-3" />
            <select
              value={colormap}
              onChange={(e) => setColormap(e.target.value as ColormapType)}
              className="bg-slate-950 border border-slate-800 rounded px-2 py-0.5 text-slate-200 text-xs cursor-pointer focus:outline-none"
            >
              <option value="forensic_cyan">Cyber Teal</option>
              <option value="inferno">Inferno Glow</option>
              <option value="viridis">Viridis</option>
              <option value="thermal">Thermal Mono</option>
            </select>
          </div>

          {/* Toggle Peak Dotted Overlay */}
          <button
            onClick={() => setShowTraceOverlay(!showTraceOverlay)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded border text-xs cursor-pointer transition-colors ${
              showTraceOverlay
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/60 font-semibold"
                : "bg-slate-800 text-slate-400 border-slate-700"
            }`}
          >
            <Sparkles className="w-3 h-3" />
            <span>White Dotted Peak Ridge</span>
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
          <span>{activeSpectrogram.max_freq.toFixed(2)}Hz</span>
          <span className="text-cyan-400 font-bold">{activeSpectrogram.center_freq.toFixed(1)}Hz</span>
          <span>{activeSpectrogram.min_freq.toFixed(2)}Hz</span>
        </div>

        {/* Heatmap Canvas */}
        <div className="flex-1 relative h-48 rounded-lg overflow-hidden border border-slate-800 bg-slate-950 shadow-inner">
          <canvas
            ref={canvasRef}
            width={760}
            height={192}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoveredPoint(null)}
            className="w-full h-full block cursor-crosshair"
          />
        </div>
      </div>

      {/* X-Axis (Time) */}
      <div className="flex justify-between pl-16 pr-2 text-[10px] font-mono text-slate-500">
        <span>0.00s</span>
        <span>
          {mode === "narrowband"
            ? "100 Hz Instantaneous Peak Trajectory (White Dots) across Selected Interval"
            : "Multi-Harmonic Spectrogram Overview (f₂ at 100 Hz, f₄ at 200 Hz)"}
        </span>
        <span>{(activeSpectrogram.times[activeSpectrogram.times.length - 1] || 0).toFixed(1)}s</span>
      </div>
    </div>
  );
};

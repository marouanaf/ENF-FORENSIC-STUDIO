"use client";

import React, { useEffect, useRef, useState } from "react";
import { Eye, ZoomIn, Info, Activity } from "lucide-react";
import { SpectrogramData, EnfTrace } from "../lib/types";

interface SpectrogramViewProps {
  spectrogram: SpectrogramData;
  trace: EnfTrace;
}

export const SpectrogramView: React.FC<SpectrogramViewProps> = ({
  spectrogram,
  trace,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<{ time: number; freq: number; db: number } | null>(null);

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

    // Colormap function: deep blue (0) -> teal -> cyan -> emerald -> bright yellow (1)
    const getColor = (val: number): string => {
      const v = Math.max(0, Math.min(1, val));
      if (v < 0.25) {
        // Deep blue to navy
        const t = v / 0.25;
        const r = Math.round(2 + t * 10);
        const g = Math.round(6 + t * 40);
        const b = Math.round(23 + t * 100);
        return `rgb(${r},${g},${b})`;
      } else if (v < 0.55) {
        // Navy to cyan
        const t = (v - 0.25) / 0.3;
        const r = Math.round(12 + t * 6);
        const g = Math.round(46 + t * 136);
        const b = Math.round(123 + t * 89);
        return `rgb(${r},${g},${b})`;
      } else if (v < 0.8) {
        // Cyan to emerald
        const t = (v - 0.55) / 0.25;
        const r = Math.round(18 + t * 0);
        const g = Math.round(182 + t * 3);
        const b = Math.round(212 - t * 83);
        return `rgb(${r},${g},${b})`;
      } else {
        // Emerald to bright neon yellow/white
        const t = (v - 0.8) / 0.2;
        const r = Math.round(18 + t * 230);
        const g = Math.round(185 + t * 70);
        const b = Math.round(129 + t * 70);
        return `rgb(${r},${g},${b})`;
      }
    };

    // Draw spectrogram heatmap: Y=0 is highest frequency, Y=height is lowest frequency
    for (let t = 0; t < numTimes; t++) {
      const col = spectrogram.power_norm[t];
      if (!col) continue;
      for (let f = 0; f < numFreqs; f++) {
        const val = col[f];
        ctx.fillStyle = getColor(val);
        const x = t * cellWidth;
        const y = height - (f + 1) * cellHeight; // lower freq at bottom
        ctx.fillRect(x, y, Math.ceil(cellWidth), Math.ceil(cellHeight));
      }
    }

    // Overlay the extracted sub-bin instantaneous ENF line (glowing magenta/cyan line)
    if (trace.raw_enf && trace.raw_enf.length > 0) {
      const minF = spectrogram.min_freq;
      const maxF = spectrogram.max_freq;
      const fSpan = maxF - minF;

      // Glow pass
      ctx.shadowColor = "#38bdf8";
      ctx.shadowBlur = 6;
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2.5;
      ctx.beginPath();

      trace.raw_enf.forEach((fVal, idx) => {
        const x = (idx + 0.5) * cellWidth;
        const normY = (fVal - minF) / fSpan;
        const y = height - normY * height;
        if (idx === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      // Sharp core pass
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }, [spectrogram, trace]);

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

    setHoveredPoint({ time: hoverT, freq: hoverF, db: 0 });
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            Narrowband Forensic Spectrogram Preview
          </h3>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
            Band: [{spectrogram.min_freq.toFixed(2)} Hz – {spectrogram.max_freq.toFixed(2)} Hz]
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
          <span className="flex items-center gap-1.5 text-cyan-300">
            <span className="w-3 h-0.5 bg-cyan-400 rounded inline-block" />
            Extracted ENF Sub-Bin Trace
          </span>
          {hoveredPoint && (
            <span className="text-emerald-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
              t={hoveredPoint.time.toFixed(1)}s | f={hoveredPoint.freq.toFixed(3)}Hz
            </span>
          )}
        </div>
      </div>

      {/* Spectrogram Canvas with Axes */}
      <div className="relative flex">
        {/* Y-Axis (Frequency) */}
        <div className="w-16 flex flex-col justify-between py-1 text-right pr-2 text-[10px] font-mono text-slate-500 select-none">
          <span>{spectrogram.max_freq.toFixed(2)}Hz</span>
          <span className="text-cyan-400 font-bold">{spectrogram.center_freq.toFixed(1)}Hz</span>
          <span>{spectrogram.min_freq.toFixed(2)}Hz</span>
        </div>

        {/* Canvas */}
        <div className="flex-1 relative h-44 rounded-lg overflow-hidden border border-slate-800 bg-slate-950">
          <canvas
            ref={canvasRef}
            width={720}
            height={176}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoveredPoint(null)}
            className="w-full h-full block cursor-crosshair"
          />
        </div>
      </div>

      {/* X-Axis (Time) */}
      <div className="flex justify-between pl-16 pr-2 pt-1 text-[10px] font-mono text-slate-500">
        <span>0.0s</span>
        <span>Time (seconds from start of ROI)</span>
        <span>
          {(spectrogram.times[spectrogram.times.length - 1] || 0).toFixed(1)}s
        </span>
      </div>
    </div>
  );
};

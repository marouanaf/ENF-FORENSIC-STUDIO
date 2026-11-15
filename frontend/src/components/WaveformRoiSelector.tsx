"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Scissors,
  Sliders,
  Radio,
  Sparkles,
  Zap,
  Activity,
  Flame,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { getMediaStreamUrl } from "../lib/api";
import { ScanQualityResponse, RecommendedRoiPocket } from "../lib/types";

interface WaveformRoiSelectorProps {
  mediaId: string;
  duration: number;
  waveformPeaks: number[];
  roiStart: number;
  roiDuration: number;
  onChangeRoi: (start: number, duration: number) => void;
  targetFreq?: number;
  qualityScan?: ScanQualityResponse | null;
  onScanQuality?: () => void;
  isScanningQuality?: boolean;
}

export const WaveformRoiSelector: React.FC<WaveformRoiSelectorProps> = ({
  mediaId,
  duration,
  waveformPeaks,
  roiStart,
  roiDuration,
  onChangeRoi,
  targetFreq = 100.0,
  qualityScan,
  onScanQuality,
  isScanningQuality = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const heatCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [humMonitorActive, setHumMonitorActive] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [dragMode, setDragMode] = useState<"left" | "right" | "window" | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragInitialStart, setDragInitialStart] = useState(0);
  const [hoveredInfo, setHoveredInfo] = useState<{ time: number; snr?: number; quality?: number } | null>(null);

  // Web Audio API filter for the Forensic Hum Monitor
  const audioContextRef = useRef<AudioContext | null>(null);
  const biquadFilterRef = useRef<BiquadFilterNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);

  const effectiveDuration = Math.max(1, duration);
  const roiEnd = Math.min(effectiveDuration, roiStart + roiDuration);

  // Draw Waveform Canvas
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = "#030712";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    const peaks = waveformPeaks && waveformPeaks.length > 0
      ? waveformPeaks
      : Array.from({ length: 250 }, (_, idx) => Math.abs(Math.sin(idx * 0.15)) * 0.5 + 0.1);

    const barWidth = width / peaks.length;
    const midY = height / 2;

    // Draw bars
    peaks.forEach((peak, i) => {
      const x = i * barWidth;
      const barHeight = Math.max(2, peak * (height * 0.88));

      const timeAtBar = (i / peaks.length) * effectiveDuration;
      const inRoi = timeAtBar >= roiStart && timeAtBar <= roiEnd;

      if (inRoi) {
        ctx.fillStyle = "#06b6d4";
      } else {
        ctx.fillStyle = "#1e293b";
      }

      ctx.fillRect(x, midY - barHeight / 2, Math.max(1, barWidth - 1), barHeight);
    });

    // ROI Boundaries
    const startX = (roiStart / effectiveDuration) * width;
    const endX = (roiEnd / effectiveDuration) * width;

    // Dimmed overlay outside selection
    ctx.fillStyle = "rgba(2, 6, 23, 0.70)";
    ctx.fillRect(0, 0, startX, height);
    ctx.fillRect(endX, 0, width - endX, height);

    // Bounding Box
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 2;
    ctx.strokeRect(startX, 1, Math.max(2, endX - startX), height - 2);

    // Draggable Handle - Left
    ctx.fillStyle = "#10b981";
    ctx.fillRect(startX - 3, 0, 6, height);
    // Draggable Handle - Right
    ctx.fillRect(endX - 3, 0, 6, height);

    // Playhead line
    if (currentTime > 0) {
      const playheadX = (currentTime / effectiveDuration) * width;
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
    }
  }, [effectiveDuration, roiStart, roiEnd, waveformPeaks, currentTime]);

  // Draw ENF Quality & SNR Heat Ribbon
  const drawHeatRibbon = useCallback(() => {
    const canvas = heatCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = "#030712";
    ctx.fillRect(0, 0, width, height);

    if (qualityScan?.timeline && qualityScan.timeline.length > 0) {
      const timeline = qualityScan.timeline;
      const numPts = timeline.length;
      const cellWidth = width / numPts;

      timeline.forEach((pt, idx) => {
        const x = idx * cellWidth;
        const snr = pt.snr_db;

        // Color coding by 100 Hz hum SNR clarity
        let color = "#1e293b"; // Muted slate (< 10 dB)
        if (snr >= 24.0) {
          color = "#10b981"; // Vibrant Emerald (Super clean indoor hum, fridge/lamp audible)
        } else if (snr >= 18.0) {
          color = "#06b6d4"; // Vibrant Cyan / Teal
        } else if (snr >= 12.0) {
          color = "#f59e0b"; // Amber (Moderate hum, some speech)
        } else if (snr >= 8.0) {
          color = "#64748b"; // Low hum
        }

        ctx.fillStyle = color;
        ctx.fillRect(x, 0, Math.ceil(cellWidth), height);
      });

      // Highlight Recommended Pockets with top borders
      if (qualityScan.recommended_pockets) {
        qualityScan.recommended_pockets.forEach((p, pIdx) => {
          const pStartX = (p.start_sec / effectiveDuration) * width;
          const pEndX = (p.end_sec / effectiveDuration) * width;
          const pWidth = Math.max(2, pEndX - pStartX);

          ctx.strokeStyle = pIdx === 0 ? "#10b981" : "#06b6d4";
          ctx.lineWidth = 2;
          ctx.strokeRect(pStartX, 0, pWidth, height);
        });
      }

      // Dim outside current ROI selection
      const startX = (roiStart / effectiveDuration) * width;
      const endX = (roiEnd / effectiveDuration) * width;

      ctx.fillStyle = "rgba(2, 6, 23, 0.65)";
      ctx.fillRect(0, 0, startX, height);
      ctx.fillRect(endX, 0, width - endX, height);

      // Active ROI indicator
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(startX, 0, Math.max(2, endX - startX), height);
    } else {
      // Placeholder scan hint
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#64748b";
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      ctx.fillText("Click 'Auto-Find Cleanest ENF Pocket' to scan full audio for 100 Hz hum SNR heatmap", width / 2, height / 2 + 3);
    }
  }, [qualityScan, effectiveDuration, roiStart, roiEnd]);

  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

  useEffect(() => {
    drawHeatRibbon();
  }, [drawHeatRibbon]);

  // Audio stream setup
  const streamUrl = getMediaStreamUrl(mediaId);

  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.src = streamUrl;
    audio.volume = isMuted ? 0 : volume;
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      if (audio) {
        setCurrentTime(audio.currentTime);
        if (audio.currentTime >= roiEnd) {
          audio.currentTime = roiStart;
        }
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      if (audio) audio.currentTime = roiStart;
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [streamUrl, roiStart, roiEnd, isMuted, volume]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      if (audio.currentTime < roiStart || audio.currentTime >= roiEnd) {
        audio.currentTime = roiStart;
      }
      audio.play().then(() => setIsPlaying(true)).catch(console.error);
    }
  }, [isPlaying, roiStart, roiEnd]);

  // Spacebar shortcut for play/pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay]);

  // Hum Monitor (Web Audio API bandpass filter)
  const toggleHumMonitor = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!humMonitorActive) {
      try {
        if (!audioContextRef.current) {
          const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const ctx = new AudioContextClass();
          audioContextRef.current = ctx;

          const source = ctx.createMediaElementSource(audio);
          sourceNodeRef.current = source;

          const filter = ctx.createBiquadFilter();
          filter.type = "bandpass";
          filter.frequency.value = targetFreq;
          filter.Q.value = 25.0;
          biquadFilterRef.current = filter;

          const gain = ctx.createGain();
          gain.gain.value = 8.0;
          gainNodeRef.current = gain;

          source.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);
        } else if (audioContextRef.current.state === "suspended") {
          audioContextRef.current.resume();
        }
        setHumMonitorActive(true);
      } catch (err) {
        console.warn("Web Audio API filter warning:", err);
        setHumMonitorActive(false);
      }
    } else {
      if (audioContextRef.current && sourceNodeRef.current) {
        try {
          sourceNodeRef.current.disconnect();
          sourceNodeRef.current.connect(audioContextRef.current.destination);
        } catch {
          // ignore
        }
      }
      setHumMonitorActive(false);
    }
  };

  // Canvas Mouse Drag for ROI handles
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;

    const startX = (roiStart / effectiveDuration) * width;
    const endX = (roiEnd / effectiveDuration) * width;

    if (Math.abs(x - startX) <= 10) {
      setDragMode("left");
    } else if (Math.abs(x - endX) <= 10) {
      setDragMode("right");
    } else if (x > startX && x < endX) {
      setDragMode("window");
      setDragStartX(x);
      setDragInitialStart(roiStart);
    } else {
      const fraction = Math.max(0, Math.min(1, x / width));
      const clickTime = fraction * effectiveDuration;
      if (audioRef.current) {
        audioRef.current.currentTime = clickTime;
        setCurrentTime(clickTime);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const timeAtX = (x / rect.width) * effectiveDuration;

    // Hover telemetry
    if (qualityScan?.timeline && qualityScan.timeline.length > 0) {
      const frac = x / rect.width;
      const idx = Math.min(qualityScan.timeline.length - 1, Math.floor(frac * qualityScan.timeline.length));
      const pt = qualityScan.timeline[idx];
      setHoveredInfo({ time: timeAtX, snr: pt?.snr_db, quality: pt?.quality_score });
    } else {
      setHoveredInfo({ time: timeAtX });
    }

    if (!dragMode) return;

    if (dragMode === "left") {
      const newStart = Math.min(timeAtX, roiEnd - 5);
      const newDur = roiEnd - newStart;
      onChangeRoi(Math.max(0, newStart), Math.max(5, newDur));
    } else if (dragMode === "right") {
      const newDur = Math.max(5, timeAtX - roiStart);
      onChangeRoi(roiStart, Math.min(effectiveDuration - roiStart, newDur));
    } else if (dragMode === "window") {
      const deltaX = x - dragStartX;
      const deltaTime = (deltaX / rect.width) * effectiveDuration;
      let newStart = dragInitialStart + deltaTime;
      newStart = Math.max(0, Math.min(effectiveDuration - roiDuration, newStart));
      onChangeRoi(newStart, roiDuration);
    }
  };

  const handleMouseUp = () => {
    setDragMode(null);
  };

  // Apply a recommended pocket
  const handleApplyPocket = (pocket: RecommendedRoiPocket) => {
    onChangeRoi(pocket.start_sec, pocket.duration_sec);
  };

  // Auto-find cleanest pocket
  const handleAutoFindCleanest = () => {
    if (qualityScan?.best_pocket) {
      handleApplyPocket(qualityScan.best_pocket);
    } else if (onScanQuality) {
      onScanQuality();
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xl space-y-3">
      {/* Top Header Row with Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Audio Waveform &amp; ENF Quality Inspector
          </span>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
            ROI: {roiStart.toFixed(1)}s – {roiEnd.toFixed(1)}s ({roiDuration.toFixed(1)}s)
          </span>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Auto-Find Cleanest ENF Pocket Button */}
          <button
            type="button"
            onClick={handleAutoFindCleanest}
            disabled={isScanningQuality}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-950/50 border border-emerald-400/50 cursor-pointer transition-all disabled:opacity-50"
            title="Scan the entire audio file to locate quiet indoor segments where electrical mains hum is loudest"
          >
            {isScanningQuality ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            )}
            <span>
              {isScanningQuality
                ? "Scanning Audio for Hum..."
                : qualityScan?.best_pocket
                ? `★ Apply Best Pocket (${qualityScan.best_pocket.start_formatted})`
                : "✨ Auto-Find Cleanest ENF Pocket"}
            </span>
          </button>

          {/* Forensic Hum Monitor Button */}
          <button
            type="button"
            onClick={toggleHumMonitor}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border transition-colors cursor-pointer ${
              humMonitorActive
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/60 shadow-sm shadow-emerald-950 animate-pulse"
                : "bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700"
            }`}
            title="Isolate & boost the electrical mains hum through a high-Q bandpass filter"
          >
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            <span>Hum Monitor ({targetFreq.toFixed(0)}Hz)</span>
          </button>

          {/* Play / Pause Button */}
          <button
            type="button"
            onClick={togglePlay}
            className="flex items-center gap-1 px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5 text-amber-400" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
            <span>{isPlaying ? "Pause" : "Play ROI"}</span>
          </button>

          {/* Reset All */}
          <button
            type="button"
            onClick={() => onChangeRoi(0, Math.round(effectiveDuration))}
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs border border-slate-700 cursor-pointer"
            title="Select entire media"
          >
            <Scissors className="w-3 h-3" />
            <span>Full File</span>
          </button>
        </div>
      </div>

      {/* Recommended Pockets Chips Bar */}
      {qualityScan?.recommended_pockets && qualityScan.recommended_pockets.length > 0 && (
        <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-1.5 shrink-0 text-[11px] font-mono text-slate-400 font-semibold">
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span>Quiet Indoor Pockets:</span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
            {qualityScan.recommended_pockets.map((pocket) => {
              const isActive = Math.abs(roiStart - pocket.start_sec) < 5 && Math.abs(roiDuration - pocket.duration_sec) < 10;
              const isBest = pocket.rank === 1;

              return (
                <button
                  key={pocket.rank}
                  type="button"
                  onClick={() => handleApplyPocket(pocket)}
                  className={`px-2.5 py-1 rounded text-[11px] font-mono transition-all flex items-center gap-1.5 shrink-0 border cursor-pointer ${
                    isActive
                      ? "bg-emerald-500/25 text-emerald-300 border-emerald-500 font-bold shadow-sm shadow-emerald-950"
                      : isBest
                      ? "bg-slate-800/90 text-emerald-300 border-emerald-500/50 hover:bg-slate-700 font-semibold"
                      : "bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800"
                  }`}
                  title={`Click to set ROI to ${pocket.start_formatted} - ${pocket.end_formatted} (+${pocket.mean_snr_db} dB SNR)`}
                >
                  <span>{isBest ? "★ #1" : `#${pocket.rank}`}</span>
                  <span className="text-white font-bold">{pocket.start_formatted} – {pocket.end_formatted}</span>
                  <span className="text-cyan-400 text-[10px]">(+{pocket.mean_snr_db}dB)</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Waveform Canvas */}
      <div
        className="relative w-full h-24 rounded-lg overflow-hidden border border-slate-800 bg-slate-950 cursor-crosshair select-none"
        ref={containerRef}
      >
        <canvas
          ref={canvasRef}
          width={800}
          height={96}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            handleMouseUp();
            setHoveredInfo(null);
          }}
          className="w-full h-full block"
        />

        <div className="absolute bottom-1 left-2 text-[10px] font-mono text-slate-500 pointer-events-none">
          0.00s
        </div>
        <div className="absolute bottom-1 right-2 text-[10px] font-mono text-slate-500 pointer-events-none">
          {effectiveDuration.toFixed(1)}s
        </div>
        <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] font-mono text-cyan-300 bg-slate-950/80 px-2 py-0.5 rounded border border-cyan-800/40 pointer-events-none">
          Playhead: {currentTime.toFixed(2)}s
        </div>
      </div>

      {/* ENF SNR / Quality Heatmap Ribbon */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
          <span className="flex items-center gap-1 text-emerald-400 font-semibold">
            <Zap className="w-3 h-3" />
            <span>100 Hz Mains Hum SNR Heatmap across Full Recording:</span>
          </span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Clean Hum (&gt;18 dB)</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>Moderate (12-18 dB)</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-slate-700" />
              <span>Noisy / Speech (&lt;12 dB)</span>
            </span>
          </div>
        </div>

        {/* Heat Ribbon Canvas */}
        <div
          className="relative w-full h-5 rounded overflow-hidden border border-slate-800 bg-slate-950 cursor-pointer select-none"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickFrac = (e.clientX - rect.left) / rect.width;
            const clickTime = clickFrac * effectiveDuration;
            const newStart = Math.max(0, Math.min(effectiveDuration - roiDuration, clickTime - roiDuration / 2));
            onChangeRoi(newStart, roiDuration);
          }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
            const timeAtX = (x / rect.width) * effectiveDuration;
            if (qualityScan?.timeline && qualityScan.timeline.length > 0) {
              const frac = x / rect.width;
              const idx = Math.min(qualityScan.timeline.length - 1, Math.floor(frac * qualityScan.timeline.length));
              const pt = qualityScan.timeline[idx];
              setHoveredInfo({ time: timeAtX, snr: pt?.snr_db, quality: pt?.quality_score });
            } else {
              setHoveredInfo({ time: timeAtX });
            }
          }}
          onMouseLeave={() => setHoveredInfo(null)}
        >
          <canvas
            ref={heatCanvasRef}
            width={800}
            height={20}
            className="w-full h-full block"
          />
        </div>

        {/* Hover telemetry readout */}
        {hoveredInfo && (
          <div className="text-[10px] font-mono text-cyan-300 flex justify-between items-center px-1">
            <span>
              Hovering: t = {hoveredInfo.time.toFixed(1)}s (
              {Math.floor(hoveredInfo.time / 60)}:
              {String(Math.floor(hoveredInfo.time % 60)).padStart(2, "0")})
            </span>
            {hoveredInfo.snr !== undefined && (
              <span className="font-bold text-emerald-400">
                100 Hz Mains Hum SNR: +{hoveredInfo.snr.toFixed(1)} dB
                {hoveredInfo.snr >= 20.0 ? " ★ (Ideal Quiet Indoor Segment)" : hoveredInfo.snr < 10.0 ? " ⚠ (High Speech / Outdoor Noise)" : ""}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Fine-Tuning Sliders */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-800/80">
        <div>
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>ROI Start Offset</span>
            <span className="font-mono text-emerald-400 font-semibold">{roiStart.toFixed(1)}s</span>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(0, effectiveDuration - 10)}
            step={1}
            value={roiStart}
            onChange={(e) => {
              const newStart = parseFloat(e.target.value);
              const maxDur = effectiveDuration - newStart;
              onChangeRoi(newStart, Math.min(roiDuration, maxDur));
            }}
            className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>

        <div>
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>ROI Duration</span>
            <span className="font-mono text-cyan-400 font-semibold">{roiDuration.toFixed(1)}s</span>
          </div>
          <input
            type="range"
            min={10}
            max={effectiveDuration - roiStart}
            step={1}
            value={roiDuration}
            onChange={(e) => {
              const newDur = parseFloat(e.target.value);
              onChangeRoi(roiStart, newDur);
            }}
            className="w-full accent-cyan-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};

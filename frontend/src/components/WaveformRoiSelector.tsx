"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, RotateCcw, Volume2, VolumeX, Scissors, Sliders, Radio } from "lucide-react";
import { getMediaStreamUrl } from "../lib/api";

interface WaveformRoiSelectorProps {
  mediaId: string;
  duration: number;
  waveformPeaks: number[];
  roiStart: number;
  roiDuration: number;
  onChangeRoi: (start: number, duration: number) => void;
  targetFreq?: number;
}

export const WaveformRoiSelector: React.FC<WaveformRoiSelectorProps> = ({
  mediaId,
  duration,
  waveformPeaks,
  roiStart,
  roiDuration,
  onChangeRoi,
  targetFreq = 100.0,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [humMonitorActive, setHumMonitorActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Web Audio API filter for the Forensic Hum Monitor
  const audioContextRef = useRef<AudioContext | null>(null);
  const biquadFilterRef = useRef<BiquadFilterNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);

  const effectiveDuration = Math.max(1, duration);
  const roiEnd = Math.min(effectiveDuration, roiStart + roiDuration);

  // Initialize or update canvas waveform
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Background grid
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    const peaks = waveformPeaks && waveformPeaks.length > 0
      ? waveformPeaks
      : Array.from({ length: 200 }, () => Math.random() * 0.4 + 0.1);

    const barWidth = width / peaks.length;
    const midY = height / 2;

    // Draw full waveform in muted slate
    peaks.forEach((peak, i) => {
      const x = i * barWidth;
      const barHeight = Math.max(2, peak * (height * 0.85));

      const timeAtBar = (i / peaks.length) * effectiveDuration;
      const inRoi = timeAtBar >= roiStart && timeAtBar <= roiEnd;

      if (inRoi) {
        ctx.fillStyle = "#06b6d4"; // Cyan for active ROI
      } else {
        ctx.fillStyle = "#334155"; // Muted slate outside ROI
      }

      ctx.fillRect(x, midY - barHeight / 2, Math.max(1, barWidth - 1), barHeight);
    });

    // Draw ROI overlay background
    const startX = (roiStart / effectiveDuration) * width;
    const endX = (roiEnd / effectiveDuration) * width;

    // Shaded mask outside ROI
    ctx.fillStyle = "rgba(2, 6, 23, 0.65)";
    ctx.fillRect(0, 0, startX, height);
    ctx.fillRect(endX, 0, width - endX, height);

    // ROI Box boundary
    ctx.strokeStyle = "#10b981"; // Emerald
    ctx.lineWidth = 2;
    ctx.strokeRect(startX, 1, Math.max(2, endX - startX), height - 2);

    // ROI Left handle
    ctx.fillStyle = "#10b981";
    ctx.fillRect(startX - 2, 0, 4, height);
    // ROI Right handle
    ctx.fillRect(endX - 2, 0, 4, height);

    // Playhead
    if (currentTime > 0) {
      const playheadX = (currentTime / effectiveDuration) * width;
      ctx.strokeStyle = "#f59e0b"; // Amber playhead
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
    }
  }, [effectiveDuration, roiStart, roiEnd, waveformPeaks, currentTime]);

  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

  // Audio setup & playback
  const streamUrl = getMediaStreamUrl(mediaId);

  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.src = streamUrl;
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      if (audio) {
        setCurrentTime(audio.currentTime);
        // Loop inside ROI if playback reaches roiEnd
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
  }, [streamUrl, roiStart, roiEnd]);

  // Handle Play/Pause
  const togglePlay = () => {
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
  };

  // Toggle Hum Monitor (Biquad bandpass filter on audio output)
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

          // Bandpass filter centered at targetFreq with Q=30 for tight mains hum isolation
          const filter = ctx.createBiquadFilter();
          filter.type = "bandpass";
          filter.frequency.value = targetFreq;
          filter.Q.value = 25.0;
          biquadFilterRef.current = filter;

          // Gain boost because mains hum is very faint
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
      // Revert to direct output
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

  // Canvas click to seek or adjust ROI
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const fraction = Math.max(0, Math.min(1, clickX / rect.width));
    const clickTime = fraction * effectiveDuration;

    if (audioRef.current) {
      audioRef.current.currentTime = clickTime;
      setCurrentTime(clickTime);
    }
  };

  const handleSelectAll = () => {
    onChangeRoi(0, Math.round(effectiveDuration));
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Interactive Audio Waveform & ROI Selector
          </span>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            ROI: {roiStart.toFixed(1)}s – {roiEnd.toFixed(1)}s (Duration: {roiDuration.toFixed(1)}s)
          </span>
        </div>

        {/* Audio Controls & Forensic Hum Monitor */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleHumMonitor}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border transition-colors cursor-pointer ${
              humMonitorActive
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm shadow-emerald-950 animate-pulse"
                : "bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700"
            }`}
            title="Isolate & boost the electrical mains hum through a high-Q bandpass filter"
          >
            <Radio className="w-3 h-3 text-cyan-400" />
            <span>Forensic Hum Monitor ({targetFreq.toFixed(0)}Hz)</span>
          </button>

          <button
            onClick={togglePlay}
            className="flex items-center gap-1 px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
          >
            {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            <span>{isPlaying ? "Pause" : "Play ROI"}</span>
          </button>

          <button
            onClick={handleSelectAll}
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs border border-slate-700 cursor-pointer"
            title="Analyze entire recording"
          >
            <Scissors className="w-3 h-3" />
            <span>Select All</span>
          </button>
        </div>
      </div>

      {/* Waveform Canvas */}
      <div className="relative w-full h-24 rounded-lg overflow-hidden border border-slate-800 bg-slate-950 cursor-pointer" ref={containerRef}>
        <canvas
          ref={canvasRef}
          width={800}
          height={96}
          onClick={handleCanvasClick}
          className="w-full h-full block"
        />

        {/* Timeline markers */}
        <div className="absolute bottom-1 left-2 text-[10px] font-mono text-slate-500 pointer-events-none">
          0.0s
        </div>
        <div className="absolute bottom-1 right-2 text-[10px] font-mono text-slate-500 pointer-events-none">
          {effectiveDuration.toFixed(1)}s
        </div>
        <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] font-mono text-cyan-400/80 bg-slate-950/80 px-1.5 py-0.5 rounded border border-cyan-800/40 pointer-events-none">
          Playhead: {currentTime.toFixed(1)}s
        </div>
      </div>

      {/* Fine-Tuning Range Sliders */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3 pt-3 border-t border-slate-800/80">
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

"use client";

import React, { useRef, useState } from "react";
import {
  Upload,
  FileAudio,
  Film,
  Radio,
  Camera,
  Sparkles,
  AlertCircle,
  RefreshCw,
  Sliders,
  Scan,
  Shield,
} from "lucide-react";
import { EnfAnalysisMode, MediaInfo } from "../lib/types";
import { uploadMedia, getMediaStreamUrl } from "../lib/api";
import { WaveformRoiSelector } from "./WaveformRoiSelector";

interface MediaInspectorProps {
  mediaInfo: MediaInfo | null;
  onMediaLoaded: (info: MediaInfo) => void;
  roiStart: number;
  roiDuration: number;
  onChangeRoi: (start: number, duration: number) => void;
  analysisMode: EnfAnalysisMode;
  setAnalysisMode: (mode: EnfAnalysisMode) => void;
  targetFreq?: number;
}

export const MediaInspector: React.FC<MediaInspectorProps> = ({
  mediaInfo,
  onMediaLoaded,
  roiStart,
  roiDuration,
  onChangeRoi,
  analysisMode,
  setAnalysisMode,
  targetFreq = 100.0,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setIsUploading(true);
    setErrorMessage(null);
    try {
      const info = await uploadMedia(file);
      onMediaLoaded(info);
      onChangeRoi(0, info.duration);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to upload media";
      setErrorMessage(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      {/* Upload Zone */}
      {!mediaInfo ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
            dragActive
              ? "border-emerald-500 bg-emerald-950/20"
              : "border-slate-800 hover:border-slate-700 bg-slate-900/50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,audio/*,.mp4,.mov,.mkv,.avi,.webm,.mp3,.wav,.flac,.m4a,.aac,.ogg"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFile(e.target.files[0]);
              }
            }}
            className="hidden"
          />

          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4 shadow-lg shadow-emerald-950">
            {isUploading ? (
              <RefreshCw className="w-6 h-6 animate-spin" />
            ) : (
              <Upload className="w-6 h-6" />
            )}
          </div>

          <h3 className="text-sm font-semibold text-slate-100 mb-1">
            {isUploading ? "Probing Video & Audio Telemetry..." : "Drag & Drop Forensic Media File"}
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mb-3">
            Upload MP4, MOV, MKV, AVI, WAV, or MP3. Supports both Acoustic mains hum extraction and CMOS rolling-shutter optical flicker analysis.
          </p>

          <span className="px-3 py-1 rounded-md text-xs font-mono font-medium bg-slate-800 text-slate-300 border border-slate-700">
            Browse Forensic Audio/Video
          </span>

          {errorMessage && (
            <div className="mt-4 flex items-center gap-1.5 text-xs text-rose-400 bg-rose-950/30 px-3 py-1.5 rounded border border-rose-900/50">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>
      ) : (
        /* Loaded Media & Multi-Modal Controls */
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xl space-y-4">
          {/* Media Header & Info Badges */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-sm shadow-emerald-950">
                {mediaInfo.has_video ? <Film className="w-5 h-5" /> : <FileAudio className="w-5 h-5" />}
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100 flex items-center gap-2">
                  <span className="truncate max-w-sm">{mediaInfo.filename}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                    EVIDENCE
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-400 mt-0.5">
                  <span>Duration: <strong className="text-slate-200">{mediaInfo.duration}s</strong></span>
                  <span>•</span>
                  <span>{formatFileSize(mediaInfo.size_bytes)}</span>
                  {mediaInfo.has_video && (
                    <>
                      <span>•</span>
                      <span className="text-cyan-400 font-semibold">{mediaInfo.resolution} @ {mediaInfo.fps} FPS</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer transition-colors"
            >
              Replace Media
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,audio/*,.mp4,.mov,.mkv,.avi,.webm,.mp3,.wav,.flac,.m4a,.aac,.ogg"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFile(e.target.files[0]);
                }
              }}
              className="hidden"
            />
          </div>

          {/* Forensic Modality Selection Tabs */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                <span>Forensic Modality Selector</span>
              </span>
              <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                {analysisMode === "acoustic"
                  ? "Mode: Audio Mains Hum (100 Hz / Harmonics)"
                  : analysisMode === "optical"
                  ? "Mode: CMOS Rolling-Shutter Line Scanner"
                  : "Mode: Auto-Fusion (Max SNR Winner)"}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* Acoustic Mode Tab */}
              <button
                type="button"
                onClick={() => setAnalysisMode("acoustic")}
                className={`py-2 px-3 rounded-lg text-xs font-medium border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  analysisMode === "acoustic"
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500 shadow-md shadow-emerald-950/50"
                    : "bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-800"
                }`}
              >
                <Radio className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="text-left">
                  <div className="font-semibold text-xs leading-none">Acoustic ENF</div>
                  <div className="text-[10px] text-slate-400 font-mono">100Hz Audio Hum</div>
                </div>
              </button>

              {/* Optical Mode Tab */}
              <button
                type="button"
                onClick={() => setAnalysisMode("optical")}
                disabled={!mediaInfo.has_video}
                className={`py-2 px-3 rounded-lg text-xs font-medium border flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-30 ${
                  analysisMode === "optical"
                    ? "bg-cyan-500/20 text-cyan-300 border-cyan-500 shadow-md shadow-cyan-950/50"
                    : "bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-800"
                }`}
              >
                <Camera className="w-4 h-4 text-cyan-400 shrink-0" />
                <div className="text-left">
                  <div className="font-semibold text-xs leading-none">Optical ENF</div>
                  <div className="text-[10px] text-slate-400 font-mono">CMOS Rolling Shutter</div>
                </div>
              </button>

              {/* Auto Multi-Modal Tab */}
              <button
                type="button"
                onClick={() => setAnalysisMode("auto_fusion")}
                className={`py-2 px-3 rounded-lg text-xs font-medium border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  analysisMode === "auto_fusion"
                    ? "bg-purple-500/20 text-purple-300 border-purple-500 shadow-md shadow-purple-950/50"
                    : "bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-800"
                }`}
              >
                <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
                <div className="text-left">
                  <div className="font-semibold text-xs leading-none">Auto-Fusion</div>
                  <div className="text-[10px] text-slate-400 font-mono">Dynamic SNR Winner</div>
                </div>
              </button>
            </div>
          </div>

          {/* HTML5 Video Player Preview (if video container) */}
          {mediaInfo.has_video && (
            <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-black flex justify-center max-h-64 shadow-2xl">
              <video
                src={getMediaStreamUrl(mediaInfo.media_id)}
                controls
                className="max-h-64 w-auto rounded"
              />
              {/* Rolling Shutter Scanline HUD Overlay */}
              {analysisMode === "optical" && (
                <div className="absolute inset-0 pointer-events-none border border-cyan-500/40 rounded-xl overflow-hidden">
                  <div className="w-full h-1 bg-cyan-400/70 shadow-lg shadow-cyan-400 animate-scanline" />
                  <div className="absolute top-2 left-2 bg-slate-950/90 backdrop-blur-sm px-2.5 py-1 rounded text-[10px] font-mono text-cyan-300 border border-cyan-800/60 flex items-center gap-1.5">
                    <Scan className="w-3 h-3 text-cyan-400 animate-spin" />
                    <span>CMOS Row Scan Active ({mediaInfo.fps} FPS • {mediaInfo.resolution})</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Interactive Waveform & ROI Scrubber */}
          <WaveformRoiSelector
            mediaId={mediaInfo.media_id}
            duration={mediaInfo.duration}
            waveformPeaks={mediaInfo.waveform_peaks}
            roiStart={roiStart}
            roiDuration={roiDuration}
            onChangeRoi={onChangeRoi}
            targetFreq={targetFreq}
          />
        </div>
      )}
    </div>
  );
};

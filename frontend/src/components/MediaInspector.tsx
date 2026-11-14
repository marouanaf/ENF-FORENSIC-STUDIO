"use client";

import React, { useRef, useState } from "react";
import {
  Upload,
  FileAudio,
  FileVideo,
  Film,
  Radio,
  Camera,
  Sparkles,
  AlertCircle,
  RefreshCw,
  Sliders,
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
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                {mediaInfo.has_video ? <Film className="w-4 h-4" /> : <FileAudio className="w-4 h-4" />}
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-100 truncate max-w-md">
                  {mediaInfo.filename}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-400">
                  <span>Duration: {mediaInfo.duration}s</span>
                  <span>•</span>
                  <span>{formatFileSize(mediaInfo.size_bytes)}</span>
                  {mediaInfo.has_video && (
                    <>
                      <span>•</span>
                      <span className="text-cyan-400">{mediaInfo.resolution} @ {mediaInfo.fps} FPS</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
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

          {/* Multi-Modal Analysis Switcher */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                <span>Forensic Modality Selection</span>
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                {analysisMode === "acoustic" ? "Audio Track Hum" : analysisMode === "optical" ? "CMOS Rolling-Shutter" : "Auto SNR Detection"}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {/* Acoustic Mode */}
              <button
                type="button"
                onClick={() => setAnalysisMode("acoustic")}
                className={`py-2 px-2.5 rounded-lg text-xs font-medium border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  analysisMode === "acoustic"
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500 shadow-sm shadow-emerald-950"
                    : "bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-800"
                }`}
              >
                <Radio className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">Acoustic (100Hz Hum)</span>
              </button>

              {/* Optical Rolling-Shutter Mode */}
              <button
                type="button"
                onClick={() => setAnalysisMode("optical")}
                disabled={!mediaInfo.has_video}
                className={`py-2 px-2.5 rounded-lg text-xs font-medium border flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-30 ${
                  analysisMode === "optical"
                    ? "bg-cyan-500/20 text-cyan-300 border-cyan-500 shadow-sm shadow-cyan-950"
                    : "bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-800"
                }`}
              >
                <Camera className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="truncate">Optical (CMOS Flicker)</span>
              </button>

              {/* Auto-Fusion Mode */}
              <button
                type="button"
                onClick={() => setAnalysisMode("auto_fusion")}
                className={`py-2 px-2.5 rounded-lg text-xs font-medium border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  analysisMode === "auto_fusion"
                    ? "bg-purple-500/20 text-purple-300 border-purple-500 shadow-sm shadow-purple-950"
                    : "bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-800"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="truncate">Auto Multi-Modal</span>
              </button>
            </div>
          </div>

          {/* HTML5 Video Player Preview (if video container) */}
          {mediaInfo.has_video && (
            <div className="relative rounded-lg overflow-hidden border border-slate-800 bg-black flex justify-center max-h-64 shadow-inner">
              <video
                src={getMediaStreamUrl(mediaInfo.media_id)}
                controls
                className="max-h-64 w-auto rounded"
              />
              <div className="absolute top-2 left-2 bg-slate-950/80 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-mono text-cyan-300 border border-slate-800">
                CMOS Rolling Shutter Active: {mediaInfo.fps} FPS
              </div>
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

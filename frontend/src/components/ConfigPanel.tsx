"use client";

import React, { useRef, useState } from "react";
import {
  Settings,
  Cpu,
  Database,
  Search,
  Sparkles,
  Upload,
  Layers,
  Clock,
  Radio,
  Globe2,
  RefreshCw,
} from "lucide-react";
import { EnfAnalysisMode, GridDatabaseInfo, MediaInfo } from "../lib/types";

interface ConfigPanelProps {
  mediaInfo: MediaInfo | null;
  roiStart: number;
  roiDuration: number;
  analysisMode: EnfAnalysisMode;
  nominalGrid: number;
  setNominalGrid: (hz: number) => void;
  harmonicMultiplier: number;
  setHarmonicMultiplier: (k: number) => void;
  windowDuration: number;
  setWindowDuration: (sec: number) => void;
  databases: GridDatabaseInfo[];
  selectedDatabaseId: string;
  setSelectedDatabaseId: (id: string) => void;
  onRefreshDatabases: () => void;
  onOpenUploadModal: () => void;
  onExtractEnf: () => void;
  onMatchDatabase: () => void;
  isExtracting: boolean;
  isMatching: boolean;
  hasExtractedTrace: boolean;
}

export const ConfigPanel: React.FC<ConfigPanelProps> = ({
  mediaInfo,
  roiStart,
  roiDuration,
  analysisMode,
  nominalGrid,
  setNominalGrid,
  harmonicMultiplier,
  setHarmonicMultiplier,
  windowDuration,
  setWindowDuration,
  databases,
  selectedDatabaseId,
  setSelectedDatabaseId,
  onRefreshDatabases,
  onOpenUploadModal,
  onExtractEnf,
  onMatchDatabase,
  isExtracting,
  isMatching,
  hasExtractedTrace,
}) => {
  const targetFreq = nominalGrid * harmonicMultiplier;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl space-y-6">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-emerald-400" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            Grid & Forensic DSP Configuration
          </h2>
        </div>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/50">
          Target Frequency: {targetFreq.toFixed(1)} Hz
        </span>
      </div>

      {/* 1. Nominal Grid Frequency Toggle */}
      <div>
        <label className="block text-xs font-medium text-slate-300 mb-2 flex items-center justify-between">
          <span>1. Synchronous Power Grid Frequency</span>
          <span className="text-[11px] text-emerald-400 font-mono font-semibold">
            {nominalGrid === 50 ? "Europe / Morocco ONEE" : "North America (US/CA)"}
          </span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setNominalGrid(50.0)}
            className={`py-2 px-3 rounded-lg text-xs font-medium border flex items-center justify-center gap-2 transition-all cursor-pointer ${
              nominalGrid === 50.0
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500 shadow-sm shadow-emerald-950"
                : "bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700"
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>50 Hz (Continental Europe / Morocco)</span>
          </button>
          <button
            type="button"
            onClick={() => setNominalGrid(60.0)}
            className={`py-2 px-3 rounded-lg text-xs font-medium border flex items-center justify-center gap-2 transition-all cursor-pointer ${
              nominalGrid === 60.0
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500 shadow-sm shadow-emerald-950"
                : "bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700"
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>60 Hz (North America)</span>
          </button>
        </div>
      </div>

      {/* 2. Target Harmonic Multiplier (Acoustic & Optical) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-slate-300">
            2. Harmonic Multiplier
          </label>
          <span className="text-[11px] font-mono text-cyan-400">
            {analysisMode === "optical" ? "Locked to 2x (100Hz Light Flicker)" : "Acoustic Mains Hum"}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { k: 1, label: `1x (${nominalGrid}Hz)` },
            { k: 2, label: `2x (${nominalGrid * 2}Hz - Recommended)` },
            { k: 3, label: `3x (${nominalGrid * 3}Hz)` },
          ].map((item) => (
            <button
              key={item.k}
              type="button"
              disabled={analysisMode === "optical" && item.k !== 2}
              onClick={() => setHarmonicMultiplier(item.k)}
              className={`py-2 px-2 text-center rounded-lg text-xs font-medium border transition-all cursor-pointer disabled:opacity-30 ${
                harmonicMultiplier === item.k
                  ? "bg-cyan-500/20 text-cyan-300 border-cyan-500 shadow-sm shadow-cyan-950"
                  : "bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* 3. STFT Window Duration */}
      <div>
        <div className="flex justify-between text-xs text-slate-300 mb-2">
          <span>3. STFT Window Duration (Zero-Phase Smoothing)</span>
          <span className="font-mono text-emerald-400 font-bold">{windowDuration}s</span>
        </div>
        <div className="flex gap-2">
          {[6.0, 8.0, 10.0, 12.0, 16.0].map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => setWindowDuration(sec)}
              className={`flex-1 py-1.5 text-xs font-mono rounded border transition-all cursor-pointer ${
                windowDuration === sec
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500 font-bold"
                  : "bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700"
              }`}
            >
              {sec}s
            </button>
          ))}
        </div>
      </div>

      {/* 4. Historical Grid Reference Database */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
            <Globe2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>4. Historical Grid Parquet Database</span>
          </label>
          <button
            onClick={onOpenUploadModal}
            className="text-[11px] font-medium text-cyan-400 hover:text-cyan-300 px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/60 transition-colors cursor-pointer flex items-center gap-1"
          >
            <Upload className="w-3 h-3" />
            <span>Upload / Ingest CSV</span>
          </button>
        </div>

        <select
          value={selectedDatabaseId}
          onChange={(e) => setSelectedDatabaseId(e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
        >
          {databases.map((db) => (
            <option key={db.database_id} value={db.database_id}>
              {db.filename} ({db.row_count.toLocaleString()}s • {db.nominal_grid_hz}Hz)
            </option>
          ))}
        </select>
        <p className="text-[10px] text-slate-500 mt-1">
          Continental Europe & Morocco ONEE synchronous grid datasets (Zenodo 5105820 & 15784548).
        </p>
      </div>

      {/* 5. Primary Action Triggers */}
      <div className="space-y-2 pt-2 border-t border-slate-800">
        <button
          onClick={onExtractEnf}
          disabled={!mediaInfo || isExtracting}
          className="w-full py-2.5 px-4 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 transition-all disabled:opacity-40 cursor-pointer"
        >
          {isExtracting ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Cpu className="w-4 h-4" />
          )}
          <span>
            {isExtracting
              ? `Extracting ${analysisMode.toUpperCase()} ENF Signal...`
              : `Extract ${analysisMode === "optical" ? "Optical (CMOS)" : analysisMode === "auto_fusion" ? "Auto-Fusion" : "Acoustic"} ENF Trace`}
          </span>
        </button>

        <button
          onClick={onMatchDatabase}
          disabled={!hasExtractedTrace || isMatching}
          className="w-full py-2.5 px-4 rounded-lg text-xs font-semibold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-950/50 flex items-center justify-center gap-2 transition-all disabled:opacity-40 cursor-pointer"
        >
          {isMatching ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          <span>{isMatching ? "Running FFT Parquet Matching..." : "Execute Vectorized Database Correlation"}</span>
        </button>
      </div>
    </div>
  );
};

"use client";

import React, { useState } from "react";
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
  CloudDownload,
  CheckCircle2,
  Calendar,
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
  onRunFullForensicAnalysis: () => void;
  isAnalyzing: boolean;
  onQuickDownloadYearMonth: (year: number, month: number) => void;
  isDownloadingYear: boolean;
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
  onRunFullForensicAnalysis,
  isAnalyzing,
  onQuickDownloadYearMonth,
  isDownloadingYear,
}) => {
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(11);
  const targetFreq = nominalGrid * harmonicMultiplier;

  const monthStr = String(selectedMonth).padStart(2, "0");

  // Check if selected Year and Month is available in databases
  const matchingDb = databases.find(
    (d) =>
      (d.filename.includes(`${selectedYear}-${monthStr}`) ||
       d.filename.includes(`${selectedYear}_m${monthStr}`) ||
       d.start_time_utc?.startsWith(`${selectedYear}-${monthStr}`))
  ) || databases.find(
    (d) =>
      d.filename.includes(String(selectedYear)) ||
      d.start_time_utc?.startsWith(String(selectedYear))
  );

  const monthNames = [
    "01 - January", "02 - February", "03 - March", "04 - April",
    "05 - May", "06 - June", "07 - July", "08 - August",
    "09 - September", "10 - October", "11 - November", "12 - December"
  ];

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl space-y-5">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-emerald-400" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            Forensic Grid & DSP Configuration
          </h2>
        </div>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/50">
          Target Frequency: {targetFreq.toFixed(1)} Hz
        </span>
      </div>

      {/* 1. Synchronous Grid Zone Selection */}
      <div>
        <label className="block text-xs font-medium text-slate-300 mb-2 flex items-center justify-between">
          <span>1. Synchronous Power Grid Interconnection</span>
          <span className="text-[11px] text-emerald-400 font-mono font-semibold">
            {nominalGrid === 50 ? "Europe / Morocco ONEE (50Hz)" : "North America (60Hz)"}
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
            <span>50 Hz (Continental Europe & Morocco)</span>
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
            <span>60 Hz (North America NERC)</span>
          </button>
        </div>
      </div>

      {/* 2. Choose Historical Grid by Year & Month */}
      <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-cyan-400" />
            <span>2. Historical Grid Year & Month</span>
          </label>
          <button
            onClick={onOpenUploadModal}
            className="text-[11px] font-medium text-cyan-400 hover:text-cyan-300 px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/50 cursor-pointer flex items-center gap-1"
          >
            <CloudDownload className="w-3 h-3" />
            <span>Zenodo Downloader</span>
          </button>
        </div>

        {/* Year Pills */}
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
          {[2017, 2018, 2019, 2020, 2021, 2022, 2024, 2026].map((year) => {
            const hasData = databases.some(
              (d) => d.filename.includes(String(year)) || d.start_time_utc?.startsWith(String(year))
            );
            const isSelected = selectedYear === year;

            return (
              <button
                key={year}
                type="button"
                onClick={() => {
                  setSelectedYear(year);
                  const db = databases.find(
                    (d) =>
                      d.filename.includes(`${year}-${monthStr}`) ||
                      d.filename.includes(String(year)) ||
                      d.start_time_utc?.startsWith(String(year))
                  );
                  if (db) setSelectedDatabaseId(db.database_id);
                }}
                className={`py-1.5 px-1 rounded-lg text-xs font-mono font-bold border transition-all cursor-pointer text-center relative ${
                  isSelected
                    ? "bg-cyan-500/20 text-cyan-300 border-cyan-500 shadow-sm shadow-cyan-950"
                    : "bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-800"
                }`}
              >
                <span>{year}</span>
                {hasData && (
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full absolute top-1 right-1" title="Data Ingested" />
                )}
              </button>
            );
          })}
        </div>

        {/* Month Dropdown Selector for the Year */}
        <div className="flex items-center justify-between gap-2 pt-1 text-[11px] font-mono">
          <span className="text-slate-400">Month:</span>
          <select
            value={selectedMonth}
            onChange={(e) => {
              const m = parseInt(e.target.value);
              setSelectedMonth(m);
              const mPad = String(m).padStart(2, "0");
              const db = databases.find(
                (d) =>
                  d.filename.includes(`${selectedYear}-${mPad}`) ||
                  d.filename.includes(`${selectedYear}_m${mPad}`) ||
                  d.start_time_utc?.startsWith(`${selectedYear}-${mPad}`)
              );
              if (db) setSelectedDatabaseId(db.database_id);
            }}
            className="flex-1 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none focus:border-cyan-500 cursor-pointer"
          >
            {monthNames.map((name, idx) => (
              <option key={idx + 1} value={idx + 1}>
                {name} {selectedYear === 2026 && idx === 10 ? "(Preloaded)" : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Year/Month Status & Quick Download Button */}
        <div className="flex items-center justify-between text-[11px] font-mono pt-1">
          {matchingDb ? (
            <div className="text-emerald-400 flex items-center gap-1.5 truncate">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{matchingDb.filename} ({matchingDb.row_count.toLocaleString()}s)</span>
            </div>
          ) : (
            <div className="text-amber-300 flex items-center justify-between w-full">
              <span>{selectedYear}-{monthStr} not in database</span>
              <button
                onClick={() => onQuickDownloadYearMonth(selectedYear, selectedMonth)}
                disabled={isDownloadingYear}
                className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1 shadow cursor-pointer disabled:opacity-40"
              >
                {isDownloadingYear ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CloudDownload className="w-3 h-3" />}
                <span>Ingest {selectedYear}-{monthStr}</span>
              </button>
            </div>
          )}
        </div>

        {/* All Loaded Databases Dropdown */}
        <select
          value={selectedDatabaseId}
          onChange={(e) => setSelectedDatabaseId(e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
        >
          {databases.map((db) => (
            <option key={db.database_id} value={db.database_id}>
              {db.filename} ({db.row_count.toLocaleString()}s • {db.nominal_grid_hz}Hz)
            </option>
          ))}
        </select>
      </div>

      {/* 3. Harmonic Multiplier */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-slate-300">
            3. Harmonic Multiplier
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

      {/* 4. STFT Window Duration */}
      <div>
        <div className="flex justify-between text-xs text-slate-300 mb-2">
          <span>4. STFT Window Duration (Smoothing)</span>
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

      {/* 5. Primary Action: Unified 1-Click Forensic Authentication */}
      <div className="pt-2 border-t border-slate-800">
        <button
          onClick={onRunFullForensicAnalysis}
          disabled={!mediaInfo || isAnalyzing}
          className="w-full py-3 px-4 rounded-xl text-xs font-extrabold bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white shadow-xl shadow-emerald-950/60 flex items-center justify-center gap-2 transition-all disabled:opacity-40 cursor-pointer"
        >
          {isAnalyzing ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          <span>
            {isAnalyzing
              ? "Running Multi-Modal DSP & FFT Correlation..."
              : `⚡ Authenticate Video Against ${selectedYear}-${monthStr} Grid (1-Click)`}
          </span>
        </button>
      </div>
    </div>
  );
};

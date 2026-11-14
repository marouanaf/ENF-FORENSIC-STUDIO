"use client";

import React, { useState } from "react";
import {
  Settings,
  Search,
  Radio,
  Globe2,
  RefreshCw,
  CloudDownload,
  CheckCircle2,
  Calendar,
  CheckSquare,
  Square,
  Sparkles,
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
  selectedDatabaseIds: string[];
  setSelectedDatabaseIds: (ids: string[]) => void;
  onRefreshDatabases: () => void;
  onOpenUploadModal: () => void;
  onRunFullForensicAnalysis: (targetDbIds: string[]) => void;
  isAnalyzing: boolean;
  onQuickDownloadYear: (year: number) => void;
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
  selectedDatabaseIds,
  setSelectedDatabaseIds,
  onRefreshDatabases,
  onOpenUploadModal,
  onRunFullForensicAnalysis,
  isAnalyzing,
  onQuickDownloadYear,
  isDownloadingYear,
}) => {
  const targetFreq = nominalGrid * harmonicMultiplier;
  const availableYears = [2017, 2018, 2019, 2020, 2021, 2022, 2024, 2026];

  // Helper to check if a year is selected
  const isYearSelected = (year: number): boolean => {
    return databases.some(
      (d) =>
        selectedDatabaseIds.includes(d.database_id) &&
        (d.filename.includes(String(year)) || d.start_time_utc?.startsWith(String(year)))
    );
  };

  // Toggle year selection
  const toggleYear = (year: number) => {
    const matchingDbs = databases.filter(
      (d) => d.filename.includes(String(year)) || d.start_time_utc?.startsWith(String(year))
    );

    if (matchingDbs.length === 0) {
      // Trigger download if year not available
      onQuickDownloadYear(year);
      return;
    }

    const yearDbIds = matchingDbs.map((d) => d.database_id);
    const anySelected = yearDbIds.some((id) => selectedDatabaseIds.includes(id));

    if (anySelected) {
      // Unselect this year
      const newIds = selectedDatabaseIds.filter((id) => !yearDbIds.includes(id));
      setSelectedDatabaseIds(newIds.length > 0 ? newIds : [matchingDbs[0].database_id]);
    } else {
      // Add this year to selection
      setSelectedDatabaseIds([...selectedDatabaseIds, ...yearDbIds]);
    }
  };

  // Select all loaded years
  const handleSelectAllYears = () => {
    setSelectedDatabaseIds(databases.map((d) => d.database_id));
  };

  const selectedYearCount = availableYears.filter((y) => isYearSelected(y)).length;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
      {/* Card Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-emerald-400" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            Forensic Grid & Multi-Year Engine
          </h2>
        </div>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/50">
          Target Frequency: {targetFreq.toFixed(1)} Hz
        </span>
      </div>

      {/* 1. Synchronous Power Grid Zone */}
      <div>
        <div className="flex items-center justify-between text-xs font-medium text-slate-300 mb-1.5">
          <span>1. Synchronous Power Grid</span>
          <span className="text-[11px] text-emerald-400 font-mono font-semibold">
            {nominalGrid === 50 ? "Europe / Morocco ONEE" : "North America (60Hz)"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setNominalGrid(50.0)}
            className={`py-1.5 px-3 rounded-lg text-xs font-medium border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              nominalGrid === 50.0
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500 shadow-sm shadow-emerald-950"
                : "bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200"
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>50 Hz (Europe / Morocco ONEE)</span>
          </button>
          <button
            type="button"
            onClick={() => setNominalGrid(60.0)}
            className={`py-1.5 px-3 rounded-lg text-xs font-medium border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              nominalGrid === 60.0
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500 shadow-sm shadow-emerald-950"
                : "bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200"
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>60 Hz (North America NERC)</span>
          </button>
        </div>
      </div>

      {/* 2. Multi-Year Historical Grid Sweep (De-duplicated & Multi-Select) */}
      <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-cyan-400" />
            <span>2. Scan Across Multiple Years</span>
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSelectAllYears}
              className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
            >
              Select All Loaded ({databases.length})
            </button>
            <button
              onClick={onOpenUploadModal}
              className="text-[11px] font-medium text-emerald-400 hover:text-emerald-300 px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/50 cursor-pointer flex items-center gap-1"
            >
              <CloudDownload className="w-3 h-3" />
              <span>Zenodo Catalog</span>
            </button>
          </div>
        </div>

        {/* Multi-Year Checkbox Pills */}
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
          {availableYears.map((year) => {
            const hasData = databases.some(
              (d) => d.filename.includes(String(year)) || d.start_time_utc?.startsWith(String(year))
            );
            const selected = isYearSelected(year);

            return (
              <button
                key={year}
                type="button"
                onClick={() => toggleYear(year)}
                className={`py-2 px-1 rounded-lg text-xs font-mono font-bold border transition-all cursor-pointer text-center relative flex flex-col items-center justify-center gap-0.5 ${
                  selected
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500 shadow-md shadow-emerald-950/60"
                    : hasData
                    ? "bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800"
                    : "bg-slate-950 text-slate-500 border-dashed border-slate-800 hover:border-slate-700"
                }`}
                title={hasData ? `Year ${year} Ingested. Click to toggle in scan.` : `Year ${year} not downloaded. Click to download from Zenodo.`}
              >
                <div className="flex items-center gap-1">
                  {selected ? (
                    <CheckSquare className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Square className="w-3 h-3 text-slate-500" />
                  )}
                  <span>{year}</span>
                </div>
                {!hasData && (
                  <span className="text-[8px] text-amber-400/80 font-normal">Download</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Selected Summary */}
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1">
          <span>Active Search Span:</span>
          <span className="text-emerald-400 font-bold">
            {selectedDatabaseIds.length} Database{selectedDatabaseIds.length > 1 ? "s" : ""} Selected across {selectedYearCount} Year{selectedYearCount > 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* 3. Harmonic & STFT Parameters */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        {/* Harmonic */}
        <div>
          <div className="flex justify-between items-center text-xs text-slate-300 mb-1">
            <span>Harmonic Target</span>
            <span className="text-[10px] text-cyan-400 font-mono">f₁, f₂, f₄ Consensus</span>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {[
              { k: 2, label: "2x (100Hz)" },
              { k: 4, label: "4x (200Hz)" },
              { k: 1, label: "1x (50Hz)" },
              { k: 3, label: "3x (150Hz)" },
            ].map((item) => (
              <button
                key={item.k}
                type="button"
                disabled={analysisMode === "optical" && item.k !== 2}
                onClick={() => setHarmonicMultiplier(item.k)}
                className={`py-1.5 rounded text-[11px] font-medium border text-center transition-all cursor-pointer disabled:opacity-30 ${
                  harmonicMultiplier === item.k
                    ? "bg-cyan-500/20 text-cyan-300 border-cyan-500 font-bold"
                    : "bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Window Duration */}
        <div>
          <div className="flex justify-between text-xs text-slate-300 mb-1">
            <span>STFT Window</span>
            <span className="font-mono text-emerald-400 font-bold">{windowDuration}s</span>
          </div>
          <div className="flex gap-1">
            {[6.0, 8.0, 10.0, 12.0, 16.0].map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => setWindowDuration(sec)}
                className={`flex-1 py-1.5 text-xs font-mono rounded border text-center transition-all cursor-pointer ${
                  windowDuration === sec
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500 font-bold"
                    : "bg-slate-800 text-slate-400 border-slate-700"
                }`}
              >
                {sec}s
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Primary Unified Action: 1-Click Multi-Year Sweep */}
      <div className="pt-2 border-t border-slate-800">
        <button
          onClick={() => onRunFullForensicAnalysis(selectedDatabaseIds)}
          disabled={!mediaInfo || isAnalyzing || selectedDatabaseIds.length === 0}
          className="w-full py-3 px-4 rounded-xl text-xs font-extrabold bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white shadow-xl shadow-emerald-950/60 flex items-center justify-center gap-2 transition-all disabled:opacity-40 cursor-pointer"
        >
          {isAnalyzing ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          <span>
            {isAnalyzing
              ? `Scanning ${selectedDatabaseIds.length} Database(s) via FFT Correlation...`
              : selectedDatabaseIds.length > 1
              ? `⚡ Scan ${selectedDatabaseIds.length} Years & Authenticate Evidence (Multi-Year Sweep)`
              : `⚡ Authenticate Video Against Selected Grid (1-Click)`}
          </span>
        </button>
      </div>
    </div>
  );
};

"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Database,
  X,
  Upload,
  Globe2,
  RefreshCw,
  Download,
  CloudDownload,
  CheckCircle2,
  Sparkles,
  Layers,
  FileCheck,
} from "lucide-react";
import { autoDownloadGrid, getAvailableGridDownloads, uploadGridCsv } from "../lib/api";
import { GridCatalogItem, GridDatabaseInfo } from "../lib/types";

interface UploadGridModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGridUploaded: (newDb: GridDatabaseInfo) => void;
}

export const UploadGridModal: React.FC<UploadGridModalProps> = ({
  isOpen,
  onClose,
  onGridUploaded,
}) => {
  const [activeTab, setActiveTab] = useState<"auto_download" | "upload_csv">("auto_download");
  const [catalog, setCatalog] = useState<GridCatalogItem[]>([]);
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>("zenodo_2017_morocco");
  const [scope, setScope] = useState<"month" | "day" | "year">("month");
  const [targetYear, setTargetYear] = useState<number>(2017);
  const [targetMonth, setTargetMonth] = useState<number>(11);
  const [nominalHz, setNominalHz] = useState<number>(50.0);

  // CSV upload state
  const [inputTz, setInputTz] = useState<string>("Europe/Berlin");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressStep, setProgressStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch catalog on modal open
  useEffect(() => {
    if (isOpen) {
      getAvailableGridDownloads()
        .then((res) => {
          setCatalog(res.catalog);
          if (res.catalog.length > 0) {
            const recommended = res.catalog.find((c) => c.recommended) || res.catalog[0];
            setSelectedCatalogId(recommended.catalog_id);
            setTargetYear(recommended.year);
            setNominalHz(recommended.nominal_grid_hz);
          }
        })
        .catch(console.error);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAutoDownload = async () => {
    setIsProcessing(true);
    setError(null);
    setProgressStep("Step 1/4: Connecting to Zenodo & Retrieving Record Metadata...");

    try {
      setTimeout(() => {
        setProgressStep("Step 2/4: Normalizing Timezones (Europe/Berlin -> UTC & Africa/Casablanca)...");
      }, 1200);

      setTimeout(() => {
        setProgressStep("Step 3/4: Enforcing Continuous 1 Hz Grid & Cleansing Sensor Spikes...");
      }, 2500);

      setTimeout(() => {
        setProgressStep("Step 4/4: Compressing Time Series into Zstandard Parquet (float32)...");
      }, 4000);

      const newDb = await autoDownloadGrid({
        catalog_id: selectedCatalogId,
        scope: scope,
        target_year: targetYear,
        target_month: targetMonth,
        nominal_hz: nominalHz,
      });

      setProgressStep("✓ Ingestion Complete! Registered to Database Engine.");
      setTimeout(() => {
        onGridUploaded(newDb);
        onClose();
      }, 700);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Auto download failed";
      setError(msg);
      setProgressStep(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    setIsProcessing(true);
    setError(null);
    setProgressStep("Normalizing timezones and compressing to Parquet...");
    try {
      const newDb = await uploadGridCsv(file, inputTz, nominalHz);
      onGridUploaded(newDb);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to upload and ingest grid CSV";
      setError(msg);
    } finally {
      setIsProcessing(false);
      setProgressStep(null);
    }
  };

  const selectedItem = catalog.find((c) => c.catalog_id === selectedCatalogId) || catalog[0];

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 text-slate-200 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5 text-emerald-400 font-bold text-sm">
            <CloudDownload className="w-5 h-5 text-emerald-400" />
            <span>Ingest Historical Grid Frequency Dataset</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab("auto_download")}
            className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === "auto_download"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/60 shadow-sm shadow-emerald-950"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Auto-Download (Zenodo)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("upload_csv")}
            className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === "upload_csv"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/60 shadow-sm shadow-cyan-950"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Upload className="w-3.5 h-3.5 text-cyan-400" />
            <span>Upload Custom CSV</span>
          </button>
        </div>

        {/* Tab 1: Automated Zenodo Download */}
        {activeTab === "auto_download" && (
          <div className="space-y-4 text-xs font-mono">
            <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
              Auto-downloads continuous 1Hz grid datasets from Zenodo (Records 5105820 & 15784548). Automatically converts
              naive <code className="text-cyan-300">Europe/Berlin</code> timestamps to <code className="text-emerald-300">UTC</code> &{" "}
              <code className="text-emerald-300">Africa/Casablanca</code> (Ramadan-aware), cleans dropouts, and compresses into high-speed Parquet.
            </p>

            {/* Dataset Catalog Selector */}
            <div>
              <label className="block text-slate-300 font-semibold mb-1.5 text-xs">
                Select Historical Power Grid Dataset
              </label>
              <div className="space-y-2">
                {catalog.map((item) => (
                  <div
                    key={item.catalog_id}
                    onClick={() => {
                      setSelectedCatalogId(item.catalog_id);
                      setTargetYear(item.year);
                      setNominalHz(item.nominal_grid_hz);
                    }}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      selectedCatalogId === item.catalog_id
                        ? "bg-emerald-950/40 border-emerald-500 shadow-sm shadow-emerald-950"
                        : "bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-400"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-bold text-white text-xs">
                        <Globe2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>{item.title}</span>
                      </div>
                      <span className="text-[10px] text-cyan-300 font-mono bg-cyan-950/70 px-2 py-0.5 rounded border border-cyan-800/50">
                        {item.nominal_grid_hz} Hz
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-sans mt-1">
                      {item.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Ingestion Scope (Month / Day / Year) */}
            <div>
              <label className="block text-slate-300 font-semibold mb-1 text-xs">
                Ingestion Scope & Resolution
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setScope("month")}
                  className={`py-2 px-2 text-center rounded-lg border text-xs cursor-pointer transition-all ${
                    scope === "month"
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500 font-bold"
                      : "bg-slate-950 text-slate-400 border-slate-800"
                  }`}
                >
                  <div className="font-semibold">Full Month</div>
                  <div className="text-[9px] text-slate-500">~2.59M seconds</div>
                </button>

                <button
                  type="button"
                  onClick={() => setScope("day")}
                  className={`py-2 px-2 text-center rounded-lg border text-xs cursor-pointer transition-all ${
                    scope === "day"
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500 font-bold"
                      : "bg-slate-950 text-slate-400 border-slate-800"
                  }`}
                >
                  <div className="font-semibold">24-Hour Day</div>
                  <div className="text-[9px] text-slate-500">86,400s (Fast)</div>
                </button>

                <button
                  type="button"
                  onClick={() => setScope("year")}
                  className={`py-2 px-2 text-center rounded-lg border text-xs cursor-pointer transition-all ${
                    scope === "year"
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500 font-bold"
                      : "bg-slate-950 text-slate-400 border-slate-800"
                  }`}
                >
                  <div className="font-semibold">Full Year</div>
                  <div className="text-[9px] text-slate-500">31.5M seconds</div>
                </button>
              </div>
            </div>

            {/* Target Year & Month Fine-tuning */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 mb-1 text-[11px]">Target Year</label>
                <input
                  type="number"
                  min={2011}
                  max={2024}
                  value={targetYear}
                  onChange={(e) => setTargetYear(parseInt(e.target.value) || 2017)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 text-[11px]">Target Month</label>
                <select
                  value={targetMonth}
                  onChange={(e) => setTargetMonth(parseInt(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono cursor-pointer"
                >
                  {[
                    "01 - January", "02 - February", "03 - March", "04 - April",
                    "05 - May", "06 - June", "07 - July", "08 - August",
                    "09 - September", "10 - October", "11 - November", "12 - December"
                  ].map((m, idx) => (
                    <option key={idx + 1} value={idx + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Progress Bar & Status Indicator */}
            {isProcessing && (
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2 animate-in fade-in">
                <div className="flex items-center justify-between text-xs font-mono text-emerald-400">
                  <span className="flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Auto-Download & Ingestion Active</span>
                  </span>
                  <span>ZSTD Parquet</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="w-full h-full bg-gradient-to-r from-emerald-500 to-cyan-500 animate-pulse" />
                </div>
                <div className="text-[11px] text-slate-400 font-sans">{progressStep}</div>
              </div>
            )}

            {error && (
              <div className="p-2.5 rounded bg-rose-950/40 border border-rose-900/60 text-rose-300 text-[11px]">
                {error}
              </div>
            )}

            {/* Auto Download Action Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleAutoDownload}
                disabled={isProcessing}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-950/60 flex items-center justify-center gap-2 transition-all disabled:opacity-40 cursor-pointer"
              >
                {isProcessing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>Auto-Download & Ingest Dataset</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Custom CSV Upload */}
        {activeTab === "upload_csv" && (
          <div className="space-y-4 text-xs font-mono">
            <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
              Upload any custom historical grid CSV dataset. The engine will normalize units, convert local timezones
              to UTC and Africa/Casablanca, enforce a strict 1Hz index, and compress to Parquet.
            </p>

            <div>
              <label className="block text-slate-300 mb-1">Source CSV Timezone</label>
              <select
                value={inputTz}
                onChange={(e) => setInputTz(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 font-mono text-slate-200 text-xs focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                <option value="Europe/Berlin">Europe/Berlin (German/European TSO Default)</option>
                <option value="UTC">UTC (Universal Time Coordinated)</option>
                <option value="Africa/Casablanca">Africa/Casablanca (Morocco ONEE)</option>
                <option value="America/New_York">America/New_York (US Eastern Interconnection)</option>
              </select>
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-cyan-500 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer bg-slate-950/60 transition-colors"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleCsvFile}
                className="hidden"
              />
              {isProcessing ? (
                <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin mb-2" />
              ) : (
                <Upload className="w-6 h-6 text-cyan-400 mb-2" />
              )}
              <span className="text-xs font-bold text-slate-200">
                {isProcessing ? "Processing & Normalizing Timezones..." : "Choose Local Grid CSV File"}
              </span>
              <span className="text-[10px] text-slate-500 mt-0.5">
                Supports: timestamp, frequency (Hz, mHz, or deviation)
              </span>
            </div>

            {error && (
              <div className="p-2.5 rounded bg-rose-950/40 border border-rose-900/60 text-rose-300 text-[11px]">
                {error}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

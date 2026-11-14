"use client";

import React, { useRef, useState } from "react";
import { Database, X, Upload, Globe2, RefreshCw } from "lucide-react";
import { uploadGridCsv } from "../lib/api";
import { GridDatabaseInfo } from "../lib/types";

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
  const [inputTz, setInputTz] = useState<string>("Europe/Berlin");
  const [nominalHz, setNominalHz] = useState<number>(50.0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    setIsUploading(true);
    setError(null);
    try {
      const newDb = await uploadGridCsv(file, inputTz, nominalHz);
      onGridUploaded(newDb);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to upload and ingest grid CSV";
      setError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-6 text-slate-200 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
            <Database className="w-5 h-5" />
            <span>Ingest Historical Grid Frequency Dataset</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          Upload raw CSV data (Zenodo Records 5105820 or 15784548). The pipeline normalizes timezones
          (Europe/Berlin to UTC & Africa/Casablanca), enforces a continuous 1Hz grid, cleans gaps,
          and converts to Zstandard-compressed Parquet.
        </p>

        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-300 mb-1">Source Timezone</label>
            <select
              value={inputTz}
              onChange={(e) => setInputTz(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 font-mono text-slate-200 text-xs focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="Europe/Berlin">Europe/Berlin (German/European TSO Default)</option>
              <option value="UTC">UTC (Universal Time Coordinated)</option>
              <option value="Africa/Casablanca">Africa/Casablanca (Morocco)</option>
              <option value="America/New_York">America/New_York (US Eastern Grid)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-300 mb-1">Nominal Grid Scale</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setNominalHz(50.0)}
                className={`py-1.5 px-3 rounded border text-xs font-medium cursor-pointer ${
                  nominalHz === 50.0
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500"
                    : "bg-slate-800 text-slate-400 border-slate-700"
                }`}
              >
                50.0 Hz (Europe / Morocco)
              </button>
              <button
                type="button"
                onClick={() => setNominalHz(60.0)}
                className={`py-1.5 px-3 rounded border text-xs font-medium cursor-pointer ${
                  nominalHz === 60.0
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500"
                    : "bg-slate-800 text-slate-400 border-slate-700"
                }`}
              >
                60.0 Hz (North America)
              </button>
            </div>
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-700 hover:border-cyan-500 rounded-lg p-5 flex flex-col items-center justify-center cursor-pointer bg-slate-950/60 transition-colors"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFile}
              className="hidden"
            />
            {isUploading ? (
              <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin mb-2" />
            ) : (
              <Upload className="w-6 h-6 text-cyan-400 mb-2" />
            )}
            <span className="text-xs font-semibold text-slate-200">
              {isUploading ? "Normalizing Timezones & Compressing to Parquet..." : "Click to select CSV File"}
            </span>
            <span className="text-[10px] text-slate-500 mt-0.5">
              Supports columns: timestamp, frequency (Hz, mHz, or deviation)
            </span>
          </div>

          {error && (
            <div className="p-2 rounded bg-rose-950/40 border border-rose-900/60 text-rose-300 text-[11px]">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-3 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

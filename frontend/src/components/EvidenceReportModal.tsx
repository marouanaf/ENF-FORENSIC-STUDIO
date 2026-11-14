"use client";

import React from "react";
import { FileText, Download, X, ShieldCheck, CheckCircle2, Copy } from "lucide-react";
import { MatchResponse, MediaInfo } from "../lib/types";

interface EvidenceReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  matchResult: MatchResponse | null;
  mediaInfo: MediaInfo | null;
}

export const EvidenceReportModal: React.FC<EvidenceReportModalProps> = ({
  isOpen,
  onClose,
  matchResult,
  mediaInfo,
}) => {
  if (!isOpen || !matchResult || !mediaInfo) return null;

  const { best_match, verdict, confidence_pct, z_score, database_filename, search_window_seconds } = matchResult;

  const reportPayload = {
    report_title: "ENF Forensic Audio/Video Authentication Certificate",
    generated_at: new Date().toISOString(),
    verdict: verdict,
    confidence_percentage: confidence_pct,
    evidence_file: {
      filename: mediaInfo.filename,
      duration_seconds: mediaInfo.duration,
      media_id: mediaInfo.media_id,
      has_video: mediaInfo.has_video,
      fps: mediaInfo.fps,
      resolution: mediaInfo.resolution,
    },
    historical_grid_match: {
      database: database_filename,
      authenticated_timestamp_utc: best_match.start_timestamp_utc,
      authenticated_casablanca_time: best_match.casablanca_time,
      window_seconds: search_window_seconds,
      pearson_correlation_r: best_match.pearson_r,
      root_mean_square_error_mhz: best_match.rmse_mhz,
      mean_squared_error_hz2: best_match.mse,
      peak_z_score: z_score,
    },
    top_candidates: matchResult.top_candidates,
  };

  const handleDownloadJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(reportPayload, null, 2));
    const dlAnchor = document.createElement("a");
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `ENF_Forensic_Report_${mediaInfo.media_id}.json`);
    dlAnchor.click();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-xl w-full p-6 text-slate-200 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
            <ShieldCheck className="w-5 h-5" />
            <span>Forensic Authentication Certificate</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3 text-xs font-mono">
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Authentication Summary</div>
            <div className="text-sm font-bold text-white flex items-center justify-between">
              <span>Status: <span className="text-emerald-400">{verdict}</span></span>
              <span className="text-xs text-slate-400">Confidence: {confidence_pct}%</span>
            </div>
            <div className="text-emerald-300 font-bold text-xs">
              Authenticated Timing (GMT): <strong className="text-emerald-400">{best_match.gmt_time || best_match.start_timestamp_utc}</strong>
            </div>
            <div className="text-slate-300">
              Casablanca (Local): <strong>{best_match.casablanca_time}</strong>
            </div>
            <div className="text-slate-400">
              UTC Timestamp: <strong className="text-slate-200">{best_match.start_timestamp_utc}</strong>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
              <span className="text-slate-500 block">Pearson Correlation (r)</span>
              <span className="text-sm font-bold text-emerald-400">{best_match.pearson_r.toFixed(5)}</span>
            </div>
            <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
              <span className="text-slate-500 block">RMSE Discrepancy</span>
              <span className="text-sm font-bold text-cyan-300">{best_match.rmse_mhz.toFixed(2)} mHz</span>
            </div>
            <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
              <span className="text-slate-500 block">Peak Noise Floor Z-Score</span>
              <span className="text-sm font-bold text-amber-300">+{z_score.toFixed(1)} σ</span>
            </div>
            <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
              <span className="text-slate-500 block">Reference Grid</span>
              <span className="text-xs text-slate-300 truncate block">{database_filename}</span>
            </div>
          </div>

          <div>
            <span className="text-slate-400 block mb-1">Raw Evidence Report JSON:</span>
            <pre className="bg-slate-950 p-3 rounded text-[10px] text-slate-300 overflow-x-auto max-h-40 border border-slate-800">
              {JSON.stringify(reportPayload, null, 2)}
            </pre>
          </div>
        </div>

        <div className="flex justify-between items-center pt-3 border-t border-slate-800">
          <button
            onClick={() => navigator.clipboard.writeText(JSON.stringify(reportPayload, null, 2))}
            className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy JSON</span>
          </button>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs cursor-pointer"
            >
              Close
            </button>
            <button
              onClick={handleDownloadJson}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-md shadow-emerald-950 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Evidence Report</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Header } from "../components/Header";
import { MediaInspector } from "../components/MediaInspector";
import { ConfigPanel } from "../components/ConfigPanel";
import { SpectrogramView } from "../components/SpectrogramView";
import { VerdictBanner } from "../components/VerdictBanner";
import { DualSignalChart } from "../components/DualSignalChart";
import { CorrelationCurveChart } from "../components/CorrelationCurveChart";
import { CandidatesTable } from "../components/CandidatesTable";
import { UploadGridModal } from "../components/UploadGridModal";
import { EvidenceReportModal } from "../components/EvidenceReportModal";
import {
  autoDownloadGrid,
  checkHealth,
  extractEnfMultiModal,
  fetchDatabases,
  matchDatabase,
} from "../lib/api";
import {
  EnfAnalysisMode,
  ExtractEnfResponse,
  GridDatabaseInfo,
  MatchResponse,
  MediaInfo,
} from "../lib/types";
import { AlertCircle, CheckCircle, ShieldCheck, Zap, FileText, Upload, Calendar, Search } from "lucide-react";

export default function ForensicWorkstationPage() {
  // Backend & Databases
  const [backendOnline, setBackendOnline] = useState(false);
  const [databases, setDatabases] = useState<GridDatabaseInfo[]>([]);
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<string>("");

  // Media & ROI
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [roiStart, setRoiStart] = useState<number>(0.0);
  const [roiDuration, setRoiDuration] = useState<number>(120.0);

  // Multi-Modal & DSP Configuration
  const [analysisMode, setAnalysisMode] = useState<EnfAnalysisMode>("acoustic");
  const [nominalGrid, setNominalGrid] = useState<number>(50.0);
  const [harmonicMultiplier, setHarmonicMultiplier] = useState<number>(2);
  const [windowDuration, setWindowDuration] = useState<number>(8.0);

  // Results
  const [extractionResult, setExtractionResult] = useState<ExtractEnfResponse | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResponse | null>(null);
  const [selectedRank, setSelectedRank] = useState<number>(1);

  // UI state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDownloadingYear, setIsDownloadingYear] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [notification, setNotification] = useState<{ type: "success" | "error" | "info"; msg: string } | null>(null);

  // Fetch databases list
  const refreshDatabases = useCallback(async () => {
    try {
      const dbs = await fetchDatabases();
      setDatabases(dbs);
      if (dbs.length > 0 && !selectedDatabaseId) {
        setSelectedDatabaseId(dbs[0].database_id);
      }
    } catch {
      // ignore
    }
  }, [selectedDatabaseId]);

  const showNotification = (type: "success" | "error" | "info", msg: string) => {
    setNotification({ type, msg });
    setTimeout(() => setNotification(null), 6000);
  };

  // Initial mount health check
  useEffect(() => {
    const init = async () => {
      try {
        await checkHealth();
        setBackendOnline(true);
        await refreshDatabases();
      } catch {
        setBackendOnline(false);
      }
    };
    init();
    const interval = setInterval(async () => {
      try {
        await checkHealth();
        setBackendOnline(true);
      } catch {
        setBackendOnline(false);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [refreshDatabases]);

  // Quick download a specific year from Zenodo
  const handleQuickDownloadYear = async (year: number) => {
    setIsDownloadingYear(true);
    showNotification("info", `Connecting to Zenodo & ingesting ${year} grid data...`);
    try {
      const catalogId = year === 2017 ? "zenodo_2017_morocco" : `zenodo_${year}_ce`;
      const newDb = await autoDownloadGrid({
        catalog_id: catalogId,
        scope: "month",
        target_year: year,
        target_month: 11,
        nominal_hz: nominalGrid,
      });
      await refreshDatabases();
      setSelectedDatabaseId(newDb.database_id);
      showNotification("success", `✓ Ingested ${year} grid dataset: ${newDb.filename}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Download failed";
      showNotification("error", msg);
    } finally {
      setIsDownloadingYear(false);
    }
  };

  // Unified Forensic Action: Extract ENF from ANY video & Correlate against chosen Grid Year
  const handleRunFullForensicAnalysis = async () => {
    if (!mediaInfo) {
      showNotification("error", "Please upload or select an audio/video file first.");
      return;
    }

    setIsAnalyzing(true);
    setExtractionResult(null);
    setMatchResult(null);

    try {
      showNotification("info", `Step 1/2: Extracting ${analysisMode.toUpperCase()} ENF trace from media...`);

      // 1. Extract ENF
      const extRes = await extractEnfMultiModal({
        media_id: mediaInfo.media_id,
        start_sec: roiStart,
        end_sec: roiStart + roiDuration,
        mode: analysisMode,
        nominal_grid_hz: nominalGrid,
        harmonic: harmonicMultiplier,
        window_seconds: windowDuration,
      });
      setExtractionResult(extRes);

      // 2. Correlate against selected database
      showNotification("info", "Step 2/2: Computing FFT cross-correlation across historical grid database...");

      const mRes = await matchDatabase({
        media_id: mediaInfo.media_id,
        query_enf: extRes.trace.normalized_enf,
        database_id: selectedDatabaseId || undefined,
        top_k: 5,
        min_separation_sec: 300,
      });

      setMatchResult(mRes);
      setSelectedRank(1);

      showNotification(
        "success",
        `Forensic matching complete! Best match: ${mRes.best_match.casablanca_time || mRes.best_match.start_timestamp_utc} (r = ${mRes.best_match.pearson_r.toFixed(4)}, RMSE: ${mRes.best_match.rmse_mhz.toFixed(2)} mHz)`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Forensic analysis failed";
      showNotification("error", msg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const activeDbInfo = databases.find((d) => d.database_id === selectedDatabaseId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col bg-grid-forensic">
      {/* Top Header */}
      <Header
        backendOnline={backendOnline}
        activeDatabaseName={activeDbInfo?.filename}
        nominalGrid={nominalGrid}
        analysisMode={analysisMode}
        onOpenUploadModal={() => setUploadModalOpen(true)}
      />

      {/* Floating Status Notification */}
      {notification && (
        <div className="fixed top-20 right-6 z-50 animate-in fade-in slide-in-from-top-3 duration-300">
          <div
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-mono border shadow-2xl ${
              notification.type === "success"
                ? "bg-emerald-950/90 text-emerald-200 border-emerald-500/50"
                : notification.type === "error"
                ? "bg-rose-950/90 text-rose-200 border-rose-500/50"
                : "bg-cyan-950/90 text-cyan-200 border-cyan-500/50"
            }`}
          >
            {notification.type === "success" && <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />}
            {notification.type === "error" && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
            {notification.type === "info" && <Zap className="w-4 h-4 text-cyan-400 shrink-0" />}
            <span>{notification.msg}</span>
          </div>
        </div>
      )}

      {/* Main Studio Body */}
      <main className="flex-1 p-4 lg:p-8 space-y-6 max-w-7xl mx-auto w-full">
        {/* Top Section: Media Inspector (Left) + Config Panel (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 space-y-4">
            <MediaInspector
              mediaInfo={mediaInfo}
              onMediaLoaded={(info) => {
                setMediaInfo(info);
                setExtractionResult(null);
                setMatchResult(null);
                showNotification("info", `Loaded: ${info.filename} (${info.duration}s). Ready for forensic analysis.`);
              }}
              roiStart={roiStart}
              roiDuration={roiDuration}
              onChangeRoi={(start, dur) => {
                setRoiStart(start);
                setRoiDuration(dur);
              }}
              analysisMode={analysisMode}
              setAnalysisMode={setAnalysisMode}
              targetFreq={nominalGrid * harmonicMultiplier}
            />
          </div>

          <div className="lg:col-span-5">
            <ConfigPanel
              mediaInfo={mediaInfo}
              roiStart={roiStart}
              roiDuration={roiDuration}
              analysisMode={analysisMode}
              nominalGrid={nominalGrid}
              setNominalGrid={setNominalGrid}
              harmonicMultiplier={harmonicMultiplier}
              setHarmonicMultiplier={setHarmonicMultiplier}
              windowDuration={windowDuration}
              setWindowDuration={setWindowDuration}
              databases={databases}
              selectedDatabaseId={selectedDatabaseId}
              setSelectedDatabaseId={setSelectedDatabaseId}
              onRefreshDatabases={refreshDatabases}
              onOpenUploadModal={() => setUploadModalOpen(true)}
              onRunFullForensicAnalysis={handleRunFullForensicAnalysis}
              isAnalyzing={isAnalyzing}
              onQuickDownloadYear={handleQuickDownloadYear}
              isDownloadingYear={isDownloadingYear}
            />
          </div>
        </div>

        {/* Visual Proof & Signal Analysis Dashboard */}
        {extractionResult && (
          <section className="space-y-6 pt-4 border-t border-slate-800 animate-in fade-in duration-500">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                  Forensic Telemetry & Narrowband Visual Proof
                </h2>
              </div>
              <div className="flex items-center gap-3">
                {extractionResult.selected_modality && (
                  <span className="text-xs font-mono px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-cyan-300">
                    Modality: <strong className="text-emerald-400 uppercase">{extractionResult.selected_modality}</strong>{" "}
                    {extractionResult.modality_rationale && `(${extractionResult.modality_rationale})`}
                  </span>
                )}
                {matchResult && (
                  <button
                    onClick={() => setReportModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-emerald-300 border border-emerald-500/40 rounded-lg cursor-pointer transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Export Evidence Report</span>
                  </button>
                )}
              </div>
            </div>

            {/* Spectrogram Preview */}
            <SpectrogramView
              spectrogram={extractionResult.spectrogram}
              trace={extractionResult.trace}
            />

            {/* Match Telemetry */}
            {matchResult && (
              <div className="space-y-6 animate-in fade-in duration-500">
                {/* 1. Verdict Banner */}
                <VerdictBanner matchResult={matchResult} />

                {/* 2. Dual-Signal Overlay Chart */}
                <DualSignalChart data={matchResult.best_match_overlay} />

                {/* 3. Sliding Correlation Spike Curve */}
                <CorrelationCurveChart
                  data={matchResult.correlation_curve}
                  bestIndex={matchResult.best_match.start_index}
                />

                {/* 4. Top 5 Candidates Table */}
                <CandidatesTable
                  candidates={matchResult.top_candidates}
                  selectedRank={selectedRank}
                  onSelectRank={(rank) => setSelectedRank(rank)}
                />
              </div>
            )}
          </section>
        )}
      </main>

      {/* Historical Grid Downloader & Ingestion Modal */}
      <UploadGridModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onGridUploaded={(newDb) => {
          refreshDatabases();
          setSelectedDatabaseId(newDb.database_id);
          showNotification("success", `Ingested Parquet grid: ${newDb.filename}`);
        }}
      />

      {/* Evidence Report Modal */}
      <EvidenceReportModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        matchResult={matchResult}
        mediaInfo={mediaInfo}
      />

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 px-6 py-4 text-center text-xs font-mono text-slate-500">
        <div>
          GRIDTRACE Multi-Modal ENF Forensic Workstation • Continental Europe / Morocco ONEE 50 Hz Synchronous Grid • Polyphase FIR • Zero-Phase Butterworth • FFT NCC
        </div>
      </footer>
    </div>
  );
}

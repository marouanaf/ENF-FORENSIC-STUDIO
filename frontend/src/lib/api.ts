import {
  EnfAnalysisMode,
  ExtractEnfResponse,
  GridDatabaseInfo,
  MatchResponse,
  MediaInfo,
  SimulationResult,
} from "./types";

function getDirectBackendBase(): string {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
  }
  const host = window.location.hostname || "127.0.0.1";
  return `http://${host}:8000`;
}

/**
 * Direct-first API fetcher.
 * Connects directly to FastAPI backend to eliminate Next.js proxy ECONNRESET
 * and socket hang-up logs during continuous polling or media streaming.
 */
async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const isBrowser = typeof window !== "undefined";
  const directBase = getDirectBackendBase();
  const directUrl = `${directBase}${path}`;

  if (isBrowser) {
    try {
      const res = await fetch(directUrl, options);
      if (res.ok || (res.status !== 502 && res.status !== 503 && res.status !== 504)) {
        return res;
      }
    } catch {
      // Fallback to relative path via Next.js proxy if direct port was unreachable
    }
  }

  return await fetch(path, options);
}

export async function checkHealth(): Promise<{ status: string; databases_available: string[] }> {
  const res = await apiFetch("/api/health", { cache: "no-store" });
  if (!res.ok) throw new Error("Backend server unreachable");
  return res.json();
}

export async function uploadMedia(file: File): Promise<MediaInfo> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await apiFetch("/api/upload-media", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to upload and parse media file");
  }
  return res.json();
}

export function getMediaStreamUrl(mediaId: string): string {
  const base = getDirectBackendBase();
  return `${base}/api/media/${mediaId}/stream`;
}

export async function extractEnfMultiModal(params: {
  media_id: string;
  start_sec?: number;
  end_sec?: number;
  mode: EnfAnalysisMode;
  nominal_grid_hz: number;
  harmonic: string | number;
  window_seconds?: number;
  band_margin?: number;
}): Promise<ExtractEnfResponse> {
  const res = await apiFetch("/api/extract-enf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_id: params.media_id,
      start_sec: params.start_sec ?? 0.0,
      end_sec: params.end_sec,
      mode: params.mode,
      nominal_grid_hz: params.nominal_grid_hz,
      harmonic: params.harmonic,
      window_seconds: params.window_seconds ?? 10.0,
      band_margin: params.band_margin ?? 0.55,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "ENF extraction failed");
  }
  return res.json();
}

export async function fetchDatabases(): Promise<GridDatabaseInfo[]> {
  const res = await apiFetch("/api/databases", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to list grid databases");
  return res.json();
}

export async function uploadGridCsv(
  file: File,
  inputTz: string = "Europe/Berlin",
  nominalHz: number = 50.0
): Promise<GridDatabaseInfo> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("input_tz", inputTz);
  formData.append("nominal_hz", nominalHz.toString());

  const res = await apiFetch("/api/upload-grid-csv", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to ingest grid CSV");
  }
  return res.json();
}

export async function matchDatabase(params: {
  media_id?: string;
  query_enf?: number[];
  database_id?: string;
  database_ids?: string[];
  years?: number[];
  top_k?: number;
  min_separation_sec?: number;
  roi_start_sec?: number;
  start_time_filter?: string;
  end_time_filter?: string;
}): Promise<MatchResponse> {
  const res = await apiFetch("/api/match-database", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_id: params.media_id,
      query_enf: params.query_enf,
      database_id: params.database_id,
      database_ids: params.database_ids,
      years: params.years,
      top_k: params.top_k ?? 5,
      min_separation_sec: params.min_separation_sec ?? 300,
      roi_start_sec: params.roi_start_sec ?? 0.0,
      start_time_filter: params.start_time_filter,
      end_time_filter: params.end_time_filter,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Database correlation matching failed");
  }
  return res.json();
}

export async function run2017ZouzSimulation(): Promise<SimulationResult> {
  const res = await apiFetch("/api/demo-synthetic-test", {
    method: "POST",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to run 2017 forensic simulation");
  }
  return res.json();
}

export async function getAvailableGridDownloads(): Promise<{
  catalog: import("./types").GridCatalogItem[];
  loaded_databases: GridDatabaseInfo[];
}> {
  const res = await apiFetch("/api/available-grid-downloads", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch available grid catalog");
  return res.json();
}

export async function autoDownloadGrid(params: import("./types").AutoDownloadGridParams): Promise<GridDatabaseInfo> {
  const res = await apiFetch("/api/auto-download-grid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to auto-download and ingest grid dataset");
  }
  return res.json();
}

export async function verifyMultiHarmonics(params: {
  media_id: string;
  start_sec?: number;
  end_sec?: number;
  nominal_grid_hz: number;
}): Promise<import("./types").MultiHarmonicVerification> {
  const res = await apiFetch("/api/verify-multi-harmonics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Multi-harmonic verification failed");
  }
  return res.json();
}

export async function scanEnfQuality(params: {
  media_id: string;
  nominal_grid_hz?: number;
  desired_roi_sec?: number;
}): Promise<import("./types").ScanQualityResponse> {
  const res = await apiFetch("/api/scan-enf-quality", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_id: params.media_id,
      nominal_grid_hz: params.nominal_grid_hz ?? 50.0,
      desired_roi_sec: params.desired_roi_sec ?? 120.0,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Audio quality scan failed");
  }
  return res.json();
}

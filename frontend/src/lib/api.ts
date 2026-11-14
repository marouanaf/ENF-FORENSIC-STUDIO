import {
  EnfAnalysisMode,
  ExtractEnfResponse,
  GridDatabaseInfo,
  MatchResponse,
  MediaInfo,
  SimulationResult,
} from "./types";

// Use same-origin relative URLs in the browser to eliminate CORS & NetworkError across localhost/127.0.0.1/LAN
const API_BASE = typeof window !== "undefined" ? "" : (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000");

export async function checkHealth(): Promise<{ status: string; databases_available: string[] }> {
  const res = await fetch(`${API_BASE}/api/health`);
  if (!res.ok) throw new Error("Backend server unreachable");
  return res.json();
}

export async function uploadMedia(file: File): Promise<MediaInfo> {
  const formData = new FormData();
  formData.append("file", file);

  let res: Response;
  try {
    res = await fetch("/api/upload-media", {
      method: "POST",
      body: formData,
    });
    if (res.status === 413 || res.status === 502 || res.status === 504) {
      throw new Error(`Proxy status ${res.status}`);
    }
  } catch {
    // Seamless fallback to direct backend port if Next.js proxy timed out on large files
    try {
      res = await fetch("http://127.0.0.1:8000/api/upload-media", {
        method: "POST",
        body: formData,
      });
    } catch {
      throw new Error("Failed to upload media: file transfer interrupted.");
    }
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to upload and parse media file");
  }
  return res.json();
}

export function getMediaStreamUrl(mediaId: string): string {
  return `${API_BASE}/api/media/${mediaId}/stream`;
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
  const res = await fetch(`${API_BASE}/api/extract-enf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_id: params.media_id,
      start_sec: params.start_sec ?? 0.0,
      end_sec: params.end_sec,
      mode: params.mode,
      nominal_grid_hz: params.nominal_grid_hz,
      harmonic: params.harmonic,
      window_seconds: params.window_seconds ?? 12.0,
      band_margin: params.band_margin ?? 0.6,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "ENF extraction failed");
  }
  return res.json();
}

export async function fetchDatabases(): Promise<GridDatabaseInfo[]> {
  const res = await fetch(`${API_BASE}/api/databases`);
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

  const res = await fetch(`${API_BASE}/api/upload-grid-csv`, {
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
}): Promise<MatchResponse> {
  const res = await fetch(`${API_BASE}/api/match-database`, {
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
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Database correlation matching failed");
  }
  return res.json();
}

export async function run2017ZouzSimulation(): Promise<SimulationResult> {
  const res = await fetch(`${API_BASE}/api/demo-synthetic-test`, {
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
  const res = await fetch(`${API_BASE}/api/available-grid-downloads`);
  if (!res.ok) throw new Error("Failed to fetch available grid catalog");
  return res.json();
}

export async function autoDownloadGrid(params: import("./types").AutoDownloadGridParams): Promise<GridDatabaseInfo> {
  const res = await fetch(`${API_BASE}/api/auto-download-grid`, {
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
  const res = await fetch(`${API_BASE}/api/verify-multi-harmonics`, {
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

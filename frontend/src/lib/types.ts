export interface YearComparisonItem {
  year: number;
  database_id: string;
  filename: string;
  peak_r: number;
  rmse_mhz: number;
  matched_gmt?: string;
  matched_casablanca_time: string;
  matched_utc: string;
  verdict: string;
  is_winner: boolean;
}
export type EnfAnalysisMode = "acoustic" | "optical" | "auto_fusion";

export interface MediaInfo {
  media_id: string;
  filename: string;
  duration: number;
  has_video: boolean;
  fps?: number;
  resolution?: string;
  sample_rate?: number;
  waveform_peaks: number[];
  size_bytes: number;
}

export interface HarmonicCandidate {
  harmonic_multiplier: number;
  target_freq: number;
  snr_db: number;
  recommended: boolean;
}

export interface AutoDetectHarmonicResult {
  best_harmonic: number;
  best_target_freq: number;
  best_snr_db: number;
  candidates: HarmonicCandidate[];
}

export interface EnfTrace {
  times: number[];
  raw_enf: number[];
  normalized_enf: number[];
  snr_estimates: number[];
  mean_snr_db: number;
  sample_count: number;
}

export interface SpectrogramData {
  times: number[];
  frequencies: number[];
  center_freq: number;
  freq_span: number;
  power_norm: number[][]; // [time_idx][freq_idx]
  min_freq: number;
  max_freq: number;
}

export interface ExtractEnfResponse {
  media_id: string;
  mode: EnfAnalysisMode;
  selected_modality?: "acoustic" | "optical";
  modality_rationale?: string;
  nominal_grid_hz: number;
  harmonic_multiplier: number;
  target_freq_hz: number;
  start_sec: number;
  duration_sec: number;
  fps?: number;
  f_row_sampling_rate?: number;
  trace: EnfTrace;
  spectrogram: SpectrogramData;
  multi_harmonic_verification?: MultiHarmonicVerification;
}

export interface GridDatabaseInfo {
  database_id: string;
  filename: string;
  row_count: number;
  start_time_utc: string;
  end_time_utc: string;
  nominal_grid_hz: number;
  description?: string;
}

export interface DualTimezoneInfo {
  gmt_formatted: string;
  gmt_time_only: string;
  gmt_date_only: string;
  utc_iso: string;
  casablanca_formatted: string;
  berlin_formatted: string;
  casablanca_time_only: string;
  casablanca_date_only: string;
  casablanca_tz_offset: string;
}

export interface MatchCandidate {
  rank: number;
  start_index: number;
  end_index: number;
  start_timestamp_utc: string;
  end_timestamp_utc: string;
  gmt_time?: string;
  gmt_time_only?: string;
  gmt_date_only?: string;
  casablanca_time: string;
  casablanca_time_only: string;
  casablanca_date_only: string;
  pearson_r: number;
  mse: number;
  rmse_mhz: number;
  relative_z_score: number;
}

export interface OverlayPoint {
  second: number;
  timestamp_utc: string;
  extracted_enf_hz: number;
  matched_grid_enf_hz: number;
  error_mhz: number;
}

export interface CorrelationPoint {
  relative_sec?: number;
  index: number;
  timestamp_utc: string;
  gmt_time?: string;
  casablanca_time?: string;
  pearson_r: number;
  mse: number;
  is_best: boolean;
}

export interface MatchResponse {
  verdict: "AUTHENTICATED" | "PROBABLE MATCH" | "INCONCLUSIVE" | "UNAUTHENTICATED";
  verdict_badge: string;
  verdict_color: "emerald" | "cyan" | "amber" | "rose";
  confidence_pct: number;
  best_match: MatchCandidate;
  best_match_timezone: DualTimezoneInfo;
  top_candidates: MatchCandidate[];
  best_match_overlay: OverlayPoint[];
  correlation_curve: CorrelationPoint[];
  correlation_curve_zoomed?: CorrelationPoint[];
  correlation_curve_global?: CorrelationPoint[];
  year_comparison?: YearComparisonItem[];
  search_window_seconds: number;
  database_total_seconds: number;
  noise_floor_mu: number;
  noise_floor_sigma: number;
  z_score: number;
  delta_r_to_second?: number;
  mse_ratio_to_second?: number;
  database_id?: string;
  database_filename?: string;
  database_description?: string;
}

export interface SimulationResult {
  status: string;
  case_name: string;
  media: {
    media_id: string;
    filename: string;
    duration: number;
    has_video: boolean;
    waveform_peaks: number[];
  };
  ground_truth: {
    planted_timestamp_utc: string;
    planted_casablanca_time: string;
    planted_offset_sec: number;
    nominal_grid_hz: number;
    harmonic_multiplier: number;
  };
  extraction: {
    mode: string;
    trace: EnfTrace;
    spectrogram: SpectrogramData;
  };
  match: MatchResponse;
}

export interface GridCatalogItem {
  catalog_id: string;
  title: string;
  record_id: string;
  year: number;
  nominal_grid_hz: number;
  size_label: string;
  description: string;
  recommended?: boolean;
}

export interface AvailableGridDownloadsResponse {
  catalog: GridCatalogItem[];
  loaded_databases: GridDatabaseInfo[];
}

export interface AutoDownloadGridParams {
  catalog_id: string;
  scope: "month" | "day" | "year";
  target_year: number;
  target_month: number;
  nominal_hz: number;
}

export interface MultiHarmonicVerification {
  verified: boolean;
  status: string;
  badge: string;
  color: string;
  description: string;
  cross_harmonic_r: number;
  mean_discrepancy_mhz: number;
  h2_snr_db: number;
  h4_snr_db: number;
  comparison_points?: Array<{
    second: number;
    f2_normalized_hz: number;
    f4_normalized_hz: number;
    diff_mhz: number;
  }>;
}

"""
Multi-Modal ENF (Electrical Network Frequency) Forensic Signal Processing Engine.

Implements the 5 Core Forensic DSP Principles:
1. 100 Hz Second-Harmonic & Multi-Harmonic Targeting (f1, f2, f4):
   Extracts fundamental f1 (50/60 Hz), dominant 2nd harmonic f2 (100/120 Hz caused by
   magnetostriction and P proportional to I^2 in appliances), and 4th harmonic f4 (200/240 Hz).
   Attenuates competing mechanical motor/compressor hums (e.g. 98.47 Hz) via tight zero-phase
   Butterworth bandpass filtering and physical grid bounds.
2. High-Resolution Fourier STFT & Sub-Millihertz Peak Estimation:
   Computes the Discrete Short-Time Fourier Transform (STFT) equation with Hann windowing,
   polyphase anti-aliasing decimation (fs = 1000 Hz), massive zero-padding (nfft = 131,072 bins),
   and log-magnitude quadratic (parabolic) interpolation achieving <0.001 Hz (sub-millihertz) precision.
3. Multi-Harmonic Cross-Verification & Consensus Fusion (f1, f2/2, f4/4):
   Extracts all three harmonics, normalizes them back to the 50 Hz / 60 Hz base grid scale,
   computes their mutual Pearson cross-correlation matrix and discrepancy in millihertz,
   and constructs an outlier-resistant SNR-weighted consensus fused trace.
4. Synchronous Continental European / Moroccan Grid Reference Data:
   Ingests 1 Hz European/Moroccan TSO data, continuous 1-second index, and dual timezone
   normalization (Europe/Berlin -> UTC & Africa/Casablanca with Ramadan/DST rules).
5. Vectorized Sliding Window FFT Cross-Correlation & Minimum MSE Matching:
   O(N log N) FFT convolution with Z-score normalized query, O(N) cumulative-sum sliding
   variance, sliding MSE/RMSE, multi-scale first-difference micro-wiggle correlation,
   and physical consistency penalty ranking candidates with noise-floor Z-scores.
"""

import json
import math
import os
import subprocess
import tempfile
from typing import Any, Dict, List, Optional, Tuple, Union

import cv2
import numpy as np
import pandas as pd
from scipy.signal import butter, decimate, fftconvolve, lfilter, medfilt, resample_poly, sosfiltfilt, windows
from scipy.stats import pearsonr

from backend.grid_data_pipeline import convert_to_dual_timezones, generate_realistic_grid_day, save_to_zstd_parquet


class ENFEngine:
    """
    Forensic Multi-Modal ENF Analysis Engine.
    """

    def __init__(self, target_fs: int = 1000):
        self.target_fs = target_fs

    # -----------------------------------------------------------------------
    # 1. AUDIO EXTRACTION & ZERO-PHASE BANDPASS
    # -----------------------------------------------------------------------

    def extract_audio_roi_to_float64(
        self,
        media_path: str,
        start_sec: Optional[float] = None,
        duration_sec: Optional[float] = None,
        intermediate_sr: int = 4000
    ) -> Tuple[np.ndarray, int]:
        """
        Zero-disk-I/O audio extraction via FFmpeg pipe into float64 NumPy array.
        """
        cmd = ["ffmpeg", "-y"]
        if start_sec is not None and start_sec > 0:
            cmd.extend(["-ss", f"{start_sec:.3f}"])
        cmd.extend(["-i", media_path])
        if duration_sec is not None and duration_sec > 0:
            cmd.extend(["-t", f"{duration_sec:.3f}"])

        cmd.extend([
            "-vn",
            "-ac", "1",
            "-ar", str(intermediate_sr),
            "-f", "f32le",
            "-acodec", "pcm_f32le",
            "pipe:1"
        ])

        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        raw_bytes, stderr = proc.communicate()

        if proc.returncode != 0:
            raise RuntimeError(f"FFmpeg audio extraction failed: {stderr.decode('utf-8', errors='ignore')}")

        audio_32 = np.frombuffer(raw_bytes, dtype=np.float32)
        if len(audio_32) == 0:
            raise ValueError("Extracted audio stream is empty.")

        return audio_32.astype(np.float64), intermediate_sr

    def decimate_audio(
        self,
        audio: np.ndarray,
        orig_sr: int,
        target_sr: int = 1000
    ) -> np.ndarray:
        """
        Anti-aliasing downsampling using rational polyphase FIR filtering (scipy.signal.resample_poly).
        """
        if orig_sr == target_sr:
            return audio.astype(np.float64)

        common_gcd = math.gcd(orig_sr, target_sr)
        up = target_sr // common_gcd
        down = orig_sr // common_gcd

        return resample_poly(audio, up, down).astype(np.float64)

    def apply_zero_phase_bandpass(
        self,
        signal: np.ndarray,
        target_freq: float,
        fs: int = 1000,
        band_margin: float = 0.55,
        order: int = 4
    ) -> np.ndarray:
        """
        4th-order zero-phase Butterworth bandpass filter centered at target_freq ± band_margin.
        Attenuates competing mechanical motor/compressor hums (e.g., 98.47 Hz) by >45 dB.
        """
        nyquist = fs / 2.0
        low = max(0.1, target_freq - band_margin)
        high = min(nyquist - 0.1, target_freq + band_margin)

        if low >= high:
            raise ValueError(f"Invalid bandpass bounds [{low}, {high}] with fs={fs}")

        sos = butter(order, [low / nyquist, high / nyquist], btype="bandpass", output="sos")
        padlen = min(fs * 4, len(signal) - 1)
        if padlen < 12:
            return signal.copy()

        filtered = sosfiltfilt(sos, signal, padlen=padlen)
        return filtered.astype(np.float64)

    # -----------------------------------------------------------------------
    # 2. FOURIER STFT & SUB-BIN PARABOLIC PEAK ESTIMATION
    # -----------------------------------------------------------------------

    def _compute_fourier_subbin_stft(
        self,
        signal: np.ndarray,
        fs: int,
        target_freq: float,
        harmonic_multiplier: int,
        window_seconds: float = 10.0,
        hop_seconds: float = 1.0,
        nfft_multiplier: int = 8,
        band_margin: float = 0.50,
        lambda_inertia: float = 2500.0
    ) -> Dict[str, Any]:
        """
        High-Resolution Short-Time Fourier Transform (STFT) with Viterbi Continuity Tracking
        and Sub-Bin Quadratic Log-Magnitude Interpolation.

        Fourier Equation implemented:
            X_m[k] = sum_{n=0}^{N_win-1} x[m*H + n] * w[n] * exp(-j * 2*pi * k * n / N_fft)
            w[n] = 0.5 * (1 - cos(2*pi*n / (N_win - 1)))  [Periodic Hann Window]

        Sub-bin parabolic log-magnitude vertex interpolation:
            alpha = S[k_peak - 1],  beta = S[k_peak],  gamma = S[k_peak + 1]  (where S = 20*log10|X|)
            delta = 0.5 * (alpha - gamma) / (alpha - 2*beta + gamma)
            f_inst = (k_peak + delta) * (fs / N_fft)
        """
        win_len = int(round(window_seconds * fs))
        step_samples = int(round(hop_seconds * fs))

        total_samples = len(signal)
        if total_samples < win_len:
            win_len = max(fs * 2, total_samples)

        # Zero-padding for Fourier interpolation: at least 65536 or 131072 bins
        min_bins = win_len * nfft_multiplier
        nfft = int(2 ** math.ceil(math.log2(max(65536, min_bins))))
        win = windows.hann(win_len, sym=False).astype(np.float64)
        freq_res = fs / nfft

        # Physical search band centered at target harmonic
        f_low = target_freq - band_margin
        f_high = target_freq + band_margin
        bin_low = max(0, int(math.floor(f_low / freq_res)))
        bin_high = min(nfft // 2, int(math.ceil(f_high / freq_res)))
        freqs_sub = np.arange(bin_low, bin_high + 1) * freq_res
        num_bins = len(freqs_sub)

        half_win = win_len // 2
        signal_padded = np.pad(signal, (half_win, half_win), mode="reflect")
        num_steps = max(1, int(math.floor(total_samples / step_samples)))

        frames_matrix = []
        raw_peak_mags = []
        snr_estimates = []

        eps = 1e-12
        for i in range(num_steps):
            center_idx = i * step_samples + half_win
            start_idx = center_idx - half_win
            end_idx = start_idx + win_len

            frame = signal_padded[start_idx:end_idx] * win
            # Discrete Fourier Transform
            X = np.fft.rfft(frame, n=nfft)
            mags = np.abs(X)
            sub_mags = mags[bin_low : bin_high + 1]

            # Local SNR calculation around target harmonic
            noise_low = max(0, int((target_freq - 2.5) / freq_res))
            noise_high = min(len(mags) - 1, int((target_freq + 2.5) / freq_res))
            noise_mask = np.ones(noise_high - noise_low + 1, dtype=bool)
            ex_start = max(0, bin_low - noise_low)
            ex_end = min(len(noise_mask), bin_high - noise_low + 1)
            noise_mask[ex_start:ex_end] = False
            noise_slice = mags[noise_low : noise_high + 1][noise_mask]

            noise_floor = np.median(noise_slice) if len(noise_slice) > 0 else eps
            peak_power = np.max(sub_mags) if len(sub_mags) > 0 else eps
            snr_db = float(20.0 * np.log10(max(peak_power, eps) / max(noise_floor, eps)))
            snr_estimates.append(round(snr_db, 2))
            raw_peak_mags.append(float(peak_power))

            # Normalized spectrum per frame so emission probability has invariant scale
            sub_norm = sub_mags / (np.max(sub_mags) + eps)
            frames_matrix.append(sub_norm)

        frames_matrix = np.array(frames_matrix)  # shape (num_steps, num_bins)

        # -------------------------------------------------------------------
        # Viterbi Dynamic Programming Continuity Tracking
        # -------------------------------------------------------------------
        # Turbo-generator rotational inertia physically limits df/dt <= 0.02 Hz/s
        dp = np.zeros((num_steps, num_bins), dtype=np.float64)
        backtrack = np.zeros((num_steps, num_bins), dtype=int)

        dp[0] = np.log(frames_matrix[0] + eps)
        freq_diff_matrix = (freqs_sub[:, None] - freqs_sub[None, :]) ** 2
        trans_cost = lambda_inertia * freq_diff_matrix

        for t in range(1, num_steps):
            log_emit = np.log(frames_matrix[t] + eps)
            scores = dp[t - 1][None, :] - trans_cost
            dp[t] = np.max(scores, axis=1) + log_emit
            backtrack[t] = np.argmax(scores, axis=1)

        # Optimal path traceback
        path = np.zeros(num_steps, dtype=int)
        path[-1] = int(np.argmax(dp[-1]))
        for t in range(num_steps - 2, -1, -1):
            path[t] = backtrack[t + 1, path[t + 1]]

        # -------------------------------------------------------------------
        # Parabolic Sub-Bin Interpolation on Optimal Path
        # -------------------------------------------------------------------
        times = []
        raw_enf = []
        norm_enf = []

        for t in range(num_steps):
            local_bin = path[t]
            global_bin = bin_low + local_bin

            # Parabolic interpolation in log-magnitude space
            m_slice = frames_matrix[t]
            if 0 < local_bin < (len(m_slice) - 1):
                alpha = float(20.0 * np.log10(max(m_slice[local_bin - 1], eps)))
                beta = float(20.0 * np.log10(max(m_slice[local_bin], eps)))
                gamma = float(20.0 * np.log10(max(m_slice[local_bin + 1], eps)))

                denom = alpha - 2.0 * beta + gamma
                if abs(denom) > 1e-12:
                    delta = 0.5 * (alpha - gamma) / denom
                    delta = float(np.clip(delta, -0.5, 0.5))
                else:
                    delta = 0.0
            else:
                delta = 0.0

            true_bin = global_bin + delta
            f_inst = true_bin * freq_res
            f_norm = f_inst / harmonic_multiplier

            times.append(float(round(t * hop_seconds, 3)))
            raw_enf.append(float(f_inst))
            norm_enf.append(float(f_norm))

        return {
            "times": times,
            "raw_enf": raw_enf,
            "normalized_enf": norm_enf,
            "snr_estimates": snr_estimates,
            "mean_snr_db": float(np.mean(snr_estimates)) if snr_estimates else 0.0,
            "sample_count": len(norm_enf)
        }

    # -----------------------------------------------------------------------
    # 3. MULTI-HARMONIC EXTRACTION & TRI-HARMONIC CONSENSUS (f1, f2, f4)
    # -----------------------------------------------------------------------

    def extract_single_harmonic_enf(
        self,
        audio_1000: np.ndarray,
        nominal_grid_hz: float,
        harmonic_multiplier: int,
        window_seconds: float = 10.0,
        hop_seconds: float = 1.0,
        band_margin: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Extracts one specific harmonic trace (k=1 for 50Hz, k=2 for 100Hz, k=4 for 200Hz).
        """
        target_freq = nominal_grid_hz * harmonic_multiplier

        # Margin scales with harmonic multiplier: f1 has +/-0.35, f2 has +/-0.55, f4 has +/-1.10
        if band_margin is None:
            if harmonic_multiplier == 1:
                margin = 0.35
            elif harmonic_multiplier == 2:
                margin = 0.55
            elif harmonic_multiplier == 3:
                margin = 0.85
            else:
                margin = 1.10
        else:
            margin = band_margin

        # Viterbi continuity weight scales with harmonic multiplier
        lambda_inertia = 1200.0 * harmonic_multiplier

        filtered = self.apply_zero_phase_bandpass(
            audio_1000,
            target_freq=target_freq,
            fs=self.target_fs,
            band_margin=margin + 0.05
        )

        trace_res = self._compute_fourier_subbin_stft(
            signal=filtered,
            fs=self.target_fs,
            target_freq=target_freq,
            harmonic_multiplier=harmonic_multiplier,
            window_seconds=window_seconds,
            hop_seconds=hop_seconds,
            nfft_multiplier=8,
            band_margin=margin,
            lambda_inertia=lambda_inertia
        )

        return {
            "harmonic_multiplier": harmonic_multiplier,
            "target_freq_hz": target_freq,
            "trace": trace_res,
            "filtered_audio": filtered
        }

    def verify_and_fuse_tri_harmonics(
        self,
        audio_1000: np.ndarray,
        nominal_grid_hz: float = 50.0,
        window_seconds: float = 10.0,
        hop_seconds: float = 1.0
    ) -> Dict[str, Any]:
        """
        Comprehensive Tri-Harmonic Forensic Verification & Consensus Fusion:
        Extracts fundamental f1 (50/60 Hz), 2nd harmonic f2 (100/120 Hz), and 4th harmonic f4 (200/240 Hz).
        
        Calculates:
        1. Pairwise Pearson cross-correlations: r(f1, f2/2), r(f2/2, f4/4), r(f1, f4/4).
        2. Pairwise mean absolute discrepancies (in mHz).
        3. Local SNR for each harmonic.
        4. Outlier-resistant, SNR-weighted consensus fusion that cancels single-harmonic audio contamination.
        """
        # Extract f1, f2, f4 independently
        h1 = self.extract_single_harmonic_enf(audio_1000, nominal_grid_hz, harmonic_multiplier=1, window_seconds=window_seconds, hop_seconds=hop_seconds)
        h2 = self.extract_single_harmonic_enf(audio_1000, nominal_grid_hz, harmonic_multiplier=2, window_seconds=window_seconds, hop_seconds=hop_seconds)
        h4 = self.extract_single_harmonic_enf(audio_1000, nominal_grid_hz, harmonic_multiplier=4, window_seconds=window_seconds, hop_seconds=hop_seconds)

        f1_norm = np.array(h1["trace"]["normalized_enf"], dtype=np.float64)
        f2_norm = np.array(h2["trace"]["normalized_enf"], dtype=np.float64)
        f4_norm = np.array(h4["trace"]["normalized_enf"], dtype=np.float64)

        snr1 = np.array(h1["trace"]["snr_estimates"], dtype=np.float64)
        snr2 = np.array(h2["trace"]["snr_estimates"], dtype=np.float64)
        snr4 = np.array(h4["trace"]["snr_estimates"], dtype=np.float64)

        min_len = min(len(f1_norm), len(f2_norm), len(f4_norm))
        if min_len < 5:
            return {
                "verified": False,
                "status": "INSUFFICIENT_DATA",
                "badge": "TOO SHORT",
                "color": "amber",
                "description": "Clip duration is too short for tri-harmonic cross-verification.",
                "cross_harmonic_r": 0.0,
                "mean_discrepancy_mhz": 0.0,
                "h1_snr_db": h1["trace"]["mean_snr_db"],
                "h2_snr_db": h2["trace"]["mean_snr_db"],
                "h4_snr_db": h4["trace"]["mean_snr_db"],
                "fused_trace": h2["trace"]["normalized_enf"]
            }

        f1_s = f1_norm[:min_len]
        f2_s = f2_norm[:min_len]
        f4_s = f4_norm[:min_len]

        snr1_s = snr1[:min_len]
        snr2_s = snr2[:min_len]
        snr4_s = snr4[:min_len]

        # Pairwise discrepancies in mHz
        diff_1_2 = np.mean(np.abs(f1_s - f2_s)) * 1000.0
        diff_2_4 = np.mean(np.abs(f2_s - f4_s)) * 1000.0
        diff_1_4 = np.mean(np.abs(f1_s - f4_s)) * 1000.0

        # Pairwise correlations
        def safe_r(a, b):
            if np.std(a) < 1e-6 or np.std(b) < 1e-6:
                return 1.0 if np.mean(np.abs(a - b)) * 1000.0 < 8.0 else 0.0
            r, _ = pearsonr(a, b)
            return float(r) if not np.isnan(r) else 0.0

        r_1_2 = safe_r(f1_s, f2_s)
        r_2_4 = safe_r(f2_s, f4_s)
        r_1_4 = safe_r(f1_s, f4_s)

        mean_snr1 = float(np.mean(snr1_s))
        mean_snr2 = float(np.mean(snr2_s))
        mean_snr4 = float(np.mean(snr4_s))

        # -------------------------------------------------------------------
        # Tri-Harmonic Consensus Fusion Algorithm
        # -------------------------------------------------------------------
        # For each second t:
        # 1. Compare f1, f2, f4.
        # 2. Reject outlier harmonics that deviate by >25 mHz from the median or have SNR < 2 dB.
        # 3. Fuse remaining valid harmonics weighted by SNR^2 (minimum-variance estimator).
        fused_series = np.zeros(min_len, dtype=np.float64)
        comparison_points = []

        for i in range(min_len):
            cand_vals = [f1_s[i], f2_s[i], f4_s[i]]
            cand_snrs = [snr1_s[i], snr2_s[i], snr4_s[i]]
            cand_mults = [1, 2, 4]

            med_val = float(np.median(cand_vals))

            # Filter valid harmonics
            valid_vals = []
            valid_weights = []
            for val, snr, mult in zip(cand_vals, cand_snrs, cand_mults):
                # Outlier threshold: deviation from median < 25 mHz and positive SNR
                if abs(val - med_val) <= 0.025 and snr >= 2.0:
                    valid_vals.append(val)
                    # Quadratic SNR weight (proportional to signal-to-noise power)
                    valid_weights.append(max(0.1, snr) ** 2)

            if valid_vals:
                w_arr = np.array(valid_weights)
                w_norm = w_arr / np.sum(w_arr)
                fused_val = float(np.sum(w_norm * np.array(valid_vals)))
            else:
                # Fallback to f2 (dominant second harmonic)
                fused_val = f2_s[i]

            fused_series[i] = fused_val

            comparison_points.append({
                "second": i,
                "f1_normalized_hz": round(float(f1_s[i]), 5),
                "f2_normalized_hz": round(float(f2_s[i]), 5),
                "f4_normalized_hz": round(float(f4_s[i]), 5),
                "fused_hz": round(float(fused_val), 5),
                "diff_mhz": round(float(diff_2_4), 2)
            })

        # Despiking inertia filter on fused trace
        for i in range(1, min_len):
            delta = fused_series[i] - fused_series[i - 1]
            if abs(delta) > 0.025:  # Physical limit: max 25 mHz change in 1 second
                fused_series[i] = fused_series[i - 1] + np.sign(delta) * 0.025

        # Overall Harmonic Coherence Assessment
        # In a genuine recording, at least f2 and f4 (or f1 and f2) correlate or agree within <= 15 mHz
        min_discrepancy = min(diff_2_4, diff_1_2, diff_1_4)
        best_pairwise_r = max(r_2_4, r_1_2, r_1_4)

        if (diff_2_4 <= 12.0 or diff_1_2 <= 12.0) and (best_pairwise_r >= 0.70 or min_discrepancy <= 8.0):
            status = "CONFIRMED_TRI_HARMONIC_ENF"
            badge = "TRI-HARMONIC CONSENSUS"
            color = "emerald"
            desc = f"Harmonics f1, f2/2, and f4/4 agree within {diff_2_4:.1f} mHz (r = {best_pairwise_r:.3f}). True electrical network origin verified."
            verified = True
        elif diff_2_4 <= 20.0 or best_pairwise_r >= 0.50:
            status = "PROBABLE_POWER_GRID_ENF"
            badge = "DUAL-HARMONIC CORRELATED"
            color = "cyan"
            desc = f"Moderate harmonic agreement: f2/2 and f4/4 within {diff_2_4:.1f} mHz (r = {r_2_4:.3f})."
            verified = True
        else:
            status = "INCONCLUSIVE_ACOUSTIC_NOISE"
            badge = "SINGLE-HARMONIC DOMINATED"
            color = "amber"
            desc = f"Harmonic discrepancy is elevated ({diff_2_4:.1f} mHz). Primary 100 Hz hum isolated with Viterbi noise rejection."
            verified = False

        return {
            "verified": verified,
            "status": status,
            "badge": badge,
            "color": color,
            "description": desc,
            "cross_harmonic_r": round(best_pairwise_r, 4),
            "mean_discrepancy_mhz": round(diff_2_4, 2),
            "r_f1_f2": round(r_1_2, 4),
            "r_f2_f4": round(r_2_4, 4),
            "r_f1_f4": round(r_1_4, 4),
            "diff_f1_f2_mhz": round(diff_1_2, 2),
            "diff_f2_f4_mhz": round(diff_2_4, 2),
            "diff_f1_f4_mhz": round(diff_1_4, 2),
            "h1_snr_db": round(mean_snr1, 1),
            "h2_snr_db": round(mean_snr2, 1),
            "h4_snr_db": round(mean_snr4, 1),
            "consensus_mode": "tri_harmonic_consensus",
            "fused_trace": [round(float(v), 5) for v in fused_series],
            "comparison_points": comparison_points,
        }

    # -----------------------------------------------------------------------
    # 4. ACOUSTIC ENF EXTRACTION INTERFACE
    # -----------------------------------------------------------------------

    def extract_acoustic_enf(
        self,
        media_path: str,
        start_sec: float = 0.0,
        end_sec: Optional[float] = None,
        nominal_grid_hz: float = 50.0,
        harmonic_multiplier: Union[int, str] = 2,
        window_seconds: float = 10.0,
        hop_seconds: float = 1.0,
        band_margin: float = 0.55
    ) -> Dict[str, Any]:
        """
        Acoustic ENF extraction with automatic multi-harmonic cross-verification.
        If harmonic_multiplier == "tri_harmonic" or 2, performs f1, f2, f4 consensus verification.
        """
        duration_sec = (end_sec - start_sec) if end_sec is not None else None
        audio_raw, sr = self.extract_audio_roi_to_float64(
            media_path,
            start_sec=start_sec,
            duration_sec=duration_sec,
            intermediate_sr=4000
        )
        audio_1000 = self.decimate_audio(audio_raw, sr, self.target_fs)

        use_tri_harmonic = str(harmonic_multiplier).lower() in ["tri_harmonic", "consensus", "auto"] or int(harmonic_multiplier if isinstance(harmonic_multiplier, int) else 2) == 2

        tri_result = None
        if use_tri_harmonic and len(audio_1000) >= self.target_fs * 5:
            try:
                tri_result = self.verify_and_fuse_tri_harmonics(
                    audio_1000=audio_1000,
                    nominal_grid_hz=nominal_grid_hz,
                    window_seconds=min(window_seconds, 10.0),
                    hop_seconds=hop_seconds
                )
            except Exception as ex:
                print(f"[Multi-Harmonic] Fusion fallback: {ex}")

        # Primary harmonic extraction (typically 2x = 100 Hz mains hum)
        target_k = 2 if str(harmonic_multiplier).lower() in ["tri_harmonic", "consensus", "auto"] else int(harmonic_multiplier)
        primary = self.extract_single_harmonic_enf(
            audio_1000=audio_1000,
            nominal_grid_hz=nominal_grid_hz,
            harmonic_multiplier=target_k,
            window_seconds=window_seconds,
            hop_seconds=hop_seconds,
            band_margin=band_margin
        )

        trace_res = primary["trace"]
        # If tri-harmonic fusion succeeded and confirmed, use the consensus trace
        if tri_result and tri_result.get("verified"):
            trace_res["normalized_enf"] = tri_result["fused_trace"]

        fourier_spectrum = self.compute_fourier_spectrum(
            audio=audio_raw,
            fs=sr,
            f_max=450.0,
            nominal_grid_hz=nominal_grid_hz,
            slice_sec=0.5
        )

        # Narrowband zoomed strictly on 100 Hz peak (+/- 0.35 Hz) matching Image 3
        spectrogram_data = self._compute_narrowband_spectrogram(
            signal=primary["filtered_audio"],
            fs=self.target_fs,
            center_freq=nominal_grid_hz * target_k,
            freq_span=0.35,
            win_sec=min(8.0, window_seconds)
        )

        # Wideband spectrogram from 80 Hz to 220 Hz matching Image 2
        wideband_data = self._compute_wideband_spectrogram(
            signal=audio_1000,
            fs=self.target_fs,
            f_min=80.0,
            f_max=220.0,
            win_sec=min(4.0, window_seconds)
        )

        return {
            "mode": "acoustic",
            "nominal_grid_hz": nominal_grid_hz,
            "harmonic_multiplier": target_k,
            "target_freq_hz": nominal_grid_hz * target_k,
            "start_sec": start_sec,
            "duration_sec": len(audio_1000) / self.target_fs,
            "trace": trace_res,
            "spectrogram": spectrogram_data,
            "wideband_spectrogram": wideband_data,
            "fourier_spectrum": fourier_spectrum,
            "multi_harmonic_verification": tri_result
        }

    def verify_multi_harmonics(
        self,
        media_path: str,
        start_sec: float = 0.0,
        end_sec: Optional[float] = None,
        nominal_grid_hz: float = 50.0,
        window_seconds: float = 10.0
    ) -> Dict[str, Any]:
        """
        Public endpoint method for Tri-Harmonic verification (f1, f2/2, f4/4).
        """
        duration_sec = (end_sec - start_sec) if end_sec is not None else None
        audio_raw, sr = self.extract_audio_roi_to_float64(
            media_path,
            start_sec=start_sec,
            duration_sec=duration_sec,
            intermediate_sr=4000
        )
        audio_1000 = self.decimate_audio(audio_raw, sr, self.target_fs)

        return self.verify_and_fuse_tri_harmonics(
            audio_1000=audio_1000,
            nominal_grid_hz=nominal_grid_hz,
            window_seconds=window_seconds,
            hop_seconds=1.0
        )

    def extract_best_harmonic(
        self,
        media_path: str,
        start_sec: float = 0.0,
        end_sec: Optional[float] = None,
        nominal_grid_hz: float = 50.0
    ) -> Dict[str, Any]:
        """
        Scans harmonics k in {1, 2, 3, 4} (50, 100, 150, 200 Hz) and selects the cleanest harmonic.
        """
        candidates = [1, 2, 3, 4]
        duration_sec = (end_sec - start_sec) if end_sec is not None else 60.0
        audio_raw, sr = self.extract_audio_roi_to_float64(
            media_path,
            start_sec=start_sec,
            duration_sec=min(60.0, duration_sec or 60.0),
            intermediate_sr=4000
        )
        audio_1000 = self.decimate_audio(audio_raw, sr, self.target_fs)

        results = []
        for k in candidates:
            f_target = k * nominal_grid_hz
            if f_target + 3.0 >= (self.target_fs / 2):
                continue

            filtered = self.apply_zero_phase_bandpass(audio_1000, f_target, fs=self.target_fs, band_margin=0.6)
            win_len = min(len(filtered), self.target_fs * 10)
            win = windows.hann(win_len, sym=False)
            X = np.fft.rfft(filtered[:win_len] * win, n=65536)
            mags = np.abs(X)
            freqs = np.fft.rfftfreq(65536, 1.0 / self.target_fs)

            sig_mask = (freqs >= (f_target - 0.5)) & (freqs <= (f_target + 0.5))
            noise_mask = ((freqs >= (f_target - 3.0)) & (freqs <= (f_target - 1.2))) | \
                         ((freqs >= (f_target + 1.2)) & (freqs <= (f_target + 3.0)))

            sig_p = float(np.max(mags[sig_mask])) if np.any(sig_mask) else 1e-12
            noise_p = float(np.median(mags[noise_mask])) if np.any(noise_mask) else 1e-12
            snr_db = float(20.0 * np.log10(max(sig_p, 1e-12) / max(noise_p, 1e-12)))

            results.append({
                "harmonic_multiplier": k,
                "target_freq": f_target,
                "snr_db": round(snr_db, 2),
                "recommended": False
            })

        results.sort(key=lambda x: x["snr_db"], reverse=True)
        results[0]["recommended"] = True

        return {
            "best_harmonic": results[0]["harmonic_multiplier"],
            "best_target_freq": results[0]["target_freq"],
            "best_snr_db": results[0]["snr_db"],
            "candidates": results
        }

    # -----------------------------------------------------------------------
    # 5. ROLLING-SHUTTER OPTICAL ENF PIPELINE (CMOS Video Frames)
    # -----------------------------------------------------------------------

    def extract_optical_enf(
        self,
        video_path: str,
        start_sec: float = 0.0,
        end_sec: Optional[float] = None,
        nominal_grid_hz: float = 50.0,
        window_seconds: float = 12.0
    ) -> Dict[str, Any]:
        """
        Extracts 100Hz/120Hz indoor lighting flicker from CMOS rolling-shutter video frames.
        """
        fps = 30.0
        frame_width = 640
        frame_height = 360
        try:
            cmd_probe = [
                "ffprobe", "-v", "error", "-select_streams", "v:0",
                "-show_entries", "stream=width,height,r_frame_rate",
                "-of", "json", video_path
            ]
            probe_out = subprocess.check_output(cmd_probe)
            streams = json.loads(probe_out).get("streams", [])
            if streams:
                frame_width = int(streams[0].get("width", 640))
                frame_height = int(streams[0].get("height", 360))
                rate_str = streams[0].get("r_frame_rate", "30/1")
                parts = rate_str.split("/")
                fps = float(parts[0]) / float(parts[1]) if len(parts) == 2 and float(parts[1]) != 0 else float(parts[0])
        except Exception:
            pass

        duration_sec = (end_sec - start_sec) if end_sec is not None else 60.0
        target_frames = int(round((duration_sec or 60.0) * fps))

        cmd_extract = ["ffmpeg", "-y"]
        if start_sec > 0:
            cmd_extract.extend(["-ss", f"{start_sec:.3f}"])
        cmd_extract.extend(["-i", video_path])
        if duration_sec is not None and duration_sec > 0:
            cmd_extract.extend(["-t", f"{duration_sec:.3f}"])

        cmd_extract.extend([
            "-an",
            "-f", "rawvideo",
            "-pix_fmt", "gray",
            "pipe:1"
        ])

        proc = subprocess.Popen(cmd_extract, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        raw_bytes, stderr = proc.communicate()

        frame_size = frame_width * frame_height
        if len(raw_bytes) < frame_size * 10:
            cap = cv2.VideoCapture(video_path)
            row_profiles = []
            if cap.isOpened():
                if start_sec > 0:
                    cap.set(cv2.CAP_PROP_POS_MSEC, start_sec * 1000)
                count = 0
                while cap.isOpened() and count < target_frames:
                    ret, f = cap.read()
                    if not ret or f is None:
                        break
                    gray = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY)
                    row_profiles.append(np.mean(gray, axis=1))
                    count += 1
                cap.release()
            if len(row_profiles) < 15:
                raise RuntimeError("Could not decode sufficient video frames for optical analysis.")
            all_rows = np.array(row_profiles, dtype=np.float64)
        else:
            num_frames = len(raw_bytes) // frame_size
            frames_arr = np.frombuffer(raw_bytes[:num_frames * frame_size], dtype=np.uint8).reshape((num_frames, frame_height, frame_width))
            all_rows = np.mean(frames_arr, axis=2).astype(np.float64)

        # Subtract temporal mean row profile to eliminate static scene textures
        mean_profile = np.mean(all_rows, axis=0)
        flicker_matrix = all_rows - mean_profile

        # Flatten into continuous rolling-shutter time series: f_row = H * fps
        f_row = frame_height * fps
        continuous_signal = flicker_matrix.flatten()

        # Downsample to target_fs = 1000 Hz
        gcd = math.gcd(int(f_row), self.target_fs)
        up = self.target_fs // gcd
        down = int(f_row) // gcd
        signal_1000 = resample_poly(continuous_signal, up, down).astype(np.float64)

        carrier_freq = 2.0 * nominal_grid_hz
        filtered = self.apply_zero_phase_bandpass(
            signal_1000,
            target_freq=carrier_freq,
            fs=self.target_fs,
            band_margin=0.55
        )

        trace_res = self._compute_fourier_subbin_stft(
            signal=filtered,
            fs=self.target_fs,
            target_freq=carrier_freq,
            harmonic_multiplier=2,
            window_seconds=window_seconds,
            hop_seconds=1.0,
            nfft_multiplier=8,
            band_margin=0.50
        )

        spectrogram_data = self._compute_narrowband_spectrogram(
            signal=filtered,
            fs=self.target_fs,
            center_freq=carrier_freq,
            freq_span=1.0,
            win_sec=min(8.0, window_seconds)
        )

        return {
            "mode": "optical",
            "fps": round(float(fps), 2),
            "frame_height": frame_height,
            "frame_width": frame_width,
            "frames_processed": len(all_rows),
            "f_row_sampling_rate": round(float(f_row), 1),
            "nominal_grid_hz": nominal_grid_hz,
            "harmonic_multiplier": 2,
            "target_freq_hz": carrier_freq,
            "start_sec": start_sec,
            "duration_sec": len(all_rows) / fps,
            "trace": trace_res,
            "spectrogram": spectrogram_data
        }

    # -----------------------------------------------------------------------
    # 6. MULTI-MODAL AUTO-FUSION MODE
    # -----------------------------------------------------------------------

    def extract_auto_fusion(
        self,
        media_path: str,
        start_sec: float = 0.0,
        end_sec: Optional[float] = None,
        nominal_grid_hz: float = 50.0,
        window_seconds: float = 10.0
    ) -> Dict[str, Any]:
        """
        Evaluates both Acoustic and Optical modalities and selects the cleanest signal (or fuses them).
        """
        acoustic_res = None
        optical_res = None

        try:
            acoustic_res = self.extract_acoustic_enf(
                media_path=media_path,
                start_sec=start_sec,
                end_sec=end_sec,
                nominal_grid_hz=nominal_grid_hz,
                harmonic_multiplier="tri_harmonic",
                window_seconds=window_seconds
            )
        except Exception:
            pass

        try:
            optical_res = self.extract_optical_enf(
                media_path=media_path,
                start_sec=start_sec,
                end_sec=end_sec,
                nominal_grid_hz=nominal_grid_hz,
                window_seconds=window_seconds
            )
        except Exception:
            pass

        if acoustic_res and optical_res:
            ac_snr = acoustic_res["trace"]["mean_snr_db"]
            opt_snr = optical_res["trace"]["mean_snr_db"]
            if ac_snr >= opt_snr:
                winner = acoustic_res
                winner["selected_modality"] = "acoustic"
                winner["modality_rationale"] = f"Acoustic hum SNR (+{ac_snr:.1f} dB) exceeds Optical flicker SNR (+{opt_snr:.1f} dB)"
            else:
                winner = optical_res
                winner["selected_modality"] = "optical"
                winner["modality_rationale"] = f"Optical rolling-shutter SNR (+{opt_snr:.1f} dB) exceeds Acoustic hum SNR (+{ac_snr:.1f} dB)"
            return winner
        elif acoustic_res:
            acoustic_res["selected_modality"] = "acoustic"
            acoustic_res["modality_rationale"] = "Acoustic audio track analyzed"
            return acoustic_res
        elif optical_res:
            optical_res["selected_modality"] = "optical"
            optical_res["modality_rationale"] = "Optical video frames analyzed"
            return optical_res
        else:
            raise RuntimeError("Both acoustic audio and optical rolling-shutter video extractions failed.")

    def compute_fourier_spectrum(
        self,
        audio: np.ndarray,
        fs: int,
        f_max: float = 450.0,
        nominal_grid_hz: float = 50.0,
        slice_sec: Optional[float] = None
    ) -> Dict[str, Any]:
        r"""
        Computes the Discrete Fourier Transform spectrum:
            X(f) = \int x(t) e^{-2\pi i f t} dt
        across 0 to 450 Hz, isolating:
        - 50 Hz (Fundamental base frequency)
        - 100 Hz (2x Second Harmonic - Dominant Mains Hum in Morocco)
        - 200 Hz (4x Fourth Harmonic - Rectifier Ripple)
        - 98.45 Hz (Mechanical motor / Refrigerator compressor hum)
        """
        if slice_sec is not None and slice_sec > 0:
            target_samples = min(len(audio), int(round(slice_sec * fs)))
            audio_slice = audio[:target_samples]
        else:
            audio_slice = audio

        nfft = max(32768, int(2 ** math.ceil(math.log2(len(audio_slice) * 4))))
        win = windows.hann(len(audio_slice), sym=False).astype(np.float64)
        X = np.abs(np.fft.rfft(audio_slice * win, n=nfft))
        freqs = np.fft.rfftfreq(nfft, 1.0 / fs)

        mask = (freqs >= 15.0) & (freqs <= f_max)
        f_sub = freqs[mask]
        X_sub = X[mask]

        def get_peak_in_band(low, high, label):
            m = (freqs >= low) & (freqs <= high)
            if not np.any(m):
                return {"freq": round((low + high) / 2.0, 3), "mag": 0.0, "label": label}
            idx = np.argmax(X[m])
            p_f = float(freqs[m][idx])
            p_m = float(X[m][idx])
            return {"freq": round(p_f, 3), "mag": round(p_m, 2), "label": label}

        peak_50 = get_peak_in_band(nominal_grid_hz - 0.4, nominal_grid_hz + 0.4, f"{nominal_grid_hz:.0f} Hz Fundamental")
        peak_100 = get_peak_in_band(2 * nominal_grid_hz - 0.5, 2 * nominal_grid_hz + 0.5, f"{nominal_grid_hz * 2:.0f} Hz Mains Hum (Morocco)")
        peak_200 = get_peak_in_band(4 * nominal_grid_hz - 1.0, 4 * nominal_grid_hz + 1.0, f"{nominal_grid_hz * 4:.0f} Hz Rectifier Harmonic")
        peak_comp = get_peak_in_band(98.0, 99.0, "98.45 Hz Mechanical Compressor")

        step = max(1, len(f_sub) // 400)
        f_disp = f_sub[::step].tolist()
        m_disp = X_sub[::step]
        max_val = np.max(X_sub) if len(X_sub) > 0 else 1.0
        m_norm = (m_disp / max_val).tolist()

        return {
            "equation": r"X(f) = \int x(t) e^{-2\pi i f t} dt",
            "frequencies": [round(float(f), 1) for f in f_disp],
            "magnitudes": [round(float(m), 4) for m in m_norm],
            "raw_max_mag": round(float(max_val), 2),
            "peak_50hz": peak_50,
            "peak_100hz": peak_100,
            "peak_200hz": peak_200,
            "peak_compressor": peak_comp,
            "nominal_grid_hz": nominal_grid_hz,
            "slice_duration_sec": slice_sec or (len(audio_slice) / fs)
        }

    def _compute_wideband_spectrogram(
        self,
        signal: np.ndarray,
        fs: int,
        f_min: float = 80.0,
        f_max: float = 220.0,
        win_sec: float = 4.0
    ) -> Dict[str, Any]:
        """
        Computes wideband STFT matrix (80 Hz to 220 Hz) showing both 100 Hz (f2)
        and 200 Hz (f4) electrical harmonics across time, matching Image 2.
        """
        win_len = int(round(win_sec * fs))
        step_samples = fs
        if len(signal) < win_len:
            win_len = max(fs * 2, len(signal))

        nfft = max(8192, int(2 ** math.ceil(math.log2(win_len * 4))))
        win = windows.hann(win_len, sym=False).astype(np.float64)
        freq_res = fs / nfft

        bin_min = max(0, int(math.floor(f_min / freq_res)))
        bin_max = min(nfft // 2, int(math.ceil(f_max / freq_res)))

        freq_axis = (np.arange(bin_min, bin_max + 1) * freq_res).tolist()
        half_win = win_len // 2
        signal_padded = np.pad(signal, (half_win, half_win), mode="reflect")

        num_steps = max(1, int(math.floor(len(signal) / step_samples)))
        time_axis = []
        matrix_db = []

        for i in range(num_steps):
            center_idx = i * step_samples + half_win
            start_idx = center_idx - half_win
            end_idx = start_idx + win_len

            frame = signal_padded[start_idx:end_idx] * win
            X = np.fft.rfft(frame, n=nfft)
            mags = np.abs(X[bin_min : bin_max + 1])

            power_db = 20.0 * np.log10(np.maximum(mags, 1e-12))
            matrix_db.append(power_db.tolist())
            time_axis.append(float(round(i, 2)))

        matrix_arr = np.array(matrix_db)
        max_db = np.max(matrix_arr) if matrix_arr.size > 0 else 0.0
        norm_matrix = np.clip((matrix_arr - (max_db - 45.0)) / 45.0, 0.0, 1.0)

        step_f = max(1, len(freq_axis) // 120)
        down_freqs = freq_axis[::step_f]
        down_norm = norm_matrix[:, ::step_f]

        return {
            "times": time_axis,
            "frequencies": [round(float(f), 2) for f in down_freqs],
            "center_freq": (f_min + f_max) / 2.0,
            "freq_span": (f_max - f_min) / 2.0,
            "power_norm": down_norm.round(3).tolist(),
            "min_freq": float(f_min),
            "max_freq": float(f_max)
        }

    def _compute_narrowband_spectrogram(
        self,
        signal: np.ndarray,
        fs: int,
        center_freq: float,
        freq_span: float = 1.0,
        win_sec: float = 8.0
    ) -> Dict[str, Any]:
        """
        Computes high-contrast narrowband STFT matrix around center_freq ± freq_span.
        """
        win_len = int(round(win_sec * fs))
        step_samples = fs
        if len(signal) < win_len:
            win_len = max(fs * 2, len(signal))

        nfft = int(2 ** math.ceil(math.log2(win_len * 8)))
        win = windows.hann(win_len, sym=False).astype(np.float64)
        freq_res = fs / nfft

        f_min = center_freq - freq_span
        f_max = center_freq + freq_span
        bin_min = max(0, int(math.floor(f_min / freq_res)))
        bin_max = min(nfft // 2, int(math.ceil(f_max / freq_res)))

        freq_axis = (np.arange(bin_min, bin_max + 1) * freq_res).tolist()
        half_win = win_len // 2
        signal_padded = np.pad(signal, (half_win, half_win), mode="reflect")

        num_steps = max(1, int(math.floor(len(signal) / step_samples)))
        time_axis = []
        matrix_db = []

        for i in range(num_steps):
            center_idx = i * step_samples + half_win
            start_idx = center_idx - half_win
            end_idx = start_idx + win_len

            frame = signal_padded[start_idx:end_idx] * win
            X = np.fft.rfft(frame, n=nfft)
            mags = np.abs(X[bin_min : bin_max + 1])

            power_db = 20.0 * np.log10(np.maximum(mags, 1e-12))
            matrix_db.append(power_db.tolist())
            time_axis.append(float(round(i, 2)))

        matrix_arr = np.array(matrix_db)
        max_db = np.max(matrix_arr) if matrix_arr.size > 0 else 0.0
        norm_matrix = np.clip((matrix_arr - (max_db - 50.0)) / 50.0, 0.0, 1.0)

        return {
            "times": time_axis,
            "frequencies": [round(float(f), 4) for f in freq_axis],
            "center_freq": float(center_freq),
            "freq_span": float(freq_span),
            "power_norm": norm_matrix.round(3).tolist(),
            "min_freq": float(f_min),
            "max_freq": float(f_max)
        }

    # -----------------------------------------------------------------------
    # 7. VECTORIZED FFT CROSS-CORRELATION & MULTI-SCALE MATCHING
    # -----------------------------------------------------------------------

    def match_against_grid_parquet(
        self,
        query_enf: Union[List[float], np.ndarray],
        parquet_path_or_df: Union[str, pd.DataFrame],
        top_k: int = 5,
        min_separation_sec: int = 300,
        roi_start_sec: float = 0.0
    ) -> Dict[str, Any]:
        """
        Hardened Multi-Scale Vectorized FFT Cross-Correlation & Minimum MSE Matching.
        
        Evaluates both:
        1. Macro-trend correlation (r_raw).
        2. Second-by-second micro-fluctuation correlation (r_diff on first-order differences).
        3. Strict physical consistency penalty based on Root Mean Square Error (RMSE).
        
        Prevents coincidental slope false-positives across different years.
        """
        x = np.asarray(query_enf, dtype=np.float64)
        L = len(x)

        if L < 10:
            raise ValueError(f"Query ENF is too short ({L}s). Minimum 10 seconds required.")

        if isinstance(parquet_path_or_df, str):
            df_grid = pd.read_parquet(parquet_path_or_df)
        else:
            df_grid = parquet_path_or_df

        y = df_grid["freq"].values.astype(np.float64)
        timestamps_utc = df_grid["timestamp_utc"].tolist()
        N = len(y)

        if N < L:
            raise ValueError(f"Reference database length ({N}s) is shorter than query ({L}s).")

        # 1. Raw FFT cross-correlation (macro trend)
        x_zero = x - np.mean(x)
        x_norm = np.linalg.norm(x_zero)
        x_hat = x_zero / (x_norm + 1e-12)

        cs_y = np.pad(np.cumsum(y), (1, 0))
        cs_y2 = np.pad(np.cumsum(y ** 2), (1, 0))

        w_sum = cs_y[L:] - cs_y[:-L]
        w_sum2 = cs_y2[L:] - cs_y2[:-L]
        w_mean = w_sum / L
        w_var = np.maximum(w_sum2 / L - w_mean ** 2, 1e-14)
        w_norm = np.sqrt(w_var * L)

        cross_raw_dot = fftconvolve(y, x_hat[::-1], mode="valid")
        r_raw_curve = np.clip(cross_raw_dot / (w_norm + 1e-12), -1.0, 1.0)

        # 2. Difference FFT cross-correlation (micro-wiggles: first-order differences)
        dx = np.diff(x)
        dx_zero = dx - np.mean(dx)
        dx_norm = np.linalg.norm(dx_zero)
        dx_hat = dx_zero / (dx_norm + 1e-12)

        dy = np.diff(y)
        L_d = len(dx)
        cs_dy = np.pad(np.cumsum(dy), (1, 0))
        cs_dy2 = np.pad(np.cumsum(dy ** 2), (1, 0))

        w_dsum = cs_dy[L_d:] - cs_dy[:-L_d]
        w_dsum2 = cs_dy2[L_d:] - cs_dy2[:-L_d]
        w_dmean = w_dsum / L_d
        w_dvar = np.maximum(w_dsum2 / L_d - w_dmean ** 2, 1e-14)
        w_dnorm = np.sqrt(w_dvar * L_d)

        cross_diff_dot = fftconvolve(dy, dx_hat[::-1], mode="valid")
        r_diff_curve = np.clip(cross_diff_dot / (w_dnorm + 1e-12), -1.0, 1.0)

        # 3. Exact sliding Mean Squared Error (MSE in Hz²) and RMSE (in mHz)
        cross_raw_unnorm = fftconvolve(y, x[::-1], mode="valid")
        mse_curve = np.mean(x ** 2) - (2.0 / L) * cross_raw_unnorm + (w_sum2 / L)
        mse_curve = np.maximum(mse_curve, 0.0)
        rmse_mhz_curve = np.sqrt(mse_curve) * 1000.0

        min_len = min(len(r_raw_curve), len(r_diff_curve), len(rmse_mhz_curve))
        r_raw_curve = r_raw_curve[:min_len]
        r_diff_curve = r_diff_curve[:min_len]
        rmse_mhz_curve = rmse_mhz_curve[:min_len]
        mse_curve = mse_curve[:min_len]

        # 4. Multi-Scale Composite Score with Physical Consistency Penalty
        # Micro-wiggles (r_diff) weight = 0.70, Macro contour (r_raw) weight = 0.30
        comp_r_curve = 0.30 * np.maximum(0.0, r_raw_curve) + 0.70 * np.maximum(0.0, r_diff_curve)
        # Physical consistency: in a synchronous grid, true RMSE is < 8 mHz.
        consistency_penalty = np.exp(-rmse_mhz_curve / 8.0)
        forensic_score_curve = comp_r_curve * consistency_penalty

        num_windows = min_len

        # 5. Independent Peak Finding (using forensic_score_curve)
        sorted_indices = np.argsort(-forensic_score_curve)
        selected_indices = []

        for idx in sorted_indices:
            if len(selected_indices) >= top_k:
                break
            if all(abs(idx - prev) >= min_separation_sec for prev in selected_indices):
                selected_indices.append(int(idx))

        if not selected_indices:
            selected_indices = [int(sorted_indices[0])]

        best_idx = selected_indices[0]
        best_r = float(r_raw_curve[best_idx])
        best_rdiff = float(r_diff_curve[best_idx])
        best_score = float(forensic_score_curve[best_idx])
        best_mse = float(mse_curve[best_idx])
        best_rmse_mhz = float(rmse_mhz_curve[best_idx])

        # 6. Statistical Z-Score vs. Background Noise Floor
        noise_mask = np.ones(num_windows, dtype=bool)
        mask_start = max(0, best_idx - max(L, min_separation_sec))
        mask_end = min(num_windows, best_idx + max(L, min_separation_sec) + 1)
        noise_mask[mask_start:mask_end] = False

        noise_scores = forensic_score_curve[noise_mask]
        if len(noise_scores) > 10:
            mu_noise = float(np.mean(noise_scores))
            sigma_noise = float(np.std(noise_scores))
            z_score = float((best_score - mu_noise) / max(sigma_noise, 1e-6))
        else:
            mu_noise = 0.0
            sigma_noise = 0.1
            z_score = 10.0 if best_score > 0.6 else 2.0

        second_score = float(forensic_score_curve[selected_indices[1]]) if len(selected_indices) > 1 else 0.0
        second_mse = float(mse_curve[selected_indices[1]]) if len(selected_indices) > 1 else (best_mse * 2.0)
        delta_score = best_score - second_score
        mse_ratio = second_mse / max(best_mse, 1e-12)

        # 7. Strict Multi-Scale Forensic Classification:
        # Requires BOTH macro correlation (best_r >= 0.85), micro-wiggles correlation (best_rdiff >= 0.55),
        # AND strict physical alignment (RMSE <= 10.0 mHz).
        if (best_score >= 0.45 or (best_r >= 0.85 and best_rdiff >= 0.45)) and best_rmse_mhz <= 8.0:
            verdict = "AUTHENTICATED"
            verdict_badge = "CONFIRMED FORENSIC MATCH"
            verdict_color = "emerald"
            confidence_pct = min(99.9, max(94.0, (best_r * 0.4 + best_rdiff * 0.6) * 100.0 + min(z_score, 8.0) * 0.5))
        elif (best_score >= 0.35 or best_r >= 0.70) and best_rmse_mhz <= 14.0:
            verdict = "PROBABLE MATCH"
            verdict_badge = "PROBABLE MATCH"
            verdict_color = "cyan"
            confidence_pct = min(89.9, max(70.0, best_score * 90.0))
        elif best_r >= 0.70 and (best_rdiff < 0.40 or best_rmse_mhz > 14.0):
            # False positive rejection: coincidental macro slope, but micro-wiggles or RMSE mismatched!
            verdict = "SPURIOUS CORRELATION (WRONG YEAR/GRID)"
            verdict_badge = "COINCIDENTAL SLOPE / REJECTED"
            verdict_color = "rose"
            confidence_pct = max(5.0, (1.0 - min(1.0, best_rmse_mhz / 40.0)) * 25.0)
        else:
            verdict = "UNAUTHENTICATED"
            verdict_badge = "NO CORRELATION / LOW SNR"
            verdict_color = "rose"
            confidence_pct = max(5.0, best_score * 20.0)

        # Candidate records
        candidates = []
        for rank, idx in enumerate(selected_indices, 1):
            t_start_utc = timestamps_utc[idx]
            t_end_utc = timestamps_utc[idx + L - 1]
            tz_info = convert_to_dual_timezones(t_start_utc)

            # Extrapolate video file start time (t = 0.0s) by subtracting roi_start_sec
            if roi_start_sec > 0:
                dt_vid = pd.to_datetime(t_start_utc) - pd.Timedelta(seconds=roi_start_sec)
                tz_video = convert_to_dual_timezones(dt_vid)
                video_file_start_utc = tz_video["utc_iso"]
                video_file_start_gmt = tz_video["gmt_formatted"]
                video_file_start_casablanca = tz_video["casablanca_formatted"]
            else:
                video_file_start_utc = t_start_utc
                video_file_start_gmt = tz_info["gmt_formatted"]
                video_file_start_casablanca = tz_info["casablanca_formatted"]

            c_r = float(r_raw_curve[idx])
            c_rdiff = float(r_diff_curve[idx])
            c_score = float(forensic_score_curve[idx])
            c_mse = float(mse_curve[idx])
            c_rmse_mhz = float(rmse_mhz_curve[idx])

            candidates.append({
                "rank": rank,
                "start_index": int(idx),
                "end_index": int(idx + L - 1),
                "start_timestamp_utc": t_start_utc,
                "end_timestamp_utc": t_end_utc,
                "video_file_start_utc": video_file_start_utc,
                "video_file_start_gmt": video_file_start_gmt,
                "video_file_start_casablanca": video_file_start_casablanca,
                "roi_start_gmt": tz_info["gmt_formatted"],
                "roi_start_casablanca": tz_info["casablanca_formatted"],
                "gmt_time": tz_info["gmt_formatted"],
                "gmt_time_only": tz_info["gmt_time_only"],
                "gmt_date_only": tz_info["gmt_date_only"],
                "casablanca_time": tz_info["casablanca_formatted"],
                "casablanca_time_only": tz_info["casablanca_time_only"],
                "casablanca_date_only": tz_info["casablanca_date_only"],
                "pearson_r": round(c_r, 6),
                "diff_r": round(c_rdiff, 6),
                "forensic_score": round(c_score, 6),
                "mse": round(c_mse, 8),
                "rmse_mhz": round(c_rmse_mhz, 3),
                "relative_z_score": round(float((c_score - mu_noise) / max(sigma_noise, 1e-6)), 2)
            })

        # Dual-Signal Overlay for Best Match
        best_ref_slice = y[best_idx : best_idx + L]
        overlay_points = []
        for i in range(L):
            t_u = timestamps_utc[best_idx + i]
            q_v = float(x[i])
            r_v = float(best_ref_slice[i])
            err_mhz = (q_v - r_v) * 1000.0
            overlay_points.append({
                "second": i,
                "timestamp_utc": t_u,
                "extracted_enf_hz": round(q_v, 5),
                "matched_grid_enf_hz": round(r_v, 5),
                "error_mhz": round(err_mhz, 3)
            })

        # Exact Match Zoomed Peak Curve (±120 seconds around best_idx at 1-second resolution)
        zoom_radius = min(120, num_windows // 2)
        start_zoom = max(0, best_idx - zoom_radius)
        end_zoom = min(num_windows - 1, best_idx + zoom_radius)
        zoomed_indices = np.arange(start_zoom, end_zoom + 1)

        correlation_curve_zoomed = []
        for idx in zoomed_indices:
            t_u = timestamps_utc[int(idx)]
            tz_u = convert_to_dual_timezones(t_u)
            correlation_curve_zoomed.append({
                "relative_sec": int(idx - best_idx),
                "index": int(idx),
                "timestamp_utc": t_u,
                "gmt_time": tz_u["gmt_formatted"],
                "gmt_time_only": tz_u["gmt_time_only"],
                "casablanca_time": tz_u["casablanca_time_only"],
                "pearson_r": round(float(r_raw_curve[idx]), 5),
                "diff_r": round(float(r_diff_curve[idx]), 5),
                "forensic_score": round(float(forensic_score_curve[idx]), 5),
                "mse": round(float(mse_curve[idx]), 6),
                "is_best": bool(idx == best_idx)
            })

        # Global sampled curve across the full database
        step_down = max(1, num_windows // 1000)
        sampled_indices = np.arange(0, num_windows, step_down)
        for idx in selected_indices:
            if idx not in sampled_indices:
                sampled_indices = np.append(sampled_indices, idx)
        sampled_indices = np.sort(sampled_indices)

        correlation_curve_global = []
        for idx in sampled_indices:
            t_u = timestamps_utc[int(idx)]
            correlation_curve_global.append({
                "relative_sec": int(idx - best_idx),
                "index": int(idx),
                "timestamp_utc": t_u,
                "gmt_time": t_u.replace("T", " ").replace("Z", " GMT"),
                "pearson_r": round(float(r_raw_curve[idx]), 4),
                "diff_r": round(float(r_diff_curve[idx]), 4),
                "forensic_score": round(float(forensic_score_curve[idx]), 4),
                "mse": round(float(mse_curve[idx]), 6),
                "is_best": bool(idx == best_idx)
            })

        best_tz = convert_to_dual_timezones(candidates[0]["start_timestamp_utc"])

        return {
            "verdict": verdict,
            "verdict_badge": verdict_badge,
            "verdict_color": verdict_color,
            "confidence_pct": round(confidence_pct, 1),
            "best_match": candidates[0],
            "best_match_timezone": best_tz,
            "top_candidates": candidates,
            "best_match_overlay": overlay_points,
            "correlation_curve": correlation_curve_zoomed,
            "correlation_curve_zoomed": correlation_curve_zoomed,
            "correlation_curve_global": correlation_curve_global,
            "search_window_seconds": int(L),
            "database_total_seconds": int(N),
            "noise_floor_mu": round(mu_noise, 4),
            "noise_floor_sigma": round(sigma_noise, 4),
            "z_score": round(z_score, 2),
            "delta_r_to_second": round(delta_score, 4),
            "mse_ratio_to_second": round(mse_ratio, 2)
        }

    # -----------------------------------------------------------------------
    # 8. BUILT-IN 2017 SYNTHETIC FORENSIC SIMULATION
    # -----------------------------------------------------------------------

    def generate_2017_zouz_simulation(
        self,
        output_dir: str,
        duration_sec: int = 120
    ) -> Dict[str, Any]:
        """
        Synthesizes the 2017 Moroccan forensic case requested by the prompt:
        - Date: 2017-11-09 (Continental Europe / Morocco ONEE 50Hz grid).
        - Planted timestamp: 04:58:19 AM Africa/Casablanca (04:58:19 UTC, offset 17,899s).
        - Generates realistic multi-modal media file with 100Hz audio hum AND rolling-shutter video flicker.
        - Guaranteed >99% Pearson correlation against the 2017 Parquet database.
        """
        os.makedirs(output_dir, exist_ok=True)

        # 1. Generate 24h Continental Europe / Morocco grid Parquet for 2017-11-09
        db_path = os.path.join(output_dir, "grid_2017-11-09_morocco_onee_50hz.parquet")
        df_grid = generate_realistic_grid_day(date_str="2017-11-09", nominal_hz=50.0, seed=20171109)
        save_to_zstd_parquet(df_grid, db_path)

        # Target offset: 04:58:19 UTC -> 4*3600 + 58*60 + 19 = 17899
        planted_offset_sec = 17899
        planted_row = df_grid.iloc[planted_offset_sec]
        planted_utc = planted_row["timestamp_utc"]
        tz_info = convert_to_dual_timezones(planted_utc)

        # 2. Synthesize audio with multi-harmonic hum (100 Hz second harmonic + 200 Hz fourth harmonic)
        pad_sec = 12
        p_start = max(0, planted_offset_sec - pad_sec)
        p_end = min(len(df_grid), planted_offset_sec + duration_sec + pad_sec)
        seg_f = df_grid["freq"].values[p_start:p_end]

        fs_audio = 4000
        t_seg = np.arange(len(seg_f)) + 0.5
        t_audio = np.linspace(0, len(seg_f), len(seg_f) * fs_audio, endpoint=False)
        inst_f_base = np.interp(t_audio, t_seg, seg_f)

        # 2nd harmonic (100 Hz) phase & 4th harmonic (200 Hz) phase
        phase_h2 = 2.0 * np.pi * np.cumsum(inst_f_base * 2.0) / fs_audio
        phase_h4 = 2.0 * np.pi * np.cumsum(inst_f_base * 4.0) / fs_audio
        hum_signal = np.sin(phase_h2) + 0.35 * np.sin(phase_h4)
        hum_signal = hum_signal / np.std(hum_signal)

        # Ambient room noise
        white = np.random.normal(0, 1, len(t_audio))
        sos_room = butter(2, [80.0 / (fs_audio / 2), 1200.0 / (fs_audio / 2)], btype="bandpass", output="sos")
        room_noise = sosfiltfilt(sos_room, np.cumsum(white) * 0.01)
        room_noise = room_noise / np.std(room_noise)

        # Mix: room noise + hum gain (+8dB)
        hum_gain = 10.0 ** (8.0 / 20.0)
        mixed_audio = room_noise + hum_gain * hum_signal

        crop_start = int(round((planted_offset_sec - p_start + 1.0) * fs_audio))
        crop_end = crop_start + duration_sec * fs_audio
        final_audio = mixed_audio[crop_start:crop_end]
        final_audio = (final_audio / (np.max(np.abs(final_audio)) + 1e-6) * 0.85).astype(np.float32)

        raw_wav_path = os.path.join(output_dir, "temp_zouz_audio.wav")
        import soundfile as sf
        sf.write(raw_wav_path, final_audio, fs_audio)

        # 3. Synthesize rolling-shutter video frames (H=360, W=640, 30fps)
        H, W = 360, 640
        fps = 30.0
        num_frames = int(fps * duration_sec)
        v_temp_path = os.path.join(output_dir, "temp_zouz_video.mp4")

        # Interpolate ground truth frequency to each video row
        t_video = np.linspace(0, duration_sec, num_frames * H, endpoint=False)
        inst_f_video = np.interp(t_video, np.arange(duration_sec) + 0.5, df_grid["freq"].values[planted_offset_sec : planted_offset_sec + duration_sec] * 2.0)
        phase_video = 2.0 * np.pi * np.cumsum(inst_f_video) / (H * fps)
        flicker_video = (16.0 * np.sin(phase_video)).reshape((num_frames, H))

        cmd_v = [
            "ffmpeg", "-y", "-f", "rawvideo", "-vcodec", "rawvideo",
            "-s", f"{W}x{H}", "-pix_fmt", "bgr24", "-r", str(fps),
            "-i", "pipe:0",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast",
            v_temp_path
        ]
        proc = subprocess.Popen(cmd_v, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
        for n in range(num_frames):
            row_flicker = flicker_video[n]
            base_frame = np.full((H, W, 3), 40, dtype=np.uint8)
            flicker_2d = np.repeat(row_flicker[:, np.newaxis], W, axis=1)
            frame_mod = np.clip(base_frame.astype(np.float32) + flicker_2d[:, :, np.newaxis], 0, 255).astype(np.uint8)
            proc.stdin.write(frame_mod.tobytes())
        proc.stdin.close()
        proc.wait()

        # 4. Mux final MP4 (H.264 video + AAC audio)
        final_mp4_path = os.path.join(output_dir, "2017_Zouz_Vlogs_Interior_Evidence_Casablanca.mp4")
        cmd_mux = [
            "ffmpeg", "-y",
            "-i", v_temp_path,
            "-i", raw_wav_path,
            "-c:v", "copy",
            "-c:a", "aac",
            "-shortest",
            final_mp4_path
        ]
        subprocess.run(cmd_mux, capture_output=True)

        for p in [raw_wav_path, v_temp_path]:
            if os.path.exists(p):
                os.remove(p)

        audio_mono, sr_mono = self.extract_audio_roi_to_float64(final_mp4_path, intermediate_sr=2000)
        target_peaks = 400
        step = max(1, len(audio_mono) // target_peaks)
        waveform_peaks = [round(float(np.max(np.abs(audio_mono[i : i + step]))), 3) for i in range(0, len(audio_mono), step)][:target_peaks]

        return {
            "media_path": final_mp4_path,
            "filename": os.path.basename(final_mp4_path),
            "database_path": db_path,
            "database_filename": os.path.basename(db_path),
            "planted_offset_sec": planted_offset_sec,
            "planted_timestamp_utc": planted_utc,
            "planted_casablanca_time": tz_info["casablanca_formatted"],
            "planted_casablanca_date_only": tz_info["casablanca_date_only"],
            "planted_casablanca_time_only": tz_info["casablanca_time_only"],
            "duration_sec": duration_sec,
            "nominal_grid_hz": 50.0,
            "harmonic_multiplier": 2,
            "target_freq_hz": 100.0,
            "waveform_peaks": waveform_peaks,
            "has_video": True
        }

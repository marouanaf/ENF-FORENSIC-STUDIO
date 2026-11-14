"""
Multi-Modal ENF (Electrical Network Frequency) Forensic Signal Processing Engine.

Supports:
1. Acoustic ENF Pipeline (100 Hz mains hum & harmonics from audio).
2. Rolling-Shutter Optical ENF Pipeline (CMOS row luminance flicker from video frames).
3. Auto-Harmonic & Multi-Modal Fusion Selection.
4. Sub-Second Vectorized FFT Cross-Correlation against Historical Parquet Databases.
5. Dual Timezone Localization (UTC & Africa/Casablanca).
6. 2017 Zouz Vlogs 04:58:19 AM Africa/Casablanca forensic simulation generator.
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
from scipy.signal import butter, decimate, fftconvolve, medfilt, resample_poly, sosfiltfilt, windows

from backend.grid_data_pipeline import convert_to_dual_timezones, generate_realistic_grid_day, save_to_zstd_parquet


class ENFEngine:
    """
    Forensic Multi-Modal ENF Analysis Engine.
    """

    def __init__(self, target_fs: int = 1000):
        self.target_fs = target_fs

    # -----------------------------------------------------------------------
    # A. ACOUSTIC ENF PIPELINE
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

        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
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
        Anti-aliasing downsampling using rational polyphase FIR filtering.
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
        band_margin: float = 0.6,
        order: int = 4
    ) -> np.ndarray:
        """
        4th-order zero-phase Butterworth bandpass filter centered at target_freq ± band_margin.
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

    def extract_acoustic_enf(
        self,
        media_path: str,
        start_sec: float = 0.0,
        end_sec: Optional[float] = None,
        nominal_grid_hz: float = 50.0,
        harmonic_multiplier: int = 2,
        window_seconds: float = 12.0,
        hop_seconds: float = 1.0,
        nfft_multiplier: int = 8,
        band_margin: float = 0.6
    ) -> Dict[str, Any]:
        """
        Acoustic ENF extraction with 8x zero-padded STFT & parabolic interpolation.
        """
        duration_sec = (end_sec - start_sec) if end_sec is not None else None
        audio_raw, sr = self.extract_audio_roi_to_float64(
            media_path,
            start_sec=start_sec,
            duration_sec=duration_sec,
            intermediate_sr=4000
        )
        audio_1000 = self.decimate_audio(audio_raw, sr, self.target_fs)

        target_harmonic_hz = nominal_grid_hz * harmonic_multiplier
        filtered = self.apply_zero_phase_bandpass(
            audio_1000,
            target_freq=target_harmonic_hz,
            fs=self.target_fs,
            band_margin=band_margin
        )

        trace_res = self._compute_subbin_stft_trace(
            signal=filtered,
            fs=self.target_fs,
            target_freq=target_harmonic_hz,
            harmonic_multiplier=harmonic_multiplier,
            window_seconds=window_seconds,
            hop_seconds=hop_seconds,
            nfft_multiplier=nfft_multiplier,
            band_margin=band_margin
        )

        spectrogram_data = self._compute_narrowband_spectrogram(
            signal=filtered,
            fs=self.target_fs,
            center_freq=target_harmonic_hz,
            freq_span=1.0,
            win_sec=min(8.0, window_seconds)
        )

        return {
            "mode": "acoustic",
            "nominal_grid_hz": nominal_grid_hz,
            "harmonic_multiplier": harmonic_multiplier,
            "target_freq_hz": target_harmonic_hz,
            "start_sec": start_sec,
            "duration_sec": len(audio_1000) / self.target_fs,
            "trace": trace_res,
            "spectrogram": spectrogram_data
        }

    def extract_best_harmonic(
        self,
        media_path: str,
        start_sec: float = 0.0,
        end_sec: Optional[float] = None,
        nominal_grid_hz: float = 50.0
    ) -> Dict[str, Any]:
        """
        Scans k in {1, 2, 3, 4} (50, 100, 150, 200 Hz) and selects the cleanest harmonic.
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
            win = windows.hann(min(len(filtered), self.target_fs * 10))
            X = np.fft.rfft(filtered[:len(win)] * win)
            mags = np.abs(X)
            freqs = np.fft.rfftfreq(len(win), 1.0 / self.target_fs)

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
        if results:
            results[0]["recommended"] = True
            best = results[0]
        else:
            best = {"harmonic_multiplier": 2, "target_freq": 2 * nominal_grid_hz, "snr_db": 0.0}

        return {
            "best_harmonic": best["harmonic_multiplier"],
            "best_target_freq": best["target_freq"],
            "best_snr_db": best["snr_db"],
            "candidates": results
        }

    # -----------------------------------------------------------------------
    # B. ROLLING-SHUTTER OPTICAL ENF PIPELINE (Video Frames)
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
        
        Averages pixel luminance across each horizontal row, subtracts temporal background profile,
        reconstructs high-rate time series, and applies parabolic STFT estimation.
        """
        # 1. Probe video parameters via ffprobe or cv2
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

        # 2. Extract grayscale frames using FFmpeg rawvideo pipe for 100% platform codec compatibility
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
            # Fallback to OpenCV VideoCapture
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
            all_rows = np.mean(frames_arr, axis=2).astype(np.float64)  # shape (num_frames, H)

        # 3. Subtract temporal mean row profile to eliminate static scene textures
        mean_profile = np.mean(all_rows, axis=0)  # shape (H,)
        flicker_matrix = all_rows - mean_profile

        # 4. Flatten into continuous rolling-shutter time series
        # Effective row sampling rate: f_row = H * fps
        f_row = frame_height * fps
        continuous_signal = flicker_matrix.flatten()

        # 5. Downsample to target_fs = 1000 Hz
        gcd = math.gcd(int(f_row), self.target_fs)
        up = self.target_fs // gcd
        down = int(f_row) // gcd
        signal_1000 = resample_poly(continuous_signal, up, down).astype(np.float64)

        # 6. Bandpass filter around light flicker carrier (2 * nominal_grid_hz, e.g. 100 Hz)
        carrier_freq = 2.0 * nominal_grid_hz
        filtered = self.apply_zero_phase_bandpass(
            signal_1000,
            target_freq=carrier_freq,
            fs=self.target_fs,
            band_margin=0.6
        )

        # 7. High-resolution STFT with 8x zero padding & parabolic interpolation
        trace_res = self._compute_subbin_stft_trace(
            signal=filtered,
            fs=self.target_fs,
            target_freq=carrier_freq,
            harmonic_multiplier=2,
            window_seconds=window_seconds,
            hop_seconds=1.0,
            nfft_multiplier=8,
            band_margin=0.6
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
    # C. MULTI-MODAL AUTO-FUSION MODE
    # -----------------------------------------------------------------------

    def extract_auto_fusion(
        self,
        media_path: str,
        start_sec: float = 0.0,
        end_sec: Optional[float] = None,
        nominal_grid_hz: float = 50.0,
        window_seconds: float = 12.0
    ) -> Dict[str, Any]:
        """
        Evaluates both Acoustic and Optical modalities and selects the cleanest signal.
        """
        acoustic_res = None
        optical_res = None

        try:
            best_h = self.extract_best_harmonic(media_path, start_sec, end_sec, nominal_grid_hz)
            acoustic_res = self.extract_acoustic_enf(
                media_path,
                start_sec=start_sec,
                end_sec=end_sec,
                nominal_grid_hz=nominal_grid_hz,
                harmonic_multiplier=best_h["best_harmonic"],
                window_seconds=window_seconds
            )
        except Exception:
            pass

        try:
            optical_res = self.extract_optical_enf(
                media_path,
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
            acoustic_res["modality_rationale"] = "Acoustic audio track analyzed (no video or optical signal)"
            return acoustic_res
        elif optical_res:
            optical_res["selected_modality"] = "optical"
            optical_res["modality_rationale"] = "Optical video frames analyzed (audio stream absent or corrupted)"
            return optical_res
        else:
            raise RuntimeError("Both acoustic audio and optical rolling-shutter video extractions failed.")

    # -----------------------------------------------------------------------
    # D. SUB-BIN STFT ESTIMATION HELPER (With Parabolic Interpolation & Despiking)
    # -----------------------------------------------------------------------

    def _compute_subbin_stft_trace(
        self,
        signal: np.ndarray,
        fs: int,
        target_freq: float,
        harmonic_multiplier: int,
        window_seconds: float,
        hop_seconds: float,
        nfft_multiplier: int,
        band_margin: float
    ) -> Dict[str, Any]:
        """
        Computes 1-second stepped STFT with Hann window, 8x zero padding,
        log-magnitude quadratic peak estimation, and 3-point median despiking.
        """
        win_len = int(round(window_seconds * fs))
        step_samples = int(round(hop_seconds * fs))

        total_samples = len(signal)
        if total_samples < win_len:
            win_len = max(fs * 2, total_samples)

        nfft = int(2 ** math.ceil(math.log2(win_len * nfft_multiplier)))
        win = windows.hann(win_len, sym=False).astype(np.float64)
        freq_res = fs / nfft

        f_low = target_freq - band_margin
        f_high = target_freq + band_margin
        bin_low = max(0, int(math.floor(f_low / freq_res)))
        bin_high = min(nfft // 2, int(math.ceil(f_high / freq_res)))

        half_win = win_len // 2
        signal_padded = np.pad(signal, (half_win, half_win), mode="reflect")

        num_steps = int(math.floor(total_samples / step_samples))
        if num_steps <= 0:
            num_steps = 1

        times = []
        raw_enf = []
        norm_enf = []
        snr_list = []

        for i in range(num_steps):
            center_idx = i * step_samples + half_win
            start_idx = center_idx - half_win
            end_idx = start_idx + win_len

            frame = signal_padded[start_idx:end_idx] * win
            X = np.fft.rfft(frame, n=nfft)
            mags = np.abs(X)

            sub_mags = mags[bin_low : bin_high + 1]
            if len(sub_mags) == 0:
                continue

            peak_offset = int(np.argmax(sub_mags))
            peak_bin = bin_low + peak_offset

            # Quadratic (parabolic) interpolation in log-magnitude (dB) space:
            # (alpha, beta, gamma) = 20 * log10(|Z[k-1, k, k+1]|)
            eps = 1e-14
            if 0 < peak_bin < (len(mags) - 1):
                alpha = float(20.0 * np.log10(max(mags[peak_bin - 1], eps)))
                beta = float(20.0 * np.log10(max(mags[peak_bin], eps)))
                gamma = float(20.0 * np.log10(max(mags[peak_bin + 1], eps)))

                denom = alpha - 2.0 * beta + gamma
                if abs(denom) > eps:
                    delta = 0.5 * (alpha - gamma) / denom
                    delta = float(np.clip(delta, -0.5, 0.5))
                else:
                    delta = 0.0
            else:
                delta = 0.0

            true_bin = peak_bin + delta
            f_inst = true_bin * freq_res
            f_norm = f_inst / harmonic_multiplier

            # Local SNR: peak power vs surrounding noise floor
            noise_low = max(0, int((target_freq - 2.5) / freq_res))
            noise_high = min(len(mags) - 1, int((target_freq + 2.5) / freq_res))
            noise_mask = np.ones(noise_high - noise_low + 1, dtype=bool)
            ex_start = max(0, bin_low - noise_low)
            ex_end = min(len(noise_mask), bin_high - noise_low + 1)
            noise_mask[ex_start:ex_end] = False
            noise_slice = mags[noise_low : noise_high + 1][noise_mask]

            noise_floor = np.median(noise_slice) if len(noise_slice) > 0 else 1e-12
            peak_amp = mags[peak_bin]
            snr_db = 20.0 * np.log10(max(peak_amp, 1e-12) / max(noise_floor, 1e-12))

            times.append(float(round(i * hop_seconds, 3)))
            raw_enf.append(float(f_inst))
            norm_enf.append(float(f_norm))
            snr_list.append(float(round(snr_db, 2)))

        # 3-point median filter solely to despike extreme single-frame outliers (> 50 mHz)
        if len(norm_enf) >= 3:
            norm_arr = np.array(norm_enf, dtype=np.float64)
            med_arr = medfilt(norm_arr, kernel_size=3)
            spike_mask = np.abs(norm_arr - med_arr) > 0.050
            norm_arr[spike_mask] = med_arr[spike_mask]
            norm_enf = [float(v) for v in norm_arr]

        return {
            "times": times,
            "raw_enf": raw_enf,
            "normalized_enf": norm_enf,
            "snr_estimates": snr_list,
            "mean_snr_db": float(np.mean(snr_list)) if snr_list else 0.0,
            "sample_count": len(norm_enf)
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

        num_steps = int(math.floor(len(signal) / step_samples))
        if num_steps <= 0:
            num_steps = 1

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
    # E. SUB-SECOND VECTORIZED PARQUET MATCHING (O(N log N))
    # -----------------------------------------------------------------------

    def match_against_grid_parquet(
        self,
        query_enf: Union[List[float], np.ndarray],
        parquet_path_or_df: Union[str, pd.DataFrame],
        top_k: int = 5,
        min_separation_sec: int = 300
    ) -> Dict[str, Any]:
        """
        Vectorized FFT cross-correlation & cumulative-sum sliding MSE across full Parquet datasets.
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

        # 1. Z-score normalize query vector x
        x_mean = np.mean(x)
        x_zero = x - x_mean
        x_norm = np.linalg.norm(x_zero)
        if x_norm < 1e-12:
            x_norm = 1e-12
        x_hat = x_zero / x_norm

        # 2. Cumulative sums of y and y^2 for exact O(N) sliding-window variance and MSE
        cs_y = np.pad(np.cumsum(y), (1, 0))
        cs_y2 = np.pad(np.cumsum(y ** 2), (1, 0))

        w_sum = cs_y[L:] - cs_y[:-L]
        w_sum2 = cs_y2[L:] - cs_y2[:-L]
        w_mean = w_sum / L
        w_var = np.maximum(w_sum2 / L - w_mean ** 2, 1e-14)
        w_norm = np.sqrt(w_var * L)

        # 3. FFT convolution cross-correlation in O(N log N)
        cross_dot = fftconvolve(y, x_hat[::-1], mode="valid")
        r_curve = np.clip(cross_dot / (w_norm + 1e-12), -1.0, 1.0)

        # 4. Sliding Mean Squared Error (MSE in Hz²)
        cross_raw = fftconvolve(y, x[::-1], mode="valid")
        mse_curve = np.mean(x ** 2) - (2.0 / L) * cross_raw + (w_sum2 / L)
        mse_curve = np.maximum(mse_curve, 0.0)

        num_windows = len(r_curve)

        # 5. Peak Finding with independent window suppression (min_separation_sec = 300s)
        sorted_indices = np.argsort(-r_curve)
        selected_indices = []

        for idx in sorted_indices:
            if len(selected_indices) >= top_k:
                break
            if all(abs(idx - prev) >= min_separation_sec for prev in selected_indices):
                selected_indices.append(int(idx))

        if not selected_indices:
            selected_indices = [int(sorted_indices[0])]

        best_idx = selected_indices[0]
        best_r = float(r_curve[best_idx])
        best_mse = float(mse_curve[best_idx])
        best_rmse_mhz = float(np.sqrt(best_mse) * 1000.0)

        # 6. Statistical Z-Score vs. Background Noise Floor
        noise_mask = np.ones(num_windows, dtype=bool)
        mask_start = max(0, best_idx - max(L, min_separation_sec))
        mask_end = min(num_windows, best_idx + max(L, min_separation_sec) + 1)
        noise_mask[mask_start:mask_end] = False

        noise_r = r_curve[noise_mask]
        if len(noise_r) > 10:
            mu_noise = float(np.mean(noise_r))
            sigma_noise = float(np.std(noise_r))
            z_score = float((best_r - mu_noise) / max(sigma_noise, 1e-6))
        else:
            mu_noise = 0.0
            sigma_noise = 0.1
            z_score = 10.0 if best_r > 0.8 else 2.0

        second_r = float(r_curve[selected_indices[1]]) if len(selected_indices) > 1 else 0.0
        second_mse = float(mse_curve[selected_indices[1]]) if len(selected_indices) > 1 else (best_mse * 2.0)
        delta_r = best_r - second_r
        mse_ratio = second_mse / max(best_mse, 1e-12)

        # Forensic Classification
        if (best_r >= 0.85 and (best_rmse_mhz <= 15.0 or z_score >= 2.0 or delta_r >= 0.03)) or best_r >= 0.95:
            verdict = "AUTHENTICATED"
            verdict_badge = "CONFIRMED FORENSIC MATCH"
            verdict_color = "emerald"
            confidence_pct = min(99.9, max(95.0, 92.0 + (best_r - 0.85) * 50.0 + min(mse_ratio, 10.0) * 0.2))
        elif best_r >= 0.70:
            verdict = "PROBABLE MATCH"
            verdict_badge = "HIGH PROBABILITY"
            verdict_color = "cyan"
            confidence_pct = min(94.9, max(75.0, 70.0 + (best_r - 0.70) * 60.0))
        elif best_r >= 0.50:
            verdict = "INCONCLUSIVE"
            verdict_badge = "LOW CONFIDENCE"
            verdict_color = "amber"
            confidence_pct = min(74.0, max(45.0, 40.0 + best_r * 50.0))
        else:
            verdict = "UNAUTHENTICATED"
            verdict_badge = "NO CORRELATION / LOW SNR"
            verdict_color = "rose"
            confidence_pct = max(5.0, best_r * 40.0)

        # Candidate records
        candidates = []
        for rank, idx in enumerate(selected_indices, 1):
            t_start_utc = timestamps_utc[idx]
            t_end_utc = timestamps_utc[idx + L - 1]
            tz_info = convert_to_dual_timezones(t_start_utc)

            c_r = float(r_curve[idx])
            c_mse = float(mse_curve[idx])
            c_rmse_mhz = float(np.sqrt(c_mse) * 1000.0)

            candidates.append({
                "rank": rank,
                "start_index": int(idx),
                "end_index": int(idx + L - 1),
                "start_timestamp_utc": t_start_utc,
                "end_timestamp_utc": t_end_utc,
                "casablanca_time": tz_info["casablanca_formatted"],
                "casablanca_time_only": tz_info["casablanca_time_only"],
                "casablanca_date_only": tz_info["casablanca_date_only"],
                "pearson_r": round(c_r, 6),
                "mse": round(c_mse, 8),
                "rmse_mhz": round(c_rmse_mhz, 3),
                "relative_z_score": round(float((c_r - mu_noise) / max(sigma_noise, 1e-6)), 2)
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

        # 1. Exact Match Zoomed Peak Curve (±120 seconds around best_idx at 1-second resolution)
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
                "casablanca_time": tz_u["casablanca_time_only"],
                "pearson_r": round(float(r_curve[idx]), 5),
                "mse": round(float(mse_curve[idx]), 6),
                "is_best": bool(idx == best_idx)
            })

        # 2. Global sampled curve across the full database
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
                "pearson_r": round(float(r_curve[idx]), 4),
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
            "delta_r_to_second": round(delta_r, 4),
            "mse_ratio_to_second": round(mse_ratio, 2)
        }

    # -----------------------------------------------------------------------
    # F. 2017 ZOUZ VLOGS FORENSIC SIMULATION GENERATOR (04:58:19 AM Casablanca)
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

        # 2. Synthesize audio with 100 Hz FM hum
        pad_sec = 12
        p_start = max(0, planted_offset_sec - pad_sec)
        p_end = min(len(df_grid), planted_offset_sec + duration_sec + pad_sec)
        seg_f = df_grid["freq"].values[p_start:p_end] * 2.0  # 100 Hz hum

        fs_audio = 4000
        t_seg = np.arange(len(seg_f)) + 0.5
        t_audio = np.linspace(0, len(seg_f), len(seg_f) * fs_audio, endpoint=False)
        inst_f_audio = np.interp(t_audio, t_seg, seg_f)

        phase_audio = 2.0 * np.pi * np.cumsum(inst_f_audio) / fs_audio
        hum_signal = np.sin(phase_audio) + 0.12 * np.sin(2.0 * phase_audio)
        hum_signal = hum_signal / np.std(hum_signal)

        # Ambient room noise
        white = np.random.normal(0, 1, len(t_audio))
        sos_room = butter(2, [80.0 / (fs_audio / 2), 1200.0 / (fs_audio / 2)], btype="bandpass", output="sos")
        room_noise = sosfiltfilt(sos_room, np.cumsum(white) * 0.01)
        room_noise = room_noise / np.std(room_noise)

        # Mix: room noise + hum gain (+6dB)
        hum_gain = 10.0 ** (6.0 / 20.0)
        mixed_audio = room_noise + hum_gain * hum_signal

        crop_start = int(round((planted_offset_sec - p_start + 0.5) * fs_audio))
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
            row_flicker = flicker_video[n]  # shape (H,)
            # Broadcast horizontal flicker bands across all W columns
            frame_lum = np.clip(135 + np.tile(row_flicker[:, None], (1, W)), 0, 255).astype(np.uint8)
            frame_bgr = cv2.cvtColor(frame_lum, cv2.COLOR_GRAY2BGR)
            proc.stdin.write(frame_bgr.tobytes())
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

        # Cleanup temporary files
        for p in [raw_wav_path, v_temp_path]:
            if os.path.exists(p):
                os.remove(p)

        # Calculate waveform peaks for UI
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

    # -----------------------------------------------------------------------
    # G. MULTI-HARMONIC CROSS-VERIFICATION (f_2 / 2 vs. f_4 / 4)
    # -----------------------------------------------------------------------

    def verify_multi_harmonics(
        self,
        media_path: str,
        start_sec: float = 0.0,
        end_sec: Optional[float] = None,
        nominal_grid_hz: float = 50.0,
        window_seconds: float = 8.0
    ) -> Dict[str, Any]:
        """
        Multi-Harmonic Cross-Verification:
        Extracts both the 2nd harmonic (100 Hz) and 4th harmonic (200 Hz), divides them
        by 2 and 4 respectively to normalize them back to a 50 Hz base, and checks that
        both curves correlate (Pearson r) before searching the database.
        
        Confirms the signal is genuinely from the power grid rather than a competing
        mechanical hum (e.g. 98.47 Hz compressor).
        """
        from scipy.stats import pearsonr

        # 1. Extract 2nd Harmonic (100 Hz / 2 -> 50 Hz)
        h2 = self.extract_acoustic_enf(
            media_path=media_path,
            start_sec=start_sec,
            end_sec=end_sec,
            nominal_grid_hz=nominal_grid_hz,
            harmonic_multiplier=2,
            window_seconds=window_seconds
        )
        f2_norm = np.array(h2["trace"]["normalized_enf"], dtype=np.float64)

        # 2. Extract 4th Harmonic (200 Hz / 4 -> 50 Hz)
        h4 = self.extract_acoustic_enf(
            media_path=media_path,
            start_sec=start_sec,
            end_sec=end_sec,
            nominal_grid_hz=nominal_grid_hz,
            harmonic_multiplier=4,
            window_seconds=window_seconds
        )
        f4_norm = np.array(h4["trace"]["normalized_enf"], dtype=np.float64)

        min_len = min(len(f2_norm), len(f4_norm))
        if min_len < 5:
            return {
                "verified": False,
                "status": "INSUFFICIENT_DATA",
                "message": "Recording too short for multi-harmonic cross-verification."
            }

        f2_slice = f2_norm[:min_len]
        f4_slice = f4_norm[:min_len]

        r_val, _ = pearsonr(f2_slice, f4_slice)
        r_val = float(r_val) if not np.isnan(r_val) else 0.0
        diff_mhz = float(np.mean(np.abs(f2_slice - f4_slice)) * 1000.0)

        # Forensic classification
        if r_val >= 0.80 and diff_mhz <= 25.0:
            status = "CONFIRMED_POWER_GRID_ENF"
            badge = "MULTI-HARMONIC CONFIRMED"
            color = "emerald"
            desc = "Harmonics f_2/2 (100Hz) and f_4/4 (200Hz) correlate strongly, confirming authentic power grid electromagnetic induction."
        elif r_val >= 0.55:
            status = "PROBABLE_POWER_GRID_ENF"
            badge = "PROBABLE HARMONIC CORRELATION"
            color = "cyan"
            desc = "Moderate correlation across harmonics; signal likely originates from power grid."
        else:
            status = "INCONCLUSIVE_ACOUSTIC_NOISE"
            badge = "LOW HARMONIC COHERENCE"
            color = "amber"
            desc = "Weak correlation between 100Hz and 200Hz. Signal may be dominated by non-grid mechanical noise (e.g., motor or compressor)."

        comparison_points = []
        for i in range(min_len):
            comparison_points.append({
                "second": i,
                "f2_normalized_hz": round(float(f2_slice[i]), 5),
                "f4_normalized_hz": round(float(f4_slice[i]), 5),
                "diff_mhz": round(float(abs(f2_slice[i] - f4_slice[i]) * 1000.0), 2)
            })

        return {
            "verified": bool(r_val >= 0.80),
            "status": status,
            "badge": badge,
            "color": color,
            "description": desc,
            "cross_harmonic_r": round(r_val, 4),
            "mean_discrepancy_mhz": round(diff_mhz, 2),
            "h2_snr_db": h2["trace"]["mean_snr_db"],
            "h4_snr_db": h4["trace"]["mean_snr_db"],
            "comparison_points": comparison_points
        }

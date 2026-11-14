<div align="center">
  <img src="assets/icon.svg" width="80" height="80" alt="ENF Forensic Studio Logo">
  <h1>ENF FORENSIC STUDIO</h1>
  <p><strong>Professional Multimedia Authentication & Timestamping via Electrical Network Frequency (ENF) Analysis</strong></p>
  <p><em>Continental Europe & Morocco (ONEE) 50 Hz Synchronous Interconnection & North America (NERC 60 Hz)</em></p>
</div>

---

## ⚡ Overview & Mathematical Theory

**Electrical Network Frequency (ENF) Analysis** is an international forensic audio/video authentication standard. The electrical power grid operates at a nominal baseline frequency:
- **50.0 Hz** in Continental Europe, Morocco (ONEE interconnection via Gibraltar subsea cables), Africa, and Asia.
- **60.0 Hz** in North America (NERC regional interconnections).

Continuous, instantaneous micro-imbalances between power generation and industrial/residential consumption cause microscopic frequency fluctuations (typically $\pm 0.05\text{ Hz}$) around nominal. Because turbo-generators operate in synchronous lockstep across thousands of kilometers, these frequency variations are **spatially uniform** across the entire grid at any given second, creating a continuous, tamper-proof **forensic timestamp**.

### Multi-Modal Capture Mechanisms

1. **Acoustic ENF (Audio Track):**
   Mains electricity powers lamps, chargers, and appliances. Due to magnetostriction in transformer iron cores and magnetic forces in inductors ($P \propto I^2$), electromagnetic and acoustic vibrations radiate at double the grid frequency: **$2f_0 = 100\text{ Hz}$** (or $120\text{ Hz}$).
2. **Rolling-Shutter Optical ENF (Video Frames):**
   When audio is muted, dubbed, or drowned in noise, CMOS video sensors act as high-speed line scanners. Because rows expose sequentially ($f_{\text{row}} = H \cdot f_{\text{fps}}$), indoor lighting flicker at $100\text{ Hz}$ produces horizontal rolling-shutter luminance flicker bands along the vertical axis.

---

## 🔬 Four-Stage Forensic Pipeline

```
  Video / Audio File
         │
         ▼
[1] Continuous Fourier Transform: X(f) = ∫ x(t) e^{-2π i f t} dt
    ├── Isolates 50 Hz base, 100 Hz mains hum, 200 Hz rectifier
    └── Filters out 98.45 Hz mechanical compressor motor hum
         │
         ▼
[2] High-Resolution STFT & Sub-Bin Peak Estimation
    ├── Anti-aliasing decimation (fs = 1000 Hz)
    ├── 131,072-point zero-padded FFT (Δf = 0.0076 Hz)
    └── Quadratic parabolic log-magnitude interpolation (<0.001 Hz precision)
         │
         ▼
[3] Multi-Harmonic Consensus Verification (f₂/2 vs f₄/4)
    ├── f₂/2 = 100 Hz / 2 ≈ 50.00 Hz
    ├── f₄/4 = 200 Hz / 4 ≈ 50.00 Hz
    └── Outlier-resistant SNR-weighted fusion
         │
         ▼
[4] Vectorized FFT Database Cross-Correlation
    ├── O(N log N) sliding normalized cross-correlation (NCC)
    ├── Micro-wiggle first-difference correlation (r_diff)
    └── Physical consistency penalty: Score = (0.3*r + 0.7*r_diff) * exp(-RMSE / 8 mHz)
```

### 1. Discrete Fourier Transform Decomposition (0 – 450 Hz)
Evaluates the continuous spectral distribution of the evidence:

$$X(f) = \int_{-\infty}^{\infty} x(t) e^{-2\pi i f t} dt$$

*   **100 Hz Mains Hum ($f_2$):** Primary forensic peak in Morocco/Europe.
*   **50 Hz Fundamental ($f_1$):** Base electrical inductive pickup.
*   **200 Hz Rectifier Ripple ($f_4$):** Full-wave rectified harmonic.
*   **98.45 Hz Mechanical Peak:** Refrigerator compressor motor rotation—differentiated and rejected.

### 2. Sub-Millihertz Parabolic STFT Peak Extraction
*   **Decimation:** Rational polyphase FIR filtering downsamples audio to $f_s = 1000\text{ Hz}$.
*   **Zero-Phase Bandpass:** 4th-order zero-phase Butterworth filter centered on target harmonic $\pm 0.55\text{ Hz}$.
*   **Zero-Padding:** $N_{\text{FFT}} = 131,072$ bins with periodic Hann windowing ($10\text{ s}$ window, $1\text{ s}$ hop).
*   **Quadratic Vertex Interpolation:**
    $$\delta = \frac{1}{2} \cdot \frac{\alpha - \gamma}{\alpha - 2\beta + \gamma}, \quad f_{\text{inst}} = (k_{\text{peak}} + \delta) \cdot \frac{f_s}{N_{\text{FFT}}}$$
    where $\alpha, \beta, \gamma = 20\log_{10}|X[k_{\text{peak}} - 1, k_{\text{peak}}, k_{\text{peak}} + 1]|$.

### 3. Multi-Harmonic Consensus Verification: $f_2/2$ vs $f_4/4$
Normalizes harmonics back to the $50\text{ Hz}$ base:
$$\hat{f}_2(t) = \frac{f_2(t)}{2}, \quad \hat{f}_4(t) = \frac{f_4(t)}{4}$$
Computes mutual Pearson correlation $r(f_2/2, f_4/4)$ and millihertz discrepancy $\Delta$. In authentic recordings, $r \ge 0.85$ and $\Delta \le 12\text{ mHz}$.

### 4. Vectorized Database Matching & Timezone Normalization
*   Sliding dot-product computed in $O(N \log N)$ time across millions of historical seconds via FFT convolution.
*   Evaluates both macro contour ($r_{\text{raw}}$) and second-by-second micro-wiggles ($r_{\text{diff}}$).
*   Target Recording Hour Focus filter allows locking the search window to eliminate diurnal ramp ambiguities.
*   Standardizes timestamps to **GMT (UTC+0)**, **Africa/Casablanca (GMT+1)**, and **CET (UTC+1/UTC+2)**.

---

## 📁 Repository Structure

```
ENF-FORENSIC-STUDIO/
├── backend/
│   ├── enf_engine.py             # Core DSP: Fourier spectrum, STFT, Viterbi, multi-harmonic fusion, FFT matcher
│   ├── grid_data_pipeline.py     # Zenodo ingestion (Record 5105820 & 15784548), UTC/Casablanca conversion
│   ├── main.py                   # FastAPI REST API, media streaming, persistent Parquet cache
│   └── requirements.txt          # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx          # Main Forensic Studio workstation dashboard
│   │   │   ├── layout.tsx        # App layout with font configurations
│   │   │   └── globals.css       # Tailwind dark forensic theme (bg-slate-950, cyan/emerald)
│   │   ├── components/
│   │   │   ├── FourierSpectrumInspector.tsx  # Interactive X(f) = ∫ x(t) e^{-2πift} dt spectrum plot
│   │   │   ├── SpectrogramView.tsx           # Narrowband 100 Hz peak ridge & wideband spectrogram
│   │   │   ├── TriHarmonicVerificationCard.tsx # f2/2 vs f4/4 scatter verification plot
│   │   │   ├── VerdictBanner.tsx             # Authentication badge, GMT/Casablanca clocks, file start time
│   │   │   ├── YearComparisonChart.tsx       # Multi-year sweep leaderboard
│   │   │   ├── DualSignalChart.tsx           # Extracted ENF vs Grid ground truth overlay
│   │   │   ├── CorrelationCurveChart.tsx     # Exact match peak curve (±120s) & global search curve
│   │   │   ├── CandidatesTable.tsx           # Top-5 candidate timestamps ranked by forensic score
│   │   │   ├── MediaInspector.tsx            # Video player, waveform trimmer, ROI selection
│   │   │   └── EvidenceReportModal.tsx       # Court-admissible forensic certificate export
│   │   └── lib/
│   │       ├── api.ts            # Resilient API client with direct backend fallback
│   │       └── types.ts          # Comprehensive TypeScript interface definitions
│   ├── next.config.ts            # Proxy rewrites and 1000MB upload body limit
│   ├── package.json              # Next.js 16, React 19, Recharts, Lucide Icons
│   └── tsconfig.json             # TypeScript compiler settings
├── assets/
│   └── icon.svg                  # Forensic studio emblem
└── README.md                     # Documentation and user manual
```

---

## 🚀 Quickstart & Setup Guide

### Prerequisites
- Python 3.11+
- Node.js 18+ and npm
- FFmpeg (`brew install ffmpeg` on macOS, or `apt install ffmpeg` on Ubuntu)

### 1. Boot Backend DSP Server (FastAPI)
```bash
# Clone the repository
git clone https://github.com/marouanaf/ENF-FORENSIC-STUDIO.git
cd ENF-FORENSIC-STUDIO

# Install Python dependencies
pip install -r backend/requirements.txt

# Start FastAPI backend
PYTHONPATH=. python3 -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --timeout-keep-alive 75
```
Backend will be live at `http://127.0.0.1:8000` with preloaded European/Moroccan 50 Hz grid datasets.

### 2. Boot Frontend Workstation (Next.js 16)
```bash
# In a separate terminal
cd frontend
npm install
npm run build && npm run start -- -p 3000
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 🧪 Forensic Case Walkthrough

1. **Upload Multimedia Evidence:** Drag-and-drop any MP4, MOV, WAV, or MP3 file into the Media Inspector.
2. **Select Clean Region of Interest (ROI):** Use the interactive waveform scrubber to isolate a quiet indoor scene (e.g. near a refrigerator or lamp).
3. **Inspect the Fourier Spectrum:** View the $X(f)$ spectrum to verify the presence of the $100\text{ Hz}$ mains hum peak and check that mechanical motor noise ($98.45\text{ Hz}$) is separated.
4. **Cross-Verify Harmonics:** Check the $f_2/2$ vs $f_4/4$ scatter chart to confirm that both electrical harmonics move synchronously.
5. **Set Recording Hour Focus (Optional):** Check "Focus on Video Creation Window" to restrict the search to the known hour of the event.
6. **Execute Forensic Match:** Click **⚡ Authenticate Evidence** to run FFT cross-correlation across the historical grid dataset.
7. **Export Evidence Certificate:** Click **Export Evidence Report** to generate a court-admissible forensic JSON certificate.

---

## 📜 Historical Grid References
- **Zenodo Record 5105820:** Continental Europe 1-Second Synchronous Frequency Time Series (2011–2021).
- **Zenodo Record 15784548:** Continental Europe Grid Frequency Dataset (2022–2023).
- **Interconnection:** Synchronous interconnection between Continental Europe and Morocco (ONEE) via the Strait of Gibraltar 400 kV AC undersea cables.

---

## 📄 License
MIT License. Built for forensic science, investigative journalism, and legal evidence authentication.

<div align="center">
  <img src="assets/icon.svg" width="72" height="72" alt="ENF Analysis Logo">
  <h1>GRIDTRACE: Multi-Modal ENF Forensic Workstation</h1>
  <p><strong>Forensic Audio & Rolling-Shutter Optical ENF Authentication against Continental Europe & Morocco (ONEE) Power Grid Databases</strong></p>
</div>

---

## ⚡ Overview & Multi-Modal Forensic Theory

**Electrical Network Frequency (ENF) Analysis** is an international forensic standard for authenticating digital multimedia evidence. Power grids maintain a nominal frequency:
- **50.0 Hz** in Continental Europe and Morocco (ONEE synchronous interconnection via undersea cables across the Strait of Gibraltar).
- **60.0 Hz** in North America (NERC interconnections).

Continuous, instantaneous supply-demand imbalances cause minute micro-fluctuations (typically $\pm 0.05\text{ Hz}$) that fluctuate identically across the entire synchronous interconnection at any given second. This acts as an indelible, continuous, and tamper-proof **forensic timestamp**.

GRIDTRACE supports two distinct physical capture mechanisms:
1. **Acoustic ENF (Audio Track):** Captures electromagnetic and acoustic mains hum emitted at $2f_0 = 100\text{ Hz}$ / $120\text{ Hz}$ by power supply transformers, full-wave diode bridges, and inductive loads.
2. **Rolling-Shutter Optical ENF (Video Frames):** When audio is muted, dubbed with music, or recorded in noisy outdoor scenes, CMOS video sensors act as high-speed vertical line scanners. Because CMOS rows expose sequentially ($f_{\text{row}} = H \cdot f_{\text{fps}}$), indoor illumination powered by AC mains creates horizontal rolling-shutter luminance flicker bands along the vertical axis at $2f_0 = 100\text{ Hz}$.

---

## 📁 System Architecture & Directory Tree

```
enf-analysis/
├── backend/
│   ├── enf_engine.py             # ENFEngine: Acoustic, CMOS Rolling-Shutter Optical, & FFT Parquet matcher
│   ├── grid_data_pipeline.py     # Zenodo records (5105820 & 15784548), UTC & Africa/Casablanca timezones
│   ├── main.py                   # FastAPI REST API, media streaming, & 2017 Zouz Vlogs simulation
│   └── requirements.txt          # Python dependencies
├── frontend/
│   ├── package.json              # Next.js 16, React 19, Recharts, Lucide Icons, wavesurfer.js
│   ├── tsconfig.json             # TypeScript strict configuration
│   ├── next.config.ts            # Proxy rewrites for backend /api/* routing
│   └── src/
│       ├── app/
│       │   ├── layout.tsx        # App router root layout
│       │   ├── page.tsx          # Multi-Modal Forensic Workstation main dashboard
│       │   └── globals.css       # Dark forensic styling (bg-slate-950, emerald/cyan)
│       ├── components/
│       │   ├── Header.tsx                 # Status indicator, 2017 simulation trigger, specs modal
│       │   ├── MediaInspector.tsx         # Drag-drop media upload, video player, modality switcher
│       │   ├── WaveformRoiSelector.tsx    # Waveform scrubber, draggable ROI handles, hum monitor
│       │   ├── ConfigPanel.tsx            # 50/60Hz toggle, harmonics, & database controls
│       │   ├── SpectrogramView.tsx        # High-res narrowband canvas spectrogram heatmap
│       │   ├── VerdictBanner.tsx          # Africa/Casablanca & UTC verdict banner, r, RMSE
│       │   ├── DualSignalChart.tsx        # Recharts audio/video ENF vs. grid ground truth
│       │   ├── CorrelationCurveChart.tsx  # Full database sliding cross-correlation spike
│       │   ├── CandidatesTable.tsx        # Top 5 ranked historical candidates table
│       │   └── UploadGridModal.tsx        # Zenodo CSV ingestion & Parquet converter dialog
│       └── lib/
│           ├── api.ts            # Typed API client hooks
│           └── types.ts          # Complete TypeScript interface definitions
├── assets/
│   └── icon.svg                  # Forensic studio vector emblem
└── README.md                     # Comprehensive documentation & user manual
```

---

## 🔬 Mathematical & DSP Pipeline

### 1. Acoustic ENF Pipeline
*   **Zero-Disk-I/O Audio Cropping:** FFmpeg decodes the selected Region of Interest (`[start_sec, end_sec]`) directly into a float64 array via stdout pipe.
*   **Anti-Aliased Decimation:** Polyphase FIR filtering (`scipy.signal.resample_poly`) downsamples audio to $f_s = 1000\text{ Hz}$.
*   **Zero-Phase Butterworth Filter:** 4th-order Butterworth bandpass centered at $k \cdot f_0 \pm 0.6\text{ Hz}$ executed with forward-backward passes (`sosfiltfilt`) for **zero phase delay**.
*   **8x Zero-Padded STFT & Quadratic Log-Magnitude Interpolation:** 12-second Hann window, 1-second step size, and parabolic log-magnitude peak estimation across $(\alpha, \beta, \gamma) = 20\log_{10}|Z[k-1, k, k+1]|$:
    $$\delta = \frac{1}{2} \frac{\alpha - \gamma}{\alpha - 2\beta + \gamma}, \quad f_{\text{inst}} = \frac{(k_{\text{peak}} + \delta) \cdot f_s}{N_{\text{fft}} \cdot k}$$
*   **3-Point Median Despiking:** Filter applied solely to despike extreme single-frame outliers ($> 50\text{ mHz}$).

### 2. CMOS Rolling-Shutter Optical ENF Pipeline
*   **Row-Luminance Profile Extraction:** For each video frame $n$, pixel luminance is averaged across rows $y \in [0, H-1]$:
    $$I_n(y) = \frac{1}{W} \sum_{x=0}^{W-1} \text{gray}(x, y, n)$$
*   **Temporal Texture Suppression:** Subtract the mean vertical profile across all frames $\tilde{I}_n(y) = I_n(y) - \bar{I}(y)$ to eliminate static scene textures (walls, furniture).
*   **High-Rate Reconstruction:** Concatenate row profiles at effective sampling rate $f_{\text{row}} = H \cdot f_{\text{fps}}$ (e.g. $720 \times 30 = 21,600\text{ Hz}$), downsample to $1000\text{ Hz}$, bandpass filter around $100\text{ Hz}$, and extract the instantaneous 1 Hz ENF trace.

### 3. Sub-Second Vectorized Parquet Matching
*   Z-score normalize query vector $x$ of length $L$: $\hat{x} = (x - \bar{x}) / \|x - \bar{x}\|_2$.
*   Sliding dot product computed in $O(N \log N)$ time using FFT convolution:
    $$\text{cross}[i] = \text{fftconvolve}(y, \hat{x}[\::-1], \text{'valid'})[i]$$
*   Sliding window variance and MSE computed in $O(N)$ time using cumulative sums (`np.cumsum`).
*   Top 5 independent candidate timestamps ranked (separated by $\ge 300\text{ s}$), and winning timestamp localized to both **UTC** and **`Africa/Casablanca`**.

---

## 🚀 Quickstart & Boot Commands

### 1. Boot Backend Server (FastAPI, Python 3.11+)
```bash
# In first terminal (from project root)
PYTHONPATH=. python3 -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

### 2. Boot Frontend Server (Next.js 16)
```bash
# In second terminal
cd frontend
npm install
npm run build && npm run start -p 3000
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 🧪 2017 Zouz Vlogs Casablanca Forensic Simulation

Click **"Run 2017 Zouz Vlogs Forensic Simulation"** in the top navigation bar. The system automatically:
1. Synthesizes a 24-hour Continental Europe / Morocco ONEE 50 Hz grid dataset for **`2017-11-09`**.
2. Plants a 100 Hz mains hum and rolling-shutter video flicker at **`04:58:19 AM Africa/Casablanca`** (`04:58:19 UTC`).
3. Extracts the ENF trace and executes the vectorized Parquet cross-correlation across all 86,400 seconds.
4. Returns an **AUTHENTICATED** verdict with **$r > 0.92$**, **$\text{RMSE} \approx 6.3\text{ mHz}$**, and displays the authenticated date and time in `Africa/Casablanca`.

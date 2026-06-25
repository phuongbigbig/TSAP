# Time-series Analysis Platform (TSAP)

A single-file, self-contained web app for visualizing and statistically analyzing time-course / time-series data — publication-ready plots and a built-in statistics engine, with an optional in-browser Python engine for advanced models. No installation, no build step, no server: just one HTML file.

Designed in the same style as a companion qPCR bar-plot tool, it suits both **biological time-course experiments** (few timepoints, replicates, group comparisons) and **general dense signals** (sensor, financial, metric data).

---

## Quick start

Open `timeseries.html` in any modern browser (Chrome, Firefox, Edge, Safari) — that's it. The app loads with example data so you can explore immediately.

To use your own data: edit the table in the **Data input** card, or copy a block of cells from Excel/Sheets and paste it onto any cell.

---

## Features

### Visualizations
- **Line + error band** (±SEM, ±SD, or exact 95% CI) — the default time-series view
- **Stacked area**, **heatmap** (series × time, viridis), and **small-multiple facets**
- Overlays: replicate points, individual-replicate "spaghetti" lines, per-timepoint markers, moving-average smoothing, linear-trend lines
- Journal color palettes (NPG, AAAS, NEJM, Lancet, JAMA, JCO, BMJ, D3, …) plus black-and-white shade / dash styles for print
- Adjustable size, aspect ratio, font, and line weight; page color themes

### Statistics (built-in JavaScript engine — works offline)
- **Linear trend regression** per series (slope, R², p)
- **Per-timepoint comparison** — one-way ANOVA or Welch t-tests at each timepoint, corrected across timepoints (Holm / Bonferroni)
- **Area under the curve (AUC)** with between-series comparison
- **Two-way ANOVA** (time × series interaction)
- **Autocorrelation (ACF)** and **series–series correlation** (Pearson / Spearman)
- **Repeated-measures mode** — when the same subjects are tracked over time, switches to a split-plot **mixed ANOVA** (random intercept per subject) and **per-subject trend (random slopes)**
- **Auto-recommendation** of the appropriate test for your data shape, and a one-click route to the Python engine when the design is unbalanced or has empty cells
- An **"Analysis explained"** card with a plain-language description and APA references that update to match the running analysis

### Advanced engine (optional — Python via Pyodide)
Click **Load Python engine** to run real [`statsmodels`](https://www.statsmodels.org/) in the browser (WebAssembly):
- **Linear mixed-effects models** — random intercept, or random intercept + slope per subject, with a joint Wald test for the time × series interaction
- **Type III two-way ANOVA** (sum-to-zero contrasts) — correct for unbalanced designs

### Export
- Plot as **SVG** or **PNG**
- Statistics as **CSV** or **XLSX** (written natively, no libraries)

---

## Deploying to GitHub Pages

1. Create a GitHub repository and add `timeseries.html` (and this `README.md`).
2. **Rename `timeseries.html` to `index.html`** so it loads as the site homepage (or keep the name and link to it directly).
3. In the repo, go to **Settings → Pages**, set **Source** to your `main` branch (root folder), and save.
4. Your app will be live at `https://<your-username>.github.io/<repo-name>/` within a minute or two.

### Does the Python engine work on GitHub Pages?
**Yes.** Pyodide is loaded from the jsDelivr CDN and runs entirely on the browser's main thread, so it needs **no special server headers** (no cross-origin isolation / `SharedArrayBuffer`), which GitHub Pages can't provide anyway. Notes:

- The first time a visitor clicks **Load Python engine**, the browser downloads the Python runtime and packages (tens of MB) from the CDN — this needs an internet connection and takes ~30–60 s. It's cached afterward.
- Everything else (all JavaScript analyses, plots, and exports) works **offline** once the page has loaded.
- Networks that block `cdn.jsdelivr.net` will prevent only the optional Python features; the built-in engine still works.

---

## Browser requirements
- Any current desktop browser. The core app uses only standard HTML/SVG/JavaScript.
- The optional Python engine requires WebAssembly support (all modern browsers) and internet access for the first load.

---

## How the data table works
- Each **row** is a timepoint; enter its time value in the first column.
- Each **series** has one or more replicate columns; the line shows the mean and the band shows its spread.
- **Missing values are handled gracefully** — empty cells, missing timepoints, and unequal replicate counts are skipped or flagged rather than causing errors.
- **Repeated-measures toggle:** when on, each replicate column is treated as one subject followed across all timepoints (column S1 = the same individual at every row). A subject must have a value at every timepoint to be included in the mixed model.

---

## Files
- `timeseries.html` — the entire application (HTML + CSS + JavaScript + embedded Python), self-contained.
- `README.md` — this file.

---

## Notes on statistical validity
The built-in tests assume approximately normal residuals and comparable variances; with few replicates, power is low, so a non-significant result is not proof of "no effect." Plain ANOVA/t-tests treat timepoints as independent — for serial dependence, use the repeated-measures toggle or the Python mixed-effects engine. With unbalanced or empty-cell designs the built-in two-way ANOVA uses sequential (Type I) sums of squares; for order-independent results use the Python Type III ANOVA (the app points you there automatically).

The statistics engine has been validated against reference implementations (R / pingouin `mixed_anova`, `statsmodels`): the two-way and repeated-measures ANOVA, Welch t-test, regression, correlation, and multiplicity corrections reproduce reference values.

---

## License & credit
© 2026 Nguyen Thanh Phuong.

You're free to use and adapt this for your own work. If you redistribute it, please keep the attribution.

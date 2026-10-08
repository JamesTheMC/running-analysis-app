# Running Analysis App

Mobile-first PWA for treadmill running gait analysis. Clinician decision support; see [SPEC.md](SPEC.md).

**Status: Milestone 3 + view map.** Lateral (side) clips are analysed on-device with MediaPipe Pose (bundled locally, no external hosts): gait events per stride and the lateral metrics as per-stride medians for the **near leg and arm only**. Which metric may come from which view is fixed in [`reference/VIEW_MAP.md`](reference/VIEW_MAP.md) and enforced in code (config `allowedViews`, the pipeline emitter and the engine), checked by `test/unit.html`. Posterior (rear) metrics are mapped but not built yet; rear-view stride segmentation and midstance are in the test page for review. The demo button still uses placeholder data.

## Run locally

There's no build step. It's plain HTML, CSS and ES modules, so any static server works:

```bash
python3 tools/devserver.py 8000
```

(`python3 -m http.server` also works, but lets the browser cache JS modules, so edits may not show up.)

Then open http://localhost:8000.

### Test on a phone

With the phone on the same Wi-Fi, open `http://<your-mac-ip>:8000` (find the IP with `ipconfig getifaddr en0`). The whole flow works over plain http. Install-to-home-screen and offline caching need https (e.g. GitHub Pages). Video is never uploaded either way.

## Layout

| Path | What |
|---|---|
| `js/config.js` | **All metric ranges, allowed views, scoring weights, confidence rules and pattern rules.** Edit here only. |
| `js/placeholder.js` | Placeholder measurements for the demo, in the shape the pipeline outputs. |
| `js/pipeline/` | On-device analysis: MP4 demux (`mp4.js`), WebCodecs decode (`decode.js`), MediaPipe pose + per-frame angles (`pose.js`, `kinematics.js`), tibia tracking gate (`gate.js`), stride segmentation + late-stance hip extension (`strides.js`), gait events (`events.js`), event-based metrics with sign conventions (`metrics.js`), orchestration (`run.js`), app measurement mapping incl. near/far rules (`measurements.js`). |
| `vendor/mediapipe/` | `@mediapipe/tasks-vision` 1.1.0 (Apache-2.0) ES module + SIMD wasm, and `pose_landmarker_full.task`. Loaded only from this origin. |
| `reference/` | Validated Python prototype (ground truth for the port) and [`VALIDATION.md`](reference/VALIDATION.md), the browser-vs-Python comparison. |
| `test/hip-anchor.html` | Click the hip joint centre on side-clip frames; stores offsets from the hip landmark (thigh lengths) in `test-data/debug/hip_anchor_clicks.json`, and compares near/far/midpoint hip jitter. `HIP_ANCHOR` in config applies the median offset in `corrected` mode. |
| `reference/CAPTURE_PLAN.md` | Plan for in-app guided filming, with what iPhone Safari can and cannot control. |
| `test/unit.html` | Unit tests: view-to-metric map enforcement, emitter guard, engine checks, and a regression check against `test/fixtures/IMG_0639_2.baseline.json` (runs when cached landmarks are present). |
| `test/pipeline.html` | Dev page: runs a clip from `test-data/`, compares against Python output (`test-data/<clip>.py.json`), validates events (manual-check printout, tolerance sensitivity, midstance cross-check), shows metrics, and builds the event contact sheet. Caches landmarks in `test-data/debug/` so re-runs skip pose. |
| `test-data/` | Local test clips. **Git-ignored: real client video, never commit.** |
| `js/engine/analysis.js` | Status, confidence, scoring, asymmetry, pattern evaluation. |
| `js/engine/summary.js` | Copy-paste summary text and auto-generated interpretation. |
| `js/views/` | Upload, intake and results screens. |
| `sw.js` | Offline app-shell cache (bump `CACHE` when shipping changes). |

## Privacy

Video is read through a local object URL and never sent anywhere. Nothing is persisted: closing the tab clears the session. Sessions are labeled by client code and date only.

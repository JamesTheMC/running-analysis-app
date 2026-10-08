# Decision Log
Format: **Date: Decision.** Alternatives considered. Why. Reversible? (Y/N)

## Foundations
- Web app before native: validate analysis first, then port to Swift.
- Hip extension measured relative to trunk axis (shoulder-hip line).
- Plain-text copy-paste summary is the primary output.
- **2026-10-06: Pose estimation = MediaPipe Pose Landmarker "full" (tasks-vision 1.1.0), bundled
  locally; frames decoded with WebCodecs from a small MP4 demuxer.** Alt: `<video>` seeking (slow,
  inexact on 120 fps HEVC). Why: exact frame indexing, fast, on-device. Y
- **2026-10-07: MediaPipe usage telemetry patched out and a Content-Security-Policy limits the page to
  its own origin.** Why: the 1.1.0 bundle beacons to googleapis; no video or data may leave the device. Y
- **2026-10-07: Every 2nd frame analysed (≈60 Hz from 120 fps), downscale 0.45.** Full resolution
  gave no measurable precision gain (MediaPipe crops the person to 256 px). Y
- **2026-10-07: Tibia-length robust z-score > 6 excludes tracking failures (from the validated
  Python prototype).** Y

## Gait events and metrics (side view)
- **2026-10-07: Strides from one reference signal (inter-ankle separation) with period-constrained
  peak tracking.** Alt: per-leg peak picking (disagreed 11 vs 15 cycles). Y
- **2026-10-07: Side IC/TO = first/last frame of the foot's lowest point within 0.3 foot lengths of
  that stride's belt level; MS = ankle under the hip midpoint.** Reviewed on a contact sheet by the
  clinician. Belt slope used only when statistically clear (camera roll ≈ 0°). Y
- **2026-10-07: Metrics are per-stride medians, never whole-clip extremes.** Y
- **2026-10-07: IC-sensitivity rule: IC-dependent metrics recomputed at contact tolerances
  0.2/0.3/0.4; if the status changes, show the range, unflagged and unscored.** Why: IC moves about one
  frame per 0.1 of tolerance. Y
- **2026-10-07: Trunk lean uses shoulder and hip midpoints; foot-to-COM uses the heel; foot
  inclination is relative to the same foot's flat midstance angle.** Why: arm-swing artefact, toe
  landmark offset, heel-landmark offset (each checked across all strides). Y
- **2026-10-07: Lateral clips report the near leg and arm only; far-leg output removed.** Why: far-leg
  landmarks swap onto the treadmill upright; far midstance was wrong on review. Y
- **2026-10-08: Hip-extension window ends at TO + 50 ms; window sweep (late stance, TO+0/50/100/150 ms)
  → "borderline, window-sensitive" when the status changes. Hip extension unscored, and its
  below-range value is informational only until `VALIDATION.hipExtensionValidated`.** (Clinician
  decision.) Y
- **2026-10-08: Foot strike = rearfoot vs non-rearfoot at 8° (Altman & Davis 2012, relative to
  standing foot angle; cutoff to be verified). Foot and tibial inclination are descriptive only (no
  load-prediction claims).** Y

## Views and enforcement
- **2026-10-08: View-to-metric map (reference/VIEW_MAP.md) enforced by `allowedViews` in config, a
  pipeline emitter that refuses disallowed metrics, and an engine check; covered by unit tests.** Y
- **2026-10-08: Tests run with one command: `python3 tools/test.py` (headless Chrome, results posted
  back to a local server).** Alt: Node (not installed), Safari WebDriver (needs a system setting). Y

## Posterior view
- **2026-10-08: Posterior strides from the left-minus-right foot-height signal; heel/toe-speed event
  detection abandoned (image height mixes foot height and distance on a treadmill).** Y
- **2026-10-08: Hip anchor: `HIP_ANCHOR.mode = 'landmark'` until the clinician clicks joint centres
  (test/hip-anchor.html).** Y

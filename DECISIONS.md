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

## Phase 2 (2026-10-08)
- **Session = three optional clip slots (lateral from left, lateral from right, posterior), merged
  per metric; each lateral clip supplies only its near leg and arm.** Alt: one lateral clip with far
  leg (rejected: far-leg landmarks unreliable). Y
- **Per-leg scores stay on with a single lateral clip; only the L/R difference needs both near-side
  clips.** Why: each leg is judged against its own template range; a comparison needs two near legs. Y
- **Midline (trunk) values from two lateral clips: stride-weighted mean of the clip medians, with a
  "clips disagree" note above 3°.** Alt: pool per-stride values (needs per-stride storage; deferred). Y
- **Arm metrics are per side (L/R), each from its own lateral clip.** Y
- **Speed and incline are recorded per clip; a warning shows when the two lateral clips differ.** Y
- **Knee/ankle sync (provisional): per stride, peak stance knee flexion and peak ankle dorsiflexion
  within 15% of stance time (≥ 1 analysed frame); "yes" when ≥ 50% of strides are in sync. Low
  confidence (ankle angle from heel/toe landmarks).** Source: no published threshold found for this
  template item; provisional, for owner review. Y

## Phase 3: posterior view (2026-10-08)
- **Rear midstance = lowest point of the smoothed pelvis inside each stance half-cycle.** Alt:
  half-cycle centre, foot-height minimum. Why: least timing-sensitive candidate on review; no
  reliable rear foot-contact events (perspective). Y
- **Timing-sensitivity rule for posterior metrics: recompute at midstance ±2 analysed frames; if the
  status changes, show the range as "borderline, timing-sensitive", unscored, no pattern trigger.** Y
- **Sign convention: + = toward the midline for both legs; verified by a mirror/swap unit test.** Y
- **Contralateral pelvic drop = change in the pelvis line from loading response (segmentation stance
  start) to midstance; unscored, trend only.** Why: 2D pelvic drop tracks 3D poorly, and the template
  red (>6°) equals the healthy 2D mean in published data. Provisional. Y
- **Crossover = heel on or past the pelvis midline at midstance in ≥ 50% of steps.** Provisional. Y
- **Spine shift vs PSIS (provisional): shoulder midpoint more than 0.25 hip widths from the pelvis
  midpoint = "beyond PSIS".** PSIS are not visible landmarks; 0.25 hip widths approximates the PSIS
  spacing relative to the hip-joint landmarks. Owner review. Y
- **Lateral shift in cm when height is entered (scale from frontal segment lengths, Winter ratios),
  otherwise in hip widths.** Y
- **Posterior L/R differences only when the left/right swap check passes.** Y
- **Not built from behind: out-toe angle, Achilles angle, rearfoot eversion.** Why: foot landmarks are
  too small and noisy at treadmill filming distance; listed in the summary as not built. Y

## Phase 4: ranges, template output (2026-10-08)
Sources were gathered by a literature-search subagent and reviewed; values marked UNVERIFIED were read
through abstracts or summaries and need a full-text check. All of these are flagged "provisional" in
the output.
- **Max stance knee flexion: green 40–55°, red < 35°.** The template's 35–45° / red > 45° would flag
  healthy runners (healthy group means 44.5–46.3° in the studies the literature review found; UNVERIFIED, exact sources to be confirmed). Y
- **Foot-to-COM at IC in cm: green ≤ 13 cm, red > 17 cm.** Heiderscheit 2011: 9.2 ± 4.0 cm at
  preferred cadence (green ≈ mean + 1 SD, red ≈ mean + 2 SD). Shoe lengths still shown. Y
- **Knee frontal-plane projection angle: unscored.** 2D FPPA has poor validity against 3D during
  running (Dingenen 2018). Y
- **Hip adduction: red > 13° (≈ healthy 3D mean + 1 SD; UNVERIFIED).** Y
- **Knee flexion at IC 15–25°, tibial inclination ±10°, trunk lean ranges: template values kept,
  marked provisional (no published cutoff found).** Y
- **Mechanics suggestion: when overstride signs are present (overstride pattern or foot-to-COM
  caution/flag), suggest a 5–10% step-rate increase with target steps/min and the resulting step
  length (Heiderscheit 2011).** Step length = treadmill speed / step rate; step rate is the entered
  cadence, else the video estimate (labelled unvalidated). Y
- **Limits statement in every interpretation: movement analysis to support clinical judgment, not a
  diagnosis; provisional thresholds are not published cutoffs.** Y

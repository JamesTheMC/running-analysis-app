# Tasks

Phased plan to v1: one side-view clip (or one per side) plus one posterior clip → the template
summary (ankle, knee, hip, lumbar, arms, then interpretation). Run tests: `python3 tools/test.py`.

## Doing

## Todo


### Phase 4: template output
- [x] Ranges reviewed against literature; anything not literature-backed marked provisional (DECISIONS.md)
- [x] Mechanics suggestions: step rate (+5–10% when overstride signs) and step length
- [x] Limits statement
- [x] Scores per phase and side, pattern flags (side + posterior), interpretation checked on the full run

### Phase 5: validation against manual measurement
- [ ] Sample frames from the side and posterior clips; blind manual joint-centre annotation
- [ ] Error per metric in degrees (or cm / hip widths); fix what is off
- [ ] Report in reference/VALIDATION.md

## Blocked (needs the owner)
- A right-side lateral clip of the same runner (only a left-side clip exists), to exercise and
  validate bilateral side-view values on real video.
- Hip extension validation (`VALIDATION.hipExtensionValidated`): reviewed 2026-10-09, stays unscored; revisit after the whole-leg correction.

## Done
- Phase 6: intake feeds the analysis, covered by tests: height → cm (foot-to-COM scored in cm,
  unscored shoe lengths without height; lateral shift cm); speed → step length; cadence (entered) →
  pattern triggers and step-rate targets (else the video estimate, labelled unvalidated); incline →
  interpretation context; full app run (left lateral + posterior) checked, copy button works
- Phase 4: template output with provisional literature ranges, mechanics suggestions, limits statement
- Phase 3: posterior view: midstance = lowest pelvis per stance; per-leg hip adduction, knee FPPA
  (unscored), pelvic drop (trend only), foot vs midline, crossover; midline lean, shift (cm),
  spine shift vs PSIS (provisional); ±2-frame timing sweep; swap-check gating; combined with lateral
- Phase 2: three clip slots (lateral from left, lateral from right, posterior) merged into one
  session; each lateral clip supplies its own leg and arm (arms now L/R); midline values from two
  lateral clips combined (stride-weighted, disagreement note > 3°); per-clip speed/incline with a
  warning when they differ; L/R difference labelled "measured on separate clips"; knee/ankle sync
  (provisional rule); provenance shown per value
- Scaffold: upload, intake, results screens (copy button, scored report)
- On-device pose pipeline (MediaPipe, bundled locally; no external hosts), validated against the
  Python reference
- Side-view gait events per stride (IC, midstance, toe-off) with contact-sheet review
- Side-view metrics as per-stride medians (near leg): knee flexion at IC, max stance knee flexion,
  knee excursion, tibial and foot inclination, foot strike, foot-to-COM, trunk lean, hip extension
  (window-sensitive), ankle DF, near-arm elbow and shoulder swing
- View-to-metric map enforced in code; IC- and window-sensitivity rules; hip-extension validation gate
- Posterior: stride segmentation, midstance candidates, swap/symmetry checks, capture off-centre check
- One-command tests: `python3 tools/test.py` (headless Chrome)

## Reconciliation phase (started 2026-10-10)
Goal: side + rear clips → one coherent per-client result; clean data foundation for the presentation
phase. Clips: C0 (original pair, 120 fps), T1 (8 mph), T2 (7 mph), T3 (6 mph); all sets complete
(side + rear). Inventory in test/clips.js; videos stay in test-data/ (gitignored).

### Baseline (pipeline as of 0d920c7, before fixes)
| Clip | Format | Result |
|---|---|---|
| C0-side | HEVC 10-bit DV, 1080×1920 (rot 90), 119.95 fps, 61.0 s | works: 67/83 strides valid, cadence 164 spm |
| C0-rear | same, 60.9 s | works: 84/84 midstances, 0 swap frames |
| T1-side | HEVC DV, 1080×1920 (rot 90), 30 fps, 29.4 s | **cadence halved (92 spm)**, 11/21 strides valid, contact 333 ms |
| T1-rear | same, 40.8 s | **cadence halved**, 1–2 valid midstances, 39 L/R swap frames, 8% frames without a pose |
| T2-side | same, 31.1 s | **0/44 strides valid** (contact 70–85% of stride) |
| T2-rear | same, 37.6 s | works: 56/56 midstances |
| T3-side | same, 34.3 s | **0/50 strides valid** (contact 62–84%) |
| T3-rear | same, 29.6 s | works: 42–43 midstances |
No crashes; all clips upright (rotation metadata applied); no mirrored clips; frame timing constant
(±1.7 ms). New side clips are filmed from the runner's RIGHT (near leg R).

### Done
- [x] Inventory + batch pose run (test/batch.html), baseline report (test/baseline.js)
- [x] Landing (IC) gate: foot must not travel forward faster than 25% of belt speed (T2/T3 swing
      counted as stance); toe-off unchanged (frame-strip check on C0)
- [x] Contact share validity 20–65% (no-flight-phase runners, confirmed on a T2 strip)
- [x] Period: shortest strong autocorrelation peak (T1 halving); cadence = mean of stride durations
      (30 fps quantisation); side vs rear cadence now within 1–4 spm on every client
- [x] Input: mirrored video undone at decode, frame-timing check, time-based sweeps
- [x] Pose stabilisation: visibility threshold, gap fill ≤ 0.1 s, SG 0.1 s; no double smoothing

### Todo
- [ ] Events per leg per view with confidence; manual frame-marking validation per clip
- [ ] Reconciliation layer: L/R convention, time alignment, authoritative view, cross-checks, confidence
- [ ] Intake: real-unit stride length, vertical oscillation; graceful blanks
- [ ] Joint-angle validation per clip and view; fix > 5° or explain
- [ ] Prototype: full flow, regression fixtures (derived JSON), debug view, mobile layout
- [ ] HANDOFF.md

## Next (Phase 5 follow-up)
- [x] Provisional thresholds reviewed with the clinician (2026-10-09; DECISIONS.md)
- [x] Owner spot-check of hand marks (3 frames; knee marks inconsistent)
- [x] Whole-leg landmark correction (near leg), tested leave-one-stride-out, applied
- [x] Far leg measured against hand marks (2026-10-09): 26% swaps, not usable; stays off
- [x] Hip anchor clicks (20 frames, 2026-10-09)
- [x] Gate foot-to-COM behind a validation flag (over-reads ≈ 9 cm vs manual)
- [x] Knee flexion at IC and tibial inclination confidence → medium (≈ 8–10° error)
- [x] Capture protocol: treadmill upright must not cross the near leg

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

## Next (Phase 5 follow-up)
- [x] Provisional thresholds reviewed with the clinician (2026-10-09; DECISIONS.md)
- [x] Owner spot-check of hand marks (3 frames; knee marks inconsistent)
- [x] Whole-leg landmark correction (near leg), tested leave-one-stride-out, applied
- [x] Far leg measured against hand marks (2026-10-09): 26% swaps, not usable; stays off
- [x] Hip anchor clicks (20 frames, 2026-10-09)
- [x] Gate foot-to-COM behind a validation flag (over-reads ≈ 9 cm vs manual)
- [x] Knee flexion at IC and tibial inclination confidence → medium (≈ 8–10° error)
- [x] Capture protocol: treadmill upright must not cross the near leg

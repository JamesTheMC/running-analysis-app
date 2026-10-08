# Tasks

Phased plan to v1: one side-view clip (or one per side) plus one posterior clip → the template
summary (ankle, knee, hip, lumbar, arms, then interpretation). Run tests: `python3 tools/test.py`.

## Doing

## Todo


### Phase 3: posterior view
- [ ] Rear midstance = lowest smoothed pelvis within each stance half-cycle (least timing-sensitive)
- [ ] Metrics per leg at midstance: hip adduction, knee frontal-plane projection angle, foot position
      vs midline and crossover (≥ 50% of steps); midline: trunk lateral lean and lateral shift
      (cm from height, else hip widths); contralateral pelvic drop (loading response → midstance,
      trend only)
- [ ] Midstance-timing sweep (±2 analysed frames): status change → "borderline, timing-sensitive"
- [ ] Left/right swap check gates posterior L/R differences; per-leg quality
- [ ] Posterior step rate (unvalidated, display only)
- [ ] Combine posterior and lateral into one result

### Phase 4: template output
- [ ] Ranges reviewed against literature; anything not literature-backed marked provisional (DECISIONS.md)
- [ ] Scores per phase and side; correlated weaknesses (pattern flags) cover side + posterior
- [ ] Mechanics suggestions: cadence and stride (step length from treadmill speed and step rate)
- [ ] Plain-language interpretation paragraph; limits statement; copy button

### Phase 5: validation against manual measurement
- [ ] Sample frames from the side and posterior clips; blind manual joint-centre annotation
- [ ] Error per metric in degrees (or cm / hip widths); fix what is off
- [ ] Report in reference/VALIDATION.md

### Phase 6: intake end to end
- [ ] Height → cm metrics (foot-to-COM, lateral shift); speed → step length; incline → hip extension
      and trunk-lean context; cadence (if entered) → pattern triggers
- [ ] Run the full flow in the app (side + posterior) and confirm intake values feed the analysis

## Blocked (needs the owner)
- A right-side lateral clip of the same runner (only a left-side clip exists), to exercise and
  validate bilateral side-view values on real video.
- Hip anchor offset: click the hip joint centre on ~20 frames in test/hip-anchor.html; until then the
  hip landmark is used as-is (hip-dependent angles carry a known anchor uncertainty).
- Hip extension validation (`VALIDATION.hipExtensionValidated`): stays unscored until validated.

## Done
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

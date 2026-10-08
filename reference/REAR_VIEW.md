# Rear-view (Milestone 4) definitions

Agreed with the clinician before building; not implemented yet (events are reviewed first). Every
metric is a per-stride median; anything below the confidence floor reads "not assessed".

| Metric | Definition | Confidence cap |
|---|---|---|
| Hip adduction | At midstance: thigh (hip → knee) vs the perpendicular to the pelvis line (hip → hip); + = knee toward midline. Relative to the pelvis, so camera roll cancels. | medium (highest of the rear metrics; raise only after validation) |
| Pelvic drop | Change in the pelvis line (hip → hip) from loading response to midstance of the stance leg; + = swing side drops. Relative, not absolute. MediaPipe hip points are joint centres, not iliac crests. | low, trend only |
| Trunk lateral shift (proxy) | At midstance: horizontal offset of the shoulder midpoint from the pelvis midpoint, in cm using the intake height; hip-width fraction when height is missing. No PSIS landmark. | medium |
| Crossover | At midstance: heel position relative to the pelvis midline, as a fraction of hip width; a step crosses over when the heel is on or past the midline. A leg's pattern is "yes" when ≥ 50% of its steps cross. | medium |
| Knee varus/valgus | At midstance: frontal hip-knee-ankle angle (180 − interior angle); + = knee toward midline (valgus). | low |

Skipped: rearfoot eversion and out-toe (the foot is ~10 px long seen from behind; the heel landmark is
not a calcaneal bisection). Achilles angle: not requested for this build.

All of these are taken at midstance, so all are event-dependent and go through the IC-sensitivity
rule (sweep over the rear-view event threshold).

## Midstance candidates (IMG_0640, October 2026)

Files: `test-data/debug/IMG_0640.midstance-candidates-strip.png`, `test-data/debug/IMG_0640.midstance-candidates.md`.

- (i) Lowest smoothed pelvis (hip midpoint) inside each stance half-cycle vs (ii) the stance centre:
  (i) is 7 analysed frames (117 ms) earlier in every half-cycle (168/168 differ by more than 2 frames),
  about 15–20% into the half-cycle.
- In the strip, (i) frames show the stance foot planted with the other foot just after its toe-off;
  (ii) frames show the swing foot passing the stance leg.
- Timing sensitivity (±1/±2/±3 frames): (i) 0 of 8 measures timing-sensitive; (ii) 3 of 8.
- Mirror test: mirroring x and swapping left/right reproduces every candidate value with the legs
  swapped (max 3e-5, float rounding) and swaps the midstance frames exactly, so the sign convention
  (+ = toward the midline for both legs) is consistent. Left/right differences are in the data.
- Posterior capture check: pelvis midline about 0.14 hip widths left of frame centre (approximate),
  below the 0.5 warning threshold.

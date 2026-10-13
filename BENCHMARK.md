# Benchmark: all runners (2026-10-13)

Runners are referred to by client code only. T1–T3 are **one runner** at three speeds; so the 12
client codes cover **10 runners**. Reproduce: `test/benchmark.js` (from committed fixtures) and
`python3 tools/test.py`. Validation details: reference/VALIDATION.md.

## 1. Clips and capture quality
| Client | Setup | Side clip | Rear clip |
|---|---|---|---|
| C0 | 1080×1920 portrait, 120 fps, hip-height camera | suitable | suitable |
| T1, T2, T3 | 1080×1920 portrait, 30 fps, hip-height camera | suitable | suitable |
| AR, AZ, CH, JW, ML, RQ, RY | 1280×720 landscape, 30 fps, **floor-level wide-angle camera** | unsuitable | unsuitable |
| CD | same, side clip 960×572 cropped; **head out of frame** | unsuitable | unsuitable |

Unsuitable = capture-quality gate (js/pipeline/capture-quality.js): no values or timing are reported
from the clip, only the reason and re-filming advice. All 16 new clips ran through pose estimation
without crashing.

## 2. Event detection (share of strides with valid events)
| Client | Side | Rear (midstances found / expected) | Cadence side / rear (spm) |
|---|---|---|---|
| C0 | 69/83 (83%) | 84/84 | 165.3 / 166.4 |
| T1 | 43/43 | 47/52 | 183.9 / 182.7 |
| T2 | 43/44 | 56/56 | 177.2 / 181.6 |
| T3 | 50/50 | 42/42 | 178.9 / 176.6 |
| AR, AZ, CD, CH, JW, ML, RQ, RY | 9–42% | 0–20% of expected | side 85–287, rear 78–351 (implausible) |

Event timing vs blind frame marking (suitable clips): side IC +33 ms (1 frame), TO +28 ms bias /
44 ms; rear IC/TO calibrated (lag 100/120 ms subtracted).

## 3. View agreement (suitable clients)
| Quantity | Agreement (side vs rear) |
|---|---|
| Cadence | within 1.1–4.4 spm (all 4 sessions agree, ±3%) |
| Step time L / R | within 1–18 ms (all agree, tolerance 33 ms) |
| Step-time asymmetry | agrees in 2 of 3, T2 disagrees (5.8 points; rear reads +2–5 points left-longer) |

## 4. Validation error per metric (app − manual at the same frame; bias / mean absolute error)
| Metric | C0 (owner spot-checked) | T1–T3 (clinician side marks) | 8 new runners (blind marks, pose only*) | Cross-runner mean abs error | Cross-runner bias |
|---|---|---|---|---|---|
| Side knee flexion (IC/MS/TO pooled) | +1.6 / 8.4° | +1.1 / 7.8° | +10.6 / 14.0° | 10.1° | +4.4° |
| Side tibial inclination at IC | +5.3 / 7.9° | −1.6 / 1.7° | −13.6 / 15.3° | 8.3° | −3.3° |
| Side hip extension | +4.6 / 8.3° | +1.9 / 3.2° | −1.2 / 7.7° | 6.4° | +1.8° |
| Side trunk lean | −5.9 / 5.9° | +6.9 / 6.9° | +7.1 / 7.3° | 6.7° | +2.7° |
| Side ankle dorsiflexion | −20.8 / 20.8° | −3.6 / 3.8° | −5.8 / 6.7° | 10.4° | −10.1° |
| Foot-to-COM at IC | +9.1 / 9.1 cm | +2.4 / 2.4 cm | — | 5.8 cm | +5.8 cm |
| Rear hip adduction | −1.4 / 2.0° | −3.1 / 3.1° | −1.8 / 5.2° | 3.4° | −2.1° |
| Rear knee frontal-plane angle | −1.6 / 1.9° | −0.5 / 1.5° | −10.8 / 20.5°† | 8.0° | −4.3° |
| Rear trunk lateral lean | −1.4 / 3.2° | −1.5 / 1.7° | 0.0 / 2.7° | 2.5° | −1.0° |

Cross-runner figures are the mean of the three groups (C0, T, new runners).
\* New runners: landmark accuracy at arbitrary frames on the unsuitable setup (their metrics are not
reported). Good when the leg is visible (CH, RQ, JW side knees within 1–11°), very large where the
console hides the leg or the head is cropped (CD side errors to 85°).
† Rear knee outliers (123°, 215°) are frames where the swing knee is hidden behind a sole facing the
low camera.

## 5. Confidence distribution (reported values, suitable sessions C0 + T1–T3)
110 values: 70 medium, 40 low, 0 high (no metric is high: unvalidated metrics are capped at medium,
validated errors above 5° cap at medium, above 10° at low).

## 6. Range territory per metric (4 sessions, 2 runners; counts of left/right/mid values)
| Metric | Normal | Caution | Flag | Borderline / pending | No status (record or low confidence) |
|---|---|---|---|---|---|
| Knee flexion at IC | 3 | 0 | 0 | 1 | 0 |
| Max stance knee flexion | 0 | 0 | 2 | 2 | 0 |
| Tibial inclination at IC | 0 | 0 | 0 | 4 | 0 |
| Foot-to-COM at IC | 0 | 0 | 0 | 4 | 0 |
| Hip adduction | 6 | 0 | 0 | 2 | 0 |
| Hip extension | 0 | 0 | 0 | 2 | 2 |
| Forward trunk lean IC / MS | 3 / 3 | 0 | 0 | 0 | 1 / 1 |
| Trunk change at peak hip extension | 3 | 0 | 0 | 0 | 1 |
| Spine shift (PSIS) | 4 | 0 | 0 | 0 | 0 |
| Crossover | 8 | 0 | 0 | 0 | 0 |
| Foot strike / inclination | 0 | 0 | 0 | 1 | 3 |
| Others (ankle DF, knee FPPA, step width, foot vs midline, trunk lateral lean/shift, arms, sync) | — | — | — | — | all |

**Common across nearly all runners** (every session): max stance knee flexion flagged or borderline,
tibial inclination and foot-to-COM borderline. Treated as likely measurement bias or a range that is
too tight (app reads knees ≈ 7° high; healthy average ≈ 45° vs the 35–45° range; foot-to-COM still
pending validation): the corrective section softens these to "worth screening" notes.

## 7. Limits of this benchmark
Only 2 runners (4 sessions) produce reported values; the 8 new runners need re-filming per
reference/CAPTURE_PLAN.md (hip-height camera, square to the treadmill, whole body in frame). Hand
marks are mostly AI blind marks; the side-view T1–T3 knees, hips, ankles and heels are clinician marks.

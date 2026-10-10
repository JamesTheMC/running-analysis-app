# Handoff: data foundation → results presentation and research-linked corrections

Status at handoff (2026-10-10, branch `milestone-3-checkpoint`). Run the tests: `python3 tools/test.py`.
Run the app: `python3 tools/devserver.py` and open http://localhost:8000.

The analysis now produces **one reconciled result per client** from a side clip and/or a rear clip
(`js/pipeline/reconcile.js`, schema `gait-session/1`). The existing text summary (`engine/summary.js`)
was deliberately left as it was; the presentation phase should build on the reconciled result.
The **Debug** tab on the results screen shows the result, per-metric confidence and reasons, the
cross-view checks, and a skeleton overlay with detected events for each clip.

Clips used: C0 (original pair, 120 fps, filmed from the left), T1 (8 mph), T2 (7 mph), T3 (6 mph)
(30 fps, filmed from the right). Validation details: `reference/VALIDATION.md`. Decisions and
sources: `DECISIONS.md`. Full sample: `reference/sample-result-T3.json`.

---

## 1. Metrics the model outputs

Confidence per value is `high | medium | low | none` = the lowest of: share of strides measurable vs
the metric's 2D cap (`baselineConfidence`), gait-event confidence for that leg/view, timing/IC/window
sensitivity (status changes across the sweep → low), validation error (> 5 → medium, > 10 → low;
not validated → at most medium), and pending clinician validation. Every downgrade is listed in
`confidenceReasons`. Validation error = mean absolute error vs blind hand marks at the same frame
(event timing excluded); "C0" = owner spot-checked reference.

### Side view (lateral) — sagittal plane, near leg only (left clip → left leg, right clip → right leg)
| id | Metric | Unit | Phase | Validation error | Behaviour |
|---|---|---|---|---|---|
| ic_knee_flexion | Knee flexion at IC | ° | IC | 9.1 (C0) | medium at best; IC-sensitive range when status changes |
| ms_max_knee_flexion | Max stance knee flexion | ° | stance | 6.7 (C0, at midstance) | medium |
| ms_knee_flexion_excursion | Knee excursion IC→MS | ° | IC→MS | 6.6 (C0) | record only |
| ic_tibial_inclination | Tibial inclination at IC | ° | IC | 7.9 (C0) / 5.5 (T) | medium; descriptive only |
| ic_foot_inclination | Foot inclination at IC (vs own midstance) | ° | IC | 12.8 (C0) | low |
| ic_foot_strike | Rearfoot / non-rearfoot (8°) | category | IC | 12.8 (C0) | low; unscored |
| ic_foot_to_com | Heel ahead of pelvis at IC | cm | IC | 9.1 cm (C0) / 5.4 cm (T) | low–medium; above-range = "pending validation" |
| ms_ankle | Ankle dorsiflexion at midstance | ° | MS | 20.8 (C0) / 3.8 (T) | low; trend only |
| ms_knee_ankle_sync | Knee/ankle peak sync | yes/no + % | stance | — | low; record only |
| to_hip_extension | Peak hip extension vs trunk axis | ° | late stance | 8.3 (C0) | medium/low; unscored until clinician validation |
| ic_spine_lean / ms_spine_lean | Forward trunk lean | ° | IC / MS | 5.9 (C0) / 6.9 (T) | medium (image-space bias, sign flips with direction) |
| trunk_change_peak_hip_ext | Trunk angle change IC → peak hip ext | ° | stance | (as trunk lean) | medium |
| arm_elbow_angle / arm_shoulder_rom | Elbow angle / shoulder swing | ° | cycle | not validated | medium |

### Rear view (posterior) — frontal plane, both legs, at midstance (lowest pelvis)
| id | Metric | Unit | Validation error | Behaviour |
|---|---|---|---|---|
| ms_hip_adduction | Hip adduction | ° | 3.1 (T) / 2.0 (C0) | medium; timing-sensitive range (±33 ms) when status changes |
| ms_knee_varus_valgus | Knee frontal-plane projection angle | ° | 1.5 (T) / 1.9 (C0) | low cap (2D FPPA vs 3D poor in literature); unscored |
| ms_pelvic_drop | Contralateral pelvic drop (IC → MS) | ° | not validated | **do not present** (see §4) |
| ms_trunk_lateral_lean | Trunk lateral lean | ° | 1.7 (T) / 3.2 (C0) | medium |
| ms_lateral_shift | Trunk lateral shift | cm (hip widths without height) | ≈0.1 hip widths | medium |
| ms_spine_shift | Between / beyond PSIS (> 5 cm) | yes/no | derived from shift | medium |
| ms_foot_midline | Heel vs pelvis midline | hip widths | 0.1 (T) / 0.2 (C0) | medium |
| ms_crossover | Crossover (≥ 50% of steps on/past midline) | yes/no + % | derived | medium |
| ms_step_width | Heel-to-heel width at midstance | cm | derived from heel marks | medium; data only, no summary line yet |
| arm_crossover | Wrist past the body midline | yes/no + % | not validated | low; **not assessable on T1–T3** (wrists hidden) |
| ms_out_toe, ms_achilles_angle, ms_rearfoot_eversion | — | — | — | not built (foot landmarks too small) |

### Reconciled / cross-view (result.timing, result.derived)
| Quantity | Unit | Source | Validation | Behaviour |
|---|---|---|---|---|
| Cadence | spm | both views, cross-checked (±3%) | side vs rear agree within 1–4 spm on all clients | agreed value when within tolerance |
| Step time L / R | s | both views (±1 frame of the coarser clip) | side vs rear agree within 1–18 ms | C0 side marked unreliable (far-ankle noise) → rear used |
| Step-time asymmetry | % (+ = left longer) | both (±5 points) | side 0–1%, rear 2–5% (rear slight + bias) | disagreement flagged, higher-confidence view reported |
| Contact time | ms | side only | IC within 1 frame, TO 1–2 frames late at 30 fps → about +33 ms | rear not estimable |
| Vertical oscillation | cm (or % of height) | side only | — | rear reads 40–75% high (perspective), shown as information |
| Step / stride length | m | speed ÷ cadence | — | needs treadmill speed |
| Duty factor, flight time | ratio, ms | contact ÷ stride | — | T1–T3 show no flight phase (duty factor ≈ 0.5) |

### Gait events (result.timing.perView[*].legEvents; per stride in each clip's eventTable)
| View | Events | Accuracy vs blind frame marking | Confidence |
|---|---|---|---|
| Side, near leg | IC, MS (ankle under hip), TO | IC +33 ms (1 frame), TO +28 ms bias / 44 ms error | per stride from tracking and IC-tolerance spread |
| Side, far leg | IC, MS, TO | 26% of far-leg points swap onto the near leg | always low; never used |
| Rear, each leg | IC, TO (calibrated foot-height crossings), MS (lowest pelvis) | crossings lagged IC 103 ms / TO 122 ms → lag subtracted (calibrated on 4 clients) | IC/TO low (timing only), MS medium |

---

## 2. Data structure of the result

`reconcileSession({ intake, clips })` → (all values plain JSON):

```
{
  schema: "gait-session/1",
  client: { code, sessionDate },
  intake: { heightCm, speed, speedUnit, inclinePct, cadenceEntered },
  views: ["lateral", "posterior"],
  clips: [ { slot, view, speed, speedUnit, inclinePct, fps, analysedHz, frames, durationSec, rotation,
             mirrored, frameTiming, analysedSize, facing?, nearLeg?, swapFrames?, landmarkQuality } ],
  convention: { rule, lateral: [ { slot, nearLeg, slotLeg, depthCheck, agrees, runnerFaces, mirrored } ],
                posterior: [ { slot, leftOnImage, mirrored, swapFrames, swapCheckPassed } ], issues: [] },
  alignment: { synchronised: false, method },
  timing: {
    perView: { <slot>: { view, analysedHz, cadenceSpm, strides, stepSecL, stepSecR, stepAsymmetryPct,
                         stepTimingReliable, contactMs: { left, right }, oscillation, legEvents: { left, right },
                         confidence, landmarkVisibility, method } },
    crossChecks: [ { quantity, unit, status: "agree"|"disagree"|"single view"|"not available", values: { <slot>: v },
                     tolerance, difference, reported, source, confidence, flag?, note?, rearInformational? } ]
  },
  derived: { speedMs, stepLengthM, strideLengthM, contactMs, dutyFactor, flightMs, inclinePct?, notes: [] },
  metrics: { <metricId>: { label, unit, phase, plane, authoritativeView, type, provisional, scored,
             notAssessed?,  // whole metric unavailable (view missing / not built)
             cells: { left|right|mid: { value, display, unit, n, total, countUnit, iqr, sweep: { kind, at, values },
                                        status, confidence, confidenceReasons: [], source: { slot, view }, note,
                                        notAssessed? } } } },
  notAssessed: [ { id, reason } ],
  limits: [ ... ]
}
```
`status` is the range status from config (`green|yellow|red|record`); the presentation layer decides
whether to show it (rule: never show a status for a `low`-confidence or sensitive value).
Each clip's per-stride event table is on the session clip (`clip.analysis.eventTable`) and per-stride
metric tables are on the pipeline results (`metrics[side].strideTable`, posterior `summary.table`).

### Sample (client T3, from committed fixtures; excerpt — full file `reference/sample-result-T3.json`)
```json
{
 "schema": "gait-session/1",
 "client": {
  "code": "T3",
  "sessionDate": "fixture"
 },
 "intake": {
  "heightCm": 170,
  "speed": null,
  "speedUnit": null,
  "inclinePct": 1,
  "cadenceEntered": null
 },
 "views": [
  "lateral",
  "posterior"
 ],
 "clips": [
  {
   "slot": "lateral_right",
   "view": "lateral",
   "speed": 6,
   "speedUnit": "mph",
   "inclinePct": 1,
   "fps": 30.00291573525124,
   "analysedHz": 30.00291573525124,
   "frames": 1030,
   "durationSec": 34.329996760609006,
   "rotation": 90,
   "mirrored": false,
   "frameTiming": null,
   "analysedSize": [
    486,
    864
   ],
   "facing": "image-right",
   "nearLeg": "right",
   "landmarkQuality": {
    "posedShare": 1,
    "meanVisibility": 0.9774864128897491,
    "lowVisibilityShare": 0
   }
  }
 ],
 "convention": {
  "rule": "anatomical left/right in every view",
  "lateral": [
   {
    "slot": "lateral_right",
    "nearLeg": "right",
    "slotLeg": "right",
    "depthCheck": {
     "leg": "right",
     "zGap": 0.59,
     "decisive": true
    },
    "agrees": true,
    "runnerFaces": "image-right",
    "mirrored": false
   }
  ],
  "posterior": [
   {
    "slot": "posterior",
    "leftOnImage": "left",
    "mirrored": false,
    "swapFrames": 0,
    "swapCheckPassed": true
   }
  ],
  "issues": []
 },
 "timing": {
  "perView": {
   "posterior": {
    "view": "posterior",
    "analysedHz": 30.0016911889058,
    "cadenceSpm": 176.6,
    "strides": 42,
    "stepSecL": 0.345,
    "stepSecR": 0.333,
    "stepAsymmetryPct": 3.4,
    "stepTimingReliable": true,
    "contactMs": {
     "left": null,
     "right": null
    },
    "oscillation": {
     "px": 29.8,
     "shareOfHeight": 0.0528,
     "strides": 42
    },
    "legEvents": {
     "left": {
      "role": "rear",
      "detected": 42,
      "valid": 42,
      "high": 0,
      "medium": 42,
      "low": 0,
      "contactMs": null,
      "confidence": "medium"
     },
     "right": {
      "role": "rear",
      "detected": 43,
      "valid": 43,
      "high": 0,
      "medium": 43,
      "low": 0,
      "contactMs": null,
      "confidence": "medium"
     }
    },
    "confidence": "medium",
    "landmarkVisibility": 0.944,
    "method": "step times from the feet's height alternation (running-mean crossings)"
   }
  },
  "crossChecks": [
   {
    "quantity": "cadence",
    "unit": "spm",
    "status": "agree",
    "values": {
     "lateral_right": 179.1,
     "posterior": 176.6
    },
    "tolerance": 5.336,
    "difference": 2.5,
    "reported": 178,
    "source": "agreed",
    "confidence": "high",
    "note": "separate recordings: small drift between clips is expected"
   },
   {
    "quantity": "step time, left",
    "unit": "s",
    "status": "agree",
    "values": {
     "lateral_right": 0.333,
     "posterior": 0.345
    },
    "tolerance": 0.033,
    "difference": 0.012,
    "reported": 0.338,
    "source": "agreed",
    "confidence": "high"
   }
  ]
 },
 "derived": {
  "speedMs": 2.68,
  "stepLengthM": 0.9,
  "strideLengthM": 1.81,
  "contactMs": 367,
  "dutyFactor": 0.54,
  "flightMs": 0,
  "notes": [],
  "inclinePct": 1
 },
 "metrics": {
  "ic_knee_flexion": {
   "label": "Knee flexion",
   "unit": "deg",
   "phase": "initial_contact",
   "plane": "sagittal",
   "authoritativeView": "lateral",
   "type": "range",
   "provisional": true,
   "scored": true,
   "cells": {
    "left": {
     "value": null,
     "confidence": "none",
     "notAssessed": "needs a lateral clip filmed from the left"
    },
    "right": {
     "value": 19.3,
     "display": null,
     "unit": "deg",
     "n": 50,
     "total": 50,
     "countUnit": "strides",
     "iqr": [
      18.32,
      20.46
     ],
     "sweep": {
      "kind": "ic",
      "at": [
       0.2,
       0.3,
       0.4
      ],
      "values": [
       19.72,
       19.3,
       19.32
      ]
     },
     "status": "green",
     "confidence": "medium",
     "confidenceReasons": [
      "metric capped at medium (2D reliability)",
      "validation error 9.1\u00b0 (> 5)"
     ],
     "source": {
      "slot": "lateral_right",
      "view": "lateral"
     },
     "note": null
    }
   }
  },
  "ms_out_toe": {
   "label": "Out-toe / foot progression angle",
   "unit": "toes",
   "phase": "midstance",
   "plane": "frontal",
   "authoritativeView": "posterior",
   "type": "range",
   "provisional": false,
   "scored": true,
   "cells": {},
   "notAssessed": "not built: poor 2D reliability"
  }
 }
}
```

---

## 3. Ranges in the code

| Metric | Green / red in code | Source |
|---|---|---|
| Knee flexion at IC | 15–25° / < 12° or > 30° | clinic template; healthy 17.8 ± 4.0° (Heiderscheit 2011, 3D); **provisional** |
| Max stance knee flexion | 35–45° / > 45° | clinic template (clinician decision 2026-10-09); literature healthy ≈ 45° (many healthy runners above 45°) |
| Tibial inclination at IC | −10–+10° / beyond ±10° | **no published threshold; provisional** |
| Foot inclination at IC | < 10° DF / > 10° | clinic template; **no source** |
| Foot strike | rearfoot > 8° | Altman & Davis 2012 (relative to standing foot); cutoff **to be verified** |
| Foot-to-COM at IC | ≤ 13 cm / > 17 cm | healthy 9.2 ± 4.0 cm (Heiderscheit 2011) → **provisional** (clinician kept) |
| Forward trunk lean IC / MS | 5–10° (IC), 0–10° (MS) / < 0 or > 15°, > 12° | healthy ≈ 7°; red **provisional** |
| Trunk change at peak hip ext | < 5° of extension | **provisional, no source** |
| Hip extension | 5–15° / < 5° | clinic template; unscored until clinician validation |
| Hip adduction | 0–13° / > 13° | ≈ healthy 3D mean + 1 SD (source **unverified**); **provisional** |
| Knee FPPA | −5–+5° | **no published basis; unscored** |
| Pelvic drop | 0–6° / > 6° | template; red equals the healthy 2D mean; **provisional, unscored** |
| Spine shift (PSIS) | > 5 cm = beyond | clinician rule (2026-10-09); without height 0.25 hip widths (**provisional**) |
| Crossover | ≥ 50% of steps | **provisional** (clinician kept) |
| Cadence-based triggers | < 160 / > 190 spm | commonly cited range; **unverified** |
| Step-rate suggestion | +5–10% | Heiderscheit 2011 |
| Ankle DF, knee excursion, knee/ankle sync, elbow, shoulder ROM, foot vs midline, step width, arm crossing, trunk lateral lean/shift | record only | **no ranges** |

---

## 4. Known limitations — what the presentation layer should hedge or hide

**Do not present (or present only as "not reliable"):**
- **Pelvic drop**: reads −2 to −4.5° (swing-side hip rising) on all four clients, opposite to expected
  physiology; 2D hip landmarks follow the thighs. Unscored, low confidence.
- **Ankle dorsiflexion at midstance** and **foot inclination / foot strike**: errors 13–21° on C0 (heel
  landmark); low confidence.
- **Far-leg side-view values**: never output (26% left/right swaps).
- **Arm crossing** on clips where wrists are hidden from behind (T1–T3): not assessed.
- **Rear-view contact time and rear vertical oscillation**: not reported (perspective).

**Hedge (medium confidence, errors 5–10°):** knee flexion at IC and max stance (validated on one
client only; T1–T3 knee reference unusable), tibial inclination, hip extension (also awaiting
clinician validation), forward trunk lean (≈ 6–7° image-space bias), foot-to-COM (5–9 cm high;
above-range values shown as "pending validation").

**Solid within 2D limits:** cadence, step times, step-time symmetry (cross-checked in two views),
contact time (± one frame at 30 fps), hip adduction, knee FPPA (accurate as a projection, but 2D FPPA
does not equal 3D valgus), trunk lateral lean/shift, heel vs midline, crossover, step width.

**General 2D limits:** no transverse-plane rotation; frontal angles are projections that depend on
camera alignment; one camera per view, separate recordings (never synchronised); 30 fps clips resolve
events to ±33 ms; validation used AI blind hand marks (C0 knees owner spot-checked), 4 clients, so
errors are indicative, not definitive. Heights of T1–T3 were not recorded (170 cm assumed in fixtures).

---

## 5. Correlated metrics in the sample data (candidates for "correlated weaknesses")

Pearson r between per-stride values **within each client** (4 clients; listed when |r| ≥ 0.4 with the
same sign in ≥ 3 clients). Pairs marked *geometric* share landmarks, so part of the correlation is
built in; treat them as one finding, not two.

| Pair | r per client (C0, T1, T2, T3) | Reading |
|---|---|---|
| Tibial inclination at IC ↔ foot-to-COM | 0.93, 0.92, 0.49, 0.53 | overstride cluster (shank angled forward with foot landing ahead) |
| Knee flexion at IC ↔ knee excursion | −0.76, −0.41, −0.56, −0.53 | straighter landing → more knee flexion after landing |
| Knee excursion ↔ tibial inclination | 0.74, 0.33, 0.57, 0.56 | overstride cluster |
| Knee excursion ↔ foot inclination | 0.56, 0.49, 0.12, 0.61 | heel-first landing with more knee flexion after |
| Trunk lean at IC ↔ trunk change at peak hip ext | −0.83, −0.68, −0.67, −0.51 | partly geometric (same trunk line) |
| Knee flexion at IC ↔ tibial inclination | −0.96, −0.80, −0.87, −0.86 | *geometric* (shared knee/ankle points) |
| Hip adduction ↔ knee FPPA | 0.95, 0.68, 0.90, 0.91 | frontal-plane collapse cluster (partly geometric: shared knee point) |
| Hip adduction ↔ heel vs midline | −0.97, −0.98, −0.96, −0.96 | *geometric* (same thigh–foot chain); crossover cluster |
| Knee FPPA ↔ heel vs midline | −0.86, −0.58, −0.76, −0.77 | crossover / collapse cluster |
| Trunk lateral lean ↔ pelvic drop | 0.90, 0.79, 0.61, 0.73 | trunk compensation (pelvic drop unreliable: see §4) |
| Trunk shift ↔ trunk lateral lean | 1.00 in all | *geometric* (same quantity) |

Not seen: no consistent side ↔ rear correlations can be computed (separate recordings, no per-stride
match). Between-client correlations are not meaningful with 4 clients.

---

## 6. Where things are
| Piece | File |
|---|---|
| Pose, decode, mirroring, frame timing | js/pipeline/run.js, decode.js, mp4.js, pose.js |
| Stabilisation (confidence, gap fill, SG 0.1 s) | js/pipeline/stabilize.js |
| Side events (landing gate), rear events (calibrated lag) | js/pipeline/events.js, rear-events.js |
| Event tables, step timing, oscillation | js/pipeline/gait-events.js |
| Per-view metrics | js/pipeline/metrics.js, measurements.js, posterior-metrics.js, posterior.js |
| Reconciliation | js/pipeline/reconcile.js |
| Debug tab | js/views/debug.js |
| Tests (one command) | tools/test.py → test/unit.html (fixture regression on test/fixtures/clips) |
| Dev tools | test/batch.html (pose run on all clips), test/strip.html (event strips), test/export-frames.html, test/anchor-loco.js |

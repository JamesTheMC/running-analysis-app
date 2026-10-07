# View-to-metric map

Source of truth for which camera view each metric may be computed from. Enforced in code:
`allowedViews` on every metric in `js/config.js`, the pipeline emitter (`js/pipeline/emit.js`) and the
engine (`js/engine/analysis.js`), checked by `test/unit.html`. A value from a disallowed view is never
shown: the report says "not assessed from this view".

## Lateral clips (filmed from the left or the right)

Near leg and near arm only. Far-leg values are never used.

| Metric (config id) | Confidence cap | Scored | Timing rule | Notes |
|---|---|---|---|---|
| Foot strike pattern (`ic_foot_strike`) | low | no | IC-sensitive | Two categories, rearfoot vs non-rearfoot; foot angle at IC vs flat-foot midstance angle; 8° cutoff, source to be verified |
| Foot inclination at IC (`ic_foot_inclination`) | low | yes | IC-sensitive | Relative to the flat-foot midstance angle (heel-landmark offset) |
| Tibial inclination at IC (`ic_tibial_inclination`) | high | yes | IC-sensitive | + = ankle ahead of knee |
| Knee flexion at IC (`ic_knee_flexion`) | high | yes | IC-sensitive | 180 − interior angle |
| Max stance knee flexion (`ms_max_knee_flexion`) | high | yes | — | |
| Knee flexion excursion, IC → midstance (`ms_knee_flexion_excursion`) | high | no | IC-dependent | Midstance minus IC |
| Foot-to-COM distance (`ic_foot_to_com`) | medium | yes | IC-sensitive | Heel vs hip midpoint; + = overstride; cm from intake height |
| Forward trunk lean at IC / midstance (`ic_spine_lean`, `ms_spine_lean`) | high | yes | IC-sensitive (IC) | Trunk-angle proxy |
| Hip extension, late stance (`to_hip_extension`) | medium | no (until validated) | window-sensitive | Relative to the trunk axis |
| Trunk change, IC → peak hip extension (`trunk_change_peak_hip_ext`) | medium | no | IC-sensitive | Trunk-angle proxy |
| Ankle dorsiflexion at midstance (`ms_ankle`) | low | no | — | |
| Knee/ankle sync (`ms_knee_ankle_sync`) | — | — | — | Not measured by this build yet |
| Near-arm elbow angle, shoulder swing range (`arm_elbow_angle`, `arm_shoulder_rom`) | medium | no | — | Reported, not scored |
| Step rate from stride period | — | no | — | Unvalidated; display only |

## Posterior clip (from behind)

Both legs visible; landmarks are checked for left/right swaps and event quality is reported per leg.
L/R differences only when the swap check passes. Status: awaiting validation, not built yet.

| Metric (config id) | Confidence cap | Notes |
|---|---|---|
| Hip adduction at midstance (`ms_hip_adduction`) | medium | Thigh vs the perpendicular to the pelvis line |
| Contralateral pelvic drop (`ms_pelvic_drop`) | low, trend only | Change from loading response (segmentation-derived stance start) to midstance |
| Knee frontal-plane projection angle at midstance (`ms_knee_varus_valgus`) | low | |
| Trunk lateral lean (`ms_trunk_lateral_lean`) and lateral shift (`ms_lateral_shift`) at midstance | medium | Proxy, no PSIS landmark; shift in cm from intake height (hip-width fraction without height) |
| Spine shift, PSIS rule (`ms_spine_shift`) | — | Not assessed: threshold not confirmed |
| Foot position vs midline (`ms_foot_midline`) and crossover (`ms_crossover`) | medium | Heel vs pelvis midline at midstance; a leg's crossover pattern is "yes" when ≥ 50% of its steps cross |
| Step rate | — | Unvalidated |

## Never

- **Never from a posterior clip:** hip extension, knee flexion, forward trunk lean, tibial inclination,
  foot strike, overstride (foot-to-COM), any sagittal angle.
- **Never from a lateral clip:** hip adduction, pelvic drop, knee valgus/varus, lateral shift, crossover,
  arm crossover.

## Not built

Rearfoot eversion and Achilles angle (poor 2D reliability, tiny heel segment); out-toe and foot
progression angle.

## Not measurable in 2D

Pelvic tilt, lordosis, transverse-plane motion.

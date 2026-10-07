# Gait & Running Analysis App: Output, Scoring and Pipeline Spec

Paste this into the project root as `SPEC.md` (or into `CLAUDE.md`) so Claude Code has full context. Items marked **[CONFIRM]** are assumptions the owner has not yet confirmed.

---

## 1. Product context

- Owner/clinician: James, DPT, ATC, CSCS (sports PT, DMV area). Primary users are James and colleagues; outputs may be shared with clients (not "patients" in the UI).
- Platform: **web app (PWA) first**, mobile-first for iPhone/iPad. Native Swift rebuild only after validation. Built solo with Claude Code on a Mac. GitHub repo already exists.
- v1 input: **video upload only** (no live capture). Treadmill running.
- Privacy: videos may be real client gait video. **Process locally in the browser or on-device. No cloud upload of video.** Files are labeled by **client code + upload date, never client name.**
- Output is clinician decision support. The clinician reviews and edits everything before it is shared. Suggestions are phrased as considerations, not prescriptions.

## 2. Milestones

1. **Shell (first Claude Code session):** upload screen, intake form, results screen rendering the summary format below with **placeholder numbers**. Validate the flow on a real phone.
2. **Pipeline port:** port the Python/MediaPipe analysis (Section 7) to run client-side. Replace placeholders with real values.
3. **Scoring and pattern engine** (Sections 5 and 6).
4. **Rear-view metrics** and two-clip sessions.
5. Native iOS only if validated.

## 3. Intake form (shown when a video is uploaded)

| Field | Required | Notes |
|---|---|---|
| Client code | yes | No names. |
| Session date | yes | Defaults to today. |
| Camera view | yes | Side or rear. A session can contain one clip per view. |
| Height | optional | Used to scale pixels to cm (foot-to-COM distance, later stride and vertical oscillation). |
| Treadmill speed | optional | Context for interpretation and comparing sessions. |
| Treadmill incline | optional | Changes hip extension expectations. |
| Cadence (spm) | optional | From a footpod or treadmill display. **Do not derive cadence from video in v1** (unreliable in testing). |
| Running history, shoe history, insoles/orthotics, goals | optional free text | From the clinic's Video Running Analysis form. |

Weight is intentionally excluded for now.

## 4. Capture protocol

- **Side (sagittal) clip:** full body, level camera, good lighting, treadmill, ideally 60 fps, native camera file (not a screen recording).
- **Rear (posterior/frontal) clip:** same setup from behind.
- A single side camera can only track the **near-side arm** (the far arm is occluded for most of the cycle) and cannot assess arm crossover. Arm swing in v1 is near-side only; label it as such. Bilateral arm comparison needs a second pass filmed from the other side.
- Left/right labels: treat anatomical L/R as unreliable under occlusion. Prefer **near/far limb** or **lead/trail leg** labeling internally, and map to anatomical L/R using the filming side entered by the user.

## 5. Output: copy-paste summary

Plain text, one-tap copy button. Header line, then five sections in this order, then interpretation **at the bottom**:

```
GAIT ANALYSIS SUMMARY | <client code> | <date>
Speed: <x> | Incline: <x> | Cadence: <x>

ANKLE
<L / R values, % difference, status, one-line note or "not reliable, re-shoot">

KNEE
<knee flexion at IC, max stance knee flexion, L / R, % difference, status>

HIP
<hip extension L / R, % difference, status>

LUMBAR
<trunk lean at IC / midstance; trunk angle change at peak hip extension; status>
<always label as a trunk-angle proxy, never as measured lumbar kinematics>

ARMS
<near-side elbow angle and shoulder swing ROM; far side "not visible from this camera angle">

INTERPRETATION
<plain-language paragraph: key findings, pattern flags, considerations, items needing re-shoot>
```

Rules:
- Show **left/right values and the % side-to-side difference** wherever both sides are measurable. Asymmetry has no validated universal threshold in running, so present it as a trend, not pass/fail.
- If a metric is below the confidence floor, print "not reliable from this clip" and say why. Never print a guessed number.
- Interpretation is auto-generated now; the clinician can edit before copying.

## 6. Scored report (phase-based, matches the clinic's template)

Layout per phase, with Left and Right columns, a status color per cell (green normal, yellow caution, red flag), and a confidence tag (high / medium / low) per metric.

### 6.1 Metric table (ranges from the clinic's template)

Rows marked **P** were highlighted yellow on the template. **[CONFIRM]** whether yellow means priority metric; the scoring weight below assumes it does.

**Initial contact (side view)**

| Metric | Green | Red | Priority |
|---|---|---|---|
| Foot inclination | <10 deg DF if rearfoot strike | >10 deg DF | |
| Tibial inclination | -10 to +10 deg | beyond +/-10 | |
| Foot-to-COM distance | < 1/2 shoe length | > 1 shoe length | P |
| Knee flexion | 15 to 25 deg | <12 or >30 | P |
| Spine lean | 5 to 10 deg | <0 or >15 | |

**Midstance (side view)**

| Metric | Green | Red | Priority |
|---|---|---|---|
| Max knee flexion | 35 to 45 deg | >45 | P |
| Ankle at midstance | record value | none defined | |
| Knee/ankle sync | yes/no | | |
| Spine lean | 0 to 10 deg | >12 | |

**Midstance (rear view)**

| Metric | Green | Red | Priority |
|---|---|---|---|
| Pelvic tilt / drop (see open questions) | 0 to 6 deg | >6 | P |
| Hip adduction | 0 to 13 deg | >13 | P |
| Knee varus/valgus | -5 to +5 deg | beyond +/-5 | P |
| Out-toe | 1 toe | >2 toes | |
| Crossover pattern | yes/no | | |
| Spine shift | between PSIS | beyond PSIS | P |
| Achilles angle | 0 to 10 deg | >10 | |
| Rearfoot eversion | 4 to -4 deg | see open questions | P |

**Toe off (side view)**

| Metric | Green | Red | Priority |
|---|---|---|---|
| Hip extension | 5 to 15 deg | <5 with lordosis | |

### 6.2 Measurability from a phone video (MediaPipe 2D)

| Confidence | Metrics |
|---|---|
| Solid (side view) | Knee flexion at IC, max stance knee flexion, tibial inclination, spine lean, hip extension (after the signed-angle fix), foot-to-COM distance (needs height scale) |
| Usable, show with a confidence tag (rear view) | Hip adduction, spine shift, Achilles angle |
| Trend only | Pelvic drop, foot inclination, ankle angles |
| Low confidence | Knee varus/valgus, rearfoot eversion (small landmarks) |
| Not possible from 2D | Pelvic tilt/APT, lordosis, femoral rotation, transverse-plane motion, hallux DF, calcaneal inversion |

For the "<5 hip extension with lordosis" row: the app reports hip extension and adds a "check lordosis clinically" prompt. It does not claim to measure lordosis.

### 6.3 Scoring

- Per metric: green = full credit, yellow (between green and red bounds) = partial, red = zero.
- Priority (P) metrics count **double** **[CONFIRM]**.
- Low-confidence metrics are down-weighted, and metrics below the confidence floor are excluded and listed as "not assessed". A weak measurement must never lower the score.
- Section score per phase (Initial Contact, Midstance, Toe Off), plus one overall score. Show scores per side where possible.
- Final score formula is a first draft; make weights configurable in one config file.

### 6.4 Pattern flags (correlated weaknesses and instabilities)

Rules fire on combinations, not single metrics. Each pattern lists its triggers and a draft consideration for the clinician.

| Pattern | Triggers | Draft considerations |
|---|---|---|
| Overstride | Foot-to-COM high, knee flexion at IC low, tibial inclination positive, cadence low (if entered) | Modest cadence increase (commonly 5-10%; verify before shipping), cue landing closer under the body, review hip flexor/extensor control |
| Poor shock absorption | Knee flexion at IC low and max stance knee flexion well below ~45 | Eccentric quad and glute loading, cue "softer" landing, check footwear and surface |
| Limited hip extension | Hip extension <5, with overstride or high cadence | Hip flexor mobility and glute strength, reassess trunk position for compensation |
| Frontal-plane control | Hip adduction high, pelvic drop high, spine shift beyond PSIS | Hip abductor strength and single-leg control, step-width and crossover review |
| Trunk posture | Spine lean outside range at IC or midstance | Review cadence and speed context before cueing |

Output language: "consider", "may suggest", never diagnoses. Every pattern shows which metrics triggered it.

## 7. Analysis pipeline requirements (lessons from testing)

Validated in Python (OpenCV + MediaPipe Pose, legacy `mp.solutions.pose`, model_complexity=1) on a real 60 fps treadmill side-view clip.

1. **Tracking-failure gate.** MediaPipe's visibility score stays high (0.92+) on frames where the trailing leg is occluded, so confidence alone does not catch bad frames. Add a **rigid-segment consistency check**: compute tibia (knee-ankle) length per frame, flag frames where the robust z-score (median/MAD) exceeds 6, and exclude them. About 1.6% of frames were flagged in the test clip, confirmed visually at max stride separation.
2. **Do not use a frame-to-frame angle-jump detector** as an error check. It mostly flags genuine fast swing-phase motion.
3. **Gait-cycle segmentation from one reference signal.** Independent per-leg peak detection gave 11 vs 15 cycles on the same clip (an artifact of occlusion). Segment from a single reliable signal and assign events to each leg from it, so left/right comparisons are valid.
4. **Joint angle conventions.**
   - Knee flexion = **180 minus the interior knee angle**. Report flexion, not interior angle.
   - Hip extension needs a **signed** thigh-to-trunk angle relative to neutral. **Decision (clinician): hip extension is measured relative to the trunk axis (shoulder-hip line), not relative to vertical.** An unsigned shoulder-hip-knee angle saturates at 180 and cannot measure extension beyond neutral, so it must not be compared to the 5-15 deg norm.
5. **True initial-contact detection** is required for IC metrics. A "peak knee extension" proxy is not the same thing as IC.
6. **Trunk angle** is shoulder-to-hip line vs vertical. It is overall trunk lean only. MediaPipe has no spine or pelvis landmark, so it cannot isolate lumbar extension or pelvic tilt.
7. **Scale and distance metrics** (foot-to-COM, stride length, vertical oscillation) require the height-based pixel-to-cm scale from intake.
8. **Cadence from video:** skip in v1. Three methods disagreed on a re-encoded screen recording. Revisit only with native full-frame-rate capture.
9. Offline note: the MediaPipe Tasks API downloads models at runtime. If the web app must run offline or without external hosts, bundle models locally.

## 8. Evidence notes

Supported by sources reviewed:
- Peak stance knee flexion is typically about 45 deg; much lower values suggest less shock absorption (Souza, 2016).
- Limited late-stance hip extension is associated with overstriding and compensatory higher cadence (Souza, 2016).
- Vertical displacement of the COM is typically about 6-10 cm (van Oeveren et al., 2021).
- Restricted hip extension is linked to greater anterior pelvic tilt and lumbar compensation in runners.
- Cadence of 160-190 spm is a commonly cited range.
- 2D frontal-plane reliability (treadmill running): hip adduction shows strong validity and reliability against 3D; contralateral pelvic drop is reliable between repeated measures but did not correlate significantly with 3D in one study; knee varus/valgus has weak 2D validity (partly a rotational motion).

Known discrepancy: the template's knee flexion at IC of 15-25 deg differs from the roughly 30-40 deg figure cited in some clinical writing (Powers, 2018). Published values vary by method. **Decision: keep the clinic's range as the app's convention and label it as the clinic template range.**

## 9. Open questions for the owner

1. Do the yellow rows mean priority metrics (double weight)?
2. Template row "Pelvic Tilt 0-6": is this pelvic drop (rear view, frontal plane)? Pelvic tilt itself is not measurable from 2D.
3. "Knee Val/Var" red range reads ">5 or >5"; presumably <-5 or >5.
4. "Rearfoot Eversion" green 4 to -4 with red "> -4" overlaps; confirm the intended red threshold.
5. Arm swing: near-side-only in v1, or require two passes (one per side)?
6. Should the template's remaining form items (head vertical rise 5 cm, trunk lateral shift 2 cm, pelvic drop 5 deg, knee flexion wave 25 deg, ankle DF at terminal stance 20 deg, PF at pre-swing 20 deg, calcaneal inversion/eversion, foot abduction 15 deg, hallux DF 75 deg) be added in a later phase? Most need the rear view, a scale reference, or are not measurable in 2D.

## 10. Suggested first Claude Code prompt

> Read SPEC.md. Scaffold the PWA shell only (Milestone 1): upload screen, intake form (Section 3), and a results screen that renders the copy-paste summary (Section 5) and the phase-based scored report (Section 6) using **placeholder data** in the exact shape described, with a one-tap copy button. Keep the metric ranges, weights and pattern rules in a single config file. Simple, clinical visual design. Do not implement pose detection yet.

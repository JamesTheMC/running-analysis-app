# Footage-quality gate: calibration (2026-10-15)

Module: `js/pipeline/footage-checks.js` (thresholds in `FOOTAGE`). Research script:
`python3 tools/gate_features.py` (feature table), `--checks` (verdicts with the chosen thresholds; it mirrors
the module), `--partial=150` (first 150 analysed frames only). JS check against the research script:
`test/gate-check.html` (also headless with `?headless=1`); its values match the Python mirror to 3 decimals
on all 48 runs (24 clips × whole fixture / first 150 frames).

Data: the 24 committed landmark fixtures (client codes only, no video).
- **Good** (must pass): C0 (120 fps, analysed at 60 Hz), T1, T2, T3 (30 fps); portrait 486×864 analysed,
  hip-height camera. Only **2 runners** (T1–T3 are one runner at three speeds).
- **Problem** (must warn/fail with the right reason): AR, AZ, CD, CH, JW, ML, RQ, RY; 1280×720 landscape
  (576×324 analysed), 30 fps, floor-level camera with a wide-angle lens; side: treadmill console crosses the
  hips; rear: near swing foot magnified; CD side 960×572 cropped (432×257 analysed), head out of frame.
  The new runners' fixtures are 30 s excerpts (900 frames).

## 1. Feature table (whole fixture)

Side = near leg (smaller depth z), rear = both legs. "Sep" = separates good from problem with a gap.

### Side view
| Feature | C0 | T1 | T2 | T3 | AR | AZ | CD | CH | JW | ML | RQ | RY | Sep |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Worst lower-limb joint visible (share ≥ 0.5) | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | no |
| Hip visibility (mean) | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | no |
| Hip jumps > 0.25 thigh / frame | 0 | 0 | 0 | 0 | 0 | 0 | 0.054 | 0 | 0 | 0 | 0 | 0 | CD only |
| Head at top 3% or not found | 0 | 0 | 0 | 0 | 0 | 0 | 0.050 | 0 | 0 | 0 | 0 | 0 | CD only |
| Hip height in body outline (0 top, 1 feet) | .475 | .478 | .476 | .477 | .415 | .431 | .254 | .443 | .454 | .401 | .400 | .431 | yes (2 pts) |
| Lower body / trunk (ankle–hip ÷ hip–shoulder, vertical) | 1.29 | 1.28 | 1.28 | 1.29 | 1.45 | 1.49 | 2.53 | 1.44 | 1.36 | 1.60 | 1.55 | 1.35 | yes (5%) |
| **Proportion deviation** (max of the two, vs 0.476 / 1.285) | .005 | −.004 | .000 | .001 | .129 | .163 | .972 | .118 | .055 | .241 | .209 | .094 | **yes** |
| Near−far contact level (shank lengths) | .091 | .065 | .085 | .065 | .032 | −.048 | .070 | .065 | .037 | .074 | .053 | −.030 | partly |
| Stance heel path slope (°) | −1.0 | 0.6 | 0.2 | 0.9 | −3.6 | 0.7 | 0.8 | −0.9 | 0.4 | 0.7 | 0.7 | −0.4 | no |
| Hip width / trunk | .059 | .056 | .043 | .058 | .046 | .085 | .150 | .055 | .048 | .060 | .044 | .036 | no |
| Body height / frame height | .53 | .58 | .59 | .58 | .68 | .69 | .68 | .57 | .71 | .58 | .68 | .65 | no |
| Body height, analysed px | 456 | 499 | 505 | 500 | 220 | 224 | 176 | 186 | 231 | 188 | 220 | 211 | yes (confounded) |
| Shank / thigh | 1.06 | 1.03 | 1.05 | 1.03 | 1.12 | 1.05 | 1.26 | 1.11 | 1.09 | 1.07 | 1.08 | 1.07 | no |
| Leg length variation (p90−p10)/median | .20 | .09 | .09 | .09 | .25 | .18 | .43 | .07 | .10 | .09 | .07 | .31 | no |
| Near/far leg length ratio | 1.06 | 1.08 | 1.09 | 1.08 | 1.06 | 1.06 | 1.09 | 1.08 | 1.08 | 1.09 | 1.10 | 1.05 | no |
| Ankle/toe visibility drop when fast | .003 | .001 | .000 | .000 | .001 | −.002 | .001 | .001 | −.001 | −.003 | .001 | .000 | no |

### Rear view
| Feature | C0 | T1 | T2 | T3 | AR | AZ | CD | CH | JW | ML | RQ | RY | Sep |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Worst lower-limb joint visible | 1.00 | .975 | 1.00 | .999 | .896 | .904 | .790 | .997 | .947 | 1.00 | 1.00 | .700 | partly |
| Hip jumps | 0 | 0 | 0 | 0 | 0 | 0 | .077 | 0 | 0 | 0 | 0 | 0 | CD only |
| Head at top 3% or not found | 0 | 0 | 0 | 0 | 0 | 0 | .207 | 0 | 0 | 0 | 0 | 0 | CD only |
| **Foot length / hip width** (median of the longer foot) | .210 | .288 | .258 | .255 | .556 | .419 | .771 | .382 | .417 | .444 | .364 | .351 | **yes (22%)** |
| Foot / shank | .093 | .129 | .119 | .117 | .271 | .198 | .258 | .174 | .211 | .176 | .134 | .166 | yes (4%) |
| Hip height in body outline | .446 | .451 | .452 | .450 | .409 | .431 | −.18 | .433 | .439 | .395 | .411 | .415 | yes (2 pts) |
| **Left/right shank ratio, p90** | 1.44 | 1.43 | 1.41 | 1.36 | 4.25 | 2.84 | 2.22 | 1.50 | 2.42 | 1.65 | 1.45 | 5.67 | yes (RQ, CH close) |
| Shoulder+hip line tilt (°) | −2.6 | 0.6 | −0.2 | 0.0 | 4.0 | 3.0 | 4.9 | −0.7 | 0.0 | 2.0 | 2.1 | 2.1 | no |
| Off-centre (hip widths) | −.14 | .11 | .13 | .06 | −1.01 | −.28 | 2.70 | −.35 | −.43 | −.93 | −.42 | −.66 | no |
| Ankle/toe visibility drop when fast | .002 | .002 | .000 | .001 | .070 | .074 | .160 | .003 | .073 | .011 | .000 | .145 | partly |
| Body height, analysed px | 520 | 557 | 562 | 558 | 208 | 195 | 130 | 179 | 206 | 213 | 198 | 192 | yes (confounded) |

Other features computed and rejected (no separation): hip visibility relative to knee/shoulder, hip and
distal jitter (second difference / thigh), share of feet near the edge, size variation, thigh/shank length
variation, correlation of segment length with position in the frame, far-leg visibility.

## 2. Chosen checks and thresholds

| Check id | Measure | Pass | Warn | Fail | Good clips | Problem clips |
|---|---|---|---|---|---|---|
| lower_limb_visibility | worst of hip/knee/ankle/heel/toe, share of frames visible (≥ 0.5) | ≥ 0.93 | < 0.93 | < 0.80 | ≥ 0.975 | rear AR .90, AZ .90 warn; CD .79, RY .70 fail |
| hip_occlusion | hip visible share; hip vis ÷ (knee+shoulder)/2; hip jumps > 0.25 thigh/frame | — | vis < 0.9, rel < 0.85 or jumps > 1% | vis < 0.7 or jumps > 3% | jumps 0 | CD side .054, rear .077 fail |
| framing | head at top 3% / not found; foot beyond an edge | — | head > 1%, feet > 20% | head > 3%, feet > 40% | head 0; feet ≤ .028 (.107 first 150 fr, T1 side) | CD side .050, rear .207 fail |
| camera_height (side) | proportion deviation; near−far contact level (needs ≥ 10 s) | — | dev > 0.04 or gap < 0.03 | dev > 0.10, or dev > 0.04 with gap < 0.045 | dev ≤ .005; gap ≥ .065 | all 8 fail (JW via dev .055 + gap .037; RY dev .094 + gap −.03) |
| camera_height (rear) | foot length ÷ hip width; hip-height deviation (ref 0.449) | — | > 0.32 or dev > 0.06 | > 0.34, or > 0.32 with dev > 0.05 | ≤ .288 | all 8 fail (.351–.771) |
| camera_tilt | side: slope of the near heel's lowest 15% positions (needs ≥ 4 s); frontal: mean of median shoulder- and hip-line angles | — | side > 3°, frontal > 5° | never | ≤ 1.0° / ≤ 2.6° | AR side −3.6° warn |
| squareness | side: hip width ÷ trunk; frontal: pelvis off-centre in hip widths (same as rear-events.js) | — | > 0.12 / > 0.5 | > 0.25 / > 1.5 | ≤ .059 / ≤ .14 | CD side .150 warn; rear AR, ML, RY warn, CD fail |
| wide_angle | frontal: p90 of left/right shank ratio (needs ≥ 4 s); side: not measured (na) | ≤ 1.6 | > 1.6 | > 2.0 | ≤ 1.44 | AR, AZ, CD, JW, RY fail; ML warn; CH 1.50, RQ 1.45 pass |
| runner_size | body height ÷ frame height; px tall in analysed frame | — | < 0.35, > 0.9, or < 300 px | < 0.2 | .53–.65, 456–562 px | all 16 warn (130–231 px) |
| frame_rate | meta.fps | ≥ 24 (advisory below 100) | < 24 | never | 120 / 30 pass | 30 pass |
| motion_blur | ankle/toe visibility, slow minus fastest-quarter frames (needs ≥ 4 s) | ≤ 0.03 | > 0.03 | never | ≤ .003 | rear AR, AZ, CD, JW, RY warn |
| lighting | optional meta.luma {mean, p5, p95} from `lumaFromImageData` | — | mean < 50 or > 220, p95−p5 < 40 | mean < 30 | na (no data) | na |

Summary (`summariseChecks`): level = fail if any check fails, else warn if any warns, else pass.
score = 0.85^warns × 0.4^fails ('na' ignored). Fixes are de-duplicated, failing checks first, then by
importance (framing, camera height, hips, lens, visibility, size, squareness, tilt, blur, light, fps).

Partial clip (first ~150 analysed frames): checks needing several strides (side tilt, rear wide angle,
motion blur) are 'na' ("needs more of the clip") below 4 s of posed frames (C0 at 60 Hz: 2.5 s); the side
contact-level part of camera_height needs 10 s (in the first 150 frames it read 0.045 on T1 side).

## 3. Result (confusion)

| Set | Whole fixture | First 150 frames |
|---|---|---|
| Good clips passing (C0, T1–T3, side + rear) | **8 / 8** | **8 / 8** |
| Problem clips warn/fail with a correct reason | **16 / 16** | **16 / 16** |

Per clip (whole fixture; main reasons in order):
| Clip | Verdict | Reasons |
|---|---|---|
| C0, T1, T2, T3 side + rear | pass | 30 fps advisory on T1–T3 (pass) |
| AR side | fail | camera height (dev .129); tilt −3.6° (warn); runner small in px |
| AZ side | fail | camera height (.163; contact level −.048) |
| CD side | fail | framing (head cut 5%, runner lost 13%); camera height (.97); hip position jumps (5%); squareness .15 |
| CH side | fail | camera height (.118) |
| JW side | fail | camera height (.055 + contact level .037) |
| ML side | fail | camera height (.241) |
| RQ side | fail | camera height (.209) |
| RY side | fail | camera height (.094 + contact level −.030) |
| AR rear | fail | camera height (feet .56 of hip width); wide angle (4.3×); visibility .90; blur |
| AZ rear | fail | camera height (.42); wide angle (2.8×); visibility .90; blur |
| CD rear | fail | framing (head 21%); camera height; hip jumps; visibility .79; off-centre; wide angle |
| CH rear | fail | camera height (.38) |
| JW rear | fail | camera height (.42); wide angle (2.4×); blur |
| ML rear | fail | camera height (.44); wide angle warn (1.65×); off-centre |
| RQ rear | fail | camera height (.36) |
| RY rear | fail | camera height (.35); wide angle (5.7×); toes visible 70%; blur |

In the first 150 frames JW side and RY side drop to **warn** (camera height dev only; the contact level
needs 10 s); all others keep their verdict.

## 4. What could not be detected reliably (honest limits)

- **Console hiding the hips (side view): not detectable from landmarks.** MediaPipe reports hip
  visibility ≈ 1.00 in every clip, including the 8 where the console crosses the pelvis; it guesses the
  hidden hips from the rest of the body. Hip jitter, jumps and hip-vs-knee/shoulder visibility do not
  separate them either (only CD, whose tracking breaks, shows hip jumps). These clips are caught by the
  **camera height** check instead (the proportions it measures are also distorted when the hips are
  guessed), and the fix text for camera height tells the user to raise the camera, which also clears the
  console. A reliable occlusion check would need image evidence (e.g. a person-segmentation mask).
- **Wide-angle lens on the side view: not separable** from the floor-level camera with landmarks (segment
  length variation, near/far leg size and position-dependent size all overlap). The side check returns
  'na'. On the rear view the strong close-range magnification of the swing leg (p90 shank ratio) is
  measured, but it reflects camera distance + lens together, not the lens alone; CH (1.50) and RQ (1.45)
  are not flagged by it.
- **Camera height from body proportions** relies on 2 good runners (C0 and one T runner), whose values are
  very close (side 1.275–1.291, 0.475–0.478). Real leg/trunk proportions vary between people (roughly
  ±3–5%), so the deviation thresholds (warn 4%, fail 10%) may flag a long-legged runner filmed correctly
  (warn), and JW (5.5%) fails only because the contact-level cue agrees. The rear foot-length cue is
  stronger (a 22% gap and a physical reason: from a low camera the soles face the lens). Re-check both
  when correctly filmed clips of more runners exist. **Provisional.**
- **Camera tilt**: the frontal estimate includes the runner's own shoulder/pelvis posture, so its
  threshold is loose (5°); the side estimate (stance heel path) flagged only AR side (−3.6°), which is
  plausible but not verified against the video.
- **Motion blur**: the rear visibility drop in fast frames can also come from the swing foot hiding
  behind the other leg or a sole facing a low camera; it never fails a clip, only warns. Not seen on side
  clips.
- **Runner size in analysed pixels** (< 300 px, all 16 problem clips at 130–231 px vs 456–562) is
  confounded: landscape filming + the pipeline's fixed 0.45 downscale. It is a warn-only advisory to film in
  portrait; its causal effect on accuracy is not shown. If the analysis scale changes, re-check it.
- **Lighting** cannot be measured from landmarks; thresholds on `meta.luma` are provisional (no clips
  with brightness data yet); the check is 'na' when `meta.luma` is absent.
- **Off-centre** (rear squareness) warns on AR, ML, RY (0.66–1.0 hip widths): in a landscape frame a hip
  width is small, so the same pixel offset reads as more hip widths. Same threshold as the existing
  rear-events.js check.

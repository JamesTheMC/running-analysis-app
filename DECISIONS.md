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

## Phase 5: validation follow-up (2026-10-09)
- **Foot-to-COM gated behind `VALIDATION.footToComValidated` (false): above-range values show
  "pending validation", unscored, no pattern trigger.** Why: over-reads ≈ 9 cm vs blind manual
  annotation (reference/VALIDATION.md), about the size of the healthy mean. Y
- **Knee flexion at IC and tibial inclination confidence lowered from high to medium.** Why: ≈ 10° and
  ≈ 8° mean absolute error vs manual annotation. Y
- **Capture protocol: the treadmill's side upright must not cross the near leg.** Why: overlays show
  the knee landmark pulled onto the upright. Y
- **Frames for annotation are exported in the browser (test/export-frames.html), not with OpenCV.**
  Why: no Python OpenCV on this Mac; uses the app's own decoder, so frame indices match exactly. Y
- **2026-10-09: Clinician hip offset (20 frames: 0.159 back, 0.062 up, thigh lengths) stored but not
  applied.** Why: applied to the hip alone it made knee, hip-extension and foot-to-COM errors larger
  vs manual annotation (other leg landmarks share the forward bias). Alt: apply anyway (rejected:
  less accurate); whole-leg correction (next). Y
- **2026-10-09: Clinician decision: hip extension stays unscored (`hipExtensionValidated = false`).**
  Why: ≈ 8° error vs manual annotation at the peak frame, about the width of the 5–15° range.
  Revisit after the whole-leg landmark correction. Y
- **2026-10-09: Clinician decision: max stance knee flexion uses the clinic template (green 35–45°,
  red > 45°), not the provisional 40–55°.** Literature context kept in the config note (healthy
  ≈ 45°). Confidence lowered to medium (validation). Y
- **2026-10-09: Clinician decisions on provisional thresholds:** foot-to-COM keeps ≤ 13 / > 17 cm;
  hip adduction keeps 0–13°, red > 13°; spine shift "beyond PSIS" = median shoulder-midpoint shift
  > 5 cm (needs height; without height the provisional 0.25 hip-width rule is used). Y
- **2026-10-09: Clinician decisions:** crossover keeps ≥ 50% of steps; knee/ankle sync becomes
  record-only (no flag, unscored) because the ankle angle is ≈ 20° off vs manual annotation. Y
- **2026-10-09: Whole-leg anchor applied to near-leg points on lateral clips (`LEG_ANCHOR`).** Alt:
  hip-only (made angles worse), none (≈ 50–75 px forward bias). Why: leave-one-stride-out errors
  lower for point positions and most angles (reference/VALIDATION.md). Limits: fitted on one runner
  and setup; refit when new clips are annotated. Y
- **2026-10-09: Far leg re-tested at the owner's request; still not used.** Why: 26% of far-leg
  points swapped onto the near leg, 2 of 6 far midstances with whole-foot swaps (knee errors up to
  61°), 1 of 6 far ICs wrong; not detectable from visibility or foot spacing. A whole-leg offset
  cannot fix this. Bilateral side values = one clip per side. Y

## Reconciliation phase (2026-10-10)
- **Side-view landing gate: a frame counts toward stance (growing back toward IC) only if the slower
  of heel and toe is not moving forward faster than 25% of belt speed.** Alt: height only (T2/T3: the
  low, forward-swinging foot merged into stance, 0 valid strides); "must move backward" (cut C0
  toe-off early); gate on both sides (same). Why: on a treadmill the loaded foot is carried backward;
  swing travels forward. Toe-off stays on height (frame strips: C0 f3884–3901 showed the gate ending
  stance while the toe was loaded). C0 events unchanged except 7 outlier ICs that had 430 ms
  contacts. This supersedes the earlier "do not change side-view event detection" rule, because the
  owner's new brief asks for view-specific event detection. Y
- **Contact share validity 20–65% of the stride (was 20–50%).** T2/T3 runners have ~50–55% contact
  with no flight phase (T2 strip f234–253). Y
- **Stride period = shortest autocorrelation peak ≥ 80% of the best (was: best peak).** T1 picked
  2 strides (1.3 s), halving cadence in both views. Y
- **Cadence = 120 / mean of stride durations within ±25% of the median (was: median duration or
  autocorrelation lag).** At 30 fps durations are whole frames (19 or 20), so medians move in ~9 spm
  steps; the mean over 40+ strides resolves ~0.5 spm. Y
- **Time-based parameters: stance gap bridging is 0.035 s (2 frames at 60 Hz, 1 at 30 Hz).** Y
- **Mirrored video: detected from the tkhd matrix determinant and undone at decode (frames are
  flipped back before pose estimation).** Alt: swap L/R labels afterwards (rejected: the model's own
  left/right inference would already be on a mirrored body). No current clip is mirrored; covered by
  a unit test on synthetic matrices. Y
- **Frame timing recorded per clip (`meta.frameTiming`); all event/metric times use timestamps or
  seconds-based parameters.** All clips are constant-rate (±1.7 ms jitter). Y
- **Posterior midstance timing sweep is ±33 ms (was ±2 frames, which doubled to ±67 ms at 30 fps).** Y
- **Landmark stabilisation before metrics (js/pipeline/stabilize.js): points below visibility 0.5
  dropped, gaps ≤ 0.1 s linearly filled (marked in `row.filled`), Savitzky–Golay order 2 with a
  0.1 s window (5 samples at 30 Hz, 7 at 60 Hz ≈ 8–10 Hz low-pass).** Alt: no smoothing (C0 knee
  jitter 9°); 0.15–0.2 s windows (stance knee peaks lowered 5–10°); moving average (flattens
  peaks). Events stay on raw landmarks. The second smoothing pass on the knee and arm series was
  removed (no double smoothing). Y
- **Far leg on lateral clips: low confidence, never reported (see far-leg validation, 26% swaps).** Y
- **Reconciliation layer (js/pipeline/reconcile.js) produces one result per client (schema
  `gait-session/1`), alongside the existing summary path (mergeSession + engine, unchanged).** Alt:
  rewrite the engine around it (rejected: the summary presentation is out of scope this phase). Y
- **Left/right convention: anatomical everywhere. Lateral near leg from MediaPipe depth when the
  hip/knee/ankle depth gap is ≥ 0.2 (all clips: 0.5–0.6); a clip put in the wrong side slot is moved
  to the matching slot with a warning (or refused if that slot is taken).** Alt: trust the slot
  (would silently measure the occluded leg). Posterior: runner's left = image left after un-mirroring;
  swap frames counted. Y
- **Views are aligned on the gait cycle, never on clock time (separate recordings).** Shared
  quantities cross-checked: cadence (±3%), step time per side (± one analysed frame of the coarser
  clip, ≥ 20 ms), step-time asymmetry (±5 points), vertical oscillation (side only, see below),
  contact time (side only). Agree → stride-weighted value; disagree → the view with higher event
  confidence, ties broken by mean landmark visibility; discrepancy recorded. Y
- **Step timing from running-mean crossings of the alternation signals with hysteresis (side:
  inter-ankle separation; rear: left-minus-right foot height); a view whose crossings are > 20% off
  two-per-stride is marked unreliable.** Raw peaks/zero crossings biased asymmetry 15–27%. C0-side is
  marked unreliable (far-ankle swaps), after three attempts. Y
- **Rear-view IC/TO = foot-height crossings, LOW confidence, used for step timing only; contact time
  is side-view only.** Y
- **Vertical oscillation: side view authoritative; rear values (40–75% higher on all clients:
  fore-aft drift toward the camera) shown for information only.** Y
- **Metric confidence = lowest of: measured-stride share vs the metric's 2D cap, gait-event
  confidence of that leg/view, timing/IC/window sensitivity, validation error (> 5 → medium,
  > 10 → low; unvalidated → at most medium), pending clinician validation; every downgrade keeps a
  reason.** Y
- **New posterior metrics, data only (no summary line yet): step width (heel-to-heel at midstance,
  cm) and arm crossing midline (wrist past the shoulder midpoint).** Arm crossing is not assessed on
  T1–T3 (wrists hidden from behind, visibility 0.1–0.2). Y
- **Debug tab: skeleton overlay on the clip's frames, event timeline with confidence, per-metric
  confidence and reasons, cross-view checks, copy-JSON.** Y
- **Treadmill speed is not estimated from video (rejected).** Belt speed from the planted foot plus
  the height scale gave 3.7–9.5 mph for clips entered as 6–8 mph, not even in rank order (30 fps
  foot velocity too noisy). Step and stride length need the entered speed; blank speed → not
  computed, noted in the result. Y
- **Rear-view IC/TO shifted back by a calibrated lag (IC 100 ms, TO 120 ms) measured against blind
  frame marking on 4 clients; pelvic-drop loading response uses the calibrated IC.** Alt: no
  correction (pelvic drop measured from almost midstance); a per-clip foot-speed detector (abandoned
  earlier: perspective). Recalibrate when more marked clips exist. Y
- **Side-view events accepted as is (IC within one frame, TO within 1–2 frames at 30 fps).** Y
- **Whole-leg anchor OFF for all clips (2026-10-10).** Alt: keep the C0 fit (worse on T1–T3), pool
  all clients (offsets disagree in direction; reference knees unreliable). Why: leave-one-client-out
  shows no transfer. Future: per-setup calibration from clinician clicks. Y
- **T1–T3 hand-marked knees rejected as a reference (implausible 1–21° midstance flexion); side-view
  knee validation uses C0 (owner spot-checked).** Y
- **Validation errors feed confidence automatically (`VALIDATION_ERROR` in reconcile.js).** Y
- **2026-10-12: Foot-to-COM stays behind its validation gate.** Clinician marks on T1–T3 gave
  2.4 cm mean error (accurate), but C0 read 9 cm high; one setup is not enough to lift the gate. Lift
  it (`VALIDATION.footToComValidated = true`) after a second clinician-checked setup agrees. Y
- **2026-10-12: Clinician range decisions.** Tibial inclination at IC: green 0–8°, red > 10°. Knee
  flexion at IC: green 14–30°, red < 10° (overstride trigger now < 14°). Forward trunk lean at IC and
  MS: green 0–15°, red > 20° (wide because of the 6–7° direction-dependent bias). Trunk change at peak
  hip extension: < 5° kept, caution only. Foot inclination at IC: template kept, under investigation
  with higher-frame-rate clips. Cadence triggers 160 / 190 spm kept. Y

## Presentation phase (2026-10-12)
- **One presentation model (js/presentation/model.js) feeds both the results screen and the
  copy-paste text.** Alt: keep the separate engine summary (two renderings drifted). Y
- **A coloured status is shown only for scored values at medium/high confidence with no hedge;
  everything else shows its value with a plain-language hedge.** (HANDOFF §4.) Y
- **Measurement-error rule: a green value is hedged when its validated error band reaches the flag
  level; a caution/flag value is hedged when the band reaches normal.** Alt: hedge whenever the band
  crosses any boundary (made almost every value "borderline"). Y
- **A correlated finding is low confidence when any of its triggers is hedged.** Y
- **Pelvic drop is listed under "not reported" with the reason, never shown as a value.** Y
- **Research-linked suggestions come only from verified literature (reference/corrections-evidence.json:
  37 PubMed records, abstracts; two spot-checked by me). "Primary" only when the finding rests on
  values with a shown status; otherwise "Consider". Step-rate cues are personalised to the runner's
  cadence.** Strengths: step rate for overstride moderate; most others limited/very limited; no
  tested cue for limited hip extension, arm crossing, lateral trunk lean. Y
- **Results tabs: Results (visual), Summary text (copy), Debug. The old "Scored report" tab is
  replaced; scores are shown in the Results tab.** Y

## Multi-runner benchmark (2026-10-13)
- **8 new runners (AR, AZ, CD, CH, JW, ML, RQ, RY) run through the pipeline; all 16 clips are a
  different setup: 720p landscape, camera at floor level with a wide lens, console/upright crossing
  the hips (side) and the near swing foot magnified (rear); CD also crops the head.** Y
- **CS/CD resolved: same runner.** The rear file is now named CD; side and rear show the same shoes
  (teal/white, yellow soles) and build. Y
- **Stride signal drift removed (1.5 s running mean) before period estimation.** The oblique camera
  made the inter-ankle signal drift with belt position, halving the stride period. C0/T unchanged. Y
- **Velocity fallback for side events (foot carried back by the belt) when the height method finds
  < 50% valid strides.** On T1–T3 it agrees with the validated height events within ±1 frame. Y
- **Leg-identity continuity correction built but OFF** (flagged legs crossing as swaps on C0). Y
- **After three attempts the new setup still gives 9–42% valid side strides and 0–20% rear
  midstances: workaround = capture-quality gate (js/pipeline/capture-quality.js).** Unsuitable clips
  give no values or timing, only the reason and re-filming advice; degraded clips are capped at low
  confidence; head/shoulders out of frame suppresses trunk and arm metrics. Thresholds from the data:
  side ≥ 75% valid strides suitable, < 50% unsuitable; rear ≥ 70% of expected midstances suitable,
  < 50% unsuitable; L/R swaps > 10% unsuitable; cadence outside 120–220 spm unsuitable. All 16 new
  clips are unsuitable; C0 and T1–T3 suitable. Y
- **New-runner fixtures are 30 s excerpts (900 analysed frames) of each clip** (keeps the repo small;
  the gate verdict is identical on the excerpt and the full clip). Y

## "Why it may be happening and what to work on" (2026-10-13)
- **Evidence: reference/limitations-evidence.json (75 PubMed records; 57 new, all PMIDs/DOIs
  matched to their records; 3 spot-checked by me), compiled into js/presentation/limitations.js
  with the list of verified PMIDs; a test fails if any shown citation is outside that list.** Y
- **The literature contradicts three proposed chains, and the app follows the literature:** weak
  glute max goes with a MORE upright trunk (Teng & Powers 2016), Thomas-test hip flexor length does
  not predict running hip extension and stretching does not change it (Schache 2000, Mettler 2019),
  quadriceps weakness is not linked to excess knee flexion (Moffit 2020). These show as "no tested
  link". Y
- **Full entry only for findings with a shown (trustworthy) status; borderline / low-confidence /
  pending findings get a "worth screening" note with the screen; "not reported" metrics get none.** Y
- **Chains sharing a limitation are merged (step rate: overstride + excess knee flexion + low cadence
  + contact time + vertical bounce; hip/pelvis control: hip adduction + knee valgus + crossover +
  lateral lean); top priorities ranked by findings explained, then evidence strength.** Y
- **Items are filtered by the direction of the finding** (excess vs too little knee flexion) so one
  entry never recommends opposing work; speed and fatigue are shown as context, not limitations;
  "2D valgus ≠ 3D abduction" is shown as a caveat. Y
- **Findings common to every benchmarked session (max stance knee flexion, tibial inclination,
  foot-to-COM) are softened to screening notes** (likely measurement bias or a tight range). Y
- **The new section replaces the earlier "What to work on" list** (its cues are inside the entries;
  one priority list instead of overlapping ones). Section text is editable on screen and is what the
  copy text and the print/PDF export carry. Y
- **Export = "Print / Save as PDF" (browser print with a print stylesheet; details expanded).** No
  three-phase still-image panels exist yet, so findings name their phase in text instead of linking. Y

## Any view combination, video check, guide, phase panels (2026-10-15)
- **Four clip slots, any subset: left side, right side, rear, front.** One explicit matrix in code
  (js/pipeline/view-matrix.js) and HANDOFF.md §9, kept identical by a test. Left side authoritative for
  left-leg sagittal values, right side for right-leg; trunk (midline) sagittal values from either side
  view, combined when both exist; frontal-plane values from the rear view. Two side views cross-check
  cadence, step times and step-time symmetry (existing reconcile cross-checks, now across any slots). Y
- **Front view is experimental.** No front-view clip exists to validate against, so front values run
  through the rear pipeline on mirrored landmarks (x → width − x, z → −z), are listed in a separate
  block, and are never scored, never findings, never in the corrective section, never reported timing.
  Alt: compute front metrics with their own formulas (unvalidated either way). Y
- **View detection from the pose, confirmed on a Clip check screen.** Shoulder width ÷ torso length
  (side 0.10–0.27, rear 0.67–0.82 on the 24 clips; threshold midway 0.425), left/right order for rear
  vs front, depth for the near leg. The clinician's choice wins over depth (the convention check still
  reports a disagreement). Pose runs once; changing the view re-runs only the view-specific steps. Y
- **Partial results: every cell is a value or "Not assessed: needs the <view>"** (shown, not hidden;
  previously missing-leg cells were hidden behind one header line). Coverage indicator = share of the
  41 reportable values whose authoritative view is present and passed the video check. Y
- **Scores are labelled with their basis** ("scored over N assessed values only; partial coverage …").
  `compareCoverage` warns when two sessions differ in coverage; the app has no in-app session
  comparison yet, so the warning is used by the re-validation report (before vs after). Y
- **Corrective entries say "Confirm with the <view>"** when a related trigger metric or the other leg
  was not assessed because its view is missing. Y
- **Video check levels pass / warn / fail** (were suitable / degraded / unsuitable). Fail: no values or
  timing; warn: all values capped at low confidence with the issue noted; pass: the clip quality score
  (0.85^warns × 0.4^fails) caps confidence below 0.85 (medium) and below 0.6 (low). Y
- **Footage checks calibrated on the 24 clips** (reference/GATE_CALIBRATION.md, research script
  tools/gate_features.py): camera height from body proportions (side) and foot length ÷ hip width
  (rear) carries the separation; 8/8 good pass, 16/16 problem clips fail with the camera-height
  reason (CD side also framing). **Known limitation:** the console hiding the hips is not visible in
  MediaPipe output (hips still reported at visibility ≈ 1); those clips are caught by camera height,
  whose fix also clears the console. Side-view wide-angle cannot be separated from camera height
  ('na'). Proportion thresholds rest on two well-filmed runners: provisional, re-check after re-filming. Y
- **30 fps passes with a note** (T1–T3 validated at 30 fps); warn below 24 fps. The guide asks 60 fps. Y
- **Runner size judged in source-video pixels** (analysed px ÷ 0.45), not analysed pixels, so a
  correctly framed landscape 720p clip is not warned (lead review of the calibration). Y
- **Quick video check after the first ~150 analysed frames**, shown while pose tracking continues
  ("before analysis runs" in practice: pose is the only slow step and it keeps going; the full check on
  the whole clip decides). Y
- **Lighting from frame brightness** sampled once a second during pose (32×18 copy; only the numbers
  are kept). Thresholds provisional (no dark clip to calibrate on). Y
- **Capture guide** = guide.html (printable one page, linked before upload); distances, heights,
  margin and warm-up marked provisional until the next filming session (REFILM_PROTOCOL.md). Y
- **One-command re-validation** `python3 tools/revalidate.py`: discovers clips named
  CODE_YYYY-MM-DD_VIEW_SPEED, poses them headless on this Mac (verified: a full T3 clip re-run
  headless reproduced every value exactly), runs the check, pipeline and validation against blind
  marks from test/mark-clip.html, and rewrites BENCHMARK.md §8 (before = the client's benchmark
  session and the §4 errors in reference/revalidation-baseline.json; after = the latest session). Y
- **Phase panels:** a still per phase per available view from the stride closest to the clip medians
  (best event confidence); toe-off panel shows the stride's PEAK hip extension frame (late stance),
  because hip extension is a peak metric (the toe-off frame read 0° vs the listed 5.1°). Arcs coloured
  only for trustworthy values. Rear: midstance only (rear IC/TO are low-confidence timing). Head blur
  on by default; mirrored clips drawn flipped to match the un-mirrored landmarks (untested: no mirrored
  clip exists). Y

## Reference analysis (2026-10-23)
- **reference/ and all derived material are gitignored** (videos, frames, contact sheets, transcripts;
  docs/reference-analysis/local/ for working notes). Already-tracked docs of ours in reference/ stay
  tracked. Alt: move reference videos elsewhere (not my call: the owner put them there). Y
- **ffmpeg from the `imageio-ffmpeg` pip package** (user install, no system change). Alt: Homebrew
  (not installed; system-wide), ffmpeg-static via npm (no Node.js). Y
- **No transcripts:** faster-whisper installed (local, free) but both audio tracks are digital silence
  (−91 dB). Y
- **Frames:** scene change > 0.06 (cap 150) plus every 2 s (cap 120); 8 × 2 contact sheets reviewed
  first, full frames for detail. A1-02 broken down by a subagent, reviewed against the same sheets. Y
- **App B (App.Onform) folder was empty:** documented, nothing to analyse. Y
- **Roadmap order = interface tools first** (review player, manual measurements, range scale,
  explainers), then the on-device session library, then measured angle curves; "ideal position"
  drawings, body maps, style labels, new metrics, overground, accounts deferred (reasons in ROADMAP.md).
  Alt: start with angle curves (most visible reference feature) — rejected: they rest on angles
  validated at events only. Y
- **Manual measurement tool included although the reference only shows an unused drawing-style icon**
  (A1-02 @ 00:00): clear clinical need, independent of validation; labelled manual and kept out of
  scores and the corrective section. Y
- **Review player angle labels are per frame, never coloured** (a frame's angle is not the validated
  per-stride median); no labels on a clip that failed the video check, but it stays playable to see why. Y
- **Manual measurements live in session.manual, outside the presentation model** (a test checks the
  model is byte-identical with and without them), with their own text/print section. Alt: add them as
  model rows (risk of entering scores or findings). Y
- **Range scale reads the config ranges** (single source); "above template range, under review" zones
  are drawn uncoloured. Y
- **Session library stores results only** (IndexedDB, this browser): no video, landmarks, clip file
  names (may contain names) or free-text history/goals. Alt: also store landmarks so saved sessions keep
  the player (rejected: more personal data, large). Reopened sessions show no player/panels (no video). Y
- **Comparison labels a change within the validated error as not a change**; values assessed in only
  one session are counted, not compared; different coverage warned. Y
- **Angle curves computed at analysis time** (stabilised landmarks, valid near-leg strides within ±35%
  of the median stride, ≥ 5 strides; median + 25–75% band), shown as measured, not scored. Alt: compute
  on screen from rows (lost for saved sessions). Y

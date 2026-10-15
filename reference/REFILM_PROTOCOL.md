# Re-filming validation protocol

One filming session that (1) tests the new Capture guide (`guide.html`) and (2) re-validates the
metrics on better footage. Runners are referred to by client code only. Videos never leave the device
and are never committed (they go in the gitignored `test-data/`).

## Goal
- Confirm that clips filmed with the guide pass the capture-quality gate in every view.
- Re-measure each metric's error (app vs hand marks) on good footage and compare with BENCHMARK.md §4.
- Confirm or change the guide's provisional settings (marked * in the guide).

## Who
- **T3** (one runner who already has validated data: T1–T3 are this runner at 8 / 7 / 6 mph, filmed
  at 30 fps portrait, side view from the runner's right + rear). Film all four views (left, right,
  rear, front) at **6 mph** (same as T3); ideally also 7 and 8 mph (new T2/T1 equivalents).
- **Two or three new runners** from the earlier unsuitable set (e.g. some of AR, AZ, CD, CH, JW, ML,
  RQ, RY), same four views, at their usual training speed. Keep their existing client codes.
- Height recorded for every runner (needed for cm values).

## Equipment and setup
As in `guide.html`: tripod, main 1x lens, landscape, 120 fps if offered (60 fps minimum), lens at hip height, level and square, about 3.5 m from the runner, 10% margin.
Also: tape measure (distance and lens height), phone level app or tripod bubble, PSIS tape dots for
the rear view, the log sheet below.

## Recording order (per runner)
1. Warm-up about 5 min at the test speed.
2. Set the camera for the first view, check the guide's checklist, record 45–60 s.
3. Move the camera (the runner keeps running at the same speed if possible): left → rear → right →
   front.
4. Repeat for each extra speed (T3: 6, then 7, then 8 mph), one speed per clip.
5. Optional, to test the provisional settings (T3 at 6 mph, left view only): one clip at about 2.5 m
   and one at about 4.5 m; one clip with the lens 20 cm above hip height; one clip at 60 fps if the
   main clips are 120 fps.

## Per-clip log
| File name | Code | Date | View | Speed | fps | Lens | Distance lens→runner (m) | Lens height (m) | Hip height (m) | Notes (light, console, clothing) |
|---|---|---|---|---|---|---|---|---|---|---|
| T3_2026-10-20_left_6.0mph.mov | T3 | 2026-10-20 | left | 6.0 mph | 120 | 1x | 3.5 | 1.15 | 1.12 | |

## After the session
1. **Copy** the clips into `test-data/` (gitignored), named per the guide:
   `CODE_YYYY-MM-DD_VIEW_SPEED`, e.g. `T3_2026-10-20_left_6.0mph.mov`. Client codes only.
2. **Run the re-validation** (one command, from the repo folder):
   `python3 tools/revalidate.py`
   It runs the capture-quality gate, the full pipeline and the validation on every new clip, and
   updates BENCHMARK.md with before / after numbers per metric, per view and per runner.
   (This command is being built separately; this protocol only describes its use.)
3. **Hand-mark frames, blind to the app's values.** About 10 frames per clip, spread across initial
   contact, midstance and toe-off of different strides. Use the marking page
   `test/mark-joints.html` (open it through the dev server, `python3 tools/devserver.py`, then
   http://localhost:8000/test/mark-joints.html):
   - It shows one exported frame at a time (crops saved as `test-data/debug/annotate_<frame>.png`
     by `test/export-frames.html`, which draws no landmarks so the marker stays blind).
   - Click the near-side **hip, knee, ankle and heel** in order; the next point is selected
     automatically. Click a step to re-place a point; tick "Unsure" when the near leg is unclear;
     Previous / Next / Clear frame.
   - Marks save as you go to `test-data/debug/clinician_marks.json` (this computer only).
   - Today the page's frame list is fixed to the 30 T1–T3 side frames (`vcrop_01`…`vcrop_30`) and
     its instructions describe a runner facing right. For the new clips the frame list and the text
     must be updated for the new exports (left-side and rear frames included); rear frames need the
     rear point set (shoulder, hip, knee, ankle, heel) used by `test/annotation-compare.js`.
4. **Compare:**
   - **T3 new vs earlier T3** (6 mph): expected agreement within the validated error: knee ±7°,
     hip extension ±3°, tibial inclination ±2°, hip adduction ±3°; cadence within 3%.
   - **New runners:** app vs hand marks, per metric and view (bias and mean absolute error).

## Success criteria
- The capture gate passes on **every** new clip filmed per the guide.
- Per-metric errors at or below the current cross-runner errors in BENCHMARK.md §4 (e.g. side knee
  10.1°, tibial 8.3°, hip extension 6.4°, trunk lean 6.7°, ankle 10.4°, rear hip adduction 3.4°,
  rear knee frontal 8.0°, trunk lateral lean 2.5°).
- Side vs rear cadence within 3%.
- Left vs right side views agree on cadence (within 3%) and step times (within 33 ms, the
  tolerance used in BENCHMARK.md §3).

## If a clip fails the gate
- Do not use it for validation. Read the gate's reason (it says what to fix).
- Fix the setup (usually distance, height, console in the way, or framing) and re-film that view
  in the same session if possible.
- Log the failed clip and the reason: repeated failures for the same reason mean the guide's
  setting is wrong, not the runner.

## Provisional settings this session confirms or changes
| Setting in guide.html | Provisional value | Confirmed by |
|---|---|---|
| Distance lens → runner | about 3.5 m (3–4 m) | Main clips pass; optional 2.5 m / 4.5 m clips show the usable range |
| Frame margin | about 10% each side | Gate framing checks across all clips (feet at back of swing, head) |
| Camera height | hip height ±10 cm (≈1.1–1.2 m above floor) | Optional +20 cm clip vs main clip: metric change |
| Frame rate | 120 fps preferred, 60 fps minimum | Optional 60 fps clip vs 120 fps: event timing and values |
| Warm-up / clip length | 5 min / 30–60 s | Stride counts and stability of means |
| Front view | experimental | Whether pose quality allows any front-view metric |

Record the outcome in DECISIONS.md and update `guide.html` (remove the * from confirmed numbers).

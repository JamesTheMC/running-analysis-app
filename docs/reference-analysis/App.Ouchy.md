# App A (reference folder App.Ouchy): feature breakdown

Words only, no images. Sources: A1-01 = ScreenRecording_10-19-2026 08-52-34_1.MP4 (0:28, a social-media
advert showing the app), A1-02 = ScreenRecording_10-19-2026 09-10-19_1.MP4 (3:07, the app's example
analyses). Both silent (no narration). People are "runner A/B/C"; no names, accounts or client details
are reproduced. Wording is paraphrased; only short generic labels are quoted. Citations: [ID @ mm:ss].
A1-01 reviewed by the lead; A1-02 broken down by a subagent from contact sheets and frames and reviewed
by the lead against the same sheets.

## A1-01
Story advert showing the app (0:00–0:21); 0:21–0:25 the app's store card; 0:25–0:27 unrelated ad / home screen.

- Rear-view treadmill video plays with a pose skeleton (joints as dots, segments as lines) and a vertical
  dashed reference line through the body midline; per-joint angle labels in small boxes next to the
  hip, knee and ankle on each side (frontal-plane angles, e.g. 0°, −3°, 6°), updating as it plays [A1-01 @ 00:00–00:02].
- Pause button and a playback-speed chip showing x0.25 (slow motion) under the video [A1-01 @ 00:00].
- Side buttons "Analysis" and "Share" on the video [A1-01 @ 00:00].
- Swiping up reveals results under the video: a total score (percentage with a one-word grade), then
  pairs of cards left / right per body segment: score %, grade word (good / okay / bad), the finding in
  words (e.g. pelvis aligned during foot landing; lower leg mild / excessive adduction; pronation),
  and "tap to see more" [A1-01 @ 00:04–00:08].
- Tapping a card opens a detail sheet: finding title and segment/side; a schematic of the lower leg
  with the detected position next to the ideal position (toggle between "position detected" and
  "ideal position"); "average angle during foot landing" shown as a value on a horizontal scale with
  a central normal band (−3 to 3), caution bands (to ±5) and an excessive zone beyond, marker at the
  runner's value [A1-01 @ 00:10–00:12].
- Below: three tabs recap / consequences / correction. Recap: plain-language bullet description;
  consequences: a body outline highlighting impacted areas plus a list (e.g. knee pain, muscle
  tension); correction: cue bullets [A1-01 @ 00:14–00:20].
- "Training": a list of exercises with thumbnail, name and small icons, each opening further [A1-01 @ 00:14–00:20].
- Technical: on-phone pose estimation or server; not determinable from the ad (UNCERTAIN). The overlay
  angle labels are per-frame 2D angles; feasible in the browser with MediaPipe (already in this app).

## A1-02
Runners seen:
- Runner A: rear-view treadmill example clip [A1-02 @ 00:00–01:10].
- Runner B: side-view treadmill example clip [A1-02 @ 01:29–02:34].
- Runner C: side-view overground (outdoor path) example clip [A1-02 @ 02:45–03:02].

All three analyses appear to be the app's built-in "example" analyses opened from the home screen,
not analyses the user created (see Uncertain items).

---

## 1. Flow summary

| Time | Segment |
|---|---|
| 00:00–00:10 | Rear-view treadmill analysis (runner A) playing full screen at 0.25x with skeleton overlay and angle labels. |
| 00:10–00:22 | Video shrinks to a thumbnail; scrollable results list appears below: total score, then left/right cards for hip, lower leg, foot. |
| 00:22–00:28 | Opens left-foot card detail (supination), then right-foot detail (neutral). |
| 00:29–00:36 | Opens right lower-leg detail (abduction). |
| 00:36–00:52 | Opens left-hip detail (pelvic drop); scrolls through recap, consequences (body map of impacted areas), correction tabs, training exercise list. |
| 00:52–01:10 | Opens right lower-leg detail again; scrolls recap, consequences, correction, longer exercise list. |
| 01:10–01:12 | Closes detail, backs out to home screen (example analyses, updates, articles, new-analysis button). |
| 01:14–01:18 | Opens profile/account page (plan status, settings, help, tutorials, FAQ, socials, logout, delete account). |
| 01:18–01:26 | Upgrade/paywall sheet (testimonial carousel, three purchase options with analysis quotas). Closed. |
| 01:28–01:31 | Back on home; taps side-view treadmill example; loading spinner over dimmed video. |
| 01:31–01:52 | Side-view analysis (runner B): total score + cards; video expanded to full screen with skeleton and joint-angle labels playing at 0.25x. |
| 01:52–02:04 | Returns to split view; Metrics tab: flight time, ground contact time, duty factor, step frequency, stride length, step length. |
| 02:04–02:08 | Graph tab: joint-angle curve over the running cycle with left/right toggles per joint. |
| 02:08–02:13 | Style tab: a named "running style" archetype with an animal metaphor and explanatory text. |
| 02:13–02:34 | Back to Analysis tab; opens back-position (trunk lean) detail: angle scale, recap/consequences/correction, coach tip, training list. |
| 02:34–02:44 | Home again; scrolls example carousel (back/side, treadmill/overground) and articles carousel. |
| 02:44–02:47 | Taps side-view overground example; loading spinner. |
| 02:47–03:02 | Overground analysis (runner C): total score and cards incl. priority ranking, knee angles at foot landing, arms, head. |
| 03:04–03:06 | Back to home, then leaves the app to the phone home screen. |

---

## 2. Feature list

### F1. Analysis video player with pose overlay
- User does: watches the clip; play/pause button; scrubs a tick-marked timeline [A1-02 @ 00:00, 00:10.63].
- Shows: full-body 2D skeleton (dots at joints, lines between them) drawn on the video, a vertical
  dashed reference line through the body in rear view, and small numeric angle labels next to joints
  [A1-02 @ 00:06] (rear view: three labels at pelvis, knee and foot level, e.g. ~5°, 1°, 11°).
  Side view shows more labels (trunk, elbow/shoulder, hip, both knees, both ankles; values like 152°, 122°, 99°, 63°, 5°, 4°) [A1-02 @ 01:40].
  The angle values change as the video plays [A1-02 @ 00:06 vs 00:20 (thumbnail shows 0°, 1°, 9°)].
- Playback speed indicator "x0.25" always shown; video plays in slow motion [A1-02 @ 00:00–00:10, 01:34–01:50]. Changing speed was not demonstrated.
- Layout states: full-screen video [A1-02 @ 00:00–00:08, 01:32–01:50] vs. collapsed thumbnail above the results list [A1-02 @ 00:10.63, 01:52.4]. The transition animates between the two.
- Two icon buttons seen but not used: one at top right of the full-screen video (looks like a pen/curve icon) [A1-02 @ 00:00], and one next to the speed control [A1-02 @ 00:06]. A "more" (three-dot) menu at top right of the results view [A1-02 @ 00:10.63] was never opened.
- Gait-event markers on the timeline: none visible; the timeline shows only uniform ticks [A1-02 @ 00:06, 01:44].

### F2. Results summary: total score + scored segment cards (Analysis tab)
- Shows a single overall percentage score [A1-02 @ 00:10.77 (66%), 01:30.17 (50%), 02:46.59 (55%)],
  then a 2-column grid of cards. Each card: body-segment icon in a circular gauge, a % score,
  segment name + side, a short verdict phrase, and a "tap to see more" footer [A1-02 @ 00:10.77, 00:20].
- Gauge/text colour encodes good / moderate / poor (green, yellow, red) [A1-02 @ 00:20, 01:31.12].
- Rear-view cards (left and right for each) [A1-02 @ 00:10.77–00:20]:
  - Hip: pelvic drop during that foot's landing (both "mild", 66% / 55%).
  - Lower leg: knee alignment vs abduction (86% aligned / 56% mild abduction).
  - Foot: supination / neutral (63% / 79%).
- Side-view cards [A1-02 @ 01:31, 02:34.64, 02:48–03:00]:
  - Foot landing: overstride severity (e.g. slight / moderate).
  - Back position: trunk forward lean (not enough lean).
  - Front knee angle at foot landing.
  - Back (trailing) knee angle at foot landing / heel kick.
  - Arms position.
  - Head position (gaze direction).
- Priority ranking: in the overground example the weakest cards carry a "#1/#2/#3 priority segment
  to work on" badge [A1-02 @ 02:48, 03:00]. Not shown in the treadmill side-view example [A1-02 @ 01:31] (UNCERTAIN whether it was absent or just not scrolled to).
- Left/right: rear view is explicitly bilateral; side-view cards are not labelled by side [A1-02 @ 01:31].
- Phases: only "foot landing" is named as the measured moment for every card; no midstance or toe-off cards seen.

### F3. Segment detail sheet (tap a card)
Opens as a bottom sheet with a close button [A1-02 @ 00:22]. Content top to bottom:
- Title = verdict + segment/side, with a "?" help icon [A1-02 @ 00:22].
- Two schematic drawings side by side: the detected position (in the verdict colour) vs. the ideal
  position (green), with joint dots and lines; a small icon between them (possibly to overlay or swap them, UNCERTAIN) [A1-02 @ 00:22, 00:31, 00:40, 02:18].
  When the result is already normal only one (green) drawing is shown [A1-02 @ 00:27.5].
- Measured value on a horizontal range scale: a marker with the value in degrees placed on a line with
  green (normal), yellow (borderline) and red (excessive) zones and labelled end-states. Label says it
  is an average angle during foot landing [A1-02 @ 00:22]. Ranges displayed:
  - Foot (rear view): green −3° to +3°, yellow ±3–5°, red beyond ±5°; ends labelled over-pronation / over-supination. Values 3.25° left [A1-02 @ 00:22], 1.93° right [A1-02 @ 00:27.5].
  - Lower leg / knee (rear view): same −5/−3/3/5 scale; ends labelled excessive adduction / abduction. Value 3.65° [A1-02 @ 00:31].
  - Pelvic drop (rear view): ticks 0, 2, 4°; green near 0–2, yellow 2–4, red beyond 4 (excessive drop). Value 2.02° [A1-02 @ 00:40.44].
  - Trunk lean (side view): ticks 2, 6, 12, 16°; green 6–12, yellow 2–6 and 12–16, red outside; red end labelled too far forward. Value 0° (marker in red zone) [A1-02 @ 02:18].
- Three-tab text panel [A1-02 @ 00:41.95, 00:47.93, 00:46.01]:
  - Recap: 2–3 bullets defining the fault and what to strengthen.
  - Consequences: a whole-body figure with highlighted joints/regions plus a bulleted list of possibly linked complaints (e.g. hip/knee/shin/Achilles/pelvis/low-back pain, muscle fatigue) [A1-02 @ 00:47.93, 00:59.29]; in side view a prose paragraph explaining the mechanism [A1-02 @ 02:24].
  - Correction: cueing bullets (e.g. imagery cues, landing softer, engage specific muscle groups) [A1-02 @ 01:04.20, 02:28].
- Coach tip box with a single running cue (side-view detail) [A1-02 @ 02:21.74, 02:30].
- Training: list of exercises, each with thumbnail photo, name, small body-region icons and a chevron [A1-02 @ 00:43.93, 01:06, 02:31.93]. Lists of 3–5 exercises seen (e.g. single-leg hip work, lunge, step-up, glute bridge, clamshell, side plank variants). Opening an exercise was not shown.

### F4. Metrics tab (side view, spatiotemporal)
[A1-02 @ 01:54.72–02:03.50] Cards with a large number, unit, metric name, "?" help icon and a small foot-icon
illustration:
- Time of flight (seconds) — 0.52 s.
- Ground contact time (seconds) — 0.26 s.
- Duty factor (% aerial) — 66%.
- Step frequency (per minute) — 161.
- Stride length (feet + inches) — 5 ft 10 in.
- Step length (feet + inches) — 2 ft 11 in.
No normal ranges, left/right split or colour coding on these cards [A1-02 @ 02:00].

### F5. Graph tab (joint-angle curves)
[A1-02 @ 02:04.45–02:07.91] Line chart of joint angle (degrees, y-axis ~0–60+) against running cycle
(0–100%). Below: a table with rows Knee, Hip, Elbow and Left/Right toggle switches. Knee left and right
were on, giving two overlaid curves (one darker = left?, UNCERTAIN). Curve shape: small peak ~20% cycle,
large peak ~60–70% (swing flexion). No normal band shown. Joint names are underlined (possibly tappable
for an explanation, UNCERTAIN).

### F6. Style tab (running-style classification)
[A1-02 @ 02:08.84–02:12.67] A single classification label for the runner's style, an animal line-drawing
metaphor, and explanatory paragraphs linking the style to step frequency, stance duration and
horizontal vs vertical propulsion. "?" help icon. No numbers shown.

### F7. Home screen
[A1-02 @ 01:11.70, 02:35.32–02:40.93] Help and Tutorials buttons, profile button; horizontal carousel of
example analyses tagged by activity and labelled by view (back / side) and setting (treadmill / overground);
"latest updates" news item; articles carousel; a prominent "new patient analysis" button. The new-analysis
flow was never started in this recording.

### F8. Account / profile page
[A1-02 @ 01:14.60–01:18.43] Shows account identity and a role tag (medical professional), plan status
(no active plan), upgrade and book-a-meeting buttons, restore purchases, settings, help and contact,
tutorials (how to film good videos, FAQ), social links, logout, delete account [A1-02 @ 01:15.05].
None of the sub-pages were opened.

### F9. Paywall / subscription
[A1-02 @ 01:18.64–01:24] Sheet with testimonial carousel and three options: annual plan, monthly plan
(each capped at a number of analyses per month, ~15) and a one-off pack of ~20 analyses; a start button.
Closed without purchase [A1-02 @ 01:26]. Implies analyses are metered per video.

### F10. Loading state when opening an analysis
[A1-02 @ 01:29.43–01:31.12, 02:45.41–02:46.55] Dimmed first frame with a spinner, then results appear
within ~1–2 s with the tab bar already present.

---

## 3. UI components and interactions checklist

| Item | Status | Evidence |
|---|---|---|
| Skeleton overlay on video | Seen | [A1-02 @ 00:00, 01:40, 02:58] |
| Reference lines (vertical plumb line) | Seen (rear view) | [A1-02 @ 00:06] |
| Angle labels on video | Seen | [A1-02 @ 00:06, 01:40] |
| Angle arcs drawn on video | Not seen (numbers only) | [A1-02 @ 01:40] |
| Scrubbing timeline | Seen (timeline with playhead; active scrubbing by finger not clearly shown) | [A1-02 @ 00:06, 01:44] |
| Frame-by-frame stepping | Not seen | — |
| Playback speed / slow motion | Seen (0.25x indicator; changing speed not shown) | [A1-02 @ 00:00] |
| Detected vs ideal side-by-side (schematic) | Seen | [A1-02 @ 00:22, 02:18] |
| Side-by-side or overlaid video comparison (two clips / two sessions) | Not seen | — |
| Left/right curve overlay | Seen (graph) | [A1-02 @ 02:06] |
| Annotation/drawing tools | Not seen in use (pen-like icon present, UNCERTAIN) | [A1-02 @ 00:00] |
| Timeline gait-event markers | Not seen | [A1-02 @ 00:06] |
| Normal/borderline/red range scales | Seen | [A1-02 @ 00:22, 00:40, 02:18] |
| Scores per segment + total | Seen | [A1-02 @ 00:10.77] |
| Priority ranking of faults | Seen | [A1-02 @ 03:00] |
| Exercise prescription list | Seen | [A1-02 @ 00:45, 01:08] |
| Saved sessions (user's own analyses) | Not seen (only examples) | [A1-02 @ 01:11.70] |
| Sharing/export (PDF, report, video) | Not seen (three-dot menu never opened) | [A1-02 @ 00:10.63] |
| Library / clients / folders / search | Not seen (only a new-patient button) | [A1-02 @ 01:11.70] |
| Progress over time (charts, history) | Not seen (only mentioned in testimonial text) | [A1-02 @ 01:18.64] |
| Intake form (height, speed, etc.) | Not seen | — |
| Help "?" explainers | Seen (icons; never opened) | [A1-02 @ 00:22, 01:56] |
| Filming tutorial | Seen as menu entry only | [A1-02 @ 01:15] |

---

## 4. Likely technical basis and feasibility (browser, on-device, one 2D camera)

| Feature | Likely does the work | Evidence | Feasible for our app? |
|---|---|---|---|
| F1 skeleton + angle labels | 2D pose estimation (~17–33 keypoints incl. heel/toe points on the foot) run per frame; angles from keypoint vectors | Dots at heel/toe [A1-02 @ 00:06]; per-frame changing values | Yes. MediaPipe/BlazePose in browser already used in our app. |
| F1 0.25x playback | Plain video playbackRate | — | Yes, trivial. |
| F2 scores | Rule-based: measured angle mapped onto a range scale and converted to a %; total = combination (average?) | Card % matches gauge position; e.g. rear total 66% vs cards 66/55/86/56/63/79 (mean 67.5, close but not exact; UNCERTAIN) | Yes, but our ranges must be literature-sourced. |
| F3 rear foot angle | Rearfoot/heel angle from a 2D posterior view (heel/ankle keypoints) at foot landing | Label "average angle during foot landing" [A1-02 @ 00:22] | Partly. Pose models' heel keypoints are coarse; rearfoot eversion of a few degrees is near the noise floor of 2D pose. Needs validation; probably flag as provisional. |
| F3 knee abduction/adduction, pelvic drop | Frontal-plane angles in rear view at contact | [A1-02 @ 00:31, 00:40] | Yes (pelvic drop from hip keypoints; knee frontal projection angle). Accuracy ~ few degrees. |
| F3 trunk lean | Shoulder–hip line vs vertical, side view | [A1-02 @ 02:18] | Yes. |
| F2 overstride, knee angle at landing, heel kick, arm, head | Side-view keypoint geometry at detected foot contact | [A1-02 @ 03:00] | Yes; head gaze from ear/eye/nose keypoints is rough. |
| F4 contact/flight time, cadence, duty factor | Foot-contact event detection from ankle/heel trajectories over time | [A1-02 @ 01:56] | Yes (we already detect events). Note the shown flight time (0.52 s) is longer than one step at 161 spm (~0.37 s), so their definition differs or the value is wrong (UNCERTAIN). |
| F4 stride/step length in ft/in | Needs a scale: treadmill speed × time, or runner height to scale pixels | No intake seen; overground example also has lengths? (not shown) | Yes with our optional height or treadmill speed intake; not possible from pixels alone. |
| F5 angle curves | Time-normalised per-cycle joint angles, averaged across strides | [A1-02 @ 02:06] | Yes. |
| F6 running-style label | Rule-based classification from cadence / contact time / duty factor | Text references step frequency and stance [A1-02 @ 02:10] | Yes (simple rules); clinical value debatable. |
| F3 text, consequences, exercises | Static content library keyed by fault | Identical cue text across views | Yes (local content). |
| Processing location | Probably cloud (server) processing for user uploads | Per-analysis quotas in paywall [A1-02 @ 01:18.64]; brief spinner when opening examples suggests downloading stored results [A1-02 @ 01:29]. Not proven: upload of a new video was never shown. | Our app must stay on-device in the browser; all of the above is achievable there. |

---

## 5. Uncertain items

1. Whether the three analyses are built-in examples or the user's own: they are opened from the "example analysis" carousel [A1-02 @ 01:28.21, 02:44.59]; the opening rear-view clip matches the first carousel item [A1-02 @ 01:11.70]. Likely all examples.
2. Purpose of the pen/curve icon on the full-screen video [A1-02 @ 00:00] and the icon next to the speed control [A1-02 @ 00:06] (annotation? overlay toggle? AI/expand?). Never tapped.
3. How the video switches between full screen and thumbnail (tap on thumbnail vs button) [A1-02 @ 01:32.5, 01:52.4].
4. Purpose of the small icon between the detected and ideal drawings (overlay/swap?) [A1-02 @ 00:22].
5. Whether the timeline can be scrubbed by dragging, and whether speed can be changed (always 0.25x).
6. How total score is computed from card scores.
7. Which curve is left vs right in the graph [A1-02 @ 02:06]; whether hip/elbow curves look similar (not toggled).
8. Definition of "time of flight" (0.52 s) vs ground contact (0.26 s) at 161 steps/min; the numbers do not add up to a single step period.
9. How stride/step length is scaled (no intake seen).
10. Whether the treadmill side-view example also has priority badges (only overground showed them).
11. Contents of the three-dot menu (possible share/export) [A1-02 @ 00:10.63] and of settings/help/tutorial sub-pages.
12. Whether any processing is on-device; no upload or new-analysis flow appears in this recording.

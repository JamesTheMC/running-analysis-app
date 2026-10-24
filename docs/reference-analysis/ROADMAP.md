# Roadmap from the reference analysis

Dependency order; interface and workflow features first (they do not depend on unvalidated
measurement). Sources by file name and timestamp: A1-01 = ScreenRecording_10-19-2026 08-52-34_1.MP4,
A1-02 = ScreenRecording_10-19-2026 09-10-19_1.MP4. Everything runs on the device; nothing is uploaded.

## How this fits with work already built
- **Phase panels** (stills at IC / midstance / peak hip extension): the review player (1) is the moving
  counterpart; both share the overlay drawing and head blur. Panels stay the printed record; the player
  is for review on screen. Findings keep linking to the phase panels.
- **Flexible views and coverage**: the player and the curves show one clip per available view; missing
  views say "Not assessed: needs the … view" as elsewhere.
- **Video check (capture-quality gate)**: a clip that failed the check is still playable in the player
  (to see why), with no angle labels and a "video check failed" note.
- **Corrective section**: the range scale (3) is added to each finding there; manual measurements (2)
  never enter it. Nothing here adds findings or changes scores.

## Phase 1: review and measurement tools (no dependency on unvalidated metrics)

### 1. Review player (R1–R4)
- Sources: A1-01 @ 00:00–00:02 (overlay, angle labels, 0.25× speed); A1-02 @ 00:00–00:10, 01:40
  (overlay in rear and side views), 00:06 and 01:44 (timeline), 00:10.6 and 01:52.4 (video collapses
  above the results).
- Goal: watch each clip in slow motion with the pose overlay and step through it frame by frame,
  jumping between detected gait events.
- Approach: js/views/review.js; one player per uploaded clip on the Results tab; hidden `<video>` drawn
  to a canvas with skeleton, rear-view midline and current-frame angle labels (knee, hip, trunk for side
  views; hip adduction and knee frontal angle for rear); speed 0.25 / 0.5 / 1×; scrubber with IC /
  midstance / toe-off markers; ±1 frame and previous / next event; overlay and head-blur toggles (blur
  on by default); "keep in view" pins the compact player while scrolling. Shared drawing with the phase
  panels.
- Acceptance: unit tests for event-marker positions, frame stepping and label formatting; works with
  no video (fixture sessions: wireframe only); phone 375 px and tablet without overflow; touch targets
  ≥ 44 px; labels say "this frame" and never carry a status colour.
- Risk: seeking precision in Safari (frames are reached by time); mitigated with the half-frame offset
  used by the debug view.

### 2. Manual measurement tools (R20)
- Source: A1-02 @ 00:00 (a drawing-style icon on the video, never used; UNCERTAIN what it does). The
  function is a standard clinical need; the reference only hints at it.
- Goal: on a paused frame, measure an angle (3 taps), a segment angle against vertical or horizontal
  (2 taps) and a distance in pixels (or cm when height is known, approximate).
- Approach: tool bar in the review player; points drawn on the canvas, draggable; results listed under
  the player as "Manual measurements (on-screen, not validated)", with frame and time; included in the
  copy text and PDF in their own section; never scored, never in findings or the corrective section.
- Acceptance: unit tests for angle maths and that manual values never reach the model's sections,
  scores or explanations; touch works (tap to place, drag to adjust).
- Risk: 2D perspective; the label states it.

### 3. Range scale (R8)
- Sources: A1-01 @ 00:10–00:12; A1-02 @ 00:22, 00:31, 00:40, 02:18.
- Goal: show where a value sits relative to the normal and flag ranges at a glance.
- Approach: small inline SVG scale built from each metric's config ranges (green / caution / flag
  zones; provisional ranges marked); marker in the status colour only when the value is trusted,
  otherwise a neutral marker plus its hedge; shown in metric details and corrective findings. Text
  (copy summary) unchanged.
- Acceptance: tests that untrusted values never get a coloured marker; scale ends sensible for each
  range metric; accessible label with the value and zone.
- Risk: none beyond keeping ranges single-sourced (config).

### 4. "What is this?" explainers (R13)
- Sources: A1-02 @ 00:22 and 01:56 (help icons on details and metric cards).
- Goal: plain-language meaning of each metric and timing value, the view it comes from and how
  reliable it is.
- Approach: one explainer table keyed by metric id (reusing VIEW_MAP and validation errors); shown in
  each row's detail and as a toggle on timing rows.
- Acceptance: every displayed metric and timing row has an explainer (test).

## Phase 2: sessions

### 5. On-device session library and comparison (R16)
- Sources: A1-02 @ 01:11.70 and 02:35 (home with analyses and a new-patient entry).
- Goal: save a session's results on this device by client code and date, reopen it later, delete it,
  and compare two sessions of the same client.
- Approach: IndexedDB (results only: intake without free-text history, reconciled result, model inputs;
  never video or frames); library list on the upload screen; reopen rebuilds the model; compare shows
  values side by side for metrics assessed in both, with the coverage warning (compareCoverage).
  Free-text intake fields are not stored.
- Acceptance: tests for save → reopen giving the same summary text, delete, and the coverage warning;
  works offline; storage failure handled (private browsing).
- Risk: browser storage can be cleared by the user or the OS; stated in the UI.

## Phase 3: measured curves (depends on partly validated angles)

### 6. Joint-angle curves over the gait cycle (R14)
- Sources: A1-02 @ 02:04–02:08.
- Goal: knee and hip angle across the normalised stride (0–100%, IC to IC), per side view, left and
  right toggles, with the stride-to-stride spread.
- Approach: from each side clip's valid strides (near leg only), time-normalised and averaged; inline
  SVG chart; marked "measured curve; knee ±7–10°, hip ±3–8° error; not scored".
- Acceptance: tests on fixture strides (curve has 101 points, peaks in swing); missing side says
  "Not assessed: needs the … side view".
- Risk: unvalidated across the whole cycle (validation was at events only): labelled.

## Deferred (with reason)
- Detected vs ideal position drawing (R7; A1-01 @ 00:10, A1-02 @ 00:22): implies a validated "ideal".
- Body map of linked complaints (R9; A1-02 @ 00:47.93): claims beyond our verified evidence.
- Exercise photo thumbnails (R11; A1-02 @ 00:43): needs an original, licensed image set.
- Running-style label (R15; A1-02 @ 02:08): no evidence base.
- Head gaze and arm position findings (R21; A1-02 @ 03:00): new unvalidated metrics.
- Rearfoot pronation / supination angle (R22; A1-02 @ 00:22): poor 2D reliability (VIEW_MAP: not built).
- Overground analysis (R23; A1-02 @ 02:45): events and video check calibrated on treadmill only.
- Accounts, plans, quotas (R24; A1-02 @ 01:14–01:26): needs a server and payments; off-device data.
- Live capture: v1 is upload only.

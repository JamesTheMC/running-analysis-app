# Feature matrix

Every feature found in the reference recordings (only App A has recordings; App B's folder was empty).
"Mine today" = this app as of commit 4781e93. Sources: A1-01 = ScreenRecording_10-19-2026 08-52-34_1.MP4,
A1-02 = ScreenRecording_10-19-2026 09-10-19_1.MP4. Equivalents are in this app's own design and wording.

| # | Feature (function) | Where seen | Mine today | Equivalent in this app |
|---|---|---|---|---|
| R1 | Video plays with a pose skeleton, a vertical midline reference (rear) and per-frame joint-angle labels | A1-01 @ 00:00–00:02; A1-02 @ 00:00–00:10, 01:40 | Partial: Debug tab skeleton (no labels); still phase panels | A **review player** on the Results tab: skeleton toggle, rear midline, angle labels for the current frame marked "this frame, not a validated metric" |
| R2 | Slow-motion playback (0.25×) with play / pause | A1-01 @ 00:00; A1-02 @ 00:00–00:10 | No | Speed control 0.25× / 0.5× / 1× in the review player |
| R3 | Timeline with a playhead (scrubbing) | A1-02 @ 00:06, 01:44 | Partial: Debug slider with event markers | Scrubber with gait-event markers (IC / midstance / toe-off) and ±1 frame / previous-next event steps |
| R4 | Video collapses to a small player above the results while scrolling | A1-02 @ 00:10.6, 01:52.4 | No | "Keep in view" option: the review player stays pinned (compact) while the results scroll |
| R5 | Total score plus left/right scored cards per body segment | A1-01 @ 00:04–00:08; A1-02 @ 00:10.77, 01:31 | Yes: scores and L/R rows with trusted-only badges | — (kept; ours shows coverage and trusted-only status) |
| R6 | Ranking of the weakest segments as priorities | A1-02 @ 02:48, 03:00 | Yes: "Top priorities" in the corrective section | — |
| R7 | Detail view: drawing of the detected position next to an ideal position | A1-01 @ 00:10–00:12; A1-02 @ 00:22, 02:18 | Partial: phase-panel stills with arcs | Deferred: an "ideal" drawing implies a norm we have not validated; the phase panel shows the runner's own frame |
| R8 | Measured value placed on a horizontal scale with normal / borderline / excessive zones | A1-01 @ 00:10; A1-02 @ 00:22, 00:31, 00:40, 02:18 | No (ranges as text) | **Range scale** in each metric's detail and corrective finding: zones from config ranges, marker coloured only when the value is trusted, otherwise neutral with the hedge |
| R9 | Recap / consequences (body map of linked complaints) / correction tabs | A1-01 @ 00:14–00:20; A1-02 @ 00:41–01:04 | Partial: corrective section (what we saw, could be contributing, screen, what to work on) | Kept as is; body map deferred (linked-complaint claims need evidence beyond ours) |
| R10 | A single coaching cue per finding | A1-02 @ 02:21.74 | Partial: cues inside work items | — (already in the corrective entries) |
| R11 | Exercise list with photo thumbnails | A1-01 @ 00:14–00:20; A1-02 @ 00:43, 01:06, 02:31 | Partial: exercise names and doses as text | Deferred: needs our own exercise images (no licensed library) |
| R12 | Spatiotemporal metric cards (flight, contact, duty factor, step rate, stride and step length) | A1-02 @ 01:54–02:03 | Yes: Timing and mechanics card (cross-checked across views) | Add plain-language explainers (R13) |
| R13 | "?" help explainers on cards and details | A1-02 @ 00:22, 01:56 | No | **"What is this?"** explainer on every metric and timing row (what it measures, from which view, how reliable) |
| R14 | Joint-angle curves over the running cycle (0–100%), left/right toggles per joint | A1-02 @ 02:04–02:08 | No | **Angle curves**: mean knee and hip angle over the normalised gait cycle per side view, with the stride spread; marked "measured curve, not scored" |
| R15 | Running-style label (archetype with metaphor) | A1-02 @ 02:08–02:13 | No | Deferred: no evidence base; low clinical value |
| R16 | Home with example analyses, news and a "new patient analysis" entry | A1-02 @ 01:11, 02:35 | Partial: demo data; one in-memory session | **On-device session library**: save a session's results (no video) by client code and date, reopen, delete, compare two sessions (coverage warning) |
| R17 | Filming tutorial | A1-02 @ 01:15 | Yes: guide.html | — |
| R18 | Share action on the analysis | A1-01 @ 00:00 | Yes: copy summary, print / PDF | — |
| R19 | Loading state while an analysis opens | A1-02 @ 01:29, 02:45 | Yes: analysing screen with quick video check | — |
| R20 | Possible drawing / annotation icon on the video (never used in the recording, UNCERTAIN) | A1-02 @ 00:00 | No | **Manual measurement tools** on a paused frame: angle (3 points), line vs vertical, distance in px; labelled "manual on-screen measurement", never scored |
| R21 | Side-view cards for head gaze and arm position | A1-02 @ 02:58, 03:00 | Partial: elbow angle, shoulder swing (side) | Deferred: new unvalidated metrics |
| R22 | Rear-view foot pronation / supination angle | A1-01 @ 00:04–00:08; A1-02 @ 00:22–00:27 | No (not built: poor 2D reliability) | Deferred (validated as unreliable in 2D at this distance) |
| R23 | Overground (outdoor) analysis | A1-02 @ 02:45–03:02 | No (treadmill protocol) | Deferred: capture gate and events calibrated on treadmill only |
| R24 | Accounts, plans, paywall, analysis quotas | A1-02 @ 01:14–01:26 | No | Deferred: accounts and payments are out of scope (privacy, no paid services) |

## Scores for features not already in the app
Scale 1–5 (5 = best: high value, good fit, easy, no dependency on unvalidated metrics). Effort: 5 = small.

| # | Feature | Clinical value | Fit (v1 scope, on-device, privacy) | Feasibility | Effort | Independence from unvalidated metrics | Total | Rank |
|---|---|---|---|---|---|---|---|---|
| R1–R4 | Review player (overlay, slow motion, scrub with events, frame step, keep in view) | 5 | 5 | 5 | 3 | 5 | 23 | 1 |
| R20 | Manual measurement tools on a paused frame | 5 | 5 | 5 | 3 | 5 | 23 | 2 |
| R8 | Range scale for values | 4 | 5 | 5 | 4 | 4 | 22 | 3 |
| R13 | "What is this?" explainers | 3 | 5 | 5 | 5 | 5 | 23 | 4* |
| R16 | On-device session library + compare | 5 | 4 | 4 | 3 | 5 | 21 | 5 |
| R14 | Joint-angle curves over the cycle | 3 | 5 | 4 | 3 | 2 | 17 | 6 |
| R11 | Exercise thumbnails | 3 | 3 | 3 | 2 | 5 | 16 | deferred |
| R7 | Detected vs ideal drawing | 2 | 4 | 4 | 3 | 1 | 14 | deferred |
| R9 | Body map of linked complaints | 2 | 4 | 4 | 3 | 2 | 15 | deferred |
| R21 | Head gaze, arm position cards | 2 | 4 | 3 | 3 | 1 | 13 | deferred |
| R15 | Running-style label | 1 | 4 | 4 | 4 | 1 | 14 | deferred |
| R22 | Rearfoot angle | 2 | 4 | 1 | 2 | 1 | 10 | deferred |
| R23 | Overground analysis | 3 | 3 | 2 | 1 | 1 | 10 | deferred |
| R24 | Accounts / paywall | 1 | 1 | 2 | 1 | 5 | 10 | deferred |

\* Ranked after the range scale despite the equal total: the explainers depend on the final wording of
each row, which the range scale and player also touch.

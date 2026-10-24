# Traceability: built features ← reference videos

Sources: A1-01 = ScreenRecording_10-19-2026 08-52-34_1.MP4, A1-02 = ScreenRecording_10-19-2026
09-10-19_1.MP4 (folder App.Ouchy). Every feature is this app's own design and wording; nothing from
the recordings (names, text, icons, colours, layout) is used in the interface.

| Feature | What it does in this app | Inspired by (file @ time) | Commit |
|---|---|---|---|
| Video review player | Each uploaded clip on the Results tab with pose skeleton, rear midline, this-frame angle labels (never coloured), 0.25 / 0.5 / 1× playback, scrubber with gait-event marks, ±1 frame and previous/next event, head blur on by default, keep-in-view pinning | ScreenRecording_10-19-2026 08-52-34_1.MP4 @ 00:00–00:02; ScreenRecording_10-19-2026 09-10-19_1.MP4 @ 00:00–00:10, 00:06, 00:10.6, 01:40, 01:52.4 | 1ef95f6 |
| Manual on-screen measurements | Angle (3 taps), line vs vertical (2), distance (2; cm approximate with height) on a paused frame, draggable points; listed apart as manual, own section in the copy text and print; never scored or used for findings | ScreenRecording_10-19-2026 09-10-19_1.MP4 @ 00:00 (an unused drawing-style icon; UNCERTAIN what it does) | 1ef95f6 |
| Range scale | Value placed on its normal / caution / flag zones (config ranges) in metric details and corrective findings; coloured only when trusted, otherwise neutral with the hedge | ScreenRecording_10-19-2026 08-52-34_1.MP4 @ 00:10–00:12; ScreenRecording_10-19-2026 09-10-19_1.MP4 @ 00:22, 00:31, 00:40, 02:18 | 1ef95f6 |
| "What is this?" explainers | Plain-language meaning, source view and validated error for every metric; meaning for every timing value | ScreenRecording_10-19-2026 09-10-19_1.MP4 @ 00:22, 01:56 | 4af7fcf |
| Saved sessions and comparison | Save results on this device (no video, landmarks, file names or free text), reopen, delete, compare two sessions of one client (values in both; within-error changes labelled; coverage warning) | ScreenRecording_10-19-2026 09-10-19_1.MP4 @ 01:11.70, 02:35 | 78ace58 |
| Angle curves over the gait cycle | Knee and hip angle of each side view's near leg from contact to contact, median and middle-half band, left/right toggles; measured, not scored | ScreenRecording_10-19-2026 09-10-19_1.MP4 @ 02:04–02:08 | 15d15f9 |

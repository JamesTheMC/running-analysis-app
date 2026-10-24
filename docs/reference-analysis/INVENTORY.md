# Reference inventory

Source folder: `reference/` (local only, gitignored with every frame, contact sheet and transcript
derived from it). This document describes the files in words; it contains no images.

| ID | App folder | File name (exact) | Duration | Resolution | Frame rate | Audio track |
|---|---|---|---|---|---|---|
| A1-01 | App.Ouchy | ScreenRecording_10-19-2026 08-52-34_1.MP4 | 0:27.9 | 1180×2556 (portrait phone screen recording) | 59.7 fps (variable) | yes, but silent (−91 dB: no narration) |
| A1-02 | App.Ouchy | ScreenRecording_10-19-2026 09-10-19_1.MP4 | 3:07.1 | 1180×2556 (portrait phone screen recording) | 37.8 fps average (variable, nominal 60) | yes, but silent (−91 dB: no narration) |
| — | App.Onform | (folder empty) | — | — | — | — |

No NOTES.md was present in either app folder. No file name contains a person's name, so file names
are used in the documents for traceability (the local mapping file is therefore not needed).

## Tools used (all local, free)
- **ffmpeg 7.1** via the `imageio-ffmpeg` pip package (user install; no system changes): probing,
  scene-change frames (threshold 0.06, capped at 150 per video) plus one frame every 2 s (capped at
  120), written to `reference/frames/<app>/<ID>/` (gitignored).
- **Contact sheets** (8 × 2 tiles, labelled mm:ss) built with Pillow (user install).
- **Speech to text:** `faster-whisper` installed (local, free) but not used: both audio tracks are
  digital silence, so there is no narration to transcribe.

## Content summary
- **A1-01**: a social-media advert (screen recording of a story ad) showing the app's rear-view
  analysis for about 21 s, followed by an unrelated advert and the phone's home screen (not used).
- **A1-02**: see docs/reference-analysis/App.Ouchy.md.

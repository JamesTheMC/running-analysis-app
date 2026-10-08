# Guided filming: plan only (not built)

Goal: help the clinician film three clips that the analysis can trust, from the phone running the app:
**left lateral**, **right lateral** and **posterior**. Plan only; nothing here is implemented.

## What a web app can and cannot control on iPhone Safari

Checked on 2026-10-08 against MDN's browser-compat-data (the data behind MDN's compatibility tables),
MDN reference pages and WebKit sources. **Unverified** means no authoritative source was found; it must
be tested on a device before relying on it.

| Capability | Status on iPhone Safari | Source |
|---|---|---|
| Live camera preview (`getUserMedia`, rear camera via `facingMode: 'environment'`) | Supported since iOS Safari 11; secure context (https) required | MDN BCD `api.MediaDevices.getUserMedia` |
| Requesting frame rate / resolution (`frameRate`, `width`, `height` constraints) | Supported since iOS Safari 11 | MDN BCD `api.MediaStreamTrack.applyConstraints.*_constraint` |
| Reading what the camera actually offers (`getCapabilities`, `getSettings`) | Supported since iOS Safari 11 | MDN BCD `api.MediaStreamTrack.getCapabilities/getSettings` |
| **Maximum capture frame rate through `getUserMedia` on iPhone** (60? 120?) | **Unverified.** A WebKit bug mentions a 60 fps limit, but it concerns WebRTC decoding and was closed as invalid. Must be read on device with `getCapabilities().frameRate.max` | [WebKit bug 272393](https://bugs.webkit.org/show_bug.cgi?id=272393) |
| Recording in the page (`MediaRecorder`) | Supported since iOS Safari 14 | MDN BCD `api.MediaRecorder` |
| Recording format | MP4 with H.264 + AAC at launch | [WebKit blog, Nov 2020](https://webkit.org/blog/11353/mediarecorder-api/) |
| HEVC / WebM recording on iOS 18.4+ | **Unverified** (search summary only, not confirmed from a primary source) | — |
| Bitrate control (`videoBitsPerSecond`) | Not supported at launch (WebKit blog 2020); **current status unverified** | [WebKit blog](https://webkit.org/blog/11353/mediarecorder-api/) |
| HDR on/off | No web API found to request or disable HDR capture: **unverified, assume no control** | — |
| Orientation lock (`screen.orientation.lock`) | **Not supported** in Safari or iOS Safari | MDN BCD `api.ScreenOrientation.lock` |
| Level indicator (`deviceorientation` events) | Supported (iOS Safari 4.2+); needs `DeviceOrientationEvent.requestPermission()` (iOS 14.5+) from a user tap | MDN BCD `api.DeviceOrientationEvent`; [MDN requestPermission](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static) |
| Recording length | No API limit; bounded by memory/storage (the recording is held in memory until saved): **practical limit unverified** | — |
| Hand-off to the native Camera app (`<input type="file" accept="video/*" capture>`) | Supported since iOS Safari 10 | MDN BCD `html.elements.input.capture` |
| Frame rate / HDR when using the native Camera hand-off | Set by the user in iOS Settings > Camera, not by the web page: **not verified here** | — |
| Still photos (`ImageCapture`) | iOS Safari 18.4+ (photos only, not video) | MDN BCD `api.ImageCapture` |

**Consequence:** the web app can preview, overlay guides, check level and time a recording. It
**cannot** guarantee 120 fps, turn HDR off, lock orientation, or lock focus/exposure. Those need either
the native Camera app (with the clinician setting 120 fps and HDR in Settings) or a native iOS build.

## Proposed web flow (two stages, so 120 fps stays possible)

1. **Set-up assistant (live preview, `getUserMedia`):** per view, overlays on the live picture.
   - **Runner outline** (silhouette for the chosen view) to size the runner: whole body in frame, feet
     above the bottom edge, head below the top.
   - **Centre line**: lateral = belt midline across the frame; posterior = vertical line on the belt
     midline. Optional live pose estimate (the bundled MediaPipe model) to show the pelvis midline
     offset in hip widths, the same estimate as the post-analysis check.
   - **Level indicator** from `deviceorientation` (roll and pitch, green within ±2°), after a tap to
     grant permission.
   - **Orientation hint**: portrait vs landscape detected from the window size (the lock is unavailable).
   - **Read-out**: `getSettings()` frame rate and resolution of the preview.
2. **Record**, chosen from what the device reports:
   - If `getCapabilities().frameRate.max >= 60` (to be measured on target iPhones): record in-page with
     `MediaRecorder`, with a **countdown** (5 s) and a **minimum-duration timer** (30 s; the stop button
     stays disabled until then), then analyse the recording directly (no upload).
   - Otherwise, or by preference: hand off to the **native Camera** (`capture`) after the phone is set
     up on the tripod. The guide reminds the clinician to choose 120 fps in iOS Settings. The returned
     file goes through the existing upload checks (fps, length, orientation, HDR).
3. **After analysis:** the existing checks (frame rate, length, near-side stride count, posterior
   off-centre estimate) confirm or reject the clip, with a "re-film" prompt.

Per-view targets (shared with the in-app protocol text):

| View | Camera position | Overlay |
|---|---|---|
| Left lateral / right lateral | Perpendicular to the belt, level, fixed, about pelvis height, as far back as the room allows | Side-view outline facing the correct way; belt line; level |
| Posterior | Directly behind, centred on the belt midline, level, about pelvis height, as far back as the room allows | Rear-view outline; vertical centre line; level; live off-centre read-out |

All three: whole body in frame, good light, at least 30 s of steady running, 120 fps recommended.

## What would need a native iOS camera build

- Guaranteed 120/240 fps capture at a chosen resolution (camera format selection).
- HDR off (SDR recording), which avoids the HDR colour conversion difference seen in Milestone 2.
- Locked focus, exposure and white balance during the run.
- Orientation lock during recording.
- Reliable long recordings written straight to storage.

(These are standard camera-framework capabilities on iOS; specific API details were not checked for
this plan.)

## Open questions

1. Measure `getCapabilities()` on the clinic's iPhones to see whether in-page recording reaches 60 or
   120 fps.
2. Decide whether a live pose overlay during set-up is worth the battery and heat cost.

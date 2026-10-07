# Vendored MediaPipe: source and local patches

Source: `@mediapipe/tasks-vision@1.1.0` (Apache-2.0) from npm via jsDelivr, and
`pose_landmarker_full.task` (float16, v1) from `storage.googleapis.com/mediapipe-models`.
Only the ES module bundle and the SIMD wasm build are kept.

## Patch 1: usage logging disabled (`vision_bundle.mjs`)

Version 1.1.0 sends usage telemetry (task type, running mode, timings) every 60 s to
`https://odml.pa.googleapis.com/v1/log`, with no option to turn it off. The app must not contact
external hosts, so the logger class is constructed in its "send failed" state; it then never
queues or sends anything:

```diff
-Mh=class{constructor(t){this.i=[],this.o=new bh,this.l=t??"",this.h=setInterval(()=>{this.flush()},6e4)}
+Mh=class{constructor(t){this.i=[],this.o=new bh,this.l=t??"",this.error=Error("usage logging disabled (local patch, see PATCHES.md)")}
```

The app's Content-Security-Policy (`connect-src 'self' blob:`) blocks external requests anyway;
this patch keeps the console clean. **Re-apply when upgrading** (the minified names change), then
check the test page's network log for any request that is not to this origin.

// Orchestrates the client-side pipeline: demux -> decode -> pose -> rows -> gate -> strides -> summary.
// Everything runs in this tab; the video never leaves the device.

import { demux } from './mp4.js';
import { checkCodec, decodeSampledFrames, decoderSupported } from './decode.js';
import { buildRow, createPoseLandmarker, deriveAngles } from './pose.js';
import { series, tibiaGate } from './gate.js';
import { STRIDE, hipExtensionPeaks, segmentStrides } from './strides.js';
import { EVENTS, IC_SWEEP, detectEvents } from './events.js';
import { cadenceFromDurations, cadenceFromStrides, computeMetrics } from './metrics.js';
import { applyHipAnchor, applyLegAnchor, medianThighPx } from './hip-anchor.js';
import { STABILIZE, stabilizeRows } from './stabilize.js';
import { fixLegSwaps } from './leg-identity.js';

// OFF by default (opts.legIdentity === true to enable): on 2026-10-13 the continuity rule flagged
// 483 "swaps" on C0 (legs crossing look like swaps) and did not fix AR/AZ/CD. Kept for future work.
// Leg-label flicker is corrected IN PLACE before anything else, so every consumer of `rows` (events,
// metrics, event tables, debug overlay) sees the same corrected landmarks.
function correctLegIdentity(rows, opts) {
  if (opts.legIdentity !== true || rows.legIdentityFixed != null) return rows.legIdentityFixed ?? 0;
  const { rows: fixed, swapped } = fixLegSwaps(rows);
  for (let i = 0; i < rows.length; i++) rows[i] = fixed[i];
  Object.defineProperty(rows, 'legIdentityFixed', { value: swapped, enumerable: false, configurable: true });
  return swapped;
}
import { HIP_ANCHOR, LEG_ANCHOR } from '../config.js';
import { REAR_EVENTS, detectRearEvents, pelvisLowMidstance, posteriorCaptureChecks, segmentRear, segmentationMidstance, orderViolations } from './rear-events.js';
import { frontalBodyHeightPx, posteriorMetrics } from './posterior-metrics.js';
import { max, median, min } from './stats.js';

export const PIPELINE = {
  scale: 0.45, // downscale before pose estimation (reference SCALE)
  targetHz: 60, // app default: sample every round(fps / 60)-th frame; the reference uses every 2nd
  quickRows: 150, // quick video check after this many analysed frames (2.5 s at 60 Hz, 5 s at 30 fps)
  lumaEverySec: 1, // brightness sample for the lighting check (tiny downscaled copy of the frame)
};

// Frame-interval check: variable frame rate would break frame-count timing. Timestamps (not frame
// indices) are used for all time-based values; this records how regular the clip is.
export function frameTiming(times) {
  const d = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b);
  if (!d.length) return null;
  const med = d[d.length >> 1];
  return { medianMs: med * 1000, minMs: d[0] * 1000, maxMs: d[d.length - 1] * 1000, variable: d[d.length - 1] > 1.5 * med || d[0] < 0.5 * med };
}

export function sampleEveryFor(fps, targetHz = PIPELINE.targetHz) {
  return Math.max(1, Math.round(fps / targetHz));
}

/**
 * @param {File|Blob} file
 * @param {object} opts { sampleEvery?, delegate?, nearSide?, onProgress?({done,total,phase}), signal?,
 *                        poseOnly? (stop after pose: the view is decided afterwards),
 *                        onPartial?(rows, meta) (called once after PIPELINE.quickRows rows: quick video check) }
 */
export async function analyzeVideo(file, opts = {}) {
  const { onProgress = () => {}, signal } = opts;
  if (!decoderSupported()) throw new Error('This browser cannot decode video frame by frame (WebCodecs). Use current Safari or Chrome.');
  onProgress({ phase: 'reading', done: 0, total: 0 });
  const track = await demux(file);
  if (!(await checkCodec(track))) throw new Error(`This browser cannot decode this video format (${track.codec}).`);

  const sampleEvery = opts.sampleEvery ?? sampleEveryFor(track.fps);
  const total = Math.ceil(track.frameCount / sampleEvery);
  onProgress({ phase: 'loading model', done: 0, total });
  const { landmarker, delegate } = await createPoseLandmarker({ delegate: opts.delegate });

  const rows = [];
  const luma = [];
  const started = performance.now();
  let size = null;
  let lastLuma = -Infinity;
  let partialSent = false;
  const metaBase = { codec: track.codec, fps: track.fps, fs: track.fps / sampleEvery, frameCount: track.frameCount, rotation: track.rotation, mirrored: !!track.mirrored, sampleEvery };
  try {
    size = await decodeSampledFrames(file, track, {
      sampleEvery,
      scale: PIPELINE.scale,
      signal,
      onFrame: async (canvas, { index, ptsSec }) => {
        const res = landmarker.detectForVideo(canvas, ptsSec * 1000);
        rows.push(buildRow(res.landmarks?.[0], { index, ptsSec, width: canvas.width, height: canvas.height }));
        if (ptsSec - lastLuma >= PIPELINE.lumaEverySec) {
          lastLuma = ptsSec;
          const l = frameLuma(canvas);
          if (l) luma.push(l);
        }
        if (!partialSent && opts.onPartial && rows.length >= PIPELINE.quickRows) {
          partialSent = true;
          try {
            opts.onPartial(rows.slice(), { ...metaBase, analysedSize: [canvas.width, canvas.height], luma: lumaSummary(luma) });
          } catch (e) {
            console.error(e);
          }
        }
        if (rows.length % 10 === 0) {
          onProgress({ phase: 'analysing', done: rows.length, total });
          await new Promise((r) => setTimeout(r)); // let the UI paint
        }
      },
    });
  } finally {
    landmarker.close();
  }
  const seconds = (performance.now() - started) / 1000;
  onProgress({ phase: 'summarising', done: rows.length, total });

  const meta = {
    ...metaBase,
    frameTiming: frameTiming(track.frameTimes),
    analysedSize: size && [size.width, size.height],
    delegate,
    seconds,
    luma: lumaSummary(luma),
  };
  meta.view = opts.view || 'lateral';
  if (opts.poseOnly) return { meta, rows };
  return { meta, rows, ...postProcessView(rows, meta, opts) };
}

// Mean brightness of a frame from a 32×18 copy (lighting check; nothing is stored but the numbers).
let lumaCanvas = null;
function frameLuma(src) {
  try {
    lumaCanvas ??= typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(32, 18) : Object.assign(document.createElement('canvas'), { width: 32, height: 18 });
    const ctx = lumaCanvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0, 32, 18);
    const d = ctx.getImageData(0, 0, 32, 18).data;
    const v = [];
    for (let i = 0; i < d.length; i += 4) v.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    v.sort((a, b) => a - b);
    return { mean: v.reduce((a, b) => a + b, 0) / v.length, p5: v[Math.floor(v.length * 0.05)], p95: v[Math.floor(v.length * 0.95)] };
  } catch {
    return null;
  }
}
function lumaSummary(list) {
  if (!list.length) return null;
  const m = (k) => median(list.map((l) => l[k]));
  return { mean: m('mean'), p5: m('p5'), p95: m('p95'), samples: list.length };
}

// Post-processing for the clip's view (re-run when the clinician overrides the detected view).
export function postProcessView(rows, meta, opts = {}) {
  const view = opts.view || meta.view || 'lateral';
  if (view === 'posterior') return postProcessRear(rows, meta, opts);
  if (view === 'anterior') return postProcessFront(rows, meta, opts);
  return postProcess(rows, meta, opts);
}

// Front view: rotating the runner 180° about the vertical axis maps a front view onto a rear view
// (x -> width - x, z -> -z, anatomical labels unchanged), so the rear-view pipeline runs on the
// mirrored landmarks. Its values are experimental (config experimentalViews) until validated on real
// front-view video. The original rows stay untouched (debug overlay, phase panels).
export function mirrorRows(rows, width) {
  return rows.map((r) => {
    if (!r.lm) return { ...r };
    const lm = Float32Array.from(r.lm);
    for (let k = 0; k < 33; k++) {
      lm[k * 4] = width - lm[k * 4];
      lm[k * 4 + 2] = -lm[k * 4 + 2];
    }
    return deriveAngles({ ...r, lm });
  });
}

export function postProcessFront(rows, meta, opts = {}) {
  const mirrored = mirrorRows(rows, meta.analysedSize?.[0] ?? 1);
  return { ...postProcessRear(mirrored, meta, opts), frontRows: mirrored, view: 'anterior' };
}

// Posterior view (Milestone 4): events only so far. Metrics are added after the event contact sheet is reviewed.
export function postProcessRear(rows, meta, opts = {}) {
  const legSwapsFixed = correctLegIdentity(rows, opts);
  const bad = tibiaGate(rows);
  const seg = segmentRear(rows, bad, meta.fs);
  seg.fs = meta.fs;
  const events = detectRearEvents(rows, bad, seg);
  const sweep = Object.fromEntries(
    REAR_EVENTS.speedSweep.map((v) => [v, v === REAR_EVENTS.speed ? events : detectRearEvents(rows, bad, seg, { speed: v })]),
  );
  // Midstance from the segmentation alone (centre of each stance half-cycle); used for rear metrics.
  const midstance = segmentationMidstance(seg);
  // Candidate: lowest smoothed pelvis within each stance half-cycle (deepest landing position).
  const midstancePelvis = pelvisLowMidstance(rows, bad, seg, midstance);
  const capture = posteriorCaptureChecks(rows, bad, meta.analysedSize[0]);
  // Posterior metrics at the lowest-pelvis midstance (and at ±33 ms for the timing rule).
  // Metrics on stabilised landmarks; segmentation and midstance on the raw ones.
  const srows = opts.stabilize === false ? rows : stabilizeRows(rows, meta.fs);
  // Frames with reversed left/right order are left out of the metrics.
  const swapped = orderViolations(rows).map(Boolean);
  const mbad = bad.map((b, i) => b || swapped[i]);
  const metrics = { ...posteriorMetrics(srows, mbad, midstancePelvis, meta.fs), bodyHeightPx: frontalBodyHeightPx(srows, mbad), fs: meta.fs };
  const cadence = cadenceFromDurations(seg.peaks.slice(1).map((p, i) => (p - seg.peaks[i]) / meta.fs));
  return { bad, seg, events, sweep, midstance, midstancePelvis, capture, metrics, cadence, legSwapsFixed, view: 'posterior', summary: referenceSummary(rows, bad) };
}

// Everything after pose estimation. Pure: can be re-run on cached rows (test page).
export function postProcess(rows, meta, opts = {}) {
  const legSwapsFixed = correctLegIdentity(rows, opts);
  const bad = tibiaGate(rows);
  const seg = segmentStrides(rows, bad, meta.fs, { nearSide: opts.nearSide });
  seg.fs = meta.fs;
  // Events always come from the uncorrected landmarks; metrics use the selected hip anchor.
  const events = detectEvents(rows, bad, seg);
  const anchor = opts.hipAnchor ?? HIP_ANCHOR;
  const leg = opts.legAnchor ?? LEG_ANCHOR;
  // Hip-only anchor (kept for the tool and its fixture) takes precedence; otherwise the whole-leg anchor.
  // Metrics use stabilised landmarks (stabilize.js) with the anchor applied; events use raw landmarks.
  const srows = opts.stabilize === false ? rows : stabilizeRows(rows, meta.fs);
  const mrows =
    anchor.mode === 'corrected'
      ? applyHipAnchor(srows, seg.near.side, seg.ref.facing, anchor.offset)
      : leg.mode === 'corrected'
        ? applyLegAnchor(srows, seg.near.side, seg.ref.facing, leg.offsets, medianThighPx(rows, seg.near.side))
        : srows;
  const hipExt = hipExtensionPeaks(mrows, bad, meta.fs, seg, events);
  // Near-leg hip extension under each window end (window-sensitivity rule).
  const hipWindows = STRIDE.windowSweep.map((end) => ({
    end,
    ...(end === 'late-stance' ? hipExtensionPeaks(mrows, bad, meta.fs, seg) : hipExtensionPeaks(mrows, bad, meta.fs, seg, events, { afterToeOffSec: end }))[seg.near.side],
  }));
  const metrics = computeMetrics({ rows: mrows, bad, seg, events, hipExt });
  const eventsSweep = { [EVENTS.contactTolerance]: events };
  // IC-timing sensitivity: the same metrics with events detected at each swept contact tolerance.
  const sweep = Object.fromEntries(
    IC_SWEEP.map((t) => [t, t === EVENTS.contactTolerance ? metrics : computeMetrics({ rows: mrows, bad, seg, hipExt, events: (eventsSweep[t] = detectEvents(rows, bad, seg, { contactTolerance: t })) })]),
  );
  const cadence = cadenceFromStrides(rows, seg);
  return { bad, seg, hipExt, hipWindows, events, eventsSweep, metrics, sweep, cadence, legSwapsFixed, hipAnchor: anchor, legAnchor: leg, summary: referenceSummary(rows, bad) };
}

// Same keys and semantics as summarize() in reference/reference_gait_pipeline.py (minus the
// unvalidated whole-series hip-extension peak picking, which strides.js replaces).
export function referenceSummary(rows, bad) {
  const out = {
    frames_sampled: rows.length,
    frames_detected: rows.filter((r) => r.detected).length,
    frames_excluded_tracking_gate: bad.filter(Boolean).length,
  };
  for (const side of ['L', 'R']) {
    const kf = series(rows, `knee_flex_${side}`).map((v, i) => (bad[i] ? NaN : v));
    const el = series(rows, `elbow_${side}`);
    const elValid = el.filter(Number.isFinite).length;
    out[side] = {
      knee_flexion_min: min(kf),
      knee_flexion_max: max(kf),
      elbow_median: elValid ? median(el) : null,
      elbow_valid_frames: elValid,
    };
  }
  out.trunk_from_vertical_median = median([...series(rows, 'trunk_L'), ...series(rows, 'trunk_R')]);
  return out;
}

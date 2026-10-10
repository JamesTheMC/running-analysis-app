// Orchestrates the client-side pipeline: demux -> decode -> pose -> rows -> gate -> strides -> summary.
// Everything runs in this tab; the video never leaves the device.

import { demux } from './mp4.js';
import { checkCodec, decodeSampledFrames, decoderSupported } from './decode.js';
import { buildRow, createPoseLandmarker } from './pose.js';
import { series, tibiaGate } from './gate.js';
import { STRIDE, hipExtensionPeaks, segmentStrides } from './strides.js';
import { EVENTS, IC_SWEEP, detectEvents } from './events.js';
import { cadenceFromDurations, cadenceFromStrides, computeMetrics } from './metrics.js';
import { applyHipAnchor, applyLegAnchor, medianThighPx } from './hip-anchor.js';
import { STABILIZE, stabilizeRows } from './stabilize.js';
import { HIP_ANCHOR, LEG_ANCHOR } from '../config.js';
import { REAR_EVENTS, detectRearEvents, pelvisLowMidstance, posteriorCaptureChecks, segmentRear, segmentationMidstance } from './rear-events.js';
import { frontalBodyHeightPx, posteriorMetrics } from './posterior-metrics.js';
import { max, median, min } from './stats.js';

export const PIPELINE = {
  scale: 0.45, // downscale before pose estimation (reference SCALE)
  targetHz: 60, // app default: sample every round(fps / 60)-th frame; the reference uses every 2nd
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
 * @param {object} opts { sampleEvery?, delegate?, nearSide?, onProgress?({done,total,phase}), signal? }
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
  const started = performance.now();
  let size = null;
  try {
    size = await decodeSampledFrames(file, track, {
      sampleEvery,
      scale: PIPELINE.scale,
      signal,
      onFrame: async (canvas, { index, ptsSec }) => {
        const res = landmarker.detectForVideo(canvas, ptsSec * 1000);
        rows.push(buildRow(res.landmarks?.[0], { index, ptsSec, width: canvas.width, height: canvas.height }));
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
    codec: track.codec,
    fps: track.fps,
    fs: track.fps / sampleEvery,
    frameCount: track.frameCount,
    rotation: track.rotation,
    mirrored: !!track.mirrored,
    frameTiming: frameTiming(track.frameTimes),
    sampleEvery,
    analysedSize: size && [size.width, size.height],
    delegate,
    seconds,
  };
  meta.view = opts.view || 'lateral';
  return { meta, rows, ...(meta.view === 'posterior' ? postProcessRear(rows, meta) : postProcess(rows, meta, opts)) };
}

// Posterior view (Milestone 4): events only so far. Metrics are added after the event contact sheet is reviewed.
export function postProcessRear(rows, meta, opts = {}) {
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
  const metrics = { ...posteriorMetrics(srows, bad, midstancePelvis, meta.fs), bodyHeightPx: frontalBodyHeightPx(srows, bad), fs: meta.fs };
  const cadence = cadenceFromDurations(seg.peaks.slice(1).map((p, i) => (p - seg.peaks[i]) / meta.fs));
  return { bad, seg, events, sweep, midstance, midstancePelvis, capture, metrics, cadence, view: 'posterior', summary: referenceSummary(rows, bad) };
}

// Everything after pose estimation. Pure: can be re-run on cached rows (test page).
export function postProcess(rows, meta, opts = {}) {
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
  // IC-timing sensitivity: the same metrics with events detected at each swept contact tolerance.
  const sweep = Object.fromEntries(
    IC_SWEEP.map((t) => [t, t === EVENTS.contactTolerance ? metrics : computeMetrics({ rows: mrows, bad, seg, hipExt, events: detectEvents(rows, bad, seg, { contactTolerance: t }) })]),
  );
  const cadence = cadenceFromStrides(rows, seg);
  return { bad, seg, hipExt, hipWindows, events, metrics, sweep, cadence, hipAnchor: anchor, legAnchor: leg, summary: referenceSummary(rows, bad) };
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

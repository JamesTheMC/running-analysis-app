// One event table per clip, the same shape for both views, so the reconciliation layer can compare
// them. Times are seconds from the clip start (row.t); frames are source frame numbers.
//
//   lateral clip:  near leg  IC / MS / TO from events.js (foot on the belt, landing gate), confidence
//                            per stride from tracking quality and IC timing sensitivity;
//                  far leg   events.js output kept only as LOW confidence (occluded, L/R swaps in 26%
//                            of far-leg points on validation); never used for metrics;
//                  step timing from the inter-ankle separation signal (both feet, forward-most).
//   posterior clip: per leg  MS = lowest pelvis in that leg's lower-foot half-cycle (reviewed);
//                            IC / TO = the half-cycle boundaries (feet at equal height), LOW
//                            confidence: they sit about half a flight time before IC / after TO,
//                            so they serve step-time symmetry only, never contact time;
//                  step timing from the same half-cycles.
//
// Confidence per stride: 'high' | 'medium' | 'low'. Per leg: the share of high/medium strides.

import { cadenceFromDurations } from './metrics.js';
import { IC_SWEEP, EVENTS } from './events.js';
import { REAR_EVENT_LAG_SEC } from './rear-events.js';
import { fillGaps, median, savgol } from './stats.js';

// IC timing spread across contact tolerances (0.2–0.4 foot lengths): above `medium` ms the stride's
// IC is medium confidence, above `low` ms it is low. One frame at 30 fps = 33 ms.
export const IC_SPREAD_MS = { medium: 35, low: 70 };

// Times where a signal crosses its own running mean (window = one stride), linearly interpolated.
// Removing the running mean makes the crossings insensitive to constant offsets (camera height or
// perspective making one foot look lower or further forward), which biased step-time symmetry by
// 15–27% when raw zero crossings or signal peaks were used (2026-10-10).
export function meanCrossings(sig, period) {
  const n = sig.length;
  const w = Math.max(3, Math.round(period));
  const cs = new Float64Array(n + 1);
  const cnt = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const ok = Number.isFinite(sig[i]);
    cs[i + 1] = cs[i] + (ok ? sig[i] : 0);
    cnt[i + 1] = cnt[i] + (ok ? 1 : 0);
  }
  const d = Array.from(sig, (v, i) => {
    const a = Math.max(0, i - (w >> 1));
    const b = Math.min(n, i + (w >> 1) + 1);
    const c = cnt[b] - cnt[a];
    return Number.isFinite(v) && c > w / 2 ? v - (cs[b] - cs[a]) / c : NaN;
  });
  // Hysteresis: a crossing counts only once the signal then reaches ±25% of its typical amplitude on
  // the new side (C0-side: far-ankle noise produced 289 raw crossings for 83 strides).
  const amp = median(d.filter(Number.isFinite).map(Math.abs));
  const h = 0.25 * (amp || 0);
  const out = [];
  let state = 0;
  let lastZero = null;
  for (let i = 1; i < n; i++) {
    const a = d[i - 1];
    const b = d[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if ((a > 0) !== (b > 0)) lastZero = { at: i - 1 + a / (a - b), up: b > 0 };
    const next = b > h ? 1 : b < -h ? -1 : state;
    if (next !== state && state !== 0 && lastZero && lastZero.up === next > 0) out.push(lastZero);
    if (next !== state) state = next;
  }
  return out;
}

const tAt = (rows, i) => (i == null || !rows[Math.round(i)] ? null : rows[Math.round(i)].t);
const fAt = (rows, i) => (i == null || !rows[Math.round(i)] ? null : rows[Math.round(i)].frame);
const ANAT = { L: 'left', R: 'right' };

function legSummary(strides) {
  const ok = strides.filter((s) => s.valid);
  const conf = (c) => ok.filter((s) => s.confidence === c).length;
  const contact = ok.map((s) => s.contactMs).filter(Number.isFinite);
  const highShare = ok.length ? conf('high') / ok.length : 0;
  const share = ok.length ? (conf('high') + conf('medium')) / ok.length : 0;
  return {
    detected: strides.length,
    valid: ok.length,
    high: conf('high'),
    medium: conf('medium'),
    low: conf('low'),
    contactMs: contact.length ? median(contact) : null,
    // Leg confidence: 'high' only when most strides are high; 'medium' when most are at least medium.
    confidence: !ok.length ? 'none' : highShare >= 0.7 && ok.length >= 8 ? 'high' : share >= 0.5 && ok.length >= 5 ? 'medium' : 'low',
  };
}

// Step times from an alternating series of [time, leg] anchors. `strides` = strides in the clip:
// two anchors per stride are expected; a count more than 20% off means the signal is too noisy
// (C0-side: 245 crossings for 83 strides, far-ankle swaps) and the timing is marked unreliable.
function stepTiming(anchors, strides) {
  const steps = { L: [], R: [] };
  for (let k = 1; k < anchors.length; k++) {
    const [t0, a] = anchors[k - 1];
    const [t1, b] = anchors[k];
    if (a === b || !Number.isFinite(t0) || !Number.isFinite(t1)) continue;
    steps[b].push(t1 - t0);
  }
  const med = (v) => {
    if (v.length < 3) return null;
    const m = median(v);
    const kept = v.filter((x) => Math.abs(x / m - 1) <= 0.3);
    return kept.reduce((s, x) => s + x, 0) / kept.length;
  };
  const L = med(steps.L);
  const R = med(steps.R);
  const ratio = strides ? anchors.length / (2 * strides) : null;
  return {
    stepSecL: L,
    stepSecR: R,
    steps: steps.L.length + steps.R.length,
    reliable: ratio != null && Math.abs(ratio - 1) <= 0.2,
    anchorRatio: ratio,
    // Step-time asymmetry, % of the mean step time (+ = left step longer).
    asymmetryPct: L && R ? (200 * (L - R)) / (L + R) : null,
  };
}

export function lateralEventTable(result, rows, meta) {
  const { seg, events, eventsSweep } = result;
  const near = seg.near.side;
  const far = near === 'L' ? 'R' : 'L';
  const fs = meta.fs;
  const legs = {};
  for (const side of [near, far]) {
    const isNear = side === near;
    const strides = events[side].strides.map((s) => {
      const flags = [...s.reasons, ...s.lowQuality];
      let confidence = 'high';
      if (!isNear) {
        confidence = 'low';
        flags.push('far leg (occluded; not used for metrics)');
      } else {
        if (s.lowQuality.length) confidence = 'medium';
        // IC timing sensitivity: IC moves by more than one analysed frame across contact tolerances.
        const ics = IC_SWEEP.map((t) => eventsSweep?.[t]?.[side]?.strides?.find((x) => x.cycle === s.cycle)?.ic).filter((x) => x != null);
        const spreadMs = ics.length > 1 ? ((Math.max(...ics) - Math.min(...ics)) / fs) * 1000 : 0;
        if (spreadMs > IC_SPREAD_MS.low) {
          confidence = 'low';
          flags.push(`IC moves ${Math.round(spreadMs)} ms across contact tolerances`);
        } else if (spreadMs > IC_SPREAD_MS.medium && confidence === 'high') confidence = 'medium';
        if (s.contactShare > 0.5) flags.push('no flight phase (contact > 50% of the stride)');
      }
      return {
        cycle: s.cycle,
        valid: s.valid,
        confidence: s.valid ? confidence : 'low',
        ic: { t: tAt(rows, s.ic), frame: fAt(rows, s.ic), row: s.ic },
        ms: { t: tAt(rows, s.ms), frame: fAt(rows, s.ms), row: s.ms, method: s.msSource },
        to: { t: tAt(rows, s.to), frame: fAt(rows, s.to), row: s.to },
        contactMs: s.valid ? ((s.to - s.ic) / fs) * 1000 : null,
        flags,
      };
    });
    legs[ANAT[side]] = { role: isNear ? 'near' : 'far', method: 'side: foot on belt + landing gate', strides, summary: legSummary(strides) };
  }
  // Step anchors: the feet passing each other (separation signal crossing its running mean). An up
  // crossing = the near foot swinging past the planted far foot (the far leg's midstance region), a
  // down crossing = the reverse. Consecutive anchors alternate legs, one step apart.
  const t0 = rows[0]?.t ?? 0;
  const anchors = meanCrossings(seg.sig, seg.periodSec * fs).map((c) => [t0 + c.at / fs, c.up ? far : near]);
  const timing = stepTiming(anchors, seg.cycles.length);
  return {
    view: 'lateral',
    fs,
    near: ANAT[near],
    legs,
    timing: {
      cadence: result.cadence,
      stepSecL: timing.stepSecL,
      stepSecR: timing.stepSecR,
      stepAsymmetryPct: timing.asymmetryPct,
      stepTimingReliable: timing.reliable,
      contactMs: { [ANAT[near]]: legs[ANAT[near]].summary.contactMs, [ANAT[far]]: null },
      method: 'step times between the feet passing each other (inter-ankle separation, running-mean crossings)',
    },
  };
}

export function posteriorEventTable(result, rows, meta) {
  const { midstancePelvis, capture } = result;
  const fs = meta.fs;
  // Same rule as the posterior adapter (posterior.js): no left/right order violations.
  const swapsOk = capture ? capture.swapFrames === 0 : false;
  const legs = {};
  for (const side of ['L', 'R']) {
    const strides = midstancePelvis[side].map((h, k) => {
      const flags = h.reason ? [h.reason] : [];
      if (!swapsOk) flags.push('left/right swaps in this clip');
      const icRow = Math.max(0, h.start - REAR_EVENT_LAG_SEC.ic * fs);
      const toRow = Math.max(0, h.end - REAR_EVENT_LAG_SEC.to * fs);
      return {
        cycle: k,
        valid: h.valid,
        // MS (lowest pelvis) is medium; IC/TO from height crossings are low (see header).
        confidence: !h.valid ? 'low' : swapsOk ? 'medium' : 'low',
        ic: { t: icRow / fs + (rows[0]?.t ?? 0), frame: fAt(rows, icRow), row: icRow, confidence: 'low', method: 'foot-height crossing − 100 ms (calibrated)' },
        ms: { t: tAt(rows, h.ms), frame: fAt(rows, h.ms), row: h.ms, method: 'lowest pelvis in stance half-cycle' },
        to: { t: toRow / fs + (rows[0]?.t ?? 0), frame: fAt(rows, toRow), row: toRow, confidence: 'low', method: 'foot-height crossing − 120 ms (calibrated)' },
        contactMs: null, // not estimable from behind (see header)
        flags,
      };
    });
    legs[ANAT[side]] = { role: 'rear', method: 'rear: foot-height alternation + lowest pelvis', strides, summary: legSummary(strides) };
  }
  // Step anchors: left-minus-right foot height crossing its running mean (up = the left foot becoming
  // the lower, planted one).
  const t0 = rows[0]?.t ?? 0;
  const anchors = meanCrossings(result.seg.sig, result.seg.period).map((c) => [t0 + c.at / fs, c.up ? 'L' : 'R']);
  const timing = stepTiming(anchors, result.seg.peaks.length);
  return {
    view: 'posterior',
    fs,
    legs,
    timing: {
      cadence: result.cadence,
      stepSecL: timing.stepSecL,
      stepSecR: timing.stepSecR,
      stepAsymmetryPct: timing.asymmetryPct,
      stepTimingReliable: timing.reliable,
      contactMs: { left: null, right: null },
      method: 'step times from the feet\'s height alternation (running-mean crossings)',
    },
  };
}

export { EVENTS };

// Vertical oscillation: per stride, the range of the smoothed pelvis (hip midpoint) height, in px
// and as a share of body height (converted to cm with the intake height by the reconciliation layer).
// Both views can measure it, so it is one of the cross-checked quantities.
export function verticalOscillation(rows, bad, bounds, bodyHeightPx, fs) {
  const y = rows.map((r, i) => (r.lm && !bad[i] ? (r.lm[23 * 4 + 1] + r.lm[24 * 4 + 1]) / 2 : NaN));
  const win = Math.max(5, Math.round(0.1 * fs) | 1);
  const sm = savgol(fillGaps(y, Math.round(0.1 * fs)), win, 2);
  const ranges = [];
  for (const [a, b] of bounds) {
    const seg = Array.from(sm.slice(Math.max(0, Math.round(a)), Math.round(b) + 1)).filter(Number.isFinite);
    if (seg.length >= 0.8 * (b - a)) ranges.push(Math.max(...seg) - Math.min(...seg));
  }
  if (ranges.length < 5) return null;
  const px = median(ranges);
  return { px, shareOfHeight: bodyHeightPx ? px / bodyHeightPx : null, strides: ranges.length };
}

// Landmark quality for a clip: share of analysed frames with a pose and mean visibility of the
// landmarks the view relies on.
export function landmarkQuality(rows, ids) {
  const posed = rows.filter((r) => r.lm);
  const vis = posed.flatMap((r) => ids.map((k) => r.lm[k * 4 + 3]));
  const meanVis = vis.length ? vis.reduce((a, b) => a + b, 0) / vis.length : 0;
  return { posedShare: rows.length ? posed.length / rows.length : 0, meanVisibility: meanVis, lowVisibilityShare: vis.length ? vis.filter((v) => v < 0.5).length / vis.length : 1 };
}

// Reconciliation inputs are optional extras: on partial input (unit-test fixtures, a failed step)
// they become null with the reason recorded instead of failing the clip.
export function safely(fn, errors, name) {
  try {
    return fn();
  } catch (e) {
    errors.push(`${name}: ${e.message}`);
    return null;
  }
}

export function clipInfo(meta, extra = {}) {
  return {
    fps: meta.fps,
    analysedHz: meta.fs,
    frames: meta.frameCount,
    durationSec: meta.frameCount && meta.fps ? meta.frameCount / meta.fps : null,
    rotation: meta.rotation,
    mirrored: !!meta.mirrored,
    frameTiming: meta.frameTiming ?? null,
    analysedSize: meta.analysedSize,
    ...extra,
  };
}

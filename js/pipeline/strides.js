// Stride segmentation from ONE reference signal (SPEC 7.3) and late-stance peak hip extension.
//
// Independent per-leg peak picking disagrees between legs because the far leg is occluded, so both
// legs' events come from one signal: the horizontal separation of the two ankles, signed so that
// positive = near foot ahead (in tibia lengths). On a treadmill the pelvis barely moves forward/back,
// and the separation does not depend on the hip landmark, which the treadmill rail and swinging hand
// often cover. From this one signal:
//   * maximum = near foot forward-most / far foot back-most (far-leg toe-off proxy),
//   * minimum = far foot forward-most / near foot back-most (near-leg toe-off proxy).
// Peaks are tracked with the stride period as a constraint (each next peak within 0.75-1.25 periods),
// which stops secondary bumps in swing from being counted as extra strides.
//
// Late-stance window for a leg = from halfway through its foot's backward sweep (forward-most ->
// back-most) to its toe-off proxy + 10% of the cycle. Peak hip extension is the maximum of the hip
// extension signal inside the window. A stride is rejected when the window is mostly missing/gated,
// or when the maximum sits on the window edge (no true peak inside: the window missed it, or
// tracking is off).

import { LANDMARKS } from './kinematics.js';
import { VIS_MIN } from './pose.js';
import { fillGaps, median, percentile, savgol } from './stats.js';

export const STRIDE = {
  minPeriodSec: 0.45,
  maxPeriodSec: 1.6,
  stepRange: [0.75, 1.25], // next peak searched this many periods after the previous one
  referenceSmoothing: 1 / 3, // Savitzky-Golay window for the reference signal, in periods
  maxMissingInWindow: 0.3,
  toeOffMargin: 0.1, // share of the cycle added after the toe-off proxy
  gapFillSec: 0.1,
};

const oddAtLeast = (n, lo) => Math.max(lo, n % 2 ? n : n + 1);

// Light smoothing used for joint-angle series (window ~0.11 s, as 7 samples at 60 Hz).
export function smoothSeries(a, fs, windowSec = 0.11) {
  const filled = fillGaps(a, Math.round(STRIDE.gapFillSec * fs));
  return savgol(filled, oddAtLeast(Math.round(windowSec * fs), 5), 2);
}

const lmAt = (row, k) => [row.lm[k * 4], row.lm[k * 4 + 1], row.lm[k * 4 + 2], row.lm[k * 4 + 3]];

// Near side = the side MediaPipe places closer to the camera (smaller z) for hip/knee/ankle.
export function detectNearSide(rows) {
  const zs = { L: [], R: [] };
  for (const r of rows) {
    if (!r.lm) continue;
    for (const side of ['L', 'R']) {
      const ids = LANDMARKS[side];
      zs[side].push((lmAt(r, ids.hip)[2] + lmAt(r, ids.knee)[2] + lmAt(r, ids.ank)[2]) / 3);
    }
  }
  const zL = median(zs.L);
  const zR = median(zs.R);
  return { side: zL <= zR ? 'L' : 'R', zL, zR };
}

export function referenceSignal(rows, bad, nearSide) {
  const farSide = nearSide === 'L' ? 'R' : 'L';
  const an = LANDMARKS[nearSide].ank;
  const af = LANDMARKS[farSide].ank;
  const facing = Math.sign(median(rows.map((r) => r.facing ?? NaN))) || 1;
  const tibia = median(rows.map((r, i) => (bad[i] ? NaN : r[`tibia_${nearSide}`] ?? NaN)));
  const raw = rows.map((r, i) => {
    if (!r.lm || bad[i]) return NaN;
    const n = lmAt(r, an);
    const f = lmAt(r, af);
    if (n[3] <= VIS_MIN || f[3] <= VIS_MIN) return NaN;
    return (facing * (n[0] - f[0])) / tibia;
  });
  return { raw, facing, tibia };
}

function estimatePeriod(x, fs) {
  const fin = Array.from(x).filter(Number.isFinite);
  if (fin.length < fs) return 0;
  const mean = fin.reduce((s, y) => s + y, 0) / fin.length;
  const d = Array.from(x, (y) => (Number.isFinite(y) ? y - mean : 0));
  let best = 0;
  let bestLag = 0;
  for (let lag = Math.round(STRIDE.minPeriodSec * fs); lag <= Math.round(STRIDE.maxPeriodSec * fs); lag++) {
    let s = 0;
    for (let i = 0; i + lag < d.length; i++) s += d[i] * d[i + lag];
    const c = s / (d.length - lag);
    if (c > best) {
      best = c;
      bestLag = lag;
    }
  }
  return bestLag;
}

function argExtreme(x, from, to, greater) {
  let best = -1;
  for (let i = Math.max(0, from); i <= Math.min(x.length - 1, to); i++) {
    if (Number.isFinite(x[i]) && (best < 0 || (greater ? x[i] > x[best] : x[i] < x[best]))) best = i;
  }
  return best;
}

// Maxima tracked outward from the global maximum, one per period. Where a whole search window is
// missing, tracking skips ahead one period, so no cycle is formed across the gap.
export function trackPeaks(x, period) {
  const [lo, hi] = STRIDE.stepRange.map((k) => Math.round(k * period));
  const anchor = argExtreme(x, 0, x.length - 1, true);
  if (anchor < 0) return [];
  const peaks = [anchor];
  for (const dir of [1, -1]) {
    let p = anchor;
    for (;;) {
      const a = p + dir * lo;
      const b = p + dir * hi;
      if (Math.min(a, b) < 0 || Math.max(a, b) >= x.length) break;
      const n = argExtreme(x, Math.min(a, b), Math.max(a, b), true);
      if (n < 0) {
        p += dir * period;
        continue;
      }
      if (dir > 0) peaks.push(n);
      else peaks.unshift(n);
      p = n;
    }
  }
  return peaks;
}

// Late-stance window for a foot moving from forward-most (index `fwd`, signal value high for this
// foot) to back-most (index `back`).
function lateStanceWindow(sig, fwd, back, sign, cycleLen, n) {
  const mid = (sig[fwd] + sig[back]) / 2;
  let ws = fwd;
  while (ws < back && sign * sig[ws] > sign * mid) ws++;
  const we = Math.min(n - 1, back + Math.round(STRIDE.toeOffMargin * cycleLen));
  return [ws, we];
}

export function segmentStrides(rows, bad, fs, { nearSide } = {}) {
  const near = nearSide ? { side: nearSide, source: 'given' } : { ...detectNearSide(rows), source: 'auto' };
  const far = near.side === 'L' ? 'R' : 'L';
  const ref = referenceSignal(rows, bad, near.side);
  const period = estimatePeriod(smoothSeries(ref.raw, fs), fs);
  const empty = { near, far, ref, sig: ref.raw, periodSec: null, peaks: [], cycles: [] };
  if (!period) return empty;

  const sig = savgol(fillGaps(ref.raw, Math.round(STRIDE.gapFillSec * fs)), oddAtLeast(Math.round(period * STRIDE.referenceSmoothing), 5), 2);
  const peaks = trackPeaks(sig, period);
  const [lo, hi] = STRIDE.stepRange.map((k) => Math.round(k * period));
  const cycles = [];
  for (let k = 0; k + 1 < peaks.length; k++) {
    const a = peaks[k];
    const b = peaks[k + 1];
    const len = b - a;
    if (len < lo || len > hi) {
      cycles.push({ start: a, end: b, reason: 'tracking gap between strides' });
      continue;
    }
    const trough = argExtreme(sig, a, b, false);
    const c = { start: a, end: b, trough, windows: {} };
    // Near foot: forward-most at a, back-most at the trough.
    c.windows[near.side] = lateStanceWindow(sig, a, trough, 1, len, rows.length);
    // Far foot: forward-most at the trough, back-most at the next maximum (b).
    c.windows[far] = lateStanceWindow(sig, trough, b, -1, len, rows.length);
    cycles.push(c);
  }
  return { near, far, ref, sig, periodSec: period / fs, peaks, cycles };
}

function peakInWindow(x, raw, [ws, we]) {
  let missing = 0;
  for (let i = ws; i <= we; i++) if (!Number.isFinite(raw[i])) missing++;
  const share = missing / (we - ws + 1);
  if (share > STRIDE.maxMissingInWindow) return { valid: false, reason: 'window mostly missing or gated' };
  const i = argExtreme(x, ws, we, true);
  if (i < 0) return { valid: false, reason: 'no data in window' };
  if (i === ws || i === we) return { valid: false, index: i, value: x[i], reason: 'maximum on window edge (no peak inside)' };
  return { valid: true, index: i, value: x[i] };
}

export function hipExtensionPeaks(rows, bad, fs, seg) {
  const out = {};
  for (const side of ['L', 'R']) {
    const raw = rows.map((r, i) => (bad[i] || r[`hip_ext_${side}`] == null ? NaN : r[`hip_ext_${side}`]));
    const sm = smoothSeries(raw, fs);
    const strides = seg.cycles.map((c) =>
      c.windows ? { window: c.windows[side], ...peakInWindow(sm, raw, c.windows[side]) } : { valid: false, reason: c.reason },
    );
    const values = strides.filter((s) => s.valid).map((s) => s.value);
    out[side] = {
      near: side === seg.near.side,
      strides,
      values,
      n: values.length,
      total: strides.length,
      median: values.length ? median(values) : null,
      iqr: values.length ? [percentile(values, 25), percentile(values, 75)] : null,
      smoothed: sm,
    };
  }
  return out;
}

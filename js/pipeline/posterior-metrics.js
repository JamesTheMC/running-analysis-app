// Posterior (rear-view) metrics at midstance, per leg, as per-stride medians.
//
// Midstance = lowest point of the smoothed pelvis (hip midpoint) inside each leg's stance
// half-cycle (rear-events.js pelvisLowMidstance): the deepest landing position and the least
// timing-sensitive candidate on review. Sign convention for both legs: + = toward the midline.
// Values are checked for left/right symmetry by mirroring (test/unit.js).
//
//   hip adduction       thigh (hip -> knee) vs the perpendicular to the pelvis line; + = knee toward midline
//   knee FPPA           180 - frontal hip-knee-ankle angle; + = knee medial to the hip-ankle line (valgus)
//   trunk lateral shift shoulder midpoint vs pelvis midpoint along the pelvis line; + = toward the stance side
//   trunk lateral lean  shoulder-midpoint to pelvis-midpoint line vs image vertical; + = toward the stance side
//   heel from midline   heel vs pelvis midpoint along the pelvis line, in hip widths; + = on its own side,
//                       <= 0 = on or past the midline (crossover)
//   pelvic drop         change in the pelvis line from loading response (stance start from the
//                       segmentation) to midstance; + = the swing-side hip drops

import { LANDMARKS } from './kinematics.js';
import { median, percentile } from './stats.js';
import { SEGMENT_RATIOS } from './metrics.js';

const DEG = 180 / Math.PI;
const P = (row, k) => [row.lm[k * 4], row.lm[k * 4 + 1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const unit = (v) => {
  const n = Math.hypot(...v) || 1;
  return [v[0] / n, v[1] / n];
};
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

// Pelvis frame for stance leg `side`: pelvis direction, downward perpendicular, medial direction.
function frame(row, side) {
  const hl = P(row, LANDMARKS.L.hip);
  const hr = P(row, LANDMARKS.R.hip);
  const u = unit(sub(hr, hl)); // left hip -> right hip
  const n = [-u[1], u[0]]; // perpendicular, pointing down the image
  const m = side === 'L' ? u : [-u[0], -u[1]]; // medial for this leg
  return { hl, hr, u, n, m, hipMid: mid(hl, hr), hipW: Math.hypot(...sub(hr, hl)) };
}

export const POSTERIOR = {
  hipAdduction(row, side) {
    const f = frame(row, side);
    const t = sub(P(row, LANDMARKS[side].knee), P(row, LANDMARKS[side].hip));
    return Math.atan2(dot(t, f.m), dot(t, f.n)) * DEG;
  },
  kneeValgus(row, side) {
    const f = frame(row, side);
    const h = P(row, LANDMARKS[side].hip);
    const k = P(row, LANDMARKS[side].knee);
    const a = P(row, LANDMARKS[side].ank);
    const v1 = sub(h, k);
    const v2 = sub(a, k);
    const interior = Math.acos(Math.max(-1, Math.min(1, dot(v1, v2) / (Math.hypot(...v1) * Math.hypot(...v2))))) * DEG;
    const l = unit(sub(a, h));
    const rel = sub(k, h);
    const off = sub(rel, [l[0] * dot(rel, l), l[1] * dot(rel, l)]);
    return Math.sign(dot(off, f.m)) * (180 - interior);
  },
  // In hip widths (converted to cm by the adapter when height is known).
  trunkShift(row, side) {
    const f = frame(row, side);
    const s = mid(P(row, LANDMARKS.L.sho), P(row, LANDMARKS.R.sho));
    return dot(sub(s, f.hipMid), [-f.m[0], -f.m[1]]) / f.hipW;
  },
  trunkLateralLean(row, side) {
    const f = frame(row, side);
    const s = mid(P(row, LANDMARKS.L.sho), P(row, LANDMARKS.R.sho));
    const v = sub(s, f.hipMid); // pointing up the trunk
    const toward = [-f.m[0], -f.m[1]]; // toward the stance side
    return Math.atan2(dot(v, toward), -v[1]) * DEG;
  },
  heelFromMidline(row, side) {
    const f = frame(row, side);
    return dot(sub(P(row, LANDMARKS[side].heel), f.hipMid), [-f.m[0], -f.m[1]]) / f.hipW;
  },
};

// Pelvis line angle for stance leg `side`: + when the swing-side hip is lower in the image.
export function pelvisDropAngle(row, side) {
  const stance = P(row, LANDMARKS[side].hip);
  const swing = P(row, LANDMARKS[side === 'L' ? 'R' : 'L'].hip);
  return Math.atan2(swing[1] - stance[1], Math.abs(swing[0] - stance[0])) * DEG;
}

// Body height in analysed pixels from frontal segment lengths (both sides, Winter ratios).
export function frontalBodyHeightPx(rows, bad) {
  const total = SEGMENT_RATIOS.thigh + SEGMENT_RATIOS.shank + SEGMENT_RATIOS.trunk;
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const v = [];
  rows.forEach((r, i) => {
    if (!r.lm || bad[i]) return;
    for (const side of ['L', 'R']) {
      const ids = LANDMARKS[side];
      v.push((d(P(r, ids.hip), P(r, ids.knee)) + d(P(r, ids.knee), P(r, ids.ank)) + d(P(r, ids.sho), P(r, ids.hip))) / total);
    }
  });
  return median(v);
}

function summarise(values, total) {
  const v = values.filter(Number.isFinite);
  return {
    median: v.length ? median(v) : null,
    mean: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null,
    iqr: v.length ? [percentile(v, 25), percentile(v, 75)] : null,
    n: v.length,
    total,
    quality: total ? v.length / total : 0,
    values: v,
  };
}

// Timing-sensitivity rule: midstance shifted by ±33 ms (2 analysed frames at 60 Hz, 1 at 30 Hz).
export const MS_SWEEP_SEC = 0.033;
export const msSweepShifts = (fs) => {
  const k = Math.max(1, Math.round(MS_SWEEP_SEC * (fs || 60)));
  return [-k, 0, k];
};

/**
 * Per-leg posterior metrics at midstance (+ the same at MS shifted by ±MS_SWEEP_SEC).
 * `ms` = pelvisLowMidstance(...) output: { L: [{ start, end, ms, valid }], R: [...] }.
 */
export function posteriorMetrics(rows, bad, ms, fs) {
  const shifts = msSweepShifts(fs);
  const usable = (i) => rows[i]?.lm && !bad[i];
  const out = {};
  for (const side of ['L', 'R']) {
    const halves = ms[side];
    const total = halves.length;
    const at = (shift) => {
      const per = { hipAdduction: [], kneeValgus: [], trunkShift: [], trunkShiftPx: [], trunkLateralLean: [], heelFromMidline: [], heelFromMidlinePx: [], pelvicDrop: [] };
      for (const h of halves) {
        if (!h.valid) continue;
        const i = h.ms + shift;
        if (!usable(i)) continue;
        for (const [k, fn] of Object.entries(POSTERIOR)) per[k].push(fn(rows[i], side));
        per.trunkShiftPx.push(POSTERIOR.trunkShift(rows[i], side) * frame(rows[i], side).hipW);
        per.heelFromMidlinePx.push(POSTERIOR.heelFromMidline(rows[i], side) * frame(rows[i], side).hipW);
        const lr = Math.max(0, Math.ceil(h.start)); // loading response: segmentation-derived stance start
        if (usable(lr) && lr < i) per.pelvicDrop.push(pelvisDropAngle(rows[i], side) - pelvisDropAngle(rows[lr], side));
      }
      return Object.fromEntries(Object.entries(per).map(([k, v]) => [k, summarise(v, total)]));
    };
    out[side] = { total, shifts, sweep: Object.fromEntries(shifts.map((d) => [d, at(d)])) };
    out[side].summary = out[side].sweep[0];
  }
  // Arm crossing: an arm swings forward while the OPPOSITE leg is in stance. For each stance
  // half-cycle, the opposite arm's largest medial wrist excursion relative to the shoulder midpoint,
  // in shoulder widths (+ = wrist past the body midline toward the other side = crossing).
  for (const stance of ['L', 'R']) {
    const arm = stance === 'L' ? 'R' : 'L';
    const wr = LANDMARKS[arm].wri;
    const v = [];
    for (const h of ms[stance]) {
      if (!h.valid) continue;
      let best = -Infinity;
      for (let i = Math.ceil(h.start); i <= Math.floor(h.end); i++) {
        if (!usable(i) || rows[i].lm[wr * 4 + 3] < 0.5) continue;
        const sl = P(rows[i], LANDMARKS.L.sho);
        const sr = P(rows[i], LANDMARKS.R.sho);
        const u = unit(sub(sr, sl)); // left shoulder -> right shoulder
        const medial = arm === 'L' ? u : [-u[0], -u[1]];
        const w = Math.hypot(...sub(sr, sl)) || 1;
        best = Math.max(best, dot(sub(P(rows[i], wr), mid(sl, sr)), medial) / w);
      }
      if (Number.isFinite(best)) v.push(best);
    }
    out[arm].armCross = summarise(v, ms[stance].length);
  }
  return out;
}

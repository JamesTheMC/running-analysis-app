// Joint-angle curves over the gait cycle for a side clip's near leg: knee flexion and hip extension
// (vs the trunk axis) from initial contact (0%) to the next initial contact (100%), each valid stride
// resampled to 101 points on stabilised landmarks, then the median and the 25–75% band across
// strides. Display only: validated at gait events (knee ±7–10°, hip ±3–8°), not across the whole
// cycle; never scored or used for findings.
import { LANDMARKS, hipExtensionSigned, kneeFlexion } from './kinematics.js';
import { stabilizeRows } from './stabilize.js';
import { VIS_MIN } from './pose.js';

export const CURVES = { points: 101, minStrides: 5, strideTolerance: 0.35 };

const pct = (sorted, p) => {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (i - lo);
};

function angleSeries(rows, side, facing) {
  const id = LANDMARKS[side];
  const P = (r, k) => [r.lm[k * 4], r.lm[k * 4 + 1]];
  const ok = (r, ...ks) => r.lm && ks.every((k) => r.lm[k * 4 + 3] >= VIS_MIN);
  return {
    knee: rows.map((r) => (ok(r, id.hip, id.knee, id.ank) ? kneeFlexion(P(r, id.hip), P(r, id.knee), P(r, id.ank)) : NaN)),
    hip: rows.map((r) => (ok(r, id.sho, id.hip, id.knee) ? hipExtensionSigned(P(r, id.sho), P(r, id.hip), P(r, id.knee), facing) : NaN)),
  };
}

function resample(series, a, b, n) {
  const out = new Array(n);
  for (let j = 0; j < n; j++) {
    const x = a + ((b - a) * j) / (n - 1);
    const i = Math.floor(x);
    const f = x - i;
    const v0 = series[i];
    const v1 = series[Math.min(i + 1, b)];
    out[j] = Number.isFinite(v0) && Number.isFinite(v1) ? v0 + (v1 - v0) * f : Number.isFinite(v0) ? v0 : v1;
  }
  return out;
}

/**
 * @param {Array} rows        pipeline rows of the clip
 * @param {object} eventTable lateral event table (gait-events.js)
 * @param {object} opts       { fs, nearSide: 'L'|'R', facing: ±1 }
 */
export function gaitCurves(rows, eventTable, { fs, nearSide, facing = 1 } = {}) {
  const leg = nearSide === 'L' ? 'left' : 'right';
  const strides = (eventTable?.legs?.[leg]?.strides || []).filter((s) => s.valid && s.ic?.row != null).sort((x, y) => x.ic.row - y.ic.row);
  const spans = [];
  for (let i = 0; i + 1 < strides.length; i++) spans.push([strides[i].ic.row, strides[i + 1].ic.row]);
  const lengths = spans.map(([a, b]) => b - a).sort((x, y) => x - y);
  const med = pct(lengths, 0.5);
  const good = spans.filter(([a, b]) => med && Math.abs(b - a - med) <= CURVES.strideTolerance * med);
  if (good.length < CURVES.minStrides) return { leg, strides: good.length, reason: `only ${good.length} complete strides (needs ${CURVES.minStrides})` };
  const srows = stabilizeRows(rows, fs);
  const series = angleSeries(srows, nearSide, facing);
  const out = { leg, strides: good.length, points: CURVES.points };
  for (const joint of ['knee', 'hip']) {
    const per = good.map(([a, b]) => resample(series[joint], a, b, CURVES.points)).filter((c) => c.filter(Number.isFinite).length > CURVES.points * 0.8);
    if (per.length < CURVES.minStrides) {
      out[joint] = { reason: `only ${per.length} strides tracked well enough` };
      continue;
    }
    const at = (j, p) => pct(per.map((c) => c[j]).filter(Number.isFinite).sort((x, y) => x - y), p);
    out[joint] = {
      median: Array.from({ length: CURVES.points }, (_, j) => Math.round(at(j, 0.5) * 10) / 10),
      p25: Array.from({ length: CURVES.points }, (_, j) => Math.round(at(j, 0.25) * 10) / 10),
      p75: Array.from({ length: CURVES.points }, (_, j) => Math.round(at(j, 0.75) * 10) / 10),
      strides: per.length,
    };
  }
  return out;
}

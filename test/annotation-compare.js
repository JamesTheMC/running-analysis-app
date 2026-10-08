// Compare blind manual joint-centre annotations with the MediaPipe landmarks on the same frames.
// Inputs (test-data/debug, gitignored): annotation_key.json (frames, crop origins, landmarks;
// written when the frames were picked) and annotations.json (manual points in crop pixels).
// Each metric is computed with the pipeline's own formula from both point sets; the difference is
// the landmark error at that frame (it does not include event-timing error).
import { LANDMARKS, hipExtensionSigned, kneeFlexion } from '../js/pipeline/kinematics.js';
import { ankleDorsiflexion, footAngle, tibialInclination, trunkLean } from '../js/pipeline/metrics.js';
import { POSTERIOR } from '../js/pipeline/posterior-metrics.js';
import { median } from '../js/pipeline/stats.js';

const SIDE_POINTS = { shoulder: 'sho', hip: 'hip', knee: 'knee', ankle: 'ank', heel: 'heel', toe: 'toe' };
const REAR_POINTS = ['shoulder', 'hip', 'knee', 'ankle', 'heel'];
const at = (row, k) => [row.lm[k * 4], row.lm[k * 4 + 1]];

// A row in analysed pixels from manual crop points. Missing points stay NaN.
function manualRow(points, key, sidePoints) {
  const lm = new Float32Array(132).fill(NaN);
  const put = (k, p) => lm.set([(p[0] + key.x0) / key.k, (p[1] + key.y0) / key.k, 0, 1], k * 4);
  for (const [name, p] of Object.entries(points)) {
    if (!Array.isArray(p)) continue;
    if (sidePoints) {
      const id = SIDE_POINTS[name];
      if (id) for (const s of ['L', 'R']) put(LANDMARKS[s][id], p); // near side stands in for both (trunk midpoints)
    } else {
      const m = /^([LR])_(\w+)$/.exec(name);
      const id = m && { shoulder: 'sho', hip: 'hip', knee: 'knee', ankle: 'ank', heel: 'heel' }[m[2]];
      if (id) put(LANDMARKS[m[1]][id], p);
    }
  }
  return { lm };
}
// MediaPipe row with the near side copied to both sides (same trunk definition as the manual row).
function nearOnly(row, near) {
  const lm = Float32Array.from(row.lm);
  for (const id of Object.values(SIDE_POINTS)) {
    const k = LANDMARKS[near][id];
    lm.set(lm.subarray(k * 4, k * 4 + 4), LANDMARKS[near === 'L' ? 'R' : 'L'][id] * 4);
  }
  return { lm };
}

export function compare(keyList, annotations, { near = 'L', facing = -1, bodyHeightPx, heightCm } = {}) {
  const ids = LANDMARKS[near];
  const rows = [];
  for (const key of keyList) {
    const label = key.blind;
    const a = annotations.crops[label];
    if (!a) continue;
    const mp = { lm: Float32Array.from(key.lm) };
    const kind = /_IC$/.test(key.label) ? 'IC' : /_MS$/.test(key.label) ? 'MS' : /HIPPEAK/.test(key.label) ? 'HIPPEAK' : 'REAR';
    const rec = { label, frame: key.frame, kind, truth: key.label, values: {} };
    if (kind !== 'REAR') {
      const man = manualRow(a, key, true);
      const mpNear = nearOnly(mp, near);
      const f = {
        kneeFlexion: (r) => kneeFlexion(at(r, ids.hip), at(r, ids.knee), at(r, ids.ank)),
        hipExtension: (r) => hipExtensionSigned(at(r, ids.sho), at(r, ids.hip), at(r, ids.knee), facing),
        tibialInclination: (r) => tibialInclination(r, ids, facing),
        footAngle: (r) => footAngle(r, ids, facing),
        ankleDF: (r) => ankleDorsiflexion(r, ids),
        trunkLeanNearSide: (r) => trunkLean(r, facing),
        heelAheadOfHipPx: (r) => facing * (at(r, ids.heel)[0] - at(r, ids.hip)[0]),
      };
      for (const [k, fn] of Object.entries(f)) {
        const m = fn(man);
        const p = fn(k === 'trunkLeanNearSide' || k === 'heelAheadOfHipPx' ? mpNear : mp);
        if (Number.isFinite(m) && Number.isFinite(p)) rec.values[k] = { manual: m, app: p, error: p - m };
      }
      // App trunk lean as reported (both-side midpoints) vs the manual near-side line.
      const tm = trunkLean(man, facing);
      if (Number.isFinite(tm)) rec.values.trunkLeanAsReported = { manual: tm, app: trunkLean(mp, facing), error: trunkLean(mp, facing) - tm };
      if (rec.values.heelAheadOfHipPx && bodyHeightPx && heightCm) {
        const s = heightCm / bodyHeightPx;
        const v = rec.values.heelAheadOfHipPx;
        rec.values.footToComCm = { manual: v.manual * s, app: v.app * s, error: v.error * s };
      }
      // Per-landmark pixel distance (full-resolution pixels).
      rec.pointErrorPx = {};
      for (const [name, id] of Object.entries(SIDE_POINTS)) {
        const k = ids[id];
        const m = at(man, k);
        if (Number.isFinite(m[0])) rec.pointErrorPx[name] = Math.hypot(at(mp, k)[0] - m[0], at(mp, k)[1] - m[1]) * key.k;
      }
    } else {
      const man = manualRow(a, key, false);
      const stance = /_Lstance_/.test(key.label) ? 'L' : 'R';
      rec.stance = stance;
      for (const [k, fn] of Object.entries(POSTERIOR)) {
        const m = fn(man, stance);
        const p = fn(mp, stance);
        if (Number.isFinite(m) && Number.isFinite(p)) rec.values[k] = { manual: m, app: p, error: p - m };
      }
      rec.pointErrorPx = {};
      for (const s of ['L', 'R'])
        for (const name of REAR_POINTS) {
          const k = LANDMARKS[s][{ shoulder: 'sho', hip: 'hip', knee: 'knee', ankle: 'ank', heel: 'heel' }[name]];
          const m = at(man, k);
          if (Number.isFinite(m[0])) rec.pointErrorPx[`${s}_${name}`] = Math.hypot(at(mp, k)[0] - m[0], at(mp, k)[1] - m[1]) * key.k;
        }
    }
    rows.push(rec);
  }
  // Per-metric summary: mean error (bias), mean absolute error, max |error|, n.
  const byMetric = {};
  for (const r of rows)
    for (const [k, v] of Object.entries(r.values)) (byMetric[`${r.kind === 'REAR' ? 'rear' : 'side'}:${k}`] ??= []).push(v.error);
  const summary = Object.fromEntries(
    Object.entries(byMetric).map(([k, e]) => [k, { n: e.length, bias: e.reduce((a, b) => a + b, 0) / e.length, mae: e.reduce((a, b) => a + Math.abs(b), 0) / e.length, medianAbs: median(e.map(Math.abs)), maxAbs: Math.max(...e.map(Math.abs)) }]),
  );
  const pts = {};
  for (const r of rows) for (const [k, v] of Object.entries(r.pointErrorPx)) (pts[`${r.kind === 'REAR' ? 'rear' : 'side'}:${k.replace(/^[LR]_/, '')}`] ??= []).push(v);
  const pointSummary = Object.fromEntries(Object.entries(pts).map(([k, v]) => [k, { n: v.length, medianPx: median(v), maxPx: Math.max(...v) }]));
  return { rows, summary, pointSummary };
}

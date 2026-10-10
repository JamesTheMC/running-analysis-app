// Event-based side-view metrics, one value per stride, summarised as per-stride medians (never
// whole-clip extremes). Built on events.js (IC / MS / TO per leg) and strides.js (cycles, hip peaks).
//
// Sign conventions (image y grows downward; `facing` = +1 when the runner faces +x):
//   tibial inclination  shank (knee -> ankle) vs vertical; + = ankle AHEAD of the knee (overstride direction)
//   trunk lean          shoulder-midpoint to hip-midpoint line vs vertical; + = shoulders ahead (forward
//                       lean). Midpoints, not the near side alone: the near shoulder landmark moves with
//                       arm swing (near-only gave a 14 deg within-stride range vs 9 deg with midpoints).
//   trunk change        lean at peak hip extension minus lean at IC (same stride); - = trunk extends (leans back)
//   ankle DF            90 deg minus the angle between shank (ankle -> knee) and foot (heel -> foot index);
//                       + = dorsiflexion
//   foot inclination    foot (heel -> foot index) angle at IC minus the same foot's angle at midstance (foot
//                       flat on the belt); + = toes up. Relative to midstance because the heel landmark sits
//                       higher on the shoe than the foot-index landmark (flat foot reads about -13 deg).
//   shoulder swing      upper arm (shoulder -> elbow) vs trunk axis (shoulder -> hip); + = arm forward;
//                       ROM = max - min within a stride
//   foot-to-COM         horizontal distance from the heel to the hip midpoint (COM proxy) at IC; + = heel
//                       ahead of the COM

import { LANDMARKS } from './kinematics.js';
import { VIS_MIN } from './pose.js';
import { median, percentile } from './stats.js';
import { hipMidX } from './events.js';

const DEG = 180 / Math.PI;

// Segment lengths as a fraction of body height (Winter, Biomechanics and Motor Control of Human
// Movement, 4th ed.): thigh 0.245, shank (leg) 0.246, trunk greater trochanter -> acromion 0.818-0.530.
// Knee/ankle sync tolerance as a share of stance duration (provisional, see DECISIONS.md).
export const SYNC_SHARE = 0.15;

export const SEGMENT_RATIOS = { thigh: 0.245, shank: 0.246, trunk: 0.288 };

const at = (row, k) => [row.lm[k * 4], row.lm[k * 4 + 1], row.lm[k * 4 + 2], row.lm[k * 4 + 3]];
const visible = (row, ...ks) => !!row?.lm && ks.every((k) => row.lm[k * 4 + 3] > VIS_MIN);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Angle of vector v from "straight down" (0, +1), signed so + points in the running direction.
const fromVerticalDown = (v, facing) => Math.atan2(facing * v[0], v[1]) * DEG;

export function tibialInclination(row, ids, facing) {
  const k = at(row, ids.knee);
  const a = at(row, ids.ank);
  return fromVerticalDown([a[0] - k[0], a[1] - k[1]], facing);
}

const mid = (row, a, b) => [(at(row, a)[0] + at(row, b)[0]) / 2, (at(row, a)[1] + at(row, b)[1]) / 2];

export function trunkLean(row, facing) {
  const s = mid(row, LANDMARKS.L.sho, LANDMARKS.R.sho);
  const h = mid(row, LANDMARKS.L.hip, LANDMARKS.R.hip);
  // Shoulders above hips: angle of (shoulder - hip) from straight up, + = shoulders forward.
  return Math.atan2(facing * (s[0] - h[0]), h[1] - s[1]) * DEG;
}

export function ankleDorsiflexion(row, ids) {
  const k = at(row, ids.knee);
  const a = at(row, ids.ank);
  const he = at(row, ids.heel);
  const t = at(row, ids.toe);
  const shank = [k[0] - a[0], k[1] - a[1]];
  const foot = [t[0] - he[0], t[1] - he[1]];
  const cos = (shank[0] * foot[0] + shank[1] * foot[1]) / (Math.hypot(...shank) * Math.hypot(...foot) + 1e-9);
  return 90 - Math.acos(Math.max(-1, Math.min(1, cos))) * DEG;
}

// Image angle of the foot (heel -> foot index); + = toes up, in the running direction.
export function footAngle(row, ids, facing) {
  const he = at(row, ids.heel);
  const t = at(row, ids.toe);
  return Math.atan2(-(t[1] - he[1]), facing * (t[0] - he[0])) * DEG;
}

function armAngle(row, ids, facing) {
  const s = at(row, ids.sho);
  const h = at(row, ids.hip);
  const e = at(row, ids.elb);
  const trunk = [h[0] - s[0], h[1] - s[1]];
  const arm = [e[0] - s[0], e[1] - s[1]];
  // Signed angle from trunk axis to arm; + = arm forward of the trunk line.
  return facing * Math.atan2(trunk[0] * arm[1] - trunk[1] * arm[0], trunk[0] * arm[0] + trunk[1] * arm[1]) * -DEG;
}

// Body height in analysed pixels from near-side segment lengths (median over clean frames).
export function bodyHeightPx(rows, bad, side) {
  const ids = LANDMARKS[side];
  const total = SEGMENT_RATIOS.thigh + SEGMENT_RATIOS.shank + SEGMENT_RATIOS.trunk;
  const sums = rows.map((r, i) => {
    if (bad[i] || !visible(r, ids.sho, ids.hip, ids.knee, ids.ank)) return NaN;
    return dist(at(r, ids.hip), at(r, ids.knee)) + dist(at(r, ids.knee), at(r, ids.ank)) + dist(at(r, ids.sho), at(r, ids.hip));
  });
  return median(sums) / total;
}

export function summarise(values, total) {
  const v = values.filter(Number.isFinite);
  return {
    median: v.length ? median(v) : null,
    mean: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null,
    iqr: v.length ? [percentile(v, 25), percentile(v, 75)] : null,
    n: v.length,
    total,
    quality: total ? v.length / total : 0,
  };
}

/**
 * Per-stride metrics for one leg. `near` decides which stride-level metrics are attempted:
 * midstance-based metrics are near-leg only (far-leg MS is a known limitation).
 */
export function legMetrics(rows, bad, seg, events, hipExt, side) {
  const ids = LANDMARKS[side];
  const near = side === seg.near.side;
  const facing = seg.ref.facing;
  const ev = events[side];
  // Rows are already stabilised (stabilize.js); no second smoothing pass.
  const knee = rows.map((r, i) => (bad[i] || r[`knee_flex_${side}`] == null ? NaN : r[`knee_flex_${side}`]));
  const total = ev.strides.length;
  const per = { kneeIC: [], maxStanceKnee: [], kneeExcursion: [], kneeAnkleSync: [], tibialIC: [], footInclIC: [], ankleDFms: [], footToComPx: [], footToComShoe: [], trunkIC: [], trunkMS: [], trunkChange: [] };
  const trunkIds = [LANDMARKS.L.sho, LANDMARKS.R.sho, LANDMARKS.L.hip, LANDMARKS.R.hip];
  const ok = (i, ...ks) => i != null && !bad[i] && visible(rows[i], ...ks);

  for (const s of ev.strides) {
    if (!s.valid) continue;
    const ic = rows[s.ic];
    if (ok(s.ic, ids.hip, ids.knee, ids.ank) && ic[`knee_flex_${side}`] != null) per.kneeIC.push(ic[`knee_flex_${side}`]);
    let mx = -Infinity;
    for (let i = s.ic; i <= s.to; i++) if (Number.isFinite(knee[i])) mx = Math.max(mx, knee[i]);
    if (Number.isFinite(mx)) per.maxStanceKnee.push(mx);
    if (ok(s.ic, ids.knee, ids.ank)) per.tibialIC.push(tibialInclination(ic, ids, facing));
    if (ok(s.ic, ids.heel)) {
      const px = facing * (at(ic, ids.heel)[0] - hipMidX(ic));
      per.footToComPx.push(px);
      per.footToComShoe.push(px / ev.footLength);
    }
    if (!near) continue; // far-leg MS is unreliable; MS-referenced and trunk metrics use the near leg only
    if (ok(s.ic, ids.heel, ids.toe) && ok(s.ms, ids.heel, ids.toe)) per.footInclIC.push(footAngle(ic, ids, facing) - footAngle(rows[s.ms], ids, facing));
    if (ok(s.ms, ids.knee, ids.ank, ids.heel, ids.toe)) per.ankleDFms.push(ankleDorsiflexion(rows[s.ms], ids));
    // Knee/ankle sync (provisional): peak stance knee flexion and peak ankle dorsiflexion within
    // SYNC_SHARE of stance time of each other (at least one analysed frame).
    {
      let kPeak = -1;
      let dPeak = -1;
      let dBest = -Infinity;
      for (let i = s.ic; i <= s.to; i++) {
        if (Number.isFinite(knee[i]) && (kPeak < 0 || knee[i] > knee[kPeak])) kPeak = i;
        if (ok(i, ids.knee, ids.ank, ids.heel, ids.toe)) {
          const df = ankleDorsiflexion(rows[i], ids);
          if (df > dBest) {
            dBest = df;
            dPeak = i;
          }
        }
      }
      if (kPeak >= 0 && dPeak >= 0) per.kneeAnkleSync.push(Math.abs(kPeak - dPeak) <= Math.max(1, Math.round(SYNC_SHARE * (s.to - s.ic))) ? 1 : 0);
    }
    // Knee flexion excursion: midstance minus IC (raw per-frame values, as knee flexion at IC).
    const kIC = ic[`knee_flex_${side}`];
    const kMS = rows[s.ms][`knee_flex_${side}`];
    if (ok(s.ic, ids.hip, ids.knee, ids.ank) && ok(s.ms, ids.hip, ids.knee, ids.ank) && kIC != null && kMS != null) per.kneeExcursion.push(kMS - kIC);
    if (ok(s.ic, ...trunkIds)) per.trunkIC.push(trunkLean(ic, facing));
    if (ok(s.ms, ...trunkIds)) per.trunkMS.push(trunkLean(rows[s.ms], facing));
    const peak = hipExt[side].strides[s.cycle];
    if (peak?.valid && peak.index > s.ic && ok(s.ic, ...trunkIds) && ok(peak.index, ...trunkIds)) {
      per.trunkChange.push(trunkLean(rows[peak.index], facing) - trunkLean(ic, facing));
    }
  }
  return { side, near, total, perStride: per, summary: Object.fromEntries(Object.entries(per).map(([k, v]) => [k, summarise(v, total)])) };
}

// Near-side arm: shoulder swing ROM (max - min of the arm-vs-trunk angle) per stride cycle.
export function shoulderSwing(rows, bad, seg) {
  const ids = LANDMARKS[seg.near.side];
  const facing = seg.ref.facing;
  const ang = rows.map((r, i) => (bad[i] || !visible(r, ids.sho, ids.elb, ids.hip) ? NaN : armAngle(r, ids, facing)));
  const usable = seg.cycles.filter((c) => c.windows);
  const roms = [];
  for (const c of usable) {
    const v = [];
    for (let i = c.start; i < c.end; i++) if (Number.isFinite(ang[i])) v.push(ang[i]);
    if (v.length >= 0.8 * (c.end - c.start)) roms.push(Math.max(...v) - Math.min(...v));
  }
  return summarise(roms, usable.length);
}

// Cadence from the stride period: 2 steps per stride cycle, from frame timestamps (handles variable
// frame rate). Unvalidated: SPEC 7.8 found video cadence unreliable on re-encoded clips; display only,
// never used for scoring or patterns (those use the intake cadence).
// Cadence from stride durations: the MEAN of durations within ±25% of the median. Each duration is a
// whole number of analysed frames, so a median (or the autocorrelation lag) moves in ~9 spm steps at
// 30 fps; averaging many strides removes that quantisation (2026-10-10).
export function cadenceFromDurations(secs) {
  const v = secs.filter((x) => Number.isFinite(x) && x > 0);
  if (v.length < 3) return null;
  const m = median(v);
  const kept = v.filter((x) => Math.abs(x / m - 1) <= 0.25);
  const stride = kept.reduce((a, b) => a + b, 0) / kept.length;
  return { spm: 120 / stride, strideSec: stride, strides: kept.length, iqrSpm: [120 / percentile(kept, 75), 120 / percentile(kept, 25)] };
}

export function cadenceFromStrides(rows, seg) {
  return cadenceFromDurations(seg.cycles.filter((c) => c.windows).map((c) => rows[c.end].t - rows[c.start].t));
}

export function computeMetrics(result) {
  const { rows, bad, seg, events, hipExt } = result;
  return {
    L: legMetrics(rows, bad, seg, events, hipExt, 'L'),
    R: legMetrics(rows, bad, seg, events, hipExt, 'R'),
    shoulderSwing: shoulderSwing(rows, bad, seg),
    bodyHeightPx: bodyHeightPx(rows, bad, seg.near.side),
  };
}

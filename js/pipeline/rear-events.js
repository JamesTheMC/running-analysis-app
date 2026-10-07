// Gait events from a REAR (posterior) clip, independent of any side clip.
//
// From behind, the runner's left is on the image left and both legs are visible. The stance foot is
// planted (lowest in the image) while the swing foot is lifted, so the two feet's heights alternate.
//   Strides: ONE reference signal, the height difference between the feet (left lowest point minus
//   right lowest point, image y; + = left foot lower = left stance), segmented with the same
//   period-constrained peak tracking as the side view. Maxima = left mid-stance region, minima =
//   right mid-stance region.
//   From behind, a planted foot slides toward the camera at belt speed, so it keeps moving DOWN the
//   image through stance (it is not a height plateau as in the side view). Stance is therefore the
//   phase between the foot's fast landing descent and its fast lift:
//   IC = end of the toe's (foot-index) landing descent: going back from the foot's stance centre, the
//        most recent frame where the toe moved down the image faster than 2x the speed threshold;
//        IC is the first frame after it where the toe's speed is at or below the threshold. Searching
//        backward from the stance centre ignores the foot's earlier swing motion.
//   TO = last frame before the toe rises quickly (upward speed above the threshold) after stance.
//   MS = temporal middle of stance. The pelvis's lowest point is kept only as a cross-check: on
//        IMG_0640 it fell in early stance, not at midstance, so it is not used.
// Speeds are in shank lengths per analysed frame, so they scale with image size.
// Checks per stride and leg: left/right landmark order (catches L/R swaps), the tibia gate, contact
// share of the cycle, event order, and one stance per stride.

import { LANDMARKS } from './kinematics.js';
import { VIS_MIN } from './pose.js';
import { fillGaps, median, savgol } from './stats.js';
import { estimatePeriod, trackPeaks } from './strides.js';

export const REAR_EVENTS = {
  // Heel/toe speed threshold, in shank lengths per analysed frame (60 Hz). The middle value is used;
  // the sweep is the rear-view equivalent of the side view's contact-tolerance sweep.
  speedSweep: [0.025, 0.035, 0.05],
  speed: 0.035,
  minStanceShare: 0.15, // TO is searched only after this share of the cycle has passed since IC
  contactShare: [0.2, 0.5],
  orderPairs: ['hip', 'knee', 'ank', 'heel'], // left must be image-left of right for each pair
  minVisibility: 0.7,
};

const at = (row, k) => [row.lm[k * 4], row.lm[k * 4 + 1], row.lm[k * 4 + 2], row.lm[k * 4 + 3]];
const oddAtLeast = (n, lo) => Math.max(lo, n % 2 ? n : n + 1);
const med3 = (a) => a.map((v, i) => (Number.isFinite(a[i - 1]) && Number.isFinite(v) && Number.isFinite(a[i + 1]) ? median([a[i - 1], v, a[i + 1]]) : v));
// Centred speed (px per frame); + = moving down the image.
const speedOf = (a) => a.map((v, i) => (Number.isFinite(a[i - 1]) && Number.isFinite(a[i + 1]) ? (a[i + 1] - a[i - 1]) / 2 : NaN));

// Frames where the left/right landmark order is violated (a likely L/R swap). Rear view: left on image left.
export function orderViolations(rows) {
  return rows.map((r) => {
    if (!r.lm) return null;
    const bad = REAR_EVENTS.orderPairs.filter((k) => at(r, LANDMARKS.L[k])[0] >= at(r, LANDMARKS.R[k])[0]);
    return bad.length ? bad : null;
  });
}

function footSeries(rows, bad, side) {
  const ids = LANDMARKS[side];
  const heel = [];
  const toe = [];
  const low = [];
  const vis = [];
  rows.forEach((r, i) => {
    if (!r.lm || bad[i]) {
      heel.push(NaN);
      toe.push(NaN);
      low.push(NaN);
      vis.push(NaN);
      return;
    }
    const h = at(r, ids.heel);
    const t = at(r, ids.toe);
    const ok = h[3] > VIS_MIN && t[3] > VIS_MIN;
    heel.push(ok ? h[1] : NaN);
    toe.push(ok ? t[1] : NaN);
    low.push(ok ? Math.max(h[1], t[1]) : NaN);
    vis.push((h[3] + t[3] + at(r, ids.ank)[3]) / 3);
  });
  return { heel: med3(heel), toe: med3(toe), low, vis };
}

export function segmentRear(rows, bad, fs) {
  const L = footSeries(rows, bad, 'L');
  const R = footSeries(rows, bad, 'R');
  const raw = L.low.map((v, i) => v - R.low[i]);
  const period = estimatePeriod(savgol(fillGaps(raw, Math.round(0.1 * fs)), oddAtLeast(Math.round(0.11 * fs), 5), 2), fs);
  if (!period) return { period: 0, peaks: [], troughs: [], cycles: [], sig: raw, feet: { L, R } };
  const sig = savgol(fillGaps(raw, Math.round(0.1 * fs)), oddAtLeast(Math.round(period / 3), 5), 2);
  const peaks = trackPeaks(sig, period); // left stance centres
  const troughs = trackPeaks(sig.map((v) => -v), period); // right stance centres
  const cycles = [];
  for (let k = 0; k + 1 < peaks.length; k++) {
    const len = peaks[k + 1] - peaks[k];
    const ok = len >= 0.75 * period && len <= 1.25 * period;
    cycles.push({ start: peaks[k], end: peaks[k + 1], len, valid: ok, reason: ok ? null : 'tracking gap between strides' });
  }
  return { period, periodSec: period / fs, peaks, troughs, cycles, sig, feet: { L, R } };
}

function shankLength(rows, bad, side) {
  const ids = LANDMARKS[side];
  return median(rows.map((r, i) => (bad[i] || !r.lm ? NaN : Math.hypot(at(r, ids.knee)[0] - at(r, ids.ank)[0], at(r, ids.knee)[1] - at(r, ids.ank)[1]))));
}

const hipMidY = (row) => (at(row, LANDMARKS.L.hip)[1] + at(row, LANDMARKS.R.hip)[1]) / 2;

/**
 * Rear-view events per leg. Each leg's strides are anchored on its own stance centres from the
 * shared reference signal (left: maxima, right: minima), so both legs come from one signal.
 */
export function detectRearEvents(rows, bad, seg, { speed = REAR_EVENTS.speed } = {}) {
  const n = rows.length;
  const order = orderViolations(rows);
  const out = {};
  for (const side of ['L', 'R']) {
    const foot = seg.feet[side];
    const shank = shankLength(rows, bad, side);
    const vThr = speed * shank;
    const vToe = speedOf(foot.toe);
    const centres = side === 'L' ? seg.peaks : seg.troughs;
    const P = seg.period;
    let prevTo = null;
    const strides = centres.map((c, k) => {
      const s = { stride: k, side, centre: c, valid: true, reasons: [], lowQuality: [] };
      const lo = Math.max(1, c - Math.round(0.45 * P));
      const hi = Math.min(n - 2, c + Math.round(0.5 * P));
      let tracked = 0;
      for (let i = lo; i <= hi; i++) if (Number.isFinite(foot.toe[i])) tracked++;
      if (tracked < 0.6 * (hi - lo + 1)) return { ...s, valid: false, reasons: ['foot not tracked in this stride'] };

      // IC: the end of the most recent fast landing descent before the stance centre.
      let fast = -1;
      for (let i = c; i >= lo && fast < 0; i--) if (Number.isFinite(vToe[i]) && vToe[i] > 2 * vThr) fast = i;
      if (fast >= 0) for (let i = fast + 1; i <= c && s.ic == null; i++) if (Number.isFinite(vToe[i]) && vToe[i] <= vThr) s.ic = i;
      if (s.ic == null) return { ...s, valid: false, reasons: ['no toe landing found before stance centre'] };

      // TO: last frame before the toe rises quickly (speed below -threshold), after a minimum stance.
      const from = s.ic + Math.round(REAR_EVENTS.minStanceShare * P);
      for (let i = from; i <= hi && s.to == null; i++) if (Number.isFinite(vToe[i]) && vToe[i] < -vThr) s.to = i - 1;
      if (s.to == null) return { ...s, valid: false, reasons: ['no toe lift found in this stride'] };

      // MS: middle of stance. Lowest pelvis kept as a cross-check only.
      let ms = -1;
      for (let i = s.ic; i <= s.to; i++) if (rows[i].lm && !bad[i] && (ms < 0 || hipMidY(rows[i]) > hipMidY(rows[ms]))) ms = i;
      s.msMid = Math.round((s.ic + s.to) / 2);
      s.msPelvis = ms >= 0 ? ms : null;
      s.ms = s.msMid;
      s.msSource = 'middle of stance';

      // Checks that invalidate the stride.
      s.contactShare = (s.to - s.ic + 1) / P;
      if (s.contactShare < REAR_EVENTS.contactShare[0] || s.contactShare > REAR_EVENTS.contactShare[1]) {
        s.valid = false;
        s.reasons.push(`contact ${Math.round(s.contactShare * 100)}% of cycle (expected ${REAR_EVENTS.contactShare.map((x) => x * 100).join('–')}%)`);
      }
      if (!(s.ic < s.ms && s.ms < s.to)) {
        s.valid = false;
        s.reasons.push('events out of order');
      }
      if (prevTo != null && s.ic <= prevTo) {
        s.valid = false;
        s.reasons.push('same stance as the previous stride');
      }
      prevTo = s.to;

      // Tracking quality (kept, but flagged).
      let swaps = 0;
      let gated = 0;
      let vis = 0;
      let m = 0;
      for (let i = s.ic; i <= s.to; i++) {
        if (order[i]) swaps++;
        if (bad[i]) gated++;
        if (Number.isFinite(foot.vis[i])) {
          vis += foot.vis[i];
          m++;
        }
      }
      if (swaps) s.lowQuality.push(`${swaps} stance frame(s) with left/right landmarks out of order (possible swap)`);
      if (gated) s.lowQuality.push(`${gated} stance frame(s) failed the tibia gate`);
      if (m && vis / m < REAR_EVENTS.minVisibility) s.lowQuality.push(`foot visibility ${(vis / m).toFixed(2)}`);
      return s;
    });
    const valid = strides.filter((s) => s.valid);
    out[side] = {
      shankLength: shank,
      speedThreshold: vThr,
      strides,
      validCount: valid.length,
      goodCount: valid.filter((s) => !s.lowQuality.length).length,
      contactShareMedian: valid.length ? median(valid.map((s) => s.contactShare)) : null,
    };
  }
  out.orderViolationFrames = order.filter(Boolean).length;
  return out;
}

// Midstance from the stride segmentation alone (no IC/TO detection). Each leg's stance half-cycle is a
// lobe of the reference signal (left minus right foot height: > 0 while the left foot is the lower,
// planted one; < 0 for the right). MS = the centre of the lobe, between its zero crossings (linear
// interpolation). Lobes much shorter or longer than half a stride are rejected.
export function segmentationMidstance(seg) {
  const { sig, period } = seg;
  const out = { L: [], R: [] };
  if (!period) return out;
  const cross = [];
  for (let i = 1; i < sig.length; i++) {
    const a = sig[i - 1];
    const b = sig[i];
    if (!Number.isFinite(a) || !Number.isFinite(b) || (a > 0) === (b > 0)) continue;
    cross.push({ at: i - 1 + a / (a - b), up: b > 0 });
  }
  for (let k = 0; k + 1 < cross.length; k++) {
    const [s, e] = [cross[k], cross[k + 1]];
    const len = e.at - s.at;
    const side = s.up ? 'L' : 'R';
    const ok = len >= 0.3 * period && len <= 0.7 * period;
    out[side].push({ start: s.at, end: e.at, ms: Math.round((s.at + e.at) / 2), valid: ok, reason: ok ? null : `half-cycle ${Math.round((len / period) * 100)}% of the stride` });
  }
  return out;
}

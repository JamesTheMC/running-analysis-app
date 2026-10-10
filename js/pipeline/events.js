// Gait events per leg: initial contact (IC), midstance (MS) and toe-off (TO), built on the stride
// segmentation in strides.js (one reference signal, so both legs share the same strides).
//
// A foot is "on the belt" when its lowest point (the lower of heel and foot-index, in image y) is
// within a tolerance of where the belt is under that foot. Two things make a single global belt
// line unreliable, so the level is found per stride:
//   * if the camera is rolled or the treadmill inclined, belt height changes with x. A belt line
//     (y = a + b·x) is fitted per leg, but its slope is only used when it is clearly non-zero
//     (>= 20 strides and |b| > 2 standard errors); otherwise the belt is taken as level. On
//     IMG_0639_2 the fitted slopes were not significant (near -0.03 deg, far -4.3 deg with 95% CI
//     -10.5..+0.5) and image horizontals showed ~0 deg camera roll; on an 8 s excerpt the near-leg
//     fit came out at +4.8 deg from 9 strides, which cut stance short;
//   * the runner drifts forward/back and toward/away from the camera between strides, so each
//     stride's belt level is that stride's own lowest foot position (median of its 3 lowest frames).
// Search window per stride: from 0.45 cycles before the foot's forward-most point (the inter-ankle
// signal peaks after the foot has already landed) to 0.15 cycles after its back-most point.
//   stance = the run of on-belt frames around the lowest foot position (short dropouts bridged),
//   IC = first frame of that run, TO = last frame,
//   MS = first stance frame with the ankle under the hip midpoint (centre-of-mass proxy), else the
//        temporal middle of stance.
// Strides failing a check keep their events (for review) but are marked invalid; strides with weak
// tracking are marked lowQuality with the reasons.

import { LANDMARKS } from './kinematics.js';
import { VIS_MIN } from './pose.js';
import { median } from './stats.js';

export const EVENTS = {
  searchBefore: 0.45, // cycles before the forward-most point
  searchAfter: 0.15, // cycles after the back-most point
  // Foot lengths above the stride's belt level that still count as contact. Landmarks settle lower
  // as the (cushioned) shoe loads, so a tight tolerance detects IC late; 0.3 matched IC judged by
  // eye on IMG_0639_2 (cycle 39: touch-down at source frame ~3436; 0.2 gave 3442).
  contactTolerance: 0.3,
  bridgeGapSec: 0.035, // off-belt time tolerated inside stance (landmark jitter): 2 frames at 60 Hz, 1 at 30 Hz
  // Treadmill stance (landing side) = foot near the belt and NOT travelling forward. Runners with short flight and
  // low foot clearance keep the toe within the height tolerance through much of swing (T2/T3 clips,
  // 2026-10-10), so height alone merges swing into stance. A frame is excluded from stance when the
  // mid-foot moves forward faster than this share of the leg's belt speed (median backward speed at
  // the lowest-foot frames). Forward, not "must move backward": at push-off the heel rises and the
  // mid-foot slows before the toe leaves, which would cut toe-off early (C0-side check).
  forwardSpeedShare: 0.25,
  slopeMinStrides: 20, // belt slope used only with this many strides ...
  slopeMinZ: 2, // ... and when |slope| exceeds this many standard errors
  // Stance duration as a share of the stride. Upper limit 0.65, not 0.5: recreational runners at
  // 6–8 mph on these clips had ~50–55% contact (no flight phase), confirmed frame by frame on a T2
  // strip (2026-10-10). Strides above 50% are kept and marked (no flight phase).
  contactShare: [0.2, 0.65],
  footLengthTolerance: 0.25, // heel-toe length vs. median, at the event frames
  minVisibility: 0.7, // mean heel/toe/ankle visibility over stance below this = low quality
};

// Contact tolerances swept to test how sensitive IC-dependent metrics are to IC timing (0.3 is used).
export const IC_SWEEP = [0.2, 0.3, 0.4];

const at = (row, k) => [row.lm[k * 4], row.lm[k * 4 + 1], row.lm[k * 4 + 2], row.lm[k * 4 + 3]];

function footFrame(row, side) {
  if (!row?.lm) return null;
  const ids = LANDMARKS[side];
  const heel = at(row, ids.heel);
  const toe = at(row, ids.toe);
  const ank = at(row, ids.ank);
  const lowest = heel[1] >= toe[1] ? heel : toe; // image y grows downward
  return {
    heel,
    toe,
    ank,
    visible: heel[3] > VIS_MIN && toe[3] > VIS_MIN,
    vis: (heel[3] + toe[3] + ank[3]) / 3,
    low: lowest[1],
    lowX: lowest[0],
    length: Math.hypot(toe[0] - heel[0], toe[1] - heel[1]),
  };
}

export function hipMidX(row) {
  return (at(row, LANDMARKS.L.hip)[0] + at(row, LANDMARKS.R.hip)[0]) / 2;
}

// Per leg: forward-most and back-most indices for each cycle of the shared segmentation.
function legCycles(seg, side) {
  const out = [];
  seg.cycles.forEach((c, k) => {
    if (!c.windows) return;
    const len = c.end - c.start;
    if (side === seg.near.side) out.push({ cycle: k, fwd: c.start, back: c.trough, len });
    // Far foot: forward-most at this cycle's trough, back-most at its end.
    else out.push({ cycle: k, fwd: c.trough, back: c.end, len });
  });
  return out;
}

// Least-squares line y = a + b·x with one round of outlier trimming, plus the slope's standard error.
function fitLine(pts) {
  const fit = (p) => {
    const n = p.length;
    const mx = p.reduce((s, q) => s + q[0], 0) / n;
    const my = p.reduce((s, q) => s + q[1], 0) / n;
    let sxx = 0;
    let sxy = 0;
    for (const [x, y] of p) {
      sxx += (x - mx) ** 2;
      sxy += (x - mx) * (y - my);
    }
    const b = sxx > 0 ? sxy / sxx : 0;
    const a = my - b * mx;
    const sse = p.reduce((s, [x, y]) => s + (y - (a + b * x)) ** 2, 0);
    const se = n > 2 && sxx > 0 ? Math.sqrt(sse / (n - 2) / sxx) : Infinity;
    return { a, b, se, n };
  };
  if (pts.length < 5) return { a: median(pts.map((p) => p[1])), b: 0, se: Infinity, n: pts.length };
  let f = fit(pts);
  const res = pts.map(([x, y]) => Math.abs(y - (f.a + f.b * x)));
  const mad = median(res) || 1;
  const kept = pts.filter((_, i) => res[i] <= 3 * mad);
  if (kept.length >= 5) f = fit(kept);
  return f;
}

const median3 = (a) => a.map((v, i) => (Number.isFinite(v) && Number.isFinite(a[i - 1]) && Number.isFinite(a[i + 1]) ? median([a[i - 1], v, a[i + 1]]) : v));

export function detectEvents(rows, bad, seg, { contactTolerance = EVENTS.contactTolerance } = {}) {
  const out = {};
  const n = rows.length;
  for (const side of ['L', 'R']) {
    const feet = rows.map((r, i) => (bad[i] ? null : footFrame(r, side)));
    const cycles = legCycles(seg, side);
    const footLen = median(feet.map((f) => (f?.visible ? f.length : NaN)));
    const tol = contactTolerance * footLen;
    const win = (c) => [Math.max(0, c.fwd - Math.round(EVENTS.searchBefore * c.len)), Math.min(n - 1, c.back + Math.round(EVENTS.searchAfter * c.len))];

    // Belt slope: fit the lowest foot point of each stride against its x.
    const lowestPts = [];
    for (const c of cycles) {
      const [lo, hi] = win(c);
      let best = -1;
      for (let i = lo; i <= hi; i++) if (feet[i]?.visible && (best < 0 || feet[i].low > feet[best].low)) best = i;
      if (best >= 0) lowestPts.push([feet[best].lowX, feet[best].low]);
    }
    const fitted = fitLine(lowestPts);
    const slopeUsed = fitted.n >= EVENTS.slopeMinStrides && Math.abs(fitted.b) > EVENTS.slopeMinZ * fitted.se;
    const line = { b: slopeUsed ? fitted.b : 0 };
    // Height above the belt line (detrended); larger = lower in the image = closer to the belt.
    const d = median3(feet.map((f) => (f?.visible ? f.low - line.b * f.lowX : NaN)));
    // Mid-foot speed in the running direction (px per analysed frame; − = backward, with the belt).
    const facing = seg.ref.facing;
    const mx = feet.map((f) => (f?.visible ? (f.heel[0] + f.toe[0]) / 2 : NaN));
    // Central difference over ±1/30 s (1 frame at 30 Hz, 2 at 60 Hz), then a 3-point median: heel and
    // toe landmarks jitter by tens of px frame to frame at 60 Hz (C0-side).
    const h = Math.max(1, Math.round(seg.fs / 30));
    const speed = (xs) => median3(xs.map((x, i) => (Number.isFinite(xs[i - h]) && Number.isFinite(xs[i + h]) ? (facing * (xs[i + h] - xs[i - h])) / (2 * h) : NaN)));
    const vx = speed(mx);
    // Swing = heel AND toe travelling forward. At push-off the heel swings forward while the toe is
    // still carried back by the belt (and the reverse at landing), so the slower of the two is used.
    const vHeel = speed(feet.map((f) => (f?.visible ? f.heel[0] : NaN)));
    const vToe = speed(feet.map((f) => (f?.visible ? f.toe[0] : NaN)));
    const vSlow = vHeel.map((v, i) => (Number.isFinite(v) && Number.isFinite(vToe[i]) ? Math.min(v, vToe[i]) : vx[i]));
    // Belt speed: median backward speed at each stride's lowest-foot frames.
    const beltV = [];
    for (const c of cycles) {
      const [lo, hi] = win(c);
      const idx = [];
      for (let i = lo; i <= hi; i++) if (Number.isFinite(d[i]) && Number.isFinite(vx[i])) idx.push(i);
      idx.sort((a, b) => d[b] - d[a]);
      for (const i of idx.slice(0, 3)) beltV.push(-vx[i]);
    }
    const beltSpeed = median(beltV.filter((v) => v > 0));
    const notForward = (i) => !(beltSpeed > 0) || !Number.isFinite(vSlow[i]) || vSlow[i] <= EVENTS.forwardSpeedShare * beltSpeed;
    const bridgeGap = Math.max(1, Math.round(EVENTS.bridgeGapSec * seg.fs));

    let prevTo = null;
    const strides = cycles.map((c) => {
      const s = { cycle: c.cycle, side, fwd: c.fwd, back: c.back, valid: true, reasons: [], lowQuality: [] };
      const [lo, hi] = win(c);
      const idx = [];
      for (let i = lo; i <= hi; i++) if (Number.isFinite(d[i])) idx.push(i);
      if (idx.length < 5) return { ...s, valid: false, reasons: ['foot not tracked in this stride'] };
      const top = idx.map((i) => d[i]).sort((x, y) => y - x);
      const level = median(top.slice(0, 3));
      s.belt = { a: level, b: line.b }; // belt y at x = a + b·x
      // Forward-motion gate only on the landing side (growing back toward IC): the T2/T3 failure was the
      // low, forward-swinging foot being counted as stance before IC. Toe-off stays on height alone: the
      // gate cut C0 toe-off 2–4 source frames early while the toe was still loaded (frame strip check).
      const onBelt = (i, dir) => Number.isFinite(d[i]) && d[i] >= level - tol && (dir > 0 || notForward(i));
      const peak = idx.reduce((p, i) => (d[i] > d[p] ? i : p), idx[0]);

      // Grow the stance run around the lowest point, bridging short dropouts.
      const grow = (dir) => {
        let last = peak;
        let gap = 0;
        for (let i = peak + dir; i >= lo && i <= hi; i += dir) {
          if (onBelt(i, dir)) {
            last = i;
            gap = 0;
          } else if (++gap > bridgeGap) break;
        }
        return last;
      };
      s.ic = grow(-1);
      s.to = grow(1);

      // MS: ankle passes under the hip midpoint (signed by running direction).
      const facing = seg.ref.facing;
      for (let i = s.ic; i <= s.to && s.ms == null; i++) {
        const f = feet[i];
        if (f && facing * (f.ank[0] - hipMidX(rows[i])) <= 0) s.ms = i;
      }
      // Both candidates are kept so their agreement can be checked (test page).
      s.msAnkle = s.ms;
      s.msMid = Math.round((s.ic + s.to) / 2);
      s.msSource = s.ms == null ? 'middle of stance' : 'ankle under hip midpoint';
      if (s.ms == null) s.ms = s.msMid;

      // Checks that invalidate the stride.
      s.contactShare = (s.to - s.ic + 1) / c.len;
      if (s.contactShare < EVENTS.contactShare[0] || s.contactShare > EVENTS.contactShare[1]) {
        s.valid = false;
        s.reasons.push(`contact ${Math.round(s.contactShare * 100)}% of cycle (expected ${EVENTS.contactShare.map((x) => x * 100).join('–')}%)`);
      }
      if (s.ic === lo || s.to === hi) {
        s.valid = false;
        s.reasons.push('stance runs past the search window');
      }
      // Neighbouring search windows overlap; a stance belongs to one stride only.
      if (prevTo != null && s.ic <= prevTo) {
        s.valid = false;
        s.reasons.push('same stance as the previous stride');
      }
      prevTo = s.to;

      // Tracking quality (kept, but flagged).
      let gated = 0;
      let vis = 0;
      let m = 0;
      for (let i = s.ic; i <= s.to; i++) {
        if (bad[i]) gated++;
        if (feet[i]) {
          vis += feet[i].vis;
          m++;
        }
      }
      if (gated) s.lowQuality.push(`${gated} stance frame(s) failed the tibia gate`);
      if (m && vis / m < EVENTS.minVisibility) s.lowQuality.push(`foot visibility ${(vis / m).toFixed(2)}`);
      for (const [name, i] of [['IC', s.ic], ['TO', s.to]]) {
        const f = feet[i];
        if (f && Math.abs(f.length / footLen - 1) > EVENTS.footLengthTolerance) {
          s.lowQuality.push(`foot length at ${name} ${Math.round((f.length / footLen) * 100)}% of median`);
        }
      }
      return s;
    });

    const valid = strides.filter((s) => s.valid);
    out[side] = {
      near: side === seg.near.side,
      beltSlope: line.b,
      beltSlopeFit: { b: fitted.b, se: fitted.se, n: fitted.n, used: slopeUsed },
      footLength: footLen,
      tolerance: tol,
      beltSpeedPxPerFrame: beltSpeed,
      strides,
      validCount: valid.length,
      goodCount: valid.filter((s) => !s.lowQuality.length).length,
      contactShareMedian: valid.length ? median(valid.map((s) => s.contactShare)) : null,
    };
  }
  return out;
}

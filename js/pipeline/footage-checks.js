// Footage-quality checks for the capture-quality gate: one plain-language check per filming problem,
// measured from the pose landmarks (and, for lighting, an optional brightness summary of the frames).
// Pure: no DOM. Calibrated on the 24 committed landmark fixtures (2026-10-15): 8 good clips (C0, T1–T3,
// side + rear; hip-height camera) vs 16 problem clips (AR, AZ, CD, CH, JW, ML, RQ, RY; floor-level
// wide-angle camera, console over the hips, CD side head cropped). Feature table, thresholds and what
// could NOT be measured: reference/GATE_CALIBRATION.md; research script: tools/gate_features.py
// (`--checks` mirrors this module exactly).
//
// Only 2 good runners exist (C0; T1–T3 are one runner), so body-proportion references are provisional:
// thresholds sit well outside the good clips and fail only with a clear margin.

import { LANDMARKS } from './kinematics.js';

export const FOOTAGE = {
  vis: 0.5, // a landmark counts as visible at visibility >= 0.5 (pose.js VIS_MIN)
  minStrideSeconds: 4, // checks that need several strides: at least 4 s of posed frames (~6 strides)
  minGapSeconds: 10, // near/far contact level needs >= 10 s: in the first 150 frames it read 0.045 on T1 side (full clip 0.065)
  lowerVisibility: { warn: 0.93, fail: 0.8 }, // worst lower-limb joint, share visible: good 0.975–1.00; problem rear 0.70 (RY), 0.79 (CD), 0.90 (AR, AZ)
  hip: { visWarn: 0.9, visFail: 0.7, relWarn: 0.85, jumpThigh: 0.25, jumpWarn: 0.01, jumpFail: 0.03 }, // hip jumps > 0.25 thigh/frame: good 0.000, CD 0.054 side / 0.077 rear; hip visibility is ~1.00 in ALL clips (console occlusion not seen)
  framing: { headTop: 0.03, headWarn: 0.01, headFail: 0.03, feetWarn: 0.2, feetFail: 0.4 }, // head at top 3% or not found: good 0.000, CD 0.050 side / 0.207 rear; a foot beyond the edge: good <= 0.028 full clip, 0.107 in the first 150 frames (T1 side back-swing heel), problem <= 0.005
  heightSide: { hipRelY: 0.476, lowerTrunk: 1.285, devWarn: 0.04, devFail: 0.1, gapWarn: 0.03, gapFail: 0.045 }, // proportion deviation: good <= 0.005, problem 0.055 (JW)–0.47 (CD); near-far contact gap (shank): good 0.065–0.091, AZ −0.048, RY −0.030, AR 0.032, JW 0.037
  heightRear: { footHipWarn: 0.32, footHipFail: 0.34, hipRelY: 0.449, devWarn: 0.06, devSupport: 0.05 }, // foot length / hip width: good 0.21–0.29, problem 0.35–0.77
  tilt: { sideWarnDeg: 3, frontalWarnDeg: 5 }, // side stance-heel path slope: good −1.0..0.9°, AR −3.6°; frontal shoulder/hip line: good −2.6..0.6°, problem −0.7..4.0° (posture confounds)
  square: { sideHipWidthWarn: 0.12, sideHipWidthFail: 0.25, offCentreWarn: 0.5, offCentreFail: 1.5 }, // side hip width / trunk: good 0.043–0.059, CD 0.150; rear off-centre (hip widths): good <= 0.14; problem AR −1.01, ML −0.93, RY −0.66, CD 2.70
  wideRear: { warn: 1.6, fail: 2.0 }, // p90 of left/right shank length ratio: good 1.36–1.44, problem 1.45 (RQ)–5.67 (RY)
  // body height / frame height: good 0.53–0.65. minSourcePx: runner height in SOURCE video pixels
  // (analysed px / analysis scale 0.45): good 1013–1249, problem 289–513. Judged in source pixels so a
  // correctly framed landscape 720p clip (runner ≈ 430 px) is not warned (lead review 2026-10-15; provisional).
  size: { fail: 0.2, warn: 0.35, tooBig: 0.9, minSourcePx: 300, analysisScale: 0.45 },
  fps: { warn: 24, recommended: 100 }, // C0 120 fps; T1–T3 validated at 30 fps (must pass)
  blur: { warn: 0.03 }, // ankle/toe visibility, slow minus fast frames: good <= 0.003; AR 0.070, AZ 0.074, JW 0.073, RY 0.145, CD 0.160 (rear)
  luma: { darkFail: 30, darkWarn: 50, brightWarn: 220, contrastWarn: 40 }, // provisional: no calibration data (fixtures have no brightness)
};

const LABELS = {
  lower_limb_visibility: 'Legs visible',
  hip_occlusion: 'Hips visible',
  framing: 'Whole body in frame',
  camera_height: 'Camera height',
  camera_tilt: 'Camera level',
  squareness: 'Camera square to the treadmill',
  wide_angle: 'Lens and distance',
  runner_size: 'Runner size in frame',
  frame_rate: 'Frame rate',
  motion_blur: 'Motion blur',
  lighting: 'Lighting',
};

const FIX = {
  visibility: 'Legs are hidden part of the time: make sure nothing (console, handrail, upright) is between the camera and the legs, and keep both feet in view.',
  hipHidden: 'The console hides the hips: move the camera so the pelvis is visible.',
  hipJumps: 'Hip position jumps between frames: make sure the pelvis is clearly visible (not behind the console) and the whole body stays in frame.',
  head: 'Head out of frame: move the camera back so the whole body fits with a margin.',
  feet: 'Feet leave the frame: move the camera back (or zoom out with the 1x lens) so both feet stay in frame through the whole stride.',
  heightSide: 'Camera is at floor level: raise it to hip height on a tripod, level, not tilted up.',
  heightRear: 'Camera is at floor level: raise it to hip height on a tripod, level, not tilted up.',
  tilt: 'Camera is not level: straighten it (use a level or the phone grid) so the belt is horizontal.',
  squareSide: 'Camera is not square to the treadmill: point it straight at the side of the runner (perpendicular to the belt).',
  squareRear: 'Runner is off-centre: place the camera directly behind the middle of the belt.',
  wide: 'Camera is too close with a wide-angle lens: move it back and use the main 1x lens (not ultra-wide).',
  small: 'Runner is small in the frame: move closer or zoom with the main 1x lens (not ultra-wide).',
  smallPx: 'Runner covers few pixels in the analysed picture: film in portrait orientation (or at higher resolution) so the runner fills more of the frame.',
  big: 'Runner fills the whole frame: move the camera back so there is a margin around the body.',
  fps: 'Frame rate is low: record at 120 fps (or at least 60 fps).',
  blur: 'Feet look blurred when they move fast: add light and record at 120 fps (higher frame rates use a faster shutter).',
  dark: 'Video is dark: add light on the runner (and avoid a bright window behind).',
  bright: 'Video is over-exposed: reduce direct light or tap to set exposure on the runner.',
  flat: 'Video has low contrast: add light and avoid backlight.',
};

// Most important first (used to order summary fixes).
// Event checks (capture-quality.js) come after the footage causes they usually stem from.
const PRIORITY = ['framing', 'camera_height', 'hip_occlusion', 'wide_angle', 'lower_limb_visibility', 'event_detection', 'cadence_plausible', 'leg_swaps', 'runner_size', 'squareness', 'camera_tilt', 'motion_blur', 'lighting', 'frame_rate'];

// ---- small numeric helpers (same definitions as tools/gate_features.py) ----
const finite = (xs) => xs.filter((x) => x != null && Number.isFinite(x));
export function median(xs) {
  const s = finite(xs).sort((a, b) => a - b);
  if (!s.length) return null;
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
export function quantile(xs, p) {
  const s = finite(xs).sort((a, b) => a - b);
  if (!s.length) return null;
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
}
const mean = (xs) => {
  const s = finite(xs);
  return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
};
const X = (lm, k) => lm[k * 4];
const Y = (lm, k) => lm[k * 4 + 1];
const Z = (lm, k) => lm[k * 4 + 2];
const V = (lm, k) => lm[k * 4 + 3];
const dist = (lm, a, b) => Math.hypot(X(lm, a) - X(lm, b), Y(lm, a) - Y(lm, b));
const pct = (v) => `${Math.round(v * 100)}%`;
const fold = (a) => {
  while (a > 90) a -= 180;
  while (a < -90) a += 180;
  return a;
};
const DEG = 180 / Math.PI;

const JOINT_NAMES = { hip: 'hips', knee: 'knees', ank: 'ankles', heel: 'heels', toe: 'toes' };

function check(id, status, value, detail, fix = null) {
  return { id, label: LABELS[id], status, value: value == null || !Number.isFinite(value) ? null : value, detail, fix: status === 'pass' || status === 'na' ? null : fix };
}
const na = (id, detail = 'needs more of the clip') => check(id, 'na', null, detail);

// Near leg on a side view: smaller (more negative) mean depth of hip, knee and ankle = nearer.
export function nearSideFromDepth(posed) {
  const z = (s) => mean(posed.map((lm) => (Z(lm, LANDMARKS[s].hip) + Z(lm, LANDMARKS[s].knee) + Z(lm, LANDMARKS[s].ank)) / 3));
  return z('L') <= z('R') ? 'L' : 'R';
}

// Top of the body (nose or shoulders) to the lowest heel/toe, analysed px.
const bodyTop = (lm) => Math.min(Y(lm, 0), Y(lm, 11), Y(lm, 12));
const bodyBottom = (lm) => Math.max(Y(lm, 29), Y(lm, 30), Y(lm, 31), Y(lm, 32));
const hipMidY = (lm) => (Y(lm, 23) + Y(lm, 24)) / 2;

// Hip height between the top of the body and the feet (0 = top, 1 = feet). A camera tilted up from the
// floor compresses the upper body, so the hips look higher (smaller value) than from hip height.
function hipRelY(posed) {
  return median(
    posed.map((lm) => {
      const top = bodyTop(lm);
      const bot = bodyBottom(lm);
      return bot - top > 1 ? (hipMidY(lm) - top) / (bot - top) : null;
    }),
  );
}

/**
 * Footage-quality checks for one clip.
 * @param {'lateral'|'posterior'|'anterior'} view  anterior is treated as a frontal view like posterior
 * @param {object} p { rows: [{ lm?: Float32Array(33*4), t, frame }], meta: { fps, fs, analysedSize: [w, h], luma? }, nearSide?: 'L'|'R' }
 * @returns {Array<{id, label, status: 'pass'|'warn'|'fail'|'na', value, detail, fix}>}
 */
export function footageChecks(view, { rows = [], meta = {}, nearSide } = {}) {
  const lateral = view === 'lateral';
  const posed = rows.filter((r) => r && r.lm).map((r) => r.lm);
  const [W, H] = meta.analysedSize || [null, null];
  const fs = meta.fs || meta.fps || 30;
  const out = [];
  if (!posed.length) {
    for (const id of Object.keys(LABELS)) out.push(id === 'frame_rate' ? frameRate(meta) : id === 'lighting' ? lighting(meta) : na(id, 'no runner found in the clip'));
    return out;
  }
  const enough = posed.length / fs >= FOOTAGE.minStrideSeconds;
  const near = lateral ? nearSide || nearSideFromDepth(posed) : null;
  const legs = lateral ? [LANDMARKS[near]] : [LANDMARKS.L, LANDMARKS.R];
  const far = lateral ? LANDMARKS[near === 'L' ? 'R' : 'L'] : null;
  const legLabel = lateral ? `${near === 'L' ? 'left' : 'right'} (near) leg` : 'both legs';
  const perLeg = (fn) => posed.flatMap((lm) => legs.map((g) => fn(lm, g)));
  const thigh = median(perLeg((lm, g) => dist(lm, g.hip, g.knee))) || 1;
  const shank = median(perLeg((lm, g) => dist(lm, g.knee, g.ank))) || 1;

  // 1. Lower-limb visibility
  {
    let worst = null;
    for (const j of ['hip', 'knee', 'ank', 'heel', 'toe']) {
      const vs = perLeg((lm, g) => V(lm, g[j]));
      const share = vs.filter((v) => v >= FOOTAGE.vis).length / vs.length;
      if (!worst || share < worst.share) worst = { j, share };
    }
    const posedShare = posed.length / rows.length;
    const t = FOOTAGE.lowerVisibility;
    const status = worst.share < t.fail ? 'fail' : worst.share < t.warn ? 'warn' : 'pass';
    const detail = `${JOINT_NAMES[worst.j]} visible in ${pct(worst.share)} of frames (${legLabel}; worst lower-limb joint); runner found in ${pct(posedShare)} of frames`;
    out.push(check('lower_limb_visibility', status, worst.share, detail, FIX.visibility));
  }

  // 2. Hip occlusion: hips specifically less visible than knees/shoulders, or hip position jumping.
  {
    const t = FOOTAGE.hip;
    const hv = perLeg((lm, g) => V(lm, g.hip));
    const visOk = hv.filter((v) => v >= FOOTAGE.vis).length / hv.length;
    const rel = mean(hv) / Math.max(1e-6, mean(perLeg((lm, g) => (V(lm, g.knee) + V(lm, g.sho)) / 2)));
    let jumps = 0;
    let pairs = 0;
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1]?.lm;
      const b = rows[i]?.lm;
      if (!a || !b) continue;
      for (const g of legs) {
        pairs++;
        if (Math.hypot(X(a, g.hip) - X(b, g.hip), Y(a, g.hip) - Y(b, g.hip)) > t.jumpThigh * thigh) jumps++;
      }
    }
    const jumpShare = pairs ? jumps / pairs : 0;
    const status = visOk < t.visFail || jumpShare > t.jumpFail ? 'fail' : visOk < t.visWarn || rel < t.relWarn || jumpShare > t.jumpWarn ? 'warn' : 'pass';
    const detail = `hips visible in ${pct(visOk)} of frames; hip position jumps in ${pct(jumpShare)} of frames`;
    const jumpsDecide = jumpShare > t.jumpWarn && visOk >= t.visWarn && rel >= t.relWarn;
    out.push(check('hip_occlusion', status, visOk, detail, jumpsDecide ? FIX.hipJumps : FIX.hipHidden));
  }

  // 3. Framing: head at/above the top edge (or not found), feet beyond the frame edges.
  if (W && H) {
    const t = FOOTAGE.framing;
    const head = posed.filter((lm) => Y(lm, 0) < t.headTop * H || V(lm, 0) < FOOTAGE.vis || Math.min(Y(lm, 11), Y(lm, 12)) < t.headTop * H).length / posed.length;
    const feet = posed.filter((lm) => [29, 30, 31, 32].some((k) => X(lm, k) < 0 || X(lm, k) > W || Y(lm, k) > H)).length / posed.length;
    const first = rows.findIndex((r) => r && r.lm);
    let last = rows.length - 1;
    while (last > first && !rows[last]?.lm) last--;
    const span = rows.slice(first, last + 1);
    const lost = span.filter((r) => !r || !r.lm).length / span.length;
    const headStatus = head > t.headFail ? 'fail' : head > t.headWarn ? 'warn' : 'pass';
    const feetStatus = feet > t.feetFail ? 'fail' : feet > t.feetWarn ? 'warn' : 'pass';
    const rank = { pass: 0, warn: 1, fail: 2 };
    const status = rank[headStatus] >= rank[feetStatus] ? headStatus : feetStatus;
    const detail = `head at the top edge or not found in ${pct(head)} of frames; a foot beyond the frame edge in ${pct(feet)}; runner lost in ${pct(lost)} of frames`;
    const fix = rank[headStatus] >= rank[feetStatus] ? FIX.head : FIX.feet;
    out.push(check('framing', status, Math.max(head, feet), detail, fix));
  } else out.push(na('framing', 'frame size unknown'));

  // 4. Camera height (perspective of a floor-level camera tilted up).
  if (lateral) {
    const t = FOOTAGE.heightSide;
    const rel = hipRelY(posed);
    const lowerTrunk = median(
      posed.map((lm) => {
        const hy = hipMidY(lm);
        const sy = (Y(lm, 11) + Y(lm, 12)) / 2;
        return hy - sy > 1 ? (Math.max(Y(lm, 27), Y(lm, 28)) - hy) / (hy - sy) : null;
      }),
    );
    const dev = Math.max((t.hipRelY - rel) / t.hipRelY, (lowerTrunk - t.lowerTrunk) / t.lowerTrunk);
    // From above the belt, the near foot's contacts sit lower in the image than the far foot's; from
    // belt level they are level. Needs several stances.
    let gap = null;
    if (posed.length / fs >= FOOTAGE.minGapSeconds) {
      const g = legs[0];
      gap = median(['heel', 'ank', 'toe'].map((j) => (quantile(posed.map((lm) => Y(lm, g[j])), 0.9) - quantile(posed.map((lm) => Y(lm, far[j])), 0.9)) / shank));
    }
    const status = dev > t.devFail || (dev > t.devWarn && gap != null && gap < t.gapFail) ? 'fail' : dev > t.devWarn || (gap != null && gap < t.gapWarn) ? 'warn' : 'pass';
    const detail =
      `legs look ${Math.max(0, Math.round(dev * 100))}% longer relative to the trunk than from a hip-height camera (hips at ${pct(rel)} of body height, legs ${lowerTrunk.toFixed(2)}× trunk)` +
      (gap == null ? '; near/far foot contact level needs more of the clip' : `; near foot lands ${(gap * 100).toFixed(0)}% of a shank below the far foot (hip-height camera: 6–9%)`);
    out.push(check('camera_height', status, dev, detail, FIX.heightSide));
  } else {
    const t = FOOTAGE.heightRear;
    const footHip = median(
      posed.map((lm) => {
        const hw = dist(lm, 23, 24);
        return hw > 1 ? Math.max(dist(lm, 29, 31), dist(lm, 30, 32)) / hw : null;
      }),
    );
    const dev = (t.hipRelY - hipRelY(posed)) / t.hipRelY;
    const status = footHip > t.footHipFail || (footHip > t.footHipWarn && dev > t.devSupport) ? 'fail' : footHip > t.footHipWarn || dev > t.devWarn ? 'warn' : 'pass';
    const detail = `feet look ${Math.round(footHip * 100)}% of hip width long (soles face a low camera; hip-height view: 21–29%); hips ${Math.round(dev * 100)}% higher in the body outline than from hip height`;
    out.push(check('camera_height', status, footHip, detail, FIX.heightRear));
  }

  // 5. Camera tilt (roll).
  if (lateral) {
    if (!enough) out.push(na('camera_tilt'));
    else {
      const g = legs[0];
      const ys = posed.map((lm) => Y(lm, g.heel));
      const thr = quantile(ys, 0.85);
      const pts = posed.filter((lm) => Y(lm, g.heel) >= thr).map((lm) => [X(lm, g.heel), Y(lm, g.heel)]);
      const tilt = slopeDeg(pts);
      if (tilt == null) out.push(na('camera_tilt'));
      else {
        const status = Math.abs(tilt) > FOOTAGE.tilt.sideWarnDeg ? 'warn' : 'pass';
        out.push(check('camera_tilt', status, tilt, `foot path on the belt is tilted ${Math.abs(tilt).toFixed(1)}° from horizontal`, FIX.tilt));
      }
    }
  } else {
    const ang = (a, b) => median(posed.map((lm) => fold(Math.atan2(Y(lm, b) - Y(lm, a), X(lm, b) - X(lm, a)) * DEG)));
    const sho = ang(11, 12);
    const hip = ang(23, 24);
    const tilt = (sho + hip) / 2;
    const status = Math.abs(tilt) > FOOTAGE.tilt.frontalWarnDeg ? 'warn' : 'pass';
    out.push(check('camera_tilt', status, tilt, `shoulder and hip lines tilted ${Math.abs(tilt).toFixed(1)}° on average (includes the runner's own posture)`, FIX.tilt));
  }

  // 6. Squareness to the belt.
  {
    const t = FOOTAGE.square;
    if (lateral) {
      const trunk = median(posed.map((lm) => Math.hypot((X(lm, 11) + X(lm, 12)) / 2 - (X(lm, 23) + X(lm, 24)) / 2, (Y(lm, 11) + Y(lm, 12)) / 2 - hipMidY(lm)))) || 1;
      const hw = median(posed.map((lm) => Math.abs(X(lm, 23) - X(lm, 24)))) / trunk;
      const status = hw > t.sideHipWidthFail ? 'fail' : hw > t.sideHipWidthWarn ? 'warn' : 'pass';
      out.push(check('squareness', status, hw, `pelvis looks ${Math.round(hw * 100)}% of trunk length wide (a true side view is about 5%)`, FIX.squareSide));
    } else if (W) {
      const off = median(
        posed.map((lm) => {
          const w = Math.abs(X(lm, 24) - X(lm, 23));
          return w > 0 ? ((X(lm, 23) + X(lm, 24)) / 2 - W / 2) / w : null;
        }),
      );
      const status = Math.abs(off) > t.offCentreFail ? 'fail' : Math.abs(off) > t.offCentreWarn ? 'warn' : 'pass';
      out.push(check('squareness', status, off, `pelvis is ${Math.abs(off).toFixed(2)} hip widths ${off >= 0 ? 'right' : 'left'} of the picture centre`, FIX.squareRear));
    } else out.push(na('squareness', 'frame size unknown'));
  }

  // 7. Wide-angle lens / camera too close.
  if (lateral) out.push(na('wide_angle', 'not measurable reliably from side-view landmarks (see the camera height check)'));
  else if (!enough) out.push(na('wide_angle'));
  else {
    const t = FOOTAGE.wideRear;
    const ratio = quantile(
      posed.map((lm) => {
        const a = dist(lm, 25, 27);
        const b = dist(lm, 26, 28);
        return Math.min(a, b) > 1 ? Math.max(a, b) / Math.min(a, b) : null;
      }),
      0.9,
    );
    const status = ratio > t.fail ? 'fail' : ratio > t.warn ? 'warn' : 'pass';
    out.push(check('wide_angle', status, ratio, `one shin looks up to ${ratio.toFixed(1)}× longer than the other (strong close-range perspective above 1.6×)`, FIX.wide));
  }

  // 8. Runner size.
  if (H) {
    const t = FOOTAGE.size;
    const size = median(posed.map((lm) => (bodyBottom(lm) - bodyTop(lm)) / H));
    const px = size * H;
    let status = 'pass';
    let fix = null;
    if (size < t.fail) [status, fix] = ['fail', FIX.small];
    else if (size < t.warn) [status, fix] = ['warn', FIX.small];
    else if (size > t.tooBig) [status, fix] = ['warn', FIX.big];
    else if (px / t.analysisScale < t.minSourcePx) [status, fix] = ['warn', FIX.smallPx];
    out.push(check('runner_size', status, size, `runner is ${pct(size)} of the frame height (about ${Math.round(px / t.analysisScale)} px tall in the video)`, fix));
  } else out.push(na('runner_size', 'frame size unknown'));

  // 9. Frame rate.
  out.push(frameRate(meta));

  // 10. Motion blur: ankle/toe confidence drops when the foot moves fast.
  if (!enough) out.push(na('motion_blur'));
  else {
    const sp = [];
    const vv = [];
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1]?.lm;
      const b = rows[i]?.lm;
      if (!a || !b) continue;
      for (const g of legs) {
        sp.push(Math.hypot(X(a, g.ank) - X(b, g.ank), Y(a, g.ank) - Y(b, g.ank)) / thigh);
        vv.push((V(b, g.toe) + V(b, g.ank)) / 2);
      }
    }
    const cut = quantile(sp, 0.75);
    const drop = (mean(vv.filter((_, i) => sp[i] < cut)) ?? 0) - (mean(vv.filter((_, i) => sp[i] >= cut)) ?? 0);
    const status = drop > FOOTAGE.blur.warn ? 'warn' : 'pass';
    out.push(check('motion_blur', status, drop, `ankle/toe confidence ${drop > 0 ? 'drops' : 'changes'} by ${Math.abs(drop).toFixed(3)} when the foot moves fast${status === 'warn' ? ' (blur, or the swing foot hidden behind the other leg)' : ''}`, FIX.blur));
  }

  // 11. Lighting (optional meta.luma from the app's downscaled frames).
  out.push(lighting(meta));
  return out;
}

function frameRate(meta) {
  const fps = meta.fps;
  if (!fps) return na('frame_rate', 'frame rate unknown');
  const r = Math.round(fps);
  if (fps < FOOTAGE.fps.warn) return check('frame_rate', 'warn', fps, `${r} fps`, FIX.fps);
  if (fps < FOOTAGE.fps.recommended) return check('frame_rate', 'pass', fps, `${r} fps (validated at 30 fps; 120 fps recommended for sharper contact timing)`);
  return check('frame_rate', 'pass', fps, `${r} fps`);
}

function lighting(meta) {
  const L = meta.luma;
  if (!L || L.mean == null) return na('lighting', 'brightness not measured');
  const t = FOOTAGE.luma;
  const contrast = (L.p95 ?? 0) - (L.p5 ?? 0);
  const detail = `average brightness ${Math.round(L.mean)} of 255 (5–95% range ${Math.round(L.p5 ?? 0)}–${Math.round(L.p95 ?? 0)})`;
  if (L.mean < t.darkFail) return check('lighting', 'fail', L.mean, detail, FIX.dark);
  if (L.mean < t.darkWarn) return check('lighting', 'warn', L.mean, detail, FIX.dark);
  if (L.mean > t.brightWarn) return check('lighting', 'warn', L.mean, detail, FIX.bright);
  if (contrast < t.contrastWarn) return check('lighting', 'warn', L.mean, detail, FIX.flat);
  return check('lighting', 'pass', L.mean, detail);
}

function slopeDeg(pts) {
  if (pts.length < 3) return null;
  const mx = mean(pts.map((p) => p[0]));
  const my = mean(pts.map((p) => p[1]));
  let sxx = 0;
  let sxy = 0;
  for (const [x, y] of pts) {
    sxx += (x - mx) ** 2;
    sxy += (x - mx) * (y - my);
  }
  return sxx > 0 ? Math.atan(sxy / sxx) * DEG : null;
}

/**
 * Overall verdict from the checks.
 * score = 0.85^(warn checks) × 0.4^(fail checks): 1 = every check passed (or not applicable); one warning
 * gives 0.85, two 0.72; one failure gives 0.4, two 0.16. 'na' checks do not change the score.
 */
export function summariseChecks(checks) {
  const fails = checks.filter((c) => c.status === 'fail');
  const warns = checks.filter((c) => c.status === 'warn');
  const level = fails.length ? 'fail' : warns.length ? 'warn' : 'pass';
  const score = 0.85 ** warns.length * 0.4 ** fails.length;
  const order = (a, b) => PRIORITY.indexOf(a.id) - PRIORITY.indexOf(b.id);
  const ranked = [...fails.sort(order), ...warns.sort(order)];
  return {
    level,
    score: Math.round(score * 1000) / 1000,
    reasons: ranked.map((c) => `${c.label}: ${c.detail}`),
    fixes: [...new Set(ranked.map((c) => c.fix).filter(Boolean))],
  };
}

/**
 * Brightness summary of one frame (RGBA bytes, e.g. ctx.getImageData(...).data of a downscaled frame).
 * Samples every 4th pixel; luma = Rec. 601 (0.299 R + 0.587 G + 0.114 B), 0–255.
 */
export function lumaFromImageData(data) {
  const hist = new Uint32Array(256);
  let sum = 0;
  let n = 0;
  for (let i = 0; i + 2 < data.length; i += 16) {
    const y = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    hist[y]++;
    sum += y;
    n++;
  }
  if (!n) return { mean: null, p5: null, p95: null };
  const at = (p) => {
    const target = p * (n - 1);
    let c = 0;
    for (let v = 0; v < 256; v++) {
      c += hist[v];
      if (c > target) return v;
    }
    return 255;
  };
  return { mean: Math.round((sum / n) * 10) / 10, p5: at(0.05), p95: at(0.95) };
}

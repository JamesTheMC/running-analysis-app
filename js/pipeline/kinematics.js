// Joint-angle math, ported 1:1 from reference/reference_gait_pipeline.py.
// Points are [x, y] in pixels of the analysed (downscaled) frame; y points down.

const DEG = 180 / Math.PI;

export const LANDMARKS = {
  nose: 0,
  L: { sho: 11, elb: 13, wri: 15, hip: 23, knee: 25, ank: 27, heel: 29, toe: 31 },
  R: { sho: 12, elb: 14, wri: 16, hip: 24, knee: 26, ank: 28, heel: 30, toe: 32 },
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function interiorAngle(a, b, c) {
  const ab = [a[0] - b[0], a[1] - b[1]];
  const cb = [c[0] - b[0], c[1] - b[1]];
  const cos = (ab[0] * cb[0] + ab[1] * cb[1]) / (Math.hypot(...ab) * Math.hypot(...cb) + 1e-9);
  return Math.acos(clamp(cos, -1, 1)) * DEG;
}

// Knee flexion = 180 - interior hip-knee-ankle angle (0 = straight).
export function kneeFlexion(hip, knee, ank) {
  return 180 - interiorAngle(hip, knee, ank);
}

// Signed thigh angle vs the trunk axis (shoulder -> hip). 0 = thigh in line with trunk,
// positive = extension (thigh behind the trunk). `facing` is +1 when the runner faces +x.
export function hipExtensionSigned(sho, hip, knee, facing) {
  const a = [hip[0] - sho[0], hip[1] - sho[1]];
  const b = [knee[0] - hip[0], knee[1] - hip[1]];
  const ang = Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]) * DEG;
  const flexion = -facing * ang;
  return -flexion;
}

// Shoulder-hip line vs vertical: overall trunk lean only (MediaPipe has no spine/pelvis landmarks).
export function trunkFromVertical(sho, hip) {
  const v = [sho[0] - hip[0], sho[1] - hip[1]];
  const cos = -v[1] / (Math.hypot(...v) + 1e-9);
  return Math.acos(clamp(cos, -1, 1)) * DEG;
}

export function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

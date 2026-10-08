// Hip anchor correction (lateral clips). MediaPipe's hip landmark can sit forward of the hip joint
// centre (near the ASIS) and is partly covered by the treadmill rail on the near side. In
// HIP_ANCHOR.mode 'corrected', the NEAR hip landmark is moved by a fixed offset expressed in
// thigh-length units in the thigh's own frame, then the angles that use that hip are recomputed.
//
// Offset frame, per analysed frame:
//   along = component along the thigh (hip -> knee), in thigh lengths (+ = toward the knee)
//   perp  = component perpendicular to the thigh, in thigh lengths (+ = forward, the running direction)
// The offset comes from clinician clicks on the joint centre (test/hip-anchor.html).

import { LANDMARKS, hipExtensionSigned, kneeFlexion, trunkFromVertical } from './kinematics.js';
import { VIS_MIN } from './pose.js';

// Thigh frame at one row: unit vector along the thigh, forward perpendicular, thigh length (px).
export function thighFrame(row, side, facing) {
  const ids = LANDMARKS[side];
  const hip = [row.lm[ids.hip * 4], row.lm[ids.hip * 4 + 1]];
  const knee = [row.lm[ids.knee * 4], row.lm[ids.knee * 4 + 1]];
  const v = [knee[0] - hip[0], knee[1] - hip[1]];
  const L = Math.hypot(...v) || 1;
  const u = [v[0] / L, v[1] / L];
  let n = [-u[1], u[0]];
  if (n[0] * facing < 0) n = [-n[0], -n[1]]; // point forward (running direction)
  return { hip, knee, u, n, L };
}

// Offset of a clicked point from the hip landmark, in thigh lengths (along, perp).
export function offsetOf(row, side, facing, point) {
  const f = thighFrame(row, side, facing);
  const d = [point[0] - f.hip[0], point[1] - f.hip[1]];
  return { along: (d[0] * f.u[0] + d[1] * f.u[1]) / f.L, perp: (d[0] * f.n[0] + d[1] * f.n[1]) / f.L };
}

// Apply an offset to the hip landmark of one row; returns the corrected [x, y].
export function correctedHip(row, side, facing, offset) {
  const f = thighFrame(row, side, facing);
  return [f.hip[0] + f.L * (offset.along * f.u[0] + offset.perp * f.n[0]), f.hip[1] + f.L * (offset.along * f.u[1] + offset.perp * f.n[1])];
}

/**
 * Rows with the near hip moved by `offset` and that side's hip-dependent angles recomputed
 * (knee flexion, hip extension, trunk-from-vertical). Other fields are copied unchanged.
 */
export function applyHipAnchor(rows, side, facing, offset) {
  const ids = LANDMARKS[side];
  const vis = (row, ...ks) => ks.every((k) => row.lm[k * 4 + 3] > VIS_MIN);
  return rows.map((row) => {
    if (!row.lm) return row;
    const lm = Float32Array.from(row.lm);
    const [hx, hy] = correctedHip(row, side, facing, offset);
    lm[ids.hip * 4] = hx;
    lm[ids.hip * 4 + 1] = hy;
    const P = (k) => [lm[k * 4], lm[k * 4 + 1]];
    const out = { ...row, lm };
    out[`knee_flex_${side}`] = vis(row, ids.hip, ids.knee, ids.ank) ? kneeFlexion(P(ids.hip), P(ids.knee), P(ids.ank)) : null;
    out[`hip_ext_${side}`] = vis(row, ids.sho, ids.hip, ids.knee) ? hipExtensionSigned(P(ids.sho), P(ids.hip), P(ids.knee), row.facing) : null;
    out[`trunk_${side}`] = vis(row, ids.sho, ids.hip) ? trunkFromVertical(P(ids.sho), P(ids.hip)) : null;
    return out;
  });
}

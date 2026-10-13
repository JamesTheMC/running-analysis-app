// Leg identity correction: MediaPipe sometimes swaps its left/right leg labels for a frame or a few
// (low, wide-angle camera clips AR/AZ/CD: ~5% of frames; also C0). Each flicker adds false crossings
// to the stride signals (side: inter-ankle separation; rear: left-minus-right foot height), which
// shortened the detected stride and inflated cadence to 216–276 spm (2026-10-13).
//
// For each frame, the knee/ankle/heel/toe of both legs are compared with the previous (corrected)
// frame. If assigning them crosswise fits at least SWAP_RATIO times better than as labelled, the
// left/right labels of those points are swapped back. Hips are not swapped (they rarely flip and anchor
// the pelvis). Derived angles are recomputed for changed frames.
import { deriveAngles } from './pose.js';

const PAIRS = [
  [25, 26], // knees
  [27, 28], // ankles
  [29, 30], // heels
  [31, 32], // toes
];
export const LEG_IDENTITY = { swapRatio: 0.5 };

const P = (lm, k) => [lm[k * 4], lm[k * 4 + 1]];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function fixLegSwaps(rows) {
  let prev = null;
  let swapped = 0;
  const out = rows.map((r) => {
    if (!r.lm) {
      prev = null;
      return r;
    }
    let lm = r.lm;
    if (prev) {
      let same = 0;
      let cross = 0;
      for (const [l, rr] of PAIRS) {
        same += dist(P(lm, l), P(prev, l)) + dist(P(lm, rr), P(prev, rr));
        cross += dist(P(lm, l), P(prev, rr)) + dist(P(lm, rr), P(prev, l));
      }
      if (cross < LEG_IDENTITY.swapRatio * same) {
        lm = Float32Array.from(lm);
        for (const [l, rr] of PAIRS) {
          for (let c = 0; c < 4; c++) {
            const t = lm[l * 4 + c];
            lm[l * 4 + c] = lm[rr * 4 + c];
            lm[rr * 4 + c] = t;
          }
        }
        swapped++;
      }
    }
    prev = lm;
    if (lm === r.lm) return r;
    const row = { ...r, lm, legSwapFixed: true };
    deriveAngles(row);
    row.facing = r.facing; // facing comes from the nose and shoulders, unchanged
    return row;
  });
  return { rows: out, swapped };
}

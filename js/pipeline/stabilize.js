// Landmark stabilisation before metrics (events keep using the raw landmarks).
//   1. a landmark below STABILIZE.minVisibility is treated as missing (never guessed from a bad point);
//   2. gaps up to STABILIZE.maxGapSec are filled by linear interpolation, longer gaps stay missing;
//   3. x and y are smoothed with a Savitzky–Golay filter (polynomial fit, which keeps peaks far better
//      than a moving average), window in seconds so 30 and 60 Hz clips are treated alike.
// Filled points are listed in row.filled (landmark indices) and given visibility = minVisibility + 0.01
// so geometry checks pass; confidence logic should count them via row.filled.
import { VIS_MIN, deriveAngles } from './pose.js';
import { fillGaps, savgol } from './stats.js';

export const STABILIZE = {
  minVisibility: VIS_MIN,
  maxGapSec: 0.1,
  // SG window ≈ 0.1 s (at least 5 samples): 5 at 30 Hz, 7 at 60 Hz, a ≈ 8–10 Hz low-pass, the usual
  // range for running kinematics. Order 2 (order 3 has identical centre weights). Measured effect:
  // C0 knee-angle jitter 9.1° → 4.0°; per-stride stance knee peaks −0.5 to −5° (the max of a noisy
  // series is biased high). Wider windows lowered peaks by up to 10° (rejected).
  windowSec: 0.1,
  order: 2,
};

const odd = (n) => (n % 2 ? n : n + 1);

export function stabilizeRows(rows, fs, opts = {}) {
  const o = { ...STABILIZE, ...opts };
  const n = rows.length;
  const win = Math.max(5, odd(Math.round(o.windowSec * fs)));
  const maxGap = Math.max(1, Math.round(o.maxGapSec * fs));
  const out = rows.map((r) => ({ ...r, lm: r.lm ? Float32Array.from(r.lm) : null, filled: [] }));
  for (let k = 0; k < 33; k++) {
    for (const c of [0, 1]) {
      const raw = rows.map((r) => (r.lm && r.lm[k * 4 + 3] >= o.minVisibility ? r.lm[k * 4 + c] : NaN));
      const filled = fillGaps(raw, maxGap);
      const smooth = o.order > 0 && win >= o.order + 2 ? savgol(filled, win, o.order) : filled;
      for (let i = 0; i < n; i++) {
        const v = Number.isFinite(smooth[i]) ? smooth[i] : filled[i];
        if (!Number.isFinite(v)) continue;
        if (!out[i].lm) {
          // A frame without a pose: rebuilt only from filled points (nothing else is set).
          out[i].lm = new Float32Array(132).fill(NaN);
          for (let q = 0; q < 33; q++) out[i].lm[q * 4 + 3] = 0;
        }
        out[i].lm[k * 4 + c] = v;
        if (!Number.isFinite(raw[i])) {
          out[i].lm[k * 4 + 3] = o.minVisibility + 0.01;
          if (c === 0) out[i].filled.push(k);
        }
      }
    }
  }
  return out.map((r) => {
    if (!r.lm) return r;
    if (r.facing == null) {
      const L = r.lm;
      if (Number.isFinite(L[0])) r.facing = L[0] > (L[11 * 4] + L[12 * 4]) / 2 ? 1 : -1;
    }
    const facing = r.facing;
    deriveAngles(r);
    if (facing != null) r.facing = facing; // keep the raw facing (it is a whole-clip property)
    return r;
  });
}

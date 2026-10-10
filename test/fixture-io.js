// Compact landmark fixtures (derived data only, committed; videos never are).
// Keeps the 17 landmarks the pipeline reads (nose, shoulders, elbows, wrists, hips, knees, ankles,
// heels, toes) as x, y (analysed px, 0.1 px), visibility (0.01), plus depth z (0.001) for hips, knees
// and ankles (near-side check). Rows: [frame, tMs, ...17×(x,y,v), ...6×z] or [frame, tMs] (no pose).
import { deriveAngles } from '../js/pipeline/pose.js';

export const KEEP = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
export const KEEP_Z = [23, 24, 25, 26, 27, 28];
const round = (v, d) => Math.round(v * d) / d;

export function packRows(meta, rows) {
  const packed = rows.map((r) => {
    const head = [r.frame, Math.round(r.t * 1e6) / 1e3];
    if (!r.lm) return head;
    const body = [];
    for (const k of KEEP) body.push(round(r.lm[k * 4], 10), round(r.lm[k * 4 + 1], 10), round(r.lm[k * 4 + 3], 100));
    for (const k of KEEP_Z) body.push(round(r.lm[k * 4 + 2], 1000));
    return head.concat(body);
  });
  const { codec, fps, fs, frameCount, rotation, mirrored, sampleEvery, analysedSize, clipId, view } = meta;
  return { format: 'gait-landmarks/1', keep: KEEP, keepZ: KEEP_Z, meta: { codec, fps, fs, frameCount, rotation, mirrored: !!mirrored, sampleEvery, analysedSize, clipId, view }, rows: packed };
}

export function unpackRows(fx) {
  const rows = fx.rows.map((p) => {
    const row = { frame: p[0], t: p[1] / 1000, detected: p.length > 2 };
    if (p.length <= 2) return row;
    const lm = new Float32Array(132).fill(0);
    fx.keep.forEach((k, i) => lm.set([p[2 + i * 3], p[3 + i * 3], 0, p[4 + i * 3]], k * 4));
    const zAt = 2 + fx.keep.length * 3;
    fx.keepZ.forEach((k, i) => (lm[k * 4 + 2] = p[zAt + i]));
    row.lm = lm;
    return deriveAngles(row);
  });
  return { meta: fx.meta, rows };
}

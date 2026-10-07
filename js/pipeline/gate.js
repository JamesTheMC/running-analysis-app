// Tracking-failure gate (SPEC 7.1). MediaPipe visibility stays high on frames where the trailing leg
// is occluded, so we check a rigid segment instead: tibia (knee-ankle) length per frame, flagged when
// its robust z-score (median / MAD) exceeds 6. Frames without a tibia value are not flagged
// (numpy: NaN > 6 is False), matching the reference.

import { median } from './stats.js';

export const GATE_Z = 6;

export function rigidSegmentOutliers(lengths, z = GATE_Z) {
  const med = median(lengths);
  const mad = median(lengths.map((v) => Math.abs(v - med))) + 1e-6;
  return lengths.map((v) => Number.isFinite(v) && Math.abs(v - med) / mad > z);
}

export const series = (rows, key) => rows.map((r) => (r[key] == null ? NaN : r[key]));

export function tibiaGate(rows) {
  const bl = rigidSegmentOutliers(series(rows, 'tibia_L'));
  const br = rigidSegmentOutliers(series(rows, 'tibia_R'));
  return bl.map((b, i) => b || br[i]);
}

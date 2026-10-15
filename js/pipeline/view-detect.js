// Camera-view detection from the pose, so each clip's view can be guessed on upload (and overridden).
//
//   lateral vs frontal: shoulder width / torso length. On the 24 benchmark clips (2026-10-15) side
//     clips read 0.10–0.27 and rear clips 0.67–0.82 (shoulders overlap from the side).
//   rear vs front (frontal views): MediaPipe labels left/right anatomically, so from behind the
//     runner's left shoulder and hip are on image-left, from the front on image-right. Rear clips:
//     99–100% of frames left-on-image-left, except CD (58%: frequent left/right swaps) → ambiguous.
//   which side faces the camera (lateral): depth (z) of hip, knee and ankle (strides.js detectNearSide).
// The guess is shown with its evidence; the clinician can always override it.
import { LANDMARKS } from './kinematics.js';
import { detectNearSide } from './strides.js';
import { median } from './stats.js';
import { RECONCILE } from './reconcile.js';

export const VIEW_DETECT = {
  lateralBelow: 0.35, // shoulder width / torso length at or below: side view
  frontalAbove: 0.5, // at or above: rear or front view (between: unsure)
  orderDecisive: 0.8, // share of frames with a consistent left/right order for a confident rear/front call
};

const x = (r, k) => r.lm[k * 4];
const y = (r, k) => r.lm[k * 4 + 1];

export function viewFeatures(rows) {
  const posed = rows.filter((r) => r.lm);
  if (!posed.length) return null;
  const { L, R } = LANDMARKS;
  const width = [];
  let leftOnLeft = 0;
  for (const r of posed) {
    const torso = Math.abs((y(r, L.hip) + y(r, R.hip)) / 2 - (y(r, L.sho) + y(r, R.sho)) / 2) || 1;
    width.push(Math.abs(x(r, L.sho) - x(r, R.sho)) / torso);
    // Shoulders and hips agree on the order: the runner's left is on image-left.
    if (x(r, L.sho) < x(r, R.sho) && x(r, L.hip) < x(r, R.hip)) leftOnLeft++;
  }
  return { shoulderWidthRatio: median(width), leftOnImageLeft: leftOnLeft / posed.length, frames: posed.length };
}

/**
 * @returns { view: 'lateral'|'posterior'|'anterior', slot, confidence: 'high'|'low', evidence: string, features }
 */
export function detectView(rows) {
  const f = viewFeatures(rows);
  if (!f) return { view: null, slot: null, confidence: 'low', evidence: 'no runner detected', features: null };
  const w = f.shoulderWidthRatio;
  // Between the two thresholds the nearer one wins, with low confidence.
  if (w < (VIEW_DETECT.lateralBelow + VIEW_DETECT.frontalAbove) / 2) {
    const d = detectNearSide(rows);
    const leg = d.side === 'L' ? 'left' : 'right';
    const zGap = Math.abs(d.zL - d.zR);
    const decisive = zGap >= RECONCILE.nearSideMinZGap;
    return {
      view: 'lateral',
      slot: `lateral_${leg}`,
      nearLeg: leg,
      confidence: decisive && w <= VIEW_DETECT.lateralBelow ? 'high' : 'low',
      evidence: `side view (shoulders overlap: width ${w.toFixed(2)} × torso); the runner's ${leg} side faces the camera (depth gap ${zGap.toFixed(2)}${decisive ? '' : ', not decisive'})`,
      features: { ...f, zGap },
    };
  }
  const rear = f.leftOnImageLeft >= 0.5;
  const share = rear ? f.leftOnImageLeft : 1 - f.leftOnImageLeft;
  const view = rear ? 'posterior' : 'anterior';
  return {
    view,
    slot: view,
    confidence: share >= VIEW_DETECT.orderDecisive && w >= VIEW_DETECT.frontalAbove ? 'high' : 'low',
    evidence: `${rear ? 'rear' : 'front'} view (shoulders square to the camera: width ${w.toFixed(2)} × torso; runner's left on image-${rear ? 'left' : 'right'} in ${Math.round(share * 100)}% of frames)`,
    features: f,
  };
}

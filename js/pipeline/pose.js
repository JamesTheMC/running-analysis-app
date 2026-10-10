// MediaPipe Pose Landmarker (Tasks API), loaded from files bundled in vendor/mediapipe/.
// Nothing is fetched from external hosts. "full" is the Tasks equivalent of the reference's
// legacy mp.solutions.pose model_complexity=1.

import { LANDMARKS, distance, hipExtensionSigned, interiorAngle, kneeFlexion, trunkFromVertical } from './kinematics.js';

const BASE = new URL('../../vendor/mediapipe/', import.meta.url).href;
export const MODEL_URL = `${BASE}models/pose_landmarker_full.task`;
export const VENDOR_FILES = [
  `${BASE}vision_bundle.mjs`,
  `${BASE}wasm/vision_wasm_internal.js`,
  `${BASE}wasm/vision_wasm_internal.wasm`,
  MODEL_URL,
];

export const VIS_MIN = 0.5;

export async function createPoseLandmarker({ delegate = 'GPU' } = {}) {
  const { PoseLandmarker } = await import(`${BASE}vision_bundle.mjs`);
  const fileset = {
    wasmLoaderPath: `${BASE}wasm/vision_wasm_internal.js`,
    wasmBinaryPath: `${BASE}wasm/vision_wasm_internal.wasm`,
  };
  const options = (d) => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate: d },
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputSegmentationMasks: false,
  });
  try {
    return { landmarker: await PoseLandmarker.createFromOptions(fileset, options(delegate)), delegate };
  } catch (e) {
    if (delegate !== 'GPU') throw e;
    // Some browsers (or GPU blocklists) cannot run the GPU delegate; CPU always works.
    return { landmarker: await PoseLandmarker.createFromOptions(fileset, options('CPU')), delegate: 'CPU' };
  }
}

/**
 * One analysed frame -> a row with the same fields as the reference rows.
 * `lm` keeps all 33 landmarks as [x px, y px, z (normalised), visibility] for later metrics/overlays.
 */
export function buildRow(landmarks, { index, ptsSec, width, height }) {
  const row = { frame: index, t: ptsSec, detected: !!landmarks };
  if (!landmarks) return row;

  const lm = new Float32Array(33 * 4);
  landmarks.forEach((p, i) => lm.set([p.x * width, p.y * height, p.z, p.visibility ?? 0], i * 4));
  row.lm = lm;
  return deriveAngles(row);
}

// Per-frame derived fields from row.lm (also re-run after landmark corrections or stabilisation).
export function deriveAngles(row) {
  const lm = row.lm;
  const P = (k) => [lm[k * 4], lm[k * 4 + 1]];
  const V = (k) => lm[k * 4 + 3];

  const nose = P(LANDMARKS.nose);
  const facing = nose[0] > (P(LANDMARKS.L.sho)[0] + P(LANDMARKS.R.sho)[0]) / 2 ? 1 : -1;
  row.facing = facing;

  for (const side of ['L', 'R']) {
    const idx = LANDMARKS[side];
    const vis = (...ks) => ks.every((k) => V(idx[k]) > VIS_MIN);
    const p = (k) => P(idx[k]);
    row[`knee_flex_${side}`] = vis('hip', 'knee', 'ank') ? kneeFlexion(p('hip'), p('knee'), p('ank')) : null;
    row[`hip_ext_${side}`] = vis('sho', 'hip', 'knee') ? hipExtensionSigned(p('sho'), p('hip'), p('knee'), facing) : null;
    row[`tibia_${side}`] = vis('knee', 'ank') ? distance(p('knee'), p('ank')) : null;
    row[`elbow_${side}`] = vis('sho', 'elb', 'wri') ? interiorAngle(p('sho'), p('elb'), p('wri')) : null;
    row[`trunk_${side}`] = vis('sho', 'hip') ? trunkFromVertical(p('sho'), p('hip')) : null;
  }
  return row;
}

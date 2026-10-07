// Upload-time checks from the file's movie header only (no decoding; milliseconds). Read: frame rate
// from each frame's timestamp (exact for variable-frame-rate iPhone files), duration, orientation
// (track rotation matrix), resolution, codec and HDR. Not knowable from the file: camera height,
// level, distance or lighting.

import { demux } from './mp4.js';
import { checkCodec } from './decode.js';

export const CAPTURE = {
  minFps: 60,
  recommendedFps: 120,
  minSeconds: 30,
};

export async function checkVideoFile(file) {
  const t = await demux(file);
  const gaps = t.frameTimes.slice(1).map((x, i) => x - t.frameTimes[i]);
  const mean = gaps.reduce((a, b) => a + b, 0) / (gaps.length || 1);
  const variable = gaps.length > 1 && Math.max(...gaps) > 1.5 * mean;
  const info = {
    fps: t.fps,
    frames: t.frameCount,
    seconds: t.duration,
    width: t.displayWidth,
    height: t.displayHeight,
    orientation: t.displayHeight >= t.displayWidth ? 'portrait' : 'landscape',
    rotation: t.rotation,
    codec: t.codec,
    hdr: t.hdr,
    variableFrameRate: variable,
    decodable: await checkCodec(t),
    warnings: [],
    notes: [],
  };
  const fps = Math.round(t.fps);
  if (!info.decodable) info.warnings.push(`This browser cannot decode this video format (${t.codec}). Use the native camera file in Safari or Chrome.`);
  if (t.fps < CAPTURE.minFps) info.warnings.push(`Recorded at ${fps} fps. At least ${CAPTURE.minFps} fps is needed; ${CAPTURE.recommendedFps} fps is recommended.`);
  else if (t.fps < CAPTURE.recommendedFps - 5) info.notes.push(`${fps} fps. ${CAPTURE.recommendedFps} fps is recommended for sharper contact timing.`);
  if (t.duration < CAPTURE.minSeconds) info.warnings.push(`Clip is ${Math.round(t.duration)} s. Record at least ${CAPTURE.minSeconds} s of steady running (more than 7 steps per leg are needed for a stable mean).`);
  if (info.hdr) info.notes.push('HDR video: colours are converted for analysis. Results can differ slightly from an SDR recording.');
  if (variable) info.notes.push('Variable frame rate: frame timestamps are used, so timing stays exact.');
  return info;
}

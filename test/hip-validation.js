// Hip extension validation aid: annotated frames at the picked late-stance peak and at toe-off for
// near-leg strides, with the trunk axis, the thigh line and the measured angle drawn on, so the angle
// can be measured by hand. Saved to test-data/debug/ through the dev server.

import { LANDMARKS } from '../js/pipeline/kinematics.js';
import { hipExtensionSigned } from '../js/pipeline/kinematics.js';

const P = (row, k) => [row.lm[k * 4], row.lm[k * 4 + 1]];

async function seek(video, t) {
  video.currentTime = t;
  await new Promise((res) => (video.onseeked = res));
}

// Five valid near-leg strides spread evenly through the clip.
export function pickHipStrides(result, count = 5) {
  const near = result.seg.near.side;
  const valid = result.hipExt[near].strides.map((s, cycle) => ({ ...s, cycle })).filter((s) => s.valid);
  const toBy = new Map(result.events[near].strides.filter((s) => s.valid).map((s) => [s.cycle, s.to]));
  return Array.from({ length: Math.min(count, valid.length) }, (_, j) => valid[Math.round((j * (valid.length - 1)) / Math.max(1, count - 1))]).map(
    (s) => ({ cycle: s.cycle, peak: s.index, peakSmoothed: s.value, to: toBy.get(s.cycle) }),
  );
}

function drawAnnotated(video, row, near, facing, { title, analysedW }) {
  const ids = LANDMARKS[near];
  const sho = P(row, ids.sho);
  const hip = P(row, ids.hip);
  const knee = P(row, ids.knee);
  // Crop around the trunk and thigh (analysed px), keep 3:4.
  const xs = [sho[0], hip[0], knee[0]];
  const ys = [sho[1], hip[1], knee[1]];
  const h = (Math.max(...ys) - Math.min(...ys)) * 1.5;
  const w = h * 0.75;
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const box = { x0: cx - w / 2, y0: cy - h / 2, w, h };
  const W = 600;
  const H = 800;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const vs = video.videoWidth / analysedW;
  ctx.drawImage(video, box.x0 * vs, box.y0 * vs, box.w * vs, box.h * vs, 0, 0, W, H);
  const T = ([px, py]) => [((px - box.x0) / box.w) * W, ((py - box.y0) / box.h) * H];

  const angle = hipExtensionSigned(sho, hip, knee, facing);
  // Trunk axis: shoulder -> hip, extended past the hip by the thigh length (the 0° reference).
  const trunk = [hip[0] - sho[0], hip[1] - sho[1]];
  const tl = Math.hypot(...trunk);
  const thighLen = Math.hypot(knee[0] - hip[0], knee[1] - hip[1]);
  const ext = [hip[0] + (trunk[0] / tl) * thighLen, hip[1] + (trunk[1] / tl) * thighLen];
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#ffd400';
  ctx.beginPath();
  ctx.moveTo(...T(sho));
  ctx.lineTo(...T(hip));
  ctx.stroke();
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(...T(hip));
  ctx.lineTo(...T(ext));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = '#2f81f7';
  ctx.beginPath();
  ctx.moveTo(...T(hip));
  ctx.lineTo(...T(knee));
  ctx.stroke();
  // Angle arc between the extended trunk axis and the thigh.
  const [hx, hy] = T(hip);
  const a1 = Math.atan2(T(ext)[1] - hy, T(ext)[0] - hx);
  const a2 = Math.atan2(T(knee)[1] - hy, T(knee)[0] - hx);
  let d = a2 - a1;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(hx, hy, 70, a1, a1 + d, d < 0);
  ctx.stroke();
  for (const p of [sho, hip, knee]) {
    const [px, py] = T(p);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, W, 70);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 20px -apple-system, system-ui, sans-serif';
  ctx.fillText(title, 12, 28);
  ctx.font = '18px -apple-system, system-ui, sans-serif';
  ctx.fillText(`Hip extension (this frame): ${angle.toFixed(1)}°  ·  + = thigh behind the trunk axis`, 12, 56);
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, H - 30, W, 30);
  ctx.fillStyle = '#fff';
  ctx.font = '14px -apple-system, system-ui, sans-serif';
  ctx.fillText('Yellow: shoulder → hip (trunk axis), dashed = 0° reference · Blue: hip → knee (thigh)', 12, H - 10);
  return { canvas: c, angle };
}

export async function buildHipValidation({ video, result, save }) {
  const near = result.seg.near.side;
  const facing = result.seg.ref.facing;
  const { rows, meta } = result;
  const picks = pickHipStrides(result);
  const out = [];
  for (const p of picks) {
    for (const [kind, i] of [
      ['peak', p.peak],
      ['TO', p.to],
    ]) {
      if (i == null) continue;
      const row = rows[i];
      await seek(video, row.t + 0.4 / meta.fps);
      const { canvas, angle } = drawAnnotated(video, row, near, facing, {
        title: `Cycle ${p.cycle} · ${kind} · source frame ${row.frame} · ${row.t.toFixed(3)} s`,
        analysedW: meta.analysedSize[0],
      });
      const name = `hipext_cycle${p.cycle}_${kind}_f${row.frame}.png`;
      await save(name, canvas);
      out.push({ cycle: p.cycle, kind, frame: row.frame, t: row.t, angleThisFrame: angle, peakSmoothed: kind === 'peak' ? p.peakSmoothed : null, file: name });
    }
  }
  return out;
}

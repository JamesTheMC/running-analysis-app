// Rear view, review tools only (no app metrics yet): midstance strip and how candidate metrics move
// when midstance shifts by a few frames. Candidate definitions follow reference/REAR_VIEW.md.

import { LANDMARKS } from '../js/pipeline/kinematics.js';
import { median, percentile } from '../js/pipeline/stats.js';

const DEG = 180 / Math.PI;
const P = (row, k) => [row.lm[k * 4], row.lm[k * 4 + 1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const unit = (v) => {
  const n = Math.hypot(...v) || 1;
  return [v[0] / n, v[1] / n];
};
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

// Frame geometry for stance leg `side`: pelvis direction, downward perpendicular, medial direction.
function frame(row, side) {
  const hl = P(row, LANDMARKS.L.hip);
  const hr = P(row, LANDMARKS.R.hip);
  const u = unit(sub(hr, hl)); // left hip -> right hip
  const n = [-u[1], u[0]]; // perpendicular, pointing down the image
  const m = side === 'L' ? u : [-u[0], -u[1]]; // medial for this leg
  return { hl, hr, u, n, m, hipMid: mid(hl, hr), hipW: Math.hypot(...sub(hr, hl)) };
}

export const CANDIDATES = {
  // Thigh vs the perpendicular to the pelvis line; + = knee toward midline (adduction).
  hipAdduction(row, side) {
    const f = frame(row, side);
    const t = sub(P(row, LANDMARKS[side].knee), P(row, LANDMARKS[side].hip));
    return Math.atan2(dot(t, f.m), dot(t, f.n)) * DEG;
  },
  // Frontal knee angle, 180 - interior hip-knee-ankle; + = knee medial to the hip-ankle line (valgus).
  kneeValgus(row, side) {
    const f = frame(row, side);
    const h = P(row, LANDMARKS[side].hip);
    const k = P(row, LANDMARKS[side].knee);
    const a = P(row, LANDMARKS[side].ank);
    const v1 = sub(h, k);
    const v2 = sub(a, k);
    const interior = Math.acos(Math.max(-1, Math.min(1, dot(v1, v2) / (Math.hypot(...v1) * Math.hypot(...v2))))) * DEG;
    const l = unit(sub(a, h));
    const rel = sub(k, h);
    const off = sub(rel, [l[0] * dot(rel, l), l[1] * dot(rel, l)]);
    return Math.sign(dot(off, f.m)) * (180 - interior);
  },
  // Shoulder midpoint vs pelvis midpoint along the pelvis line, in hip widths; + = toward the stance side.
  trunkShift(row, side) {
    const f = frame(row, side);
    const s = mid(P(row, LANDMARKS.L.sho), P(row, LANDMARKS.R.sho));
    return dot(sub(s, f.hipMid), [-f.m[0], -f.m[1]]) / f.hipW;
  },
  // Heel vs the pelvis midline, in hip widths; + = on its own side, <= 0 = on or past the midline (crossover).
  heelFromMidline(row, side) {
    const f = frame(row, side);
    return dot(sub(P(row, LANDMARKS[side].heel), f.hipMid), [-f.m[0], -f.m[1]]) / f.hipW;
  },
};

const UNITS = { hipAdduction: '°', kneeValgus: '°', trunkShift: ' hip widths', heelFromMidline: ' hip widths' };

export function midstanceSensitivity(rows, bad, ms, shifts = [-3, -2, -1, 0, 1, 2, 3]) {
  const out = {};
  for (const side of ['L', 'R']) {
    const strides = ms[side].filter((s) => s.valid);
    out[side] = {};
    for (const [name, fn] of Object.entries(CANDIDATES)) {
      const byShift = shifts.map((d) => {
        const v = strides.map((s) => s.ms + d).filter((i) => rows[i]?.lm && !bad[i]).map((i) => fn(rows[i], side));
        return { shift: d, median: median(v), iqr: [percentile(v, 25), percentile(v, 75)], n: v.length, crossoverShare: name === 'heelFromMidline' ? v.filter((x) => x <= 0).length / v.length : undefined };
      });
      const base = byShift.find((x) => x.shift === 0).median;
      out[side][name] = { unit: UNITS[name], byShift: byShift.map((x) => ({ ...x, delta: x.median - base })) };
    }
  }
  return out;
}

// Strip of midstance frames, 10 strides per leg. `candidates` = [{ name, ms }] where ms has the
// shape of segmentationMidstance(); the same half-cycles are shown for every candidate, one row each.
export async function buildMidstanceStrip({ video, result, ms, candidates, perLeg = 10 }) {
  candidates ??= [{ name: 'stance centre', ms }];
  const { rows, meta } = result;
  const tw = 190;
  const th = 300;
  const head = 150;
  const top = 64;
  const rowsPerLeg = candidates.length;
  const canvas = document.createElement('canvas');
  canvas.width = head + perLeg * tw;
  canvas.height = top + 2 * rowsPerLeg * (th + 30) + 10;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px -apple-system, system-ui, sans-serif';
  ctx.fillText(`Rear view · midstance candidates: ${candidates.map((c) => c.name).join(' vs ')}`, 12, 26);
  ctx.font = '13px -apple-system, system-ui, sans-serif';
  ctx.fillText('Check: stance foot planted and roughly under the pelvis, at the deepest landing position. Yellow = pelvis line and hip midpoint; blue = left leg, orange = right leg; thick = stance leg.', 12, 48);
  const vs = video.videoWidth / meta.analysedSize[0];
  let r = 0;
  for (const side of ['L', 'R']) {
    const base = candidates[0].ms[side];
    const validIdx = base.map((h, i) => i).filter((i) => candidates.every((c) => c.ms[side][i]?.valid));
    const picks = Array.from({ length: Math.min(perLeg, validIdx.length) }, (_, j) => validIdx[Math.round((j * (validIdx.length - 1)) / Math.max(1, perLeg - 1))]);
    for (const cand of candidates) {
      const y0 = top + r * (th + 30);
      r++;
      ctx.fillStyle = side === 'L' ? '#2f81f7' : '#ff7a1a';
      ctx.font = 'bold 15px -apple-system, system-ui, sans-serif';
      ctx.fillText(side === 'L' ? 'Left stance' : 'Right stance', 10, y0 + 24);
      ctx.fillStyle = '#fff';
      ctx.font = '13px -apple-system, system-ui, sans-serif';
      ctx.fillText(cand.name, 10, y0 + 44);
      for (const [j, idx] of picks.entries()) {
        const h = cand.ms[side][idx];
        const row = rows[h.ms];
        video.currentTime = row.t + 0.4 / meta.fps;
        await new Promise((res) => (video.onseeked = res));
        const pts = ['hip', 'knee', 'ank', 'heel', 'toe'].flatMap((k) => [P(row, LANDMARKS.L[k]), P(row, LANDMARKS.R[k])]);
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        let bx = Math.min(...xs);
        let bw = Math.max(...xs) - bx;
        let by = Math.min(...ys);
        let bh = Math.max(...ys) - by;
        const pad = 0.1 * bh;
        by -= pad;
        bh += 1.6 * pad;
        const want = bh * (tw / th);
        bx -= (want - bw) / 2;
        bw = want;
        const x0 = head + j * tw;
        ctx.drawImage(video, bx * vs, by * vs, bw * vs, bh * vs, x0 + 2, y0, tw - 4, th);
        const T = ([px, py]) => [x0 + 2 + ((px - bx) / bw) * (tw - 4), y0 + ((py - by) / bh) * th];
        const hm = mid(P(row, LANDMARKS.L.hip), P(row, LANDMARKS.R.hip));
        ctx.strokeStyle = '#ffd400';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(...T(P(row, LANDMARKS.L.hip)));
        ctx.lineTo(...T(P(row, LANDMARKS.R.hip)));
        ctx.stroke();
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(T(hm)[0], y0);
        ctx.lineTo(T(hm)[0], y0 + th);
        ctx.stroke();
        ctx.setLineDash([]);
        for (const sd of ['L', 'R']) {
          const ids = LANDMARKS[sd];
          ctx.strokeStyle = sd === 'L' ? '#2f81f7' : '#ff7a1a';
          ctx.lineWidth = sd === side ? 3.5 : 1.5;
          ctx.beginPath();
          [ids.hip, ids.knee, ids.ank, ids.heel].forEach((k, n) => ctx[n ? 'lineTo' : 'moveTo'](...T(P(row, k))));
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(x0 + 2, y0 + th, tw - 4, 22);
        ctx.fillStyle = '#fff';
        ctx.font = '12px -apple-system, system-ui, sans-serif';
        const span = `${rows[Math.ceil(h.start)].frame}–${rows[Math.floor(h.end)].frame}`;
        ctx.fillText(`f${row.frame} (stance ${span})`, x0 + 6, y0 + th + 15);
      }
    }
  }
  return canvas;
}

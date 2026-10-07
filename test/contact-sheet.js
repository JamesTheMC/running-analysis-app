// Debug contact sheet: annotated frames at IC / MS / TO for both legs over 5 consecutive strides,
// plus an IC timing strip (IC-2 .. IC+2) per leg, so events can be checked by eye.
// Side view: near leg blue, far leg orange, with each stride's belt line.
// Rear view: left leg blue, right leg orange, with the pelvis line (hip to hip).

import { LANDMARKS } from '../js/pipeline/kinematics.js';

const C = {
  near: '#2f81f7',
  far: '#ff7a1a',
  other: 'rgba(255,255,255,0.55)',
  hip: '#ffd400',
  bad: '#ff3b30',
  warn: '#ffb020',
  text: '#ffffff',
  bg: '#0d1117',
  panel: '#161b22',
};
const TILE = { w: 300, h: 360 };
const STRIP = { w: 150, h: 180 };
const HEAD_W = 170;
const EVENTS = ['ic', 'ms', 'to'];
const EVENT_LABEL = { ic: 'IC', ms: 'MS', to: 'TO' };

const P = (row, k) => [row.lm[k * 4], row.lm[k * 4 + 1]];

async function seek(video, t) {
  video.currentTime = t;
  await new Promise((res) => (video.onseeked = res));
}

// Crop box (analysed px) around both legs and the hips, padded.
function cropBox(row, beltY, aspect) {
  const ids = ['hip', 'knee', 'ank', 'heel', 'toe'].flatMap((k) => [LANDMARKS.L[k], LANDMARKS.R[k]]);
  const pts = ids.map((k) => P(row, k));
  let x0 = Math.min(...pts.map((p) => p[0]));
  let x1 = Math.max(...pts.map((p) => p[0]));
  let y0 = Math.min(...pts.map((p) => p[1]));
  let y1 = Math.max(...pts.map((p) => p[1]), beltY);
  const pad = 0.12 * (y1 - y0);
  x0 -= pad;
  x1 += pad;
  y0 -= pad;
  y1 += pad * 0.6;
  // Grow to the tile aspect ratio, centred.
  const w = x1 - x0;
  const h = y1 - y0;
  if (w / h < aspect) {
    const nw = h * aspect;
    x0 -= (nw - w) / 2;
    x1 = x0 + nw;
  } else {
    const nh = w / aspect;
    y0 -= (nh - h) / 2;
    y1 = y0 + nh;
  }
  return { x0, y0, w: x1 - x0, h: y1 - y0 };
}

function drawFrame(ctx, video, row, { x, y, w, h }, opts) {
  const { side, nearSide, belt, analysedW, label, highlight, flags = [], invalid, pelvis } = opts;
  const beltAt = (px) => (belt ? belt.a + belt.b * px : null);
  const footX = P(row, LANDMARKS[side].heel)[0];
  const box = cropBox(row, belt ? beltAt(footX) : 0, w / h);
  const vs = video.videoWidth / analysedW; // analysed px -> video px
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(video, box.x0 * vs, box.y0 * vs, box.w * vs, box.h * vs, x, y, w, h);
  const T = ([px, py]) => [x + ((px - box.x0) / box.w) * w, y + ((py - box.y0) / box.h) * h];
  const s = w / box.w;

  // Hip midpoint (COM proxy) vertical line.
  const hipMid = [(P(row, LANDMARKS.L.hip)[0] + P(row, LANDMARKS.R.hip)[0]) / 2, (P(row, LANDMARKS.L.hip)[1] + P(row, LANDMARKS.R.hip)[1]) / 2];
  ctx.strokeStyle = C.hip;
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(T(hipMid)[0], y);
  ctx.lineTo(T(hipMid)[0], y + h);
  ctx.stroke();

  // Rear view: pelvis line (hip to hip).
  if (pelvis) {
    ctx.strokeStyle = C.hip;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(...T(P(row, LANDMARKS.L.hip)));
    ctx.lineTo(...T(P(row, LANDMARKS.R.hip)));
    ctx.stroke();
  }

  // This stride's belt level for the event leg (slanted to follow the treadmill in the image).
  const legColor = side === nearSide ? C.near : C.far;
  if (belt) {
    ctx.strokeStyle = legColor;
    ctx.beginPath();
    ctx.moveTo(...T([box.x0, beltAt(box.x0)]));
    ctx.lineTo(...T([box.x0 + box.w, beltAt(box.x0 + box.w)]));
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Legs: other leg thin, event leg thick.
  for (const sd of [side === 'L' ? 'R' : 'L', side]) {
    const ids = LANDMARKS[sd];
    const chain = [ids.hip, ids.knee, ids.ank, ids.heel, ids.toe, ids.ank].map((k) => T(P(row, k)));
    ctx.strokeStyle = sd === side ? legColor : C.other;
    ctx.lineWidth = sd === side ? Math.max(2.5, 3 * s * 0.5) : 1.5;
    ctx.beginPath();
    chain.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](...p));
    ctx.stroke();
    if (sd === side) {
      for (const [k, col] of [
        [ids.heel, '#ffffff'],
        [ids.toe, '#00e5ff'],
      ]) {
        const [px, py] = T(P(row, k));
        ctx.fillStyle = col;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
      }
    }
  }
  ctx.restore();

  // Frame border and labels.
  ctx.lineWidth = highlight ? 4 : 2;
  ctx.strokeStyle = invalid ? C.bad : flags.length ? C.warn : highlight ? '#ffffff' : '#30363d';
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  if (label) {
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(x, y, w, 22);
    ctx.fillStyle = C.text;
    ctx.font = '13px -apple-system, system-ui, sans-serif';
    ctx.fillText(label, x + 6, y + 15);
  }
  const notes = [...(invalid ? [`INVALID: ${invalid}`] : []), ...flags.map((f) => `LOW QUALITY: ${f}`)];
  notes.slice(0, 3).forEach((n, i) => {
    const yy = y + h - 20 * (notes.slice(0, 3).length - i);
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(x, yy, w, 20);
    ctx.fillStyle = invalid && i === 0 ? C.bad : C.warn;
    ctx.font = '11px -apple-system, system-ui, sans-serif';
    ctx.fillText(n.length > 48 ? `${n.slice(0, 47)}…` : n, x + 5, yy + 14);
  });
}

// Five consecutive cycles from the middle of the clip where both legs have event records.
export function pickStrides(events, count = 5) {
  const byCycle = (side) => new Map(events[side].strides.map((s) => [s.cycle, s]));
  const L = byCycle('L');
  const R = byCycle('R');
  const both = [...L.keys()].filter((k) => R.has(k)).sort((a, b) => a - b);
  const start = Math.max(0, Math.floor(both.length / 2) - Math.floor(count / 2));
  return both.slice(start, start + count).map((k) => ({ cycle: k, L: L.get(k), R: R.get(k) }));
}

// Rear view: pair each left stride with the right stride whose stance centre follows it.
export function pickRearStrides(events, period, count = 5) {
  const pairs = [];
  for (const l of events.L.strides) {
    const r = events.R.strides.find((x) => x.centre > l.centre && x.centre <= l.centre + period);
    if (r) pairs.push({ cycle: l.stride, L: l, R: r });
  }
  const start = Math.max(0, Math.floor(pairs.length / 2) - Math.floor(count / 2));
  return pairs.slice(start, start + count);
}

export async function buildContactSheet({ video, result, clipName, onProgress = () => {} }) {
  const { rows, events, seg, meta } = result;
  const rear = result.view === 'posterior';
  const near = rear ? 'L' : seg.near.side;
  const analysedW = meta.analysedSize[0];
  const picks = rear ? pickRearStrides(events, seg.period) : pickStrides(events);
  const sides = [near, near === 'L' ? 'R' : 'L'];
  const legName = rear ? (sd) => (sd === 'L' ? 'Left' : 'Right') : (sd) => `${sd} ${sd === near ? 'near' : 'far'}`;

  const gridW = HEAD_W + 6 * TILE.w;
  const top = 96;
  const gridH = picks.length * (TILE.h + 8);
  const stripTop = top + gridH + 56;
  const stripRowH = STRIP.h + 30;
  const H = stripTop + picks.length * stripRowH + 20;
  const canvas = document.createElement('canvas');
  canvas.width = gridW;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, gridW, H);

  // Title and legend.
  ctx.fillStyle = C.text;
  ctx.font = 'bold 20px -apple-system, system-ui, sans-serif';
  ctx.fillText(`Gait events · ${clipName}`, 16, 30);
  ctx.font = '13px -apple-system, system-ui, sans-serif';
  const ev = (sd) => events[sd];
  ctx.fillText(
    rear
      ? 'Rear view · Left (blue) · Right (orange) · white dot = heel, cyan dot = foot index · yellow line = pelvis (hip to hip) · yellow dashed = hip midpoint · MS = middle of stance'
      : `${legName(near)} (blue) · ${legName(sides[1])} (orange) · white dot = heel, cyan dot = foot index · coloured dashed = that stride's belt level · yellow dashed = hip midpoint (COM proxy)`,
    16,
    54,
  );
  ctx.fillText(
    `Valid strides: ${sides.map((sd) => `${sd} ${ev(sd).validCount}/${ev(sd).strides.length} (good ${ev(sd).goodCount})`).join(' · ')} · Border: red = invalid stride, amber = low-quality tracking`,
    16,
    74,
  );

  // Column headers.
  ctx.font = 'bold 14px -apple-system, system-ui, sans-serif';
  sides.forEach((sd, j) =>
    EVENTS.forEach((e, k) => {
      ctx.fillStyle = sd === near ? C.near : C.far;
      ctx.fillText(`${legName(sd)} · ${EVENT_LABEL[e]}`, HEAD_W + (j * 3 + k) * TILE.w + 8, top - 6);
    }),
  );

  let done = 0;
  const total = picks.length * 6 + picks.length * 2 * 5;
  for (const [r, pick] of picks.entries()) {
    const y = top + r * (TILE.h + 8);
    // Row header with per-leg flags.
    ctx.fillStyle = C.panel;
    ctx.fillRect(0, y, HEAD_W - 6, TILE.h);
    ctx.fillStyle = C.text;
    ctx.font = 'bold 15px -apple-system, system-ui, sans-serif';
    ctx.fillText(`Stride ${r + 1}`, 10, y + 24);
    ctx.font = '12px -apple-system, system-ui, sans-serif';
    ctx.fillStyle = '#9aa5b1';
    ctx.fillText(rear ? `left stride #${pick.cycle}` : `cycle #${pick.cycle}`, 10, y + 42);
    let ly = y + 70;
    for (const sd of sides) {
      const s = pick[sd];
      const status = !s.valid ? 'INVALID' : s.lowQuality.length ? 'LOW QUALITY' : 'ok';
      ctx.fillStyle = sd === near ? C.near : C.far;
      ctx.font = 'bold 12px -apple-system, system-ui, sans-serif';
      ctx.fillText(legName(sd), 10, ly);
      ctx.fillStyle = status === 'ok' ? '#3fb950' : status === 'INVALID' ? C.bad : C.warn;
      ctx.fillText(status, 10, ly + 16);
      ctx.fillStyle = '#9aa5b1';
      ctx.font = '11px -apple-system, system-ui, sans-serif';
      const contact = s.contactShare != null ? `contact ${Math.round(s.contactShare * 100)}%` : '';
      ctx.fillText(contact, 10, ly + 31);
      const why = [...s.reasons, ...s.lowQuality];
      why.slice(0, 3).forEach((w, i) => ctx.fillText(w.length > 26 ? `${w.slice(0, 25)}…` : w, 10, ly + 46 + i * 14));
      ly += 120;
    }

    for (const [j, sd] of sides.entries()) {
      const s = pick[sd];
      for (const [k, e] of EVENTS.entries()) {
        const x = HEAD_W + (j * 3 + k) * TILE.w;
        const i = s[e];
        if (i == null) {
          ctx.fillStyle = C.panel;
          ctx.fillRect(x + 2, y + 2, TILE.w - 4, TILE.h - 4);
          ctx.fillStyle = C.bad;
          ctx.fillText(`no ${EVENT_LABEL[e]}: ${s.reasons.join('; ')}`, x + 10, y + 30);
          continue;
        }
        const row = rows[i];
        await seek(video, row.t + 0.4 / meta.fps);
        drawFrame(ctx, video, row, {
          x: x + 2,
          y,
          w: TILE.w - 4,
          h: TILE.h,
        }, {
          side: sd,
          nearSide: near,
          belt: s.belt,
          pelvis: rear,
          analysedW,
          label: `${EVENT_LABEL[e]} · frame ${row.frame} · ${row.t.toFixed(3)} s${e === 'ms' && s.msSource === 'middle of stance' ? ' (mid-stance time)' : ''}`,
          flags: s.lowQuality,
          invalid: s.valid ? null : s.reasons.join('; '),
        });
        onProgress(++done, total);
      }
    }
  }

  // IC timing strips: IC-2 .. IC+2 for each leg.
  ctx.fillStyle = C.text;
  ctx.font = 'bold 16px -apple-system, system-ui, sans-serif';
  ctx.fillText('Initial-contact timing: 2 frames before → IC (white border) → 2 frames after', 16, stripTop - 18);
  const stripColW = HEAD_W + 5 * STRIP.w + 30;
  for (const [r, pick] of picks.entries()) {
    for (const [j, sd] of sides.entries()) {
      const s = pick[sd];
      const x0 = j * stripColW;
      const y = stripTop + r * stripRowH;
      ctx.fillStyle = sd === near ? C.near : C.far;
      ctx.font = 'bold 12px -apple-system, system-ui, sans-serif';
      ctx.fillText(`Stride ${r + 1} · ${legName(sd)}`, x0 + 10, y + 20);
      if (s.ic == null) continue;
      for (let d = -2; d <= 2; d++) {
        const i = s.ic + d;
        if (i < 0 || i >= rows.length || !rows[i].lm) continue;
        const row = rows[i];
        await seek(video, row.t + 0.4 / meta.fps);
        drawFrame(ctx, video, row, {
          x: x0 + HEAD_W + (d + 2) * STRIP.w,
          y,
          w: STRIP.w - 4,
          h: STRIP.h,
        }, {
          side: sd,
          nearSide: near,
          belt: s.belt,
          pelvis: rear,
          analysedW,
          label: d === 0 ? 'IC' : `${d > 0 ? '+' : ''}${d}`,
          highlight: d === 0,
        });
        onProgress(++done, total);
      }
    }
  }
  return canvas;
}

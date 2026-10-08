// Hip anchor tool: clinician clicks on the hip joint centre -> offsets from the near hip landmark.
// Clicks persist in test-data/debug/hip_anchor_clicks.json (dev server save endpoint).

import { postProcess } from '../js/pipeline/run.js';
import { LANDMARKS } from '../js/pipeline/kinematics.js';
import { offsetOf, thighFrame } from '../js/pipeline/hip-anchor.js';
import { median, percentile, savgol, fillGaps } from '../js/pipeline/stats.js';

const $ = (id) => document.getElementById(id);
const CLICKS_FILE = 'hip_anchor_clicks.json';
const state = { clip: null, r: null, video: null, frames: [], k: 0, clicks: [], box: null };
const f2 = (v) => (v == null || !Number.isFinite(v) ? '–' : v.toFixed(3));

const P = (row, k) => [row.lm[k * 4], row.lm[k * 4 + 1]];
const near = () => state.r.seg.near.side;
const far = () => (near() === 'L' ? 'R' : 'L');
const facing = () => state.r.seg.ref.facing;
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

async function load() {
  const clip = $('clip').value;
  const base = clip.replace(/\.[^.]+$/, '');
  $('status').textContent = 'Loading landmarks and video…';
  const res = await fetch(`../test-data/debug/${base}.rows.json`);
  if (!res.ok) {
    $('status').textContent = `No cached landmarks for ${clip}: run it once on test/pipeline.html.`;
    return;
  }
  const { meta, rows } = await res.json();
  for (const r of rows) if (r.lm) r.lm = Float32Array.from(r.lm);
  // Landmark mode: clicks are measured against the raw hip landmark.
  state.r = { meta, rows, ...postProcess(rows, meta, { hipAnchor: { mode: 'landmark' } }) };
  state.clip = clip;
  const blob = await (await fetch(`../test-data/${encodeURIComponent(clip)}`)).blob();
  state.video = document.createElement('video');
  state.video.muted = true;
  state.video.src = URL.createObjectURL(blob);
  await new Promise((r) => (state.video.onloadeddata = r));

  // Default frames: the saved hip-extension validation frames (test-data/debug/hipext_*_f<frame>.png).
  const listing = await (await fetch('../test-data/debug/')).text();
  const saved = [...listing.matchAll(/hipext_cycle(\d+)_(peak|TO)_f(\d+)\.png/g)].map((m) => ({ label: `cycle ${m[1]} ${m[2]} · f${m[3]}`, frame: Number(m[3]) }));
  const seen = new Set();
  state.frames = saved.filter((f) => !seen.has(f.frame) && seen.add(f.frame));
  const prior = await fetch(`../test-data/debug/${CLICKS_FILE}`);
  state.clicks = prior.ok ? (await prior.json()).clicks.filter((c) => c.clip === clip) : [];
  renderFrameList();
  renderJitter();
  await show(0);
}

function renderFrameList() {
  $('frames').innerHTML = state.frames.map((f, i) => `<option value="${i}">${f.label}${state.clicks.some((c) => c.frame === f.frame) ? ' ✓' : ''}</option>`).join('');
  $('frames').value = String(state.k);
}

const rowIndex = (frame) => state.r.rows.findIndex((x) => x.frame === frame);

async function show(k) {
  if (!state.frames.length) return;
  state.k = (k + state.frames.length) % state.frames.length;
  $('frames').value = String(state.k);
  const frame = state.frames[state.k].frame;
  const i = rowIndex(frame);
  const row = state.r.rows[i];
  if (!row?.lm) {
    $('status').textContent = `No landmarks for frame ${frame}.`;
    return;
  }
  state.video.currentTime = row.t + 0.4 / state.r.meta.fps;
  await new Promise((r) => (state.video.onseeked = r));
  // Crop: centred on the near hip, a thigh length and a half each way (3:4).
  const tf = thighFrame(row, near(), facing());
  const h = tf.L * 2.4;
  const w = h * 0.75;
  state.box = { x0: tf.hip[0] - w / 2, y0: tf.hip[1] - h * 0.42, w, h };
  draw(i);
}

function toCanvas([px, py]) {
  const c = $('view');
  return [((px - state.box.x0) / state.box.w) * c.width, ((py - state.box.y0) / state.box.h) * c.height];
}
function fromCanvas([cx, cy]) {
  const c = $('view');
  return [state.box.x0 + (cx / c.width) * state.box.w, state.box.y0 + (cy / c.height) * state.box.h];
}

function draw(i) {
  const c = $('view');
  const ctx = c.getContext('2d');
  const row = state.r.rows[i];
  const vs = state.video.videoWidth / state.r.meta.analysedSize[0];
  ctx.drawImage(state.video, state.box.x0 * vs, state.box.y0 * vs, state.box.w * vs, state.box.h * vs, 0, 0, c.width, c.height);
  const dot = (p, col, r = 6) => {
    const [x, y] = toCanvas(p);
    ctx.fillStyle = col;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  };
  const nh = P(row, LANDMARKS[near()].hip);
  const fh = P(row, LANDMARKS[far()].hip);
  ctx.strokeStyle = 'rgba(47,129,247,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(...toCanvas(nh));
  ctx.lineTo(...toCanvas(P(row, LANDMARKS[near()].knee)));
  ctx.stroke();
  dot(nh, '#2f81f7');
  dot(fh, '#ff7a1a');
  dot(mid(nh, fh), '#ffd400', 5);
  dot(P(row, LANDMARKS[near()].knee), '#ffffff', 5);
  const click = state.clicks.find((x) => x.frame === row.frame);
  if (click) {
    const [x, y] = toCanvas(click.point);
    ctx.strokeStyle = '#3fb950';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 12, y);
    ctx.lineTo(x + 12, y);
    ctx.moveTo(x, y - 12);
    ctx.lineTo(x, y + 12);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, c.width, 26);
  ctx.fillStyle = '#fff';
  ctx.font = '14px -apple-system, system-ui, sans-serif';
  ctx.fillText(`${state.clip} · source frame ${row.frame} · near hip ${near()} · ${click ? 'clicked' : 'click the hip joint centre'}`, 8, 18);
  $('status').textContent = `${state.clicks.length} frame(s) clicked`;
  renderClicks();
}

async function persist() {
  let all = [];
  const prior = await fetch(`../test-data/debug/${CLICKS_FILE}`);
  if (prior.ok) all = (await prior.json()).clicks.filter((c) => c.clip !== state.clip);
  const body = JSON.stringify({ note: 'Hip joint centre clicks; offsets in thigh lengths (along + toward knee, perp + forward).', clicks: [...all, ...state.clicks] }, null, 1);
  await fetch(`/__save?name=${CLICKS_FILE}`, { method: 'POST', body });
}

$('view').addEventListener('click', async (e) => {
  const rect = e.target.getBoundingClientRect();
  const c = $('view');
  const point = fromCanvas([((e.clientX - rect.left) / rect.width) * c.width, ((e.clientY - rect.top) / rect.height) * c.height]);
  const frame = state.frames[state.k].frame;
  const i = rowIndex(frame);
  const row = state.r.rows[i];
  const off = offsetOf(row, near(), facing(), point);
  const L = thighFrame(row, near(), facing()).L;
  const nh = P(row, LANDMARKS[near()].hip);
  const fh = P(row, LANDMARKS[far()].hip);
  const dist = (p) => Math.hypot(p[0] - point[0], p[1] - point[1]) / L;
  state.clicks = state.clicks.filter((x) => x.frame !== frame);
  state.clicks.push({ clip: state.clip, frame, point, ...off, dNear: dist(nh), dFar: dist(fh), dMid: dist(mid(nh, fh)) });
  await persist();
  renderFrameList();
  draw(i);
});

function renderClicks() {
  const cs = state.clicks;
  if (!cs.length) {
    $('summary').innerHTML = '<p class="muted">No clicks yet. Until there are, the corrected anchor uses a placeholder offset of 0 (identical to the landmark).</p>';
    $('clicks').innerHTML = '';
    return;
  }
  const stat = (k) => ({ med: median(cs.map((c) => c[k])), p25: percentile(cs.map((c) => c[k]), 25), p75: percentile(cs.map((c) => c[k]), 75) });
  const a = stat('along');
  const p = stat('perp');
  const dn = median(cs.map((c) => c.dNear));
  const df = median(cs.map((c) => c.dFar));
  const dm = median(cs.map((c) => c.dMid));
  const best = [['near hip', dn], ['far hip', df], ['midpoint', dm]].sort((x, y) => x[1] - y[1])[0][0];
  $('summary').innerHTML = `<table>
    <tr><th></th><th>Median</th><th>IQR</th></tr>
    <tr><td>Along thigh (+ toward knee)</td><td>${f2(a.med)}</td><td>${f2(a.p25)} to ${f2(a.p75)}</td></tr>
    <tr><td>Perpendicular (+ forward)</td><td>${f2(p.med)}</td><td>${f2(p.p25)} to ${f2(p.p75)}</td></tr>
    <tr><td>Distance to click: near / far / midpoint</td><td colspan="2">${f2(dn)} / ${f2(df)} / ${f2(dm)} thigh lengths → closest: <strong>${best}</strong></td></tr>
    </table>
    <p class="small">${cs.length} frame(s). Config value for <code>HIP_ANCHOR.offset</code>: <code>{ along: ${a.med.toFixed(3)}, perp: ${p.med.toFixed(3)}, frames: ${cs.length} }</code></p>`;
  $('clicks').innerHTML = `<table><tr><th>Frame</th><th>Along</th><th>Perp</th><th>d near</th><th>d far</th><th>d mid</th></tr>${cs
    .sort((x, y) => x.frame - y.frame)
    .map((c) => `<tr><td>${c.frame}</td><td>${f2(c.along)}</td><td>${f2(c.perp)}</td><td>${f2(c.dNear)}</td><td>${f2(c.dFar)}</td><td>${f2(c.dMid)}</td></tr>`)
    .join('')}</table>`;
}

// 1b: jitter of the near hip, far hip and midpoint: median absolute residual from a 0.2 s smooth,
// in thigh lengths (x and y separately), over frames that pass the tibia gate.
export function hipJitter(r) {
  const { rows, bad, meta } = r;
  const n = r.seg.near.side;
  const f = n === 'L' ? 'R' : 'L';
  const L = median(rows.map((row, i) => (bad[i] || !row.lm ? NaN : Math.hypot(...[0, 1].map((d) => P(row, LANDMARKS[n].knee)[d] - P(row, LANDMARKS[n].hip)[d])))));
  const win = Math.max(5, Math.round(0.2 * meta.fs) | 1);
  const series = (fn) => [0, 1].map((d) => rows.map((row, i) => (bad[i] || !row.lm ? NaN : fn(row)[d])));
  const resid = (a) => {
    const s = savgol(fillGaps(a, 6), win, 2);
    return median(a.map((v, i) => (Number.isFinite(v) && Number.isFinite(s[i]) ? Math.abs(v - s[i]) : NaN))) / L;
  };
  const pts = {
    'near hip': (row) => P(row, LANDMARKS[n].hip),
    'far hip': (row) => P(row, LANDMARKS[f].hip),
    midpoint: (row) => mid(P(row, LANDMARKS[n].hip), P(row, LANDMARKS[f].hip)),
  };
  const out = {};
  for (const [name, fn] of Object.entries(pts)) {
    const [xs, ys] = series(fn);
    out[name] = { x: resid(xs), y: resid(ys) };
  }
  // How far apart the two hip landmarks sit (they should nearly overlap from a side view).
  out.separation = median(rows.map((row, i) => (bad[i] || !row.lm ? NaN : Math.hypot(...[0, 1].map((d) => P(row, LANDMARKS[n].hip)[d] - P(row, LANDMARKS[f].hip)[d]))))) / L;
  out.thighPx = L;
  return out;
}

function renderJitter() {
  const j = hipJitter(state.r);
  window.__hipJitter = j;
  $('jitter').innerHTML = `<table><tr><th>Point</th><th>Jitter x</th><th>Jitter y</th></tr>${['near hip', 'far hip', 'midpoint']
    .map((k) => `<tr><td>${k}</td><td>${f2(j[k].x)}</td><td>${f2(j[k].y)}</td></tr>`)
    .join('')}</table><p class="muted small">Median |position − 0.2 s smooth| in thigh lengths (thigh ≈ ${j.thighPx.toFixed(0)} px). Near-far hip separation: ${f2(j.separation)} thigh lengths.</p>`;
}

$('frames').onchange = () => show(Number($('frames').value));
$('prev').onclick = () => show(state.k - 1);
$('next').onclick = () => show(state.k + 1);
$('go').onclick = () => {
  const frame = Number($('frameNo').value);
  if (rowIndex(frame) < 0) return ($('status').textContent = `Frame ${frame} is not an analysed frame (every 2nd frame).`);
  state.frames.push({ label: `f${frame}`, frame });
  renderFrameList();
  show(state.frames.length - 1);
};
$('random').onclick = () => {
  const ev = state.r.events[near()].strides.filter((s) => s.valid);
  const s = ev[Math.floor(Math.random() * ev.length)];
  const i = s.ic + Math.floor(Math.random() * (s.to - s.ic + 1));
  state.frames.push({ label: `cycle ${s.cycle} stance · f${state.r.rows[i].frame}`, frame: state.r.rows[i].frame });
  renderFrameList();
  show(state.frames.length - 1);
};
$('undo').onclick = async () => {
  const frame = state.frames[state.k].frame;
  state.clicks = state.clicks.filter((x) => x.frame !== frame);
  await persist();
  renderFrameList();
  draw(rowIndex(frame));
};
window.__hipAnchor = state;
load();

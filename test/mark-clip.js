// Blind hand marking on any clip (dev, this machine only): test/mark-clip.html?clip=<clip id>.
// Frames are picked from the clip's own gait events (side: initial contact, midstance and toe-off of
// valid near-leg strides spread over the clip; rear/front: each leg's midstance). The app's landmarks
// are NOT shown, so the marks are blind. Marks are saved in analysed-pixel coordinates to
// test-data/debug/marks_<clip id>.json (gitignored), which tools/revalidate.py compares with the app.
// The frame is drawn from the local video (never uploaded or stored).
import { CLIPS, clipUrl } from './clips.js';
import { unpackRows } from './fixture-io.js';
import { detectView } from '../js/pipeline/view-detect.js';
import { processClip } from '../js/pipeline/adapt.js';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const clipId = q.get('clip');
const PER_KIND = 4; // frames per event kind (side: 4 IC + 4 MS + 4 TO; rear: 6 per leg)
const SIDE_POINTS = ['shoulder', 'hip', 'knee', 'ankle', 'heel', 'toe'];
const REAR_POINTS = ['L_shoulder', 'R_shoulder', 'L_hip', 'R_hip', 'L_knee', 'R_knee', 'L_ankle', 'R_ankle', 'L_heel', 'R_heel'];

let frames = [];
let k = 0;
let marks = { frames: {} };
let points = SIDE_POINTS;
let meta = null;
let rows = null;
const video = document.createElement('video');
video.muted = true;
video.playsInline = true;

async function loadRows(id) {
  const fx = await fetch(`fixtures/clips/${id}.lm.json`);
  if (fx.ok) return unpackRows(await fx.json());
  const res = await fetch(`../test-data/debug/${id}.rows.json`);
  if (!res.ok) return null;
  const d = await res.json();
  for (const r of d.rows) if (r.lm) r.lm = Float32Array.from(r.lm);
  return d;
}

function spread(list, n) {
  if (list.length <= n) return list;
  return Array.from({ length: n }, (_, i) => list[Math.round((i * (list.length - 1)) / (n - 1))]);
}

async function init() {
  if (!clipId) return ($('status').textContent = 'Add ?clip=<clip id> (e.g. T3-side or T3_2026-10-20_left).');
  const d = await loadRows(clipId);
  if (!d) return ($('status').textContent = `No landmarks for ${clipId}: run python3 tools/revalidate.py first.`);
  ({ meta, rows } = d);
  const found = await (await fetch('../test-data/debug/revalidate-clips.json')).json().catch(() => ({ clips: [] }));
  const nc = found.clips.find((c) => `${c.code}_${c.date}_${c.view}` === clipId);
  const file = CLIPS.find((c) => c.id === clipId)?.file || nc?.file;
  const slot = nc ? { left: 'lateral_left', right: 'lateral_right', rear: 'posterior', front: 'anterior' }[nc.view] : detectView(rows).slot;
  const { analysis } = processClip(rows, meta, slot, {});
  const legs = analysis.eventTable?.legs || {};
  if (slot.startsWith('lateral')) {
    const strides = (legs[analysis.nearSide]?.strides || []).filter((s) => s.valid);
    for (const kind of ['ic', 'ms', 'to']) for (const s of spread(strides, PER_KIND)) if (s[kind]?.row != null) frames.push({ row: s[kind].row, t: s[kind].t, kind: kind.toUpperCase() });
  } else {
    points = REAR_POINTS;
    for (const leg of ['left', 'right']) for (const s of spread((legs[leg]?.strides || []).filter((x) => x.valid && x.ms?.row != null), PER_KIND + 2)) frames.push({ row: s.ms.row, t: s.ms.t, kind: 'MS', stance: leg === 'left' ? 'L' : 'R' });
  }
  frames.sort((a, b) => a.t - b.t);
  const res = await fetch(`../test-data/debug/marks_${clipId}.json`);
  if (res.ok) marks = await res.json();
  marks.clipId = clipId;
  marks.slot = slot;
  marks.coords = 'analysed pixels (meta.analysedSize)';
  video.src = URL.createObjectURL(await (await fetch(await clipUrl(file))).blob());
  await new Promise((r) => (video.onloadeddata = r));
  show();
}

function current() {
  return (marks.frames[frames[k].row] ??= { kind: frames[k].kind, stance: frames[k].stance, points: {} });
}

async function show() {
  const f = frames[k];
  video.currentTime = f.t + 0.5 / (meta.fps || 30);
  await new Promise((r) => (video.onseeked = r));
  draw();
}

function draw() {
  const c = $('canvas');
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  const ctx = c.getContext('2d');
  if (meta.mirrored) {
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const sx = c.width / meta.analysedSize[0];
  const sy = c.height / meta.analysedSize[1];
  const m = current();
  for (const [name, p] of Object.entries(m.points)) {
    ctx.fillStyle = /^R_/.test(name) ? '#ef4444' : '#3b82f6';
    ctx.beginPath();
    ctx.arc(p[0] * sx, p[1] * sy, Math.max(4, c.width / 250), 0, 7);
    ctx.fill();
  }
  const next = points.find((p) => !m.points[p]);
  $('pos').textContent = `Frame ${k + 1} of ${frames.length} · ${frames[k].kind}${frames[k].stance ? ` (${frames[k].stance} stance)` : ''} · ${frames[k].t.toFixed(2)} s`;
  $('next').textContent = next ? `Click: ${next.replace('_', ' ')}` : 'All points marked: Next';
}

function save() {
  $('status').textContent = 'saving…';
  fetch(`/__save?name=marks_${clipId}.json`, { method: 'POST', body: JSON.stringify({ ...marks, updated: new Date().toISOString() }, null, 1) }).then((r) => ($('status').textContent = r.ok ? 'saved ✓' : 'save failed'));
}

$('canvas').addEventListener('click', (e) => {
  const c = $('canvas');
  const rect = c.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * meta.analysedSize[0];
  const y = ((e.clientY - rect.top) / rect.height) * meta.analysedSize[1];
  const m = current();
  const next = points.find((p) => !m.points[p]);
  if (!next) return;
  m.points[next] = [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  save();
  draw();
});
$('undo').onclick = () => {
  const m = current();
  const last = points.filter((p) => m.points[p]).pop();
  if (last) delete m.points[last];
  save();
  draw();
};
$('prev').onclick = () => k > 0 && (k--, show());
$('nextBtn').onclick = () => k < frames.length - 1 && (k++, show());
document.addEventListener('keydown', (e) => {
  if (e.key === 'z') $('undo').click();
  if (e.key === 'ArrowRight') $('nextBtn').click();
  if (e.key === 'ArrowLeft') $('prev').click();
});
init();

// Clinician joint marking on the T1–T3 side-view validation frames (crops exported earlier).
// Marks are saved to test-data/debug/clinician_marks.json (dev server, this machine only).
const FRAMES = Array.from({ length: 30 }, (_, i) => `vcrop_${String(i + 1).padStart(2, '0')}`);
const POINTS = ['hip', 'knee', 'ankle', 'heel'];
const COLORS = { hip: '#3b82f6', knee: '#ef4444', ankle: '#22c55e', heel: '#f59e0b' };
const FILE = 'clinician_marks.json';
const $ = (id) => document.getElementById(id);

let frames = [];
let k = 0;
let point = 'hip';
let marks = {};

async function exists(name) {
  return (await fetch(`../test-data/debug/${name}`, { method: 'HEAD' })).ok;
}

async function init() {
  for (const f of FRAMES) if (await exists(`annotate_${f}_side.png`)) frames.push(`${f}_side`);
  const res = await fetch(`../test-data/debug/${FILE}`);
  if (res.ok) marks = (await res.json()).frames || {};
  const firstOpen = frames.findIndex((f) => !POINTS.every((p) => marks[f]?.[p]));
  k = firstOpen >= 0 ? firstOpen : 0;
  show();
}

function save() {
  $('status').textContent = 'saving…';
  fetch(`/__save?name=${FILE}`, { method: 'POST', body: JSON.stringify({ marker: 'clinician', updated: new Date().toISOString(), coords: 'crop pixels of annotate_<frame>.png', frames: marks }, null, 1) })
    .then((r) => ($('status').textContent = r.ok ? 'saved ✓' : 'save failed'))
    .catch(() => ($('status').textContent = 'save failed'));
}

function show() {
  const f = frames[k];
  $('img').src = `../test-data/debug/annotate_${f}.png`;
  $('pos').textContent = `Frame ${k + 1} of ${frames.length}`;
  $('unsure').checked = !!marks[f]?.unsure;
  point = POINTS.find((p) => !marks[f]?.[p]) || 'hip';
  draw();
}

function draw() {
  const f = frames[k];
  for (const s of document.querySelectorAll('.step')) s.setAttribute('aria-current', s.dataset.p === point);
  for (const el of document.querySelectorAll('.pin')) el.remove();
  const img = $('img');
  if (!img.naturalWidth) return;
  const sx = img.clientWidth / img.naturalWidth;
  for (const p of POINTS) {
    const m = marks[f]?.[p];
    if (!m) continue;
    const pin = document.createElement('div');
    pin.className = 'pin';
    pin.style.background = COLORS[p];
    pin.style.left = `${m[0] * sx}px`;
    pin.style.top = `${m[1] * sx}px`;
    pin.innerHTML = `<span>${p}</span>`;
    $('stage').appendChild(pin);
  }
  const done = frames.filter((x) => POINTS.every((p) => marks[x]?.[p])).length;
  $('pos').textContent = `Frame ${k + 1} of ${frames.length} · ${done} complete`;
}

$('img').addEventListener('load', draw);
window.addEventListener('resize', draw);
$('img').addEventListener('click', (e) => {
  const img = $('img');
  const r = img.getBoundingClientRect();
  const s = img.naturalWidth / r.width;
  const f = frames[k];
  marks[f] = { ...(marks[f] || {}), [point]: [Math.round((e.clientX - r.left) * s), Math.round((e.clientY - r.top) * s)] };
  point = POINTS.find((p) => !marks[f][p]) || point;
  draw();
  save();
});
for (const s of document.querySelectorAll('.step')) s.addEventListener('click', () => ((point = s.dataset.p), draw()));
$('unsure').addEventListener('change', () => {
  const f = frames[k];
  marks[f] = { ...(marks[f] || {}), unsure: $('unsure').checked };
  save();
});
$('next').addEventListener('click', () => ((k = Math.min(frames.length - 1, k + 1)), show()));
$('prev').addEventListener('click', () => ((k = Math.max(0, k - 1)), show()));
$('clear').addEventListener('click', () => {
  delete marks[frames[k]];
  save();
  show();
});
init();

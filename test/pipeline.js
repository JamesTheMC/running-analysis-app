import { analyzeVideo, postProcess, postProcessRear } from '../js/pipeline/run.js';
import { REAR_EVENTS } from '../js/pipeline/rear-events.js';
import { buildMidstanceStrip, midstanceSensitivity } from './rear-midstance.js';
import { buildContactSheet } from './contact-sheet.js';
import { detectEvents } from '../js/pipeline/events.js';
import { computeMetrics } from '../js/pipeline/metrics.js';
import { tibiaGate } from '../js/pipeline/gate.js';
import { LANDMARKS } from '../js/pipeline/kinematics.js';
import { median, percentile } from '../js/pipeline/stats.js';

const $ = (id) => document.getElementById(id);
const out = $('out');
const f1 = (v) => (v == null || !Number.isFinite(v) ? '–' : v.toFixed(1));

// Targets given for the original 678-frame reference clip (not in test-data/). Shown for context only.
const ORIGINAL_TARGETS = 'frames 678 · excluded 11±3 · knee L ≈2–108 / R ≈12–102 (±5) · L elbow median ≈72 (±4)';

// Tolerances used when comparing against Python output for the same clip.
const CHECKS = [
  ['Frames sampled', (s) => s.frames_sampled, 0],
  ['Frames detected', (s) => s.frames_detected, null],
  ['Frames excluded (tibia gate)', (s) => s.frames_excluded_tracking_gate, 3],
  ['Knee flexion L min', (s) => s.L.knee_flexion_min, 5],
  ['Knee flexion L max', (s) => s.L.knee_flexion_max, 5],
  ['Knee flexion R min', (s) => s.R.knee_flexion_min, 5],
  ['Knee flexion R max', (s) => s.R.knee_flexion_max, 5],
  ['Elbow L median', (s) => s.L.elbow_median, 4],
  ['Elbow R median', (s) => s.R.elbow_median, 4],
  ['Elbow L valid frames', (s) => s.L.elbow_valid_frames, null],
  ['Elbow R valid frames', (s) => s.R.elbow_valid_frames, null],
  ['Trunk from vertical median', (s) => s.trunk_from_vertical_median, null],
];

async function listClips() {
  try {
    const html = await (await fetch('../test-data/')).text();
    const names = [...html.matchAll(/href="([^"]+\.(?:mov|mp4|m4v))"/gi)].map((m) => decodeURIComponent(m[1]));
    $('clip').innerHTML = names.map((n) => `<option>${n}</option>`).join('') || '<option value="">(none in test-data/)</option>';
  } catch {
    $('clip').innerHTML = '<option value="">(test-data/ not served)</option>';
  }
}

async function loadPython(name) {
  if ($('pyfile').files[0]) return JSON.parse(await $('pyfile').files[0].text());
  const res = await fetch(`../test-data/${name.replace(/\.[^.]+$/, '')}.${$('pyvariant').value}.json`);
  return res.ok ? res.json() : null;
}

async function run() {
  const picked = $('file').files[0];
  const name = picked ? picked.name : $('clip').value;
  if (!name) return;
  $('run').disabled = true;
  out.innerHTML = '';
  try {
    $('status').textContent = 'Loading clip…';
    const file = picked || (await (await fetch(`../test-data/${encodeURIComponent(name)}`)).blob());
    const t0 = performance.now();
    const base = name.replace(/\.[^.]+$/, '');
    let result = $('cache').checked ? await loadCachedRows(base) : null;
    if (result) $('status').textContent = 'Using cached landmarks…';
    else result = await analyzeVideo(file, {
      sampleEvery: Number($('every').value) || undefined,
      delegate: $('delegate').value,
      nearSide: $('near').value || undefined,
      view: $('view').value,
      onProgress: ({ phase, done, total }) => {
        $('prog').max = total || 1;
        $('prog').value = done;
        const rate = done / ((performance.now() - t0) / 1000);
        $('status').textContent = `${phase} ${done}/${total}${done ? ` · ${rate.toFixed(1)} frames/s` : ''}`;
      },
    });
    if (!result.cached) await saveCachedRows(base, result);
    const py = await loadPython(name);
    window.__result = { name, result, py };
    window.__file = file;
    $('status').textContent = result.cached
      ? 'Done (cached landmarks; events and strides recomputed).'
      : `Done in ${result.meta.seconds.toFixed(0)} s (${(result.rows.length / result.meta.seconds).toFixed(1)} frames/s, ${result.meta.delegate}). Landmarks cached.`;
    render(name, file, result, py);
  } catch (e) {
    console.error(e);
    $('status').textContent = `Error: ${e.message}`;
  } finally {
    $('run').disabled = false;
  }
}

function render(name, file, r, py) {
  if (r.view === 'rear') return renderRear(name, file, r);
  const m = r.meta;
  out.innerHTML = `
    <h2>Clip</h2>
    <p>${name} · ${m.codec} · ${m.frameCount} frames at ${m.fps.toFixed(2)} fps · rotation ${m.rotation}° · every ${m.sampleEvery} → ${m.fs.toFixed(1)} Hz · analysed at ${m.analysedSize.join('×')}</p>
    <h2>Summary vs Python reference (same clip)</h2>
    ${py ? summaryTable(r.summary, py.summary) : '<p class="muted">No Python output found. Put it at test-data/&lt;clip&gt;.py.json (or .pytasks.json) or pick the file above.</p>'}
    <p class="muted small">Original reference-clip targets, for context: ${ORIGINAL_TARGETS}</p>
    ${py ? frameTable(r, py) : ''}
    <h2>Gait events</h2>
    ${eventsText(r)}
    ${eventValidationHtml(r)}
    ${metricsHtml(r)}
    <p><button id="sheet">Build contact sheet (5 strides)</button> <span id="sheet-status" class="muted"></span></p>
    <div id="sheet-out" class="scroll"></div>
    <h2>Stride segmentation and late-stance hip extension</h2>
    ${strideText(r)}
    <div class="scroll">${plot(r)}</div>
    <h2>Frames at picked hip-extension peaks</h2>
    <p class="muted">Check that the thigh is behind the trunk around toe-off. Blue = near-side leg, orange = far-side leg. Shaded bands in the plot are each leg's late-stance windows.</p>
    <div class="thumbs" id="thumbs"></div>
    <h2>JS summary</h2>
    <pre>${JSON.stringify(r.summary, null, 2)}</pre>
    <button id="dl">Download rows JSON</button>`;
  $('dl').onclick = () => download(r, name);
  $('sheet').onclick = () => contactSheet(name, file, r);
  thumbnails(file, r);
}

function summaryTable(js, ps) {
  const rows = CHECKS.map(([label, get, tol]) => {
    const a = get(js);
    const b = get(ps);
    const d = a != null && b != null ? a - b : null;
    const verdict = tol == null || d == null ? '' : Math.abs(d) <= tol ? '<span class="pass">pass</span>' : '<span class="fail">FAIL</span>';
    return `<tr><td>${label}</td><td>${f1(a)}</td><td>${f1(b)}</td><td>${d == null ? '–' : (d > 0 ? '+' : '') + d.toFixed(1)}</td><td>${tol == null ? 'info' : `±${tol}`}</td><td>${verdict}</td></tr>`;
  });
  return `<table><tr><th>Metric</th><th>Browser</th><th>Python</th><th>Δ</th><th>Tolerance</th><th></th></tr>${rows.join('')}</table>`;
}

function frameTable(r, py) {
  const byFrame = new Map(py.frames.map((f) => [f.frame, f]));
  const pyRowsAligned = r.rows.map((x) => byFrame.get(x.frame) || { frame: x.frame, detected: false });
  const pyBad = tibiaGate(py.frames);
  const pyBadSet = new Set(py.frames.filter((_, i) => pyBad[i]).map((f) => f.frame));
  const jsBadSet = new Set(r.rows.filter((_, i) => r.bad[i]).map((f) => f.frame));
  const both = [...jsBadSet].filter((f) => pyBadSet.has(f)).length;
  const lines = [];
  for (const key of ['knee_flex', 'hip_ext', 'elbow', 'trunk', 'tibia']) {
    for (const side of ['L', 'R']) {
      const d = [];
      r.rows.forEach((x, i) => {
        const a = x[`${key}_${side}`];
        const b = pyRowsAligned[i][`${key}_${side}`];
        if (a != null && b != null) d.push(Math.abs(a - b));
      });
      lines.push(`<tr><td>${key}_${side}</td><td>${d.length}</td><td>${f1(median(d))}</td><td>${f1(percentile(d, 90))}</td><td>${f1(percentile(d, 99))}</td></tr>`);
    }
  }
  const facingAgree = r.rows.filter((x, i) => x.facing != null && x.facing === pyRowsAligned[i].facing).length;
  return `
    <h2>Frame-by-frame agreement</h2>
    <p>Matched frames: ${r.rows.filter((x) => byFrame.has(x.frame)).length}/${r.rows.length} · facing agrees on ${facingAgree} ·
       gated frames: browser ${jsBadSet.size}, Python ${pyBadSet.size}, both ${both}</p>
    <table><tr><th>Signal</th><th>Frames (both valid)</th><th>Median |Δ|</th><th>P90 |Δ|</th><th>P99 |Δ|</th></tr>${lines.join('')}</table>`;
}

function strideText(r) {
  const s = r.seg;
  const valid = s.cycles.filter((c) => c.windows).length;
  const lens = s.cycles.filter((c) => c.windows).map((c) => c.end - c.start);
  const fmt = (h) =>
    `${h.near ? 'near' : 'far'}: ${h.n}/${h.total} strides, median ${f1(h.median)}°, IQR ${h.iqr ? `${f1(h.iqr[0])} to ${f1(h.iqr[1])}` : '–'}`;
  const reasons = {};
  for (const side of ['L', 'R']) for (const st of r.hipExt[side].strides) if (!st.valid) reasons[st.reason] = (reasons[st.reason] || 0) + 1;
  return `<p>Near side ${s.near.side} (${s.near.source}${s.near.zL != null ? `, median z L ${s.near.zL.toFixed(3)} / R ${s.near.zR.toFixed(3)}` : ''}) ·
    facing ${s.ref.facing > 0 ? '+x' : '−x'} · period ${s.periodSec ? s.periodSec.toFixed(3) : '–'} s · cycles ${valid}/${s.cycles.length} usable${lens.length ? ` (length ${Math.min(...lens)}–${Math.max(...lens)} samples)` : ''}</p>
    <p>Hip extension (vs trunk axis), late-stance peaks · L ${fmt(r.hipExt.L)} · R ${fmt(r.hipExt.R)}</p>
    <p class="muted">Rejected: ${Object.entries(reasons).map(([k, v]) => `${k} ×${v}`).join(' · ') || 'none'}</p>`;
}

function plot(r) {
  const n = r.rows.length;
  const W = n + 60;
  const panel = (y0, h, series, lo, hi, label) => {
    const y = (v) => y0 + h - ((v - lo) / (hi - lo)) * h;
    const paths = series
      .map(({ data, color }) => {
        let d = '';
        let pen = false;
        data.forEach((v, i) => {
          if (!Number.isFinite(v)) return (pen = false);
          d += `${pen ? 'L' : 'M'}${(i + 50).toFixed(0)},${y(Math.max(lo, Math.min(hi, v))).toFixed(1)}`;
          pen = true;
        });
        return `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.2"/>`;
      })
      .join('');
    const zero = lo < 0 && hi > 0 ? `<line x1="50" x2="${W}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line)"/>` : '';
    return { y, svg: `<text x="0" y="${y0 + 12}">${label}</text><text x="0" y="${y0 + h}">${lo}</text><text x="0" y="${y0 + 24}">${hi}</text>${zero}${paths}` };
  };
  const near = r.seg.near.side;
  const far = near === 'L' ? 'R' : 'L';
  const shades = r.seg.cycles
    .filter((c) => c.windows)
    .map(
      (c) => `<rect x="${c.windows[near][0] + 50}" y="160" width="${c.windows[near][1] - c.windows[near][0]}" height="80" fill="var(--near)" opacity="0.15"/>
              <rect x="${c.windows[far][0] + 50}" y="240" width="${c.windows[far][1] - c.windows[far][0]}" height="80" fill="var(--far)" opacity="0.15"/>
              <line x1="${c.start + 50}" x2="${c.start + 50}" y1="0" y2="330" stroke="var(--line)"/>`,
    )
    .join('');
  const a = panel(0, 130, [{ data: r.seg.sig, color: 'var(--fg)' }], -2.5, 2.5, 'ankle sep. (+ = near ahead)');
  const b = panel(160, 160, [
    { data: r.hipExt[near].smoothed, color: 'var(--near)' },
    { data: r.hipExt[far].smoothed, color: 'var(--far)' },
  ], -60, 40, 'hip ext (deg)');
  const dots = [near, far]
    .flatMap((side) =>
      r.hipExt[side].strides
        .filter((s) => s.index != null)
        .map((s) => `<circle cx="${s.index + 50}" cy="${b.y(s.value)}" r="3" fill="${s.valid ? (side === near ? 'var(--near)' : 'var(--far)') : 'none'}" stroke="${side === near ? 'var(--near)' : 'var(--far)'}"/>`),
    )
    .join('');
  const bad = r.bad.map((x, i) => (x ? `<line x1="${i + 50}" x2="${i + 50}" y1="322" y2="330" stroke="var(--bad)"/>` : '')).join('');
  return `<svg width="${W}" height="335" role="img" aria-label="Reference signal, stride windows and hip extension">${shades}${a.svg}${b.svg}${dots}${bad}</svg>`;
}

async function thumbnails(file, r) {
  const near = r.seg.near.side;
  const far = near === 'L' ? 'R' : 'L';
  const pick = (side, k) => {
    const v = r.hipExt[side].strides.filter((s) => s.valid);
    return Array.from({ length: Math.min(k, v.length) }, (_, j) => ({ side, ...v[Math.floor(((j + 0.5) * v.length) / k)] }));
  };
  const picks = [...pick(near, 3), ...pick(far, 3)];
  const video = document.createElement('video');
  video.muted = true;
  video.src = URL.createObjectURL(file);
  await new Promise((res) => (video.onloadeddata = res));
  const [W, H] = r.meta.analysedSize;
  for (const p of picks) {
    const row = r.rows[p.index];
    video.currentTime = row.t + 0.5 / r.meta.fps;
    await new Promise((res) => (video.onseeked = res));
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    ctx.drawImage(video, 0, 0, W, H);
    drawLeg(ctx, row, near, '#1f6feb');
    drawLeg(ctx, row, far, '#c2410c');
    const fig = document.createElement('figure');
    fig.append(c);
    fig.insertAdjacentHTML('beforeend', `<figcaption>${p.side} ${p.side === near ? 'near' : 'far'} · ${p.value.toFixed(1)}° · t ${row.t.toFixed(2)} s</figcaption>`);
    $('thumbs').append(fig);
  }
  URL.revokeObjectURL(video.src);
}

function drawLeg(ctx, row, side, color) {
  const ids = LANDMARKS[side];
  const P = (k) => [row.lm[k * 4], row.lm[k * 4 + 1]];
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  [ids.sho, ids.hip, ids.knee, ids.ank].forEach((k, i) => ctx[i ? 'lineTo' : 'moveTo'](...P(k)));
  ctx.stroke();
}

function download(r, name) {
  const rows = r.rows.map(({ lm, ...rest }) => rest);
  const blob = new Blob([JSON.stringify({ summary: r.summary, meta: r.meta, frames: rows })], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${name.replace(/\.[^.]+$/, '')}.js.json` });
  a.click();
  URL.revokeObjectURL(a.href);
}

$('run').onclick = run;
listClips();

// ---- Landmark cache (test-data/debug/<clip>.rows.json), so event work does not re-run pose ----

async function saveCachedRows(base, r) {
  const rows = r.rows.map(({ lm, ...rest }) => ({ ...rest, lm: lm ? Array.from(lm, (v) => Math.round(v * 1e4) / 1e4) : undefined }));
  await fetch(`/__save?name=${encodeURIComponent(base)}.rows.json`, { method: 'POST', body: JSON.stringify({ meta: r.meta, rows }) }).catch(() => {});
}

async function loadCachedRows(base) {
  const res = await fetch(`../test-data/debug/${encodeURIComponent(base)}.rows.json`);
  if (!res.ok) return null;
  const { meta, rows } = await res.json();
  for (const row of rows) if (row.lm) row.lm = Float32Array.from(row.lm);
  if ($('view').value === 'rear') return { meta: { ...meta, view: 'rear' }, rows, cached: true, ...postProcessRear(rows, meta) };
  return { meta, rows, cached: true, ...postProcess(rows, meta, { nearSide: $('near').value || undefined }) };
}

// ---- Events ----

function eventsText(r) {
  if (!r.events) return '';
  const near = r.seg.near.side;
  const line = (sd) => {
    const e = r.events[sd];
    const invalid = {};
    const low = {};
    for (const s of e.strides) {
      for (const why of s.reasons) invalid[why.replace(/\d+%/, 'N%')] = (invalid[why.replace(/\d+%/, 'N%')] || 0) + 1;
      if (s.valid) for (const why of s.lowQuality) low[why.replace(/[\d.]+%?/g, 'N')] = (low[why.replace(/[\d.]+%?/g, 'N')] || 0) + 1;
    }
    const fmt = (o) => Object.entries(o).map(([k, v]) => `${k} ×${v}`).join(' · ') || 'none';
    return `<tr><td>${sd} ${sd === near ? 'near' : 'far'}</td><td>${e.validCount}/${e.strides.length}</td><td>${e.goodCount}</td>
      <td>${e.contactShareMedian == null ? '–' : `${Math.round(e.contactShareMedian * 100)}%`}</td><td>slope ${e.beltSlope.toFixed(3)} · tol ${f1(e.tolerance)} px · foot ${f1(e.footLength)} px</td>
      <td class="small">${fmt(invalid)}</td><td class="small">${fmt(low)}</td></tr>`;
  };
  return `<table><tr><th>Leg</th><th>Valid strides</th><th>Good (no flags)</th><th>Contact (median % of cycle)</th><th>Belt line</th><th>Invalid because</th><th>Low-quality flags (valid strides)</th></tr>
    ${[near, near === 'L' ? 'R' : 'L'].map(line).join('')}</table>`;
}

async function contactSheet(name, file, r) {
  $('sheet').disabled = true;
  const status = $('sheet-status');
  const video = document.createElement('video');
  video.muted = true;
  video.src = URL.createObjectURL(file);
  try {
    await new Promise((res, rej) => {
      video.onloadeddata = res;
      video.onerror = () => rej(new Error('video failed to load'));
    });
    const canvas = await buildContactSheet({ video, result: r, clipName: name, onProgress: (d, t) => (status.textContent = `Drawing ${d}/${t}…`) });
    canvas.style.maxWidth = '100%';
    $('sheet-out').replaceChildren(canvas);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    const file = `${name.replace(/\.[^.]+$/, '')}.contact-sheet.png`;
    const saved = await fetch(`/__save?name=${encodeURIComponent(file)}`, { method: 'POST', body: blob }).then((x) => x.ok).catch(() => false);
    status.textContent = saved ? `Saved to test-data/debug/${file}` : 'Built (not saved: dev server save endpoint unavailable).';
    window.__sheet = canvas;
  } catch (e) {
    console.error(e);
    status.textContent = `Error: ${e.message}`;
  } finally {
    URL.revokeObjectURL(video.src);
    $('sheet').disabled = false;
  }
}

// ---- Event validation (near leg): manual-check printout, tolerance sensitivity, MS cross-check ----

const TOLERANCES = [0.2, 0.3, 0.4];

export function eventValidation(r) {
  const near = r.seg.near.side;
  const ms = (i) => r.rows[i].t * 1000;
  const frame = (i) => r.rows[i].frame;
  const valid = r.events[near].strides.filter((s) => s.valid);

  // 1. Three strides from early / middle / late in the clip, for manual frame counting.
  const picks = [0.15, 0.5, 0.85].map((q) => valid[Math.min(valid.length - 1, Math.floor(q * valid.length))]);
  const printout = picks.map((s) => ({
    cycle: s.cycle,
    icFrame: frame(s.ic),
    icMs: ms(s.ic),
    toFrame: frame(s.to),
    toMs: ms(s.to),
    contactMs: ms(s.to) - ms(s.ic),
    contactShare: s.contactShare,
    msFrame: frame(s.ms),
  }));

  // 2. Sensitivity of IC / TO / contact share to the contact tolerance.
  const runs = Object.fromEntries(TOLERANCES.map((t) => [t, detectEvents(r.rows, r.bad, r.seg, { contactTolerance: t })[near]]));
  const byCycle = (e) => new Map(e.strides.filter((s) => s.valid).map((s) => [s.cycle, s]));
  const ref = byCycle(runs[0.3]);
  const stats = (a) => (a.length ? { median: median(a), p25: percentile(a, 25), p75: percentile(a, 75), maxAbs: Math.max(...a.map(Math.abs)), n: a.length } : null);
  const sensitivity = TOLERANCES.map((t) => {
    const e = runs[t];
    const v = e.strides.filter((s) => s.valid);
    const cur = byCycle(e);
    const shared = [...cur.keys()].filter((k) => ref.has(k));
    return {
      tolerance: t,
      valid: v.length,
      total: e.strides.length,
      contactMs: stats(v.map((s) => ms(s.to) - ms(s.ic))),
      contactShare: stats(v.map((s) => s.contactShare * 100)),
      icShiftMs: t === 0.3 ? null : stats(shared.map((k) => ms(cur.get(k).ic) - ms(ref.get(k).ic))),
      toShiftMs: t === 0.3 ? null : stats(shared.map((k) => ms(cur.get(k).to) - ms(ref.get(k).to))),
    };
  });

  // 3. Midstance: ankle-under-hip frame vs the midpoint of stance (sampled frames).
  const withAnkle = valid.filter((s) => s.msAnkle != null);
  const diffs = withAnkle.map((s) => s.msAnkle - s.msMid);
  const msCheck = {
    strides: valid.length,
    ankleFound: withAnkle.length,
    medianDiff: diffs.length ? median(diffs) : null,
    iqr: diffs.length ? [percentile(diffs, 25), percentile(diffs, 75)] : null,
    over2: diffs.filter((d) => Math.abs(d) > 2).length,
    frameMs: 1000 / r.meta.fs,
  };
  return { near, sampleMs: 1000 / r.meta.fs, sourceFps: r.meta.fps, printout, sensitivity, msCheck };
}

function eventValidationHtml(r) {
  const v = eventValidation(r);
  window.__eventValidation = v;
  const ms0 = (x) => (x == null ? '–' : Math.round(x));
  const st = (o, f = ms0) => (o ? `${f(o.median)} (IQR ${f(o.p25)} to ${f(o.p75)})` : '–');
  const shift = (o) => (o ? `${st(o)} · max |Δ| ${ms0(o.maxAbs)} · n ${o.n}` : 'reference');
  const m = v.msCheck;
  return `
    <h3>Event validation · near leg (${v.near})</h3>
    <p class="muted small">Analysed every ${r.meta.sampleEvery}${r.meta.sampleEvery === 1 ? 'st' : 'nd'} frame of a ${v.sourceFps.toFixed(2)} fps clip: each event is resolved to ±${v.sampleMs.toFixed(1)} ms (one analysed frame). Frame numbers are source frames. Contact time = TO − IC.</p>
    <table><tr><th>Stride (cycle)</th><th>IC frame</th><th>IC time</th><th>TO frame</th><th>TO time</th><th>Contact</th><th>Share of cycle</th><th>MS frame</th></tr>
    ${v.printout.map((p) => `<tr><td>#${p.cycle}</td><td>${p.icFrame}</td><td>${ms0(p.icMs)} ms</td><td>${p.toFrame}</td><td>${ms0(p.toMs)} ms</td><td>${ms0(p.contactMs)} ms</td><td>${Math.round(p.contactShare * 100)}%</td><td>${p.msFrame}</td></tr>`).join('')}</table>
    <p class="small"><strong>Tolerance sensitivity</strong> (all near-leg strides; shifts vs. 0.3 over strides valid at both)</p>
    <table><tr><th>Tolerance</th><th>Valid</th><th>Contact ms, median (IQR)</th><th>Share %, median (IQR)</th><th>IC shift ms</th><th>TO shift ms</th></tr>
    ${v.sensitivity.map((x) => `<tr><td>${x.tolerance}</td><td>${x.valid}/${x.total}</td><td>${st(x.contactMs)}</td><td>${st(x.contactShare)}</td><td>${shift(x.icShiftMs)}</td><td>${shift(x.toShiftMs)}</td></tr>`).join('')}</table>
    <p class="small"><strong>Midstance cross-check:</strong> ankle-under-hip found in ${m.ankleFound}/${m.strides} valid strides;
      difference from the stance midpoint (ankle − midpoint): median ${m.medianDiff ?? '–'} frames, IQR ${m.iqr ? m.iqr.join(' to ') : '–'};
      differs by more than 2 analysed frames (${(2 * m.frameMs).toFixed(0)} ms) in ${m.over2}/${m.ankleFound}.</p>`;
}

// ---- Metrics (per-stride medians) and their sensitivity to the IC tolerance ----

const METRIC_ROWS = [
  ['kneeIC', 'Knee flexion at IC'],
  ['maxStanceKnee', 'Max stance knee flexion'],
  ['tibialIC', 'Tibial inclination at IC (+ ankle ahead)'],
  ['footInclIC', 'Foot inclination at IC (+ toes up)'],
  ['ankleDFms', 'Ankle DF at MS'],
  ['footToComShoe', 'Foot-to-COM at IC (shoe lengths, ≈)'],
  ['trunkIC', 'Trunk lean at IC (+ forward)'],
  ['trunkMS', 'Trunk lean at MS'],
  ['trunkChange', 'Trunk change IC → peak hip ext'],
];

function metricsHtml(r) {
  if (!r.metrics) return '';
  const near = r.seg.near.side;
  const far = near === 'L' ? 'R' : 'L';
  const fmt = (s) => (s.n ? `${f1(s.median)} (${f1(s.iqr[0])} to ${f1(s.iqr[1])}) · n ${s.n}/${s.total}` : `– · n 0/${s.total}`);
  const sens = Object.fromEntries(
    TOLERANCES.map((t) => {
      const events = detectEvents(r.rows, r.bad, r.seg, { contactTolerance: t });
      return [t, computeMetrics({ ...r, events })[near].summary];
    }),
  );
  window.__metricSensitivity = sens;
  const sw = r.metrics.shoulderSwing;
  return `
    <h3>Metrics · per-stride median (IQR) · n strides</h3>
    <table><tr><th>Metric</th><th>${near} near</th><th>${far} far (low reliability)</th>${TOLERANCES.map((t) => `<th>Near @ tol ${t}</th>`).join('')}</tr>
    ${METRIC_ROWS.map(([k, label]) => `<tr><td>${label}</td><td>${fmt(r.metrics[near].summary[k])}</td><td>${fmt(r.metrics[far].summary[k])}</td>${TOLERANCES.map((t) => `<td>${f1(sens[t][k].median)}</td>`).join('')}</tr>`).join('')}
    <tr><td>Shoulder swing ROM (near arm)</td><td>${fmt(sw)}</td><td>–</td>${TOLERANCES.map(() => '<td>–</td>').join('')}</tr>
    </table>
    <p class="muted small">Body height estimate: ${f1(r.metrics.bodyHeightPx)} px (analysed frame) from near-side thigh + shank + trunk (Winter ratios). Foot length ${f1(r.events[near].footLength)} px.</p>`;
}

// ---- Rear view (Milestone 4): events and their validation only ----

export function rearValidation(r) {
  const ms = (i) => r.rows[i].t * 1000;
  const out = {};
  for (const side of ['L', 'R']) {
    const e = r.events[side];
    const valid = e.strides.filter((s) => s.valid);
    const byStride = (ev) => new Map(ev[side].strides.filter((s) => s.valid).map((s) => [s.stride, s]));
    const ref = byStride(r.events);
    const sweep = REAR_EVENTS.speedSweep.map((v) => {
      const cur = byStride(r.sweep[v]);
      const shared = [...cur.keys()].filter((k) => ref.has(k));
      const sv = r.sweep[v][side].strides.filter((s) => s.valid);
      const st = (a) => (a.length ? { median: median(a), p25: percentile(a, 25), p75: percentile(a, 75), maxAbs: Math.max(...a.map(Math.abs)) } : null);
      return {
        speed: v,
        valid: sv.length,
        total: r.sweep[v][side].strides.length,
        contactMs: st(sv.map((s) => ms(s.to) - ms(s.ic))),
        icShiftMs: v === REAR_EVENTS.speed ? null : st(shared.map((k) => ms(cur.get(k).ic) - ms(ref.get(k).ic))),
        toShiftMs: v === REAR_EVENTS.speed ? null : st(shared.map((k) => ms(cur.get(k).to) - ms(ref.get(k).to))),
      };
    });
    const withPelvis = valid.filter((s) => s.msPelvis != null);
    const d = withPelvis.map((s) => s.msPelvis - s.msMid);
    const reasons = {};
    for (const s of e.strides) for (const w of s.reasons) reasons[w.replace(/\d+%/, 'N%')] = (reasons[w.replace(/\d+%/, 'N%')] || 0) + 1;
    const low = {};
    for (const s of valid) for (const w of s.lowQuality) low[w.replace(/[\d.]+/g, 'N')] = (low[w.replace(/[\d.]+/g, 'N')] || 0) + 1;
    out[side] = {
      valid: valid.length,
      total: e.strides.length,
      good: e.goodCount,
      contactShare: e.contactShareMedian,
      shank: e.shankLength,
      speedPx: e.speedThreshold,
      reasons,
      low,
      sweep,
      ms: { found: withPelvis.length, median: d.length ? median(d) : null, over2: d.filter((x) => Math.abs(x) > 2).length },
    };
  }
  return out;
}

function renderRear(name, file, r) {
  const m = r.meta;
  const v = rearValidation(r);
  window.__rearValidation = v;
  const ms0 = (x) => (x == null ? '–' : Math.round(x));
  const st = (o) => (o ? `${ms0(o.median)} (IQR ${ms0(o.p25)} to ${ms0(o.p75)})` : '–');
  const sh = (o) => (o ? `${st(o)}, max |Δ| ${ms0(o.maxAbs)}` : 'reference');
  const fmt = (o) => Object.entries(o).map(([k, n]) => `${k} ×${n}`).join(' · ') || 'none';
  out.innerHTML = `
    <h2>Clip (rear view)</h2>
    <p>${name} · ${m.codec} · ${m.frameCount} frames at ${m.fps.toFixed(2)} fps · every ${m.sampleEvery} → ${m.fs.toFixed(1)} Hz · analysed at ${m.analysedSize.join('×')}</p>
    <p>Stride period ${r.seg.periodSec ? r.seg.periodSec.toFixed(3) : '–'} s · left stance centres ${r.seg.peaks.length} · right ${r.seg.troughs.length} ·
      frames with left/right landmarks out of order: ${r.events.orderViolationFrames}/${r.rows.length} · tibia-gated frames ${r.bad.filter(Boolean).length}</p>
    <h2>Rear-view gait events (per leg)</h2>
    <table><tr><th>Leg</th><th>Valid</th><th>Good (no flags)</th><th>Contact (median % of cycle)</th><th>Speed threshold</th><th>Invalid because</th><th>Low-quality flags (valid strides)</th></tr>
    ${['L', 'R'].map((sd) => `<tr><td>${sd === 'L' ? 'Left' : 'Right'}</td><td>${v[sd].valid}/${v[sd].total}</td><td>${v[sd].good}</td><td>${v[sd].contactShare == null ? '–' : Math.round(v[sd].contactShare * 100) + '%'}</td><td>${v[sd].speedPx.toFixed(1)} px/frame (shank ${v[sd].shank.toFixed(0)} px)</td><td class="small">${fmt(v[sd].reasons)}</td><td class="small">${fmt(v[sd].low)}</td></tr>`).join('')}
    </table>
    <p class="small"><strong>Threshold sensitivity</strong> (heel/toe speed, shank lengths per frame; shifts vs ${REAR_EVENTS.speed})</p>
    <table><tr><th>Leg</th><th>Speed</th><th>Valid</th><th>Contact ms (internal)</th><th>IC shift ms</th><th>TO shift ms</th></tr>
    ${['L', 'R'].flatMap((sd) => v[sd].sweep.map((x) => `<tr><td>${sd}</td><td>${x.speed}</td><td>${x.valid}/${x.total}</td><td>${st(x.contactMs)}</td><td>${sh(x.icShiftMs)}</td><td>${sh(x.toShiftMs)}</td></tr>`)).join('')}
    </table>
    <p class="small"><strong>Midstance cross-check</strong> (MS = stance midpoint; lowest pelvis minus midpoint, analysed frames):
      ${['L', 'R'].map((sd) => `${sd}: found ${v[sd].ms.found}/${v[sd].valid}, median ${v[sd].ms.median ?? '–'}, differs by >2 in ${v[sd].ms.over2}`).join(' · ')}</p>
    <p><button id="sheet">Build contact sheet (5 strides)</button> <span id="sheet-status" class="muted"></span></p>
    <div id="sheet-out" class="scroll"></div>
    <h2>Midstance from segmentation</h2>
    ${rearMidstanceHtml(r)}
    <p><button id="msstrip">Build midstance strip (10 strides per leg)</button> <span id="ms-status" class="muted"></span></p>
    <div id="ms-out" class="scroll"></div>`;
  $('sheet').onclick = () => contactSheet(name, file, r);
  $('msstrip').onclick = () => midstanceStrip(name, file, r);
}

function rearMidstanceHtml(r) {
  const ms = r.midstance;
  const sens = midstanceSensitivity(r.rows, r.bad, ms);
  window.__msSensitivity = sens;
  const count = (sd) => `${ms[sd].filter((s) => s.valid).length}/${ms[sd].length}`;
  const f = (v, u) => (u === '°' ? v.toFixed(1) : v.toFixed(3));
  const rowsHtml = ['L', 'R'].flatMap((sd) =>
    Object.entries(sens[sd]).map(([name, m]) => {
      const cells = m.byShift.map((x) => `<td>${f(x.median, m.unit)}${x.shift ? ` <span class="muted">(${x.delta >= 0 ? '+' : ''}${f(x.delta, m.unit)})</span>` : ''}${x.crossoverShare != null ? `<br><span class="muted">${Math.round(x.crossoverShare * 100)}% cross</span>` : ''}</td>`).join('');
      return `<tr><td>${sd}</td><td>${name}</td><td>${m.unit.trim()}</td>${cells}</tr>`;
    }),
  );
  return `<p>Valid stance half-cycles: left ${count('L')}, right ${count('R')} (0.3–0.7 of the stride).</p>
    <table><tr><th>Leg</th><th>Candidate</th><th>Unit</th>${[-3, -2, -1, 0, 1, 2, 3].map((d) => `<th>MS ${d > 0 ? '+' : ''}${d}</th>`).join('')}</tr>${rowsHtml.join('')}</table>
    <p class="muted small">Per-stride medians at midstance shifted by d analysed frames (16.7 ms each); change vs d = 0 in brackets.</p>`;
}

async function midstanceStrip(name, file, r) {
  const status = $('ms-status');
  const video = document.createElement('video');
  video.muted = true;
  video.src = URL.createObjectURL(file);
  try {
    await new Promise((res) => (video.onloadeddata = res));
    status.textContent = 'Drawing…';
    const canvas = await buildMidstanceStrip({ video, result: r, ms: r.midstance });
    canvas.style.maxWidth = '100%';
    $('ms-out').replaceChildren(canvas);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    const fname = `${name.replace(/\.[^.]+$/, '')}.midstance-strip.png`;
    const ok = await fetch(`/__save?name=${encodeURIComponent(fname)}`, { method: 'POST', body: blob }).then((x) => x.ok).catch(() => false);
    status.textContent = ok ? `Saved to test-data/debug/${fname}` : 'Built (not saved).';
  } catch (e) {
    status.textContent = `Error: ${e.message}`;
  } finally {
    URL.revokeObjectURL(video.src);
  }
}

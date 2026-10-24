// Angle curves over the gait cycle (Results tab): knee flexion and hip extension of each side view's
// near leg, median across strides with the 25–75% band, 0% = initial contact, 100% = the next one.
// Left and right come from separate clips (each side view). Display only: not scored, no findings.
import { esc } from '../util.js';

const JOINTS = [
  { id: 'knee', title: 'Knee flexion', note: 'checked at gait events: about ±7–10°' },
  { id: 'hip', title: 'Hip extension (vs trunk line; + = thigh behind the trunk)', note: 'checked at gait events: about ±3–8°' },
];
const SIDES = [
  { slot: 'lateral_left', leg: 'left', label: 'Left', cls: 'cv-l' },
  { slot: 'lateral_right', leg: 'right', label: 'Right', cls: 'cv-r' },
];

function chartSvg(series, joint) {
  const all = series.flatMap((s) => [...s.c.p25, ...s.c.p75]).filter(Number.isFinite);
  if (!all.length) return '';
  // Round axis steps (5, 10, 20, 25 or 50°) with at most 6 grid lines.
  const raw = Math.max(20, Math.max(...all) - Math.min(...all)) / 4;
  const step = [5, 10, 20, 25, 50].find((v) => v >= raw) || 50;
  const lo = Math.floor(Math.min(...all) / step) * step;
  const hi = Math.ceil(Math.max(...all) / step) * step;
  const W = 320;
  const H = 150;
  const L = 30;
  const B = 18;
  const x = (j) => L + (j / 100) * (W - L - 6);
  const y = (v) => 6 + (1 - (v - lo) / (hi - lo)) * (H - B - 6);
  const path = (arr) => arr.map((v, j) => `${j ? 'L' : 'M'}${x(j).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const band = (s) => `${path(s.c.p75)} ${s.c.p25.map((v, j) => `L${x(100 - j).toFixed(1)} ${y(s.c.p25[100 - j]).toFixed(1)}`).join(' ')} Z`;
  const gridY = [];
  for (let v = lo; v <= hi; v += step) gridY.push(v);
  return `<svg viewBox="0 0 ${W} ${H}" class="cv-svg" role="img" aria-label="${esc(`${joint.title} over the gait cycle: ${series.map((s) => `${s.label} median from ${Math.round(Math.min(...s.c.median))} to ${Math.round(Math.max(...s.c.median))} degrees`).join('; ')}`)}">
    ${gridY.map((v) => `<line x1="${L}" x2="${W - 6}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="cv-grid"/><text x="${L - 4}" y="${(y(v) + 3).toFixed(1)}" class="cv-ax" text-anchor="end">${v}°</text>`).join('')}
    ${[0, 20, 40, 60, 80, 100].map((p) => `<text x="${x(p).toFixed(1)}" y="${H - 4}" class="cv-ax" text-anchor="middle">${p}%</text>`).join('')}
    ${series.map((s) => `<g class="cv-series ${s.cls}" data-cv-leg="${s.leg}"><path d="${band(s)}" class="cv-band"/><path d="${path(s.c.median)}" class="cv-line"/></g>`).join('')}
  </svg>`;
}

export function curvesHtml(state) {
  const clips = state.session?.clips || {};
  if (state.session?.placeholder) return '';
  const have = SIDES.filter((s) => clips[s.slot]);
  if (!have.length) return `<section class="card cv-section"><h3>Angle curves over the gait cycle</h3><p class="r-na small">Not assessed: needs a side view (left or right).</p></section>`;
  const notes = [];
  for (const s of SIDES) {
    const c = clips[s.slot]?.analysis?.curves;
    if (!clips[s.slot]) notes.push(`${s.label}: Not assessed: needs the ${s.leg} side view.`);
    else if (!c) notes.push(`${s.label}: not available (${['fail', 'unsuitable'].includes(clips[s.slot].analysis?.captureQuality?.level) ? 'the clip failed the video check' : 'no curve data for this clip'}).`);
    else if (c.reason) notes.push(`${s.label}: not available (${c.reason}).`);
  }
  const charts = JOINTS.map((j) => {
    const series = SIDES.map((s) => ({ ...s, c: clips[s.slot]?.analysis?.curves?.[j.id] })).filter((s) => s.c?.median);
    if (!series.length) return `<div class="cv-chart"><h4>${esc(j.title)}</h4><p class="muted small">${esc(SIDES.map((s) => clips[s.slot]?.analysis?.curves?.[j.id]?.reason).filter(Boolean).join('; ') || 'No curve.')}</p></div>`;
    return `<div class="cv-chart"><h4>${esc(j.title)}</h4>${chartSvg(series, j)}<p class="muted small">${series.map((s) => `${s.label}: ${s.c.strides} strides`).join(' · ')} · ${esc(j.note)}</p></div>`;
  }).join('');
  return `<section class="card cv-section" aria-label="Angle curves over the gait cycle">
    <h3>Angle curves over the gait cycle <span class="hedge">measured, not scored</span></h3>
    <div class="rv-toggles" role="group" aria-label="Show legs">${have.map((s) => `<button class="rv-chip ${s.cls}-chip" data-cv="${s.leg}" aria-pressed="true">${s.label}</button>`).join('')}</div>
    <p class="muted small">0% = foot contact, 100% = the next contact of the same foot. Line = median across strides; shaded = middle half of strides. Each side comes from its own side-view clip (separate recordings). Validated at gait events only, not across the whole cycle; shown for pattern, not for scoring.</p>
    <div class="cv-grid-2">${charts}</div>
    ${notes.length ? `<p class="small muted">${notes.map(esc).join(' ')}</p>` : ''}
  </section>`;
}

// Left/right toggles (event delegation on the section; re-render safe).
export function wireCurves(root) {
  const sec = root.querySelector('.cv-section');
  if (!sec || sec.dataset.wired) return;
  sec.dataset.wired = '1';
  sec.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cv]');
    if (!b) return;
    const on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(on));
    for (const g of sec.querySelectorAll(`[data-cv-leg="${b.dataset.cv}"]`)) g.style.display = on ? '' : 'none';
  });
}

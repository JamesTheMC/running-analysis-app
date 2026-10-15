// Phase panels: a still frame at initial contact, midstance and toe-off from a representative stride,
// with the pose wireframe and the phase's joint angles drawn as arcs, and that phase's metrics beside it.
// Frames are grabbed on the device from the clip's local object URL (hidden <video>, seek, draw);
// nothing is stored or sent anywhere. Without a video the wireframe is drawn on a plain background.
//
//   phasePanelsHtml(state, model)  -> HTML of the "Phase panels" card (placeholders + controls)
//   mountPhasePanels(root, state, model) -> grabs frames, draws, wires the controls (call after each render)
//   representativeStride(clip, phase, leg) -> { index, stride, label } | null (pure)
//   PANEL_METRICS -> which metric ids each panel lists and draws
import { esc } from '../util.js';
import { CLIP_SLOTS } from '../config.js';
import { STATUS_WORD } from '../presentation/model.js';
import { LANDMARKS, kneeFlexion, hipExtensionSigned } from '../pipeline/kinematics.js';
import { tibialInclination, trunkLean } from '../pipeline/metrics.js';
import { POSTERIOR } from '../pipeline/posterior-metrics.js';

export const PANEL_METRICS = {
  lateral: {
    initial_contact: ['ic_knee_flexion', 'ic_tibial_inclination', 'ic_foot_strike', 'ic_foot_inclination', 'ic_foot_to_com', 'ic_spine_lean'],
    midstance: ['ms_max_knee_flexion', 'ms_knee_flexion_excursion', 'ms_ankle', 'ms_knee_ankle_sync', 'ms_spine_lean'],
    toe_off: ['to_hip_extension', 'trunk_change_peak_hip_ext'],
  },
  posterior: {
    midstance: ['ms_hip_adduction', 'ms_knee_varus_valgus', 'ms_foot_midline', 'ms_crossover', 'ms_trunk_lateral_lean', 'ms_lateral_shift', 'ms_spine_shift', 'ms_step_width'],
  },
};

const PHASES = ['initial_contact', 'midstance', 'toe_off'];
const PHASE_LABEL = { initial_contact: 'Initial contact', midstance: 'Midstance', toe_off: 'Toe-off' };
const EVENT_KEY = { initial_contact: 'ic', midstance: 'ms', toe_off: 'to' };
const SIDE_KEY = { left: 'L', right: 'R' };
const LEG_WORD = { left: 'Left', right: 'Right' };
const RANK = { high: 2, medium: 1, low: 0 };
const STEPS = [-3, -1, 1, 3];
const VIS = 0.5;

const BONES = [
  [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
];
const LEG_IDS = { L: new Set([23, 25, 27, 29, 31]), R: new Set([24, 26, 28, 30, 32]) };

// Frontal views: the posterior slot (and an anterior one if a build adds it).
const frontal = (slot) => slot === 'posterior' || slot === 'anterior';
const viewOf = (slot) => (frontal(slot) ? 'posterior' : 'lateral');
const P = (row, k) => [row.lm[k * 4], row.lm[k * 4 + 1]];
const seen = (row, ...ks) => !!row?.lm && ks.every((k) => row.lm[k * 4 + 3] > VIS);
const median = (v) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
// Front-view clips: angles are computed on landmarks mirrored into rear-view geometry (x -> width - x,
// as run.js postProcessFront does), while the drawing uses the original, unmirrored landmarks.
const isFront = (clip) => clip?.analysis?.view === 'anterior' || clip?.debug?.meta?.view === 'anterior';
function geomRow(clip, row) {
  if (!row?.lm || !isFront(clip)) return row;
  const w = clip.debug?.meta?.analysedSize?.[0] ?? 1;
  const lm = Float32Array.from(row.lm);
  for (let k = 0; k < 33; k++) lm[k * 4] = w - lm[k * 4];
  return { ...row, lm };
}
const facingOf = (clip, row) => (clip.analysis?.clip?.facing ? (clip.analysis.clip.facing === 'image-right' ? 1 : -1) : row?.facing || 1);

// Key angle(s) per view and phase, from one analysed row: used to pick the representative stride.
// The same definitions as the pipeline (kinematics.js, metrics.js, posterior-metrics.js).
const KEY_VALUES = {
  lateral: {
    initial_contact: (row, s, facing) => {
      const id = LANDMARKS[s];
      return [seen(row, id.hip, id.knee, id.ank) ? kneeFlexion(P(row, id.hip), P(row, id.knee), P(row, id.ank)) : null, seen(row, id.knee, id.ank) ? tibialInclination(row, id, facing) : null];
    },
    midstance: (row, s) => {
      const id = LANDMARKS[s];
      return [seen(row, id.hip, id.knee, id.ank) ? kneeFlexion(P(row, id.hip), P(row, id.knee), P(row, id.ank)) : null];
    },
    toe_off: (row, s, facing) => {
      const id = LANDMARKS[s];
      return [seen(row, id.sho, id.hip, id.knee) ? hipExtensionSigned(P(row, id.sho), P(row, id.hip), P(row, id.knee), facing) : null];
    },
  },
  posterior: {
    midstance: (row, s) => {
      const id = LANDMARKS[s];
      const ok = seen(row, 23, 24, id.knee, id.ank);
      return [ok ? POSTERIOR.hipAdduction(row, s) : null, ok ? POSTERIOR.kneeValgus(row, s) : null];
    },
  },
};

/**
 * Representative stride for a clip, phase and leg: among the valid strides with the best available
 * event confidence, the one whose key angles at that event are closest to the clip's medians
 * (distance = sum of |value - median| / spread, spread = median absolute deviation, at least 1°).
 * Without landmark rows: the confident valid stride nearest the middle of the clip.
 * Lateral clips: near leg only (the far leg's events are low confidence and never used).
 * Lateral toe-off: the stride's peak hip extension (midstance to toe-off + 2 rows) is the compared
 * value and the drawn frame (`row`), with `note` saying how long before toe-off it is.
 */
export function representativeStride(clip, phase, leg) {
  const table = clip?.analysis?.eventTable;
  const strides = table?.legs?.[leg]?.strides;
  const key = EVENT_KEY[phase];
  if (!strides?.length || !key) return null;
  const view = table.view === 'posterior' ? 'posterior' : 'lateral';
  if (view === 'lateral' && (clip.analysis.nearSide || table.near) !== leg) return null;
  const rows = clip.debug?.rows || null;
  let cands = strides.map((stride, index) => ({ stride, index })).filter(({ stride }) => stride.valid && stride[key]?.row != null && Number.isFinite(stride[key].t));
  if (!cands.length) return null;
  const best = Math.max(...cands.map((c) => RANK[c.stride.confidence] ?? 0));
  cands = cands.filter((c) => (RANK[c.stride.confidence] ?? 0) === best);
  const fn = KEY_VALUES[view][phase];
  const peakPhase = view === 'lateral' && phase === 'toe_off';
  for (const c of cands) c.row = Math.round(c.stride[key].row);
  let pick = null;
  if (rows && fn) {
    const s = SIDE_KEY[leg];
    for (const c of cands) {
      if (peakPhase) {
        // Hip extension is a late-stance PEAK metric: draw and compare the stride's peak (pipeline's
        // signed hip extension vs trunk axis) between midstance and toe-off + 2 analysed rows.
        const peak = hipExtPeak(rows, c.stride, s);
        c.row = peak?.row ?? c.row;
        c.vals = peak ? [peak.value] : null;
        continue;
      }
      const row = rows[c.row];
      c.vals = row?.lm ? fn(geomRow(clip, row), s, facingOf(clip, row)) : null;
    }
    const withVals = cands.filter((c) => c.vals && c.vals.every(Number.isFinite));
    if (withVals.length) {
      const k = withVals[0].vals.length;
      const med = Array.from({ length: k }, (_, j) => median(withVals.map((c) => c.vals[j])));
      const mad = med.map((m, j) => Math.max(1, median(withVals.map((c) => Math.abs(c.vals[j] - m)))));
      // Ties (common with one key angle) go to the stride nearest the middle of the clip, away from
      // the start and end where tracking settles.
      const ts = withVals.map((c) => c.stride[key].t);
      const mid = (Math.min(...ts) + Math.max(...ts)) / 2;
      const span = Math.max(1e-6, Math.max(...ts) - Math.min(...ts));
      for (const c of withVals) c.d = c.vals.reduce((a, v, j) => a + Math.abs(v - med[j]) / mad[j], 0) + (0.01 * Math.abs(c.stride[key].t - mid)) / span;
      pick = withVals.reduce((a, b) => (b.d < a.d ? b : a));
    }
  }
  if (!pick) {
    const ts = cands.map((c) => c.stride[key].t);
    const mid = (Math.min(...ts) + Math.max(...ts)) / 2;
    pick = cands.reduce((a, b) => (Math.abs(b.stride[key].t - mid) < Math.abs(a.stride[key].t - mid) ? b : a));
  }
  const t = rows?.[pick.row]?.t ?? pick.stride[key].t;
  let note = null;
  if (peakPhase && rows && pick.vals) {
    const ms = Math.round((pick.stride.to.t - t) * 1000);
    note = `peak hip extension (late stance), ${ms >= 0 ? `${ms} ms before` : `${-ms} ms after`} toe-off`;
  }
  return { index: pick.index, stride: pick.stride, row: pick.row, note, label: `Stride ${pick.index + 1} of ${strides.length}, ${leg} leg, ${t.toFixed(1)} s` };
}

// Peak of the pipeline's signed hip extension (row.hip_ext_L|R, vs the trunk axis) from midstance to
// toe-off + 2 analysed rows of one stride; null when no row in that window has a value.
export function hipExtPeak(rows, stride, s) {
  const a = Math.round(stride.ms?.row ?? stride.ic?.row);
  const b = Math.min(rows.length - 1, Math.round(stride.to.row) + 2);
  let best = null;
  for (let i = Math.max(0, a); i <= b; i++) {
    const v = rows[i]?.[`hip_ext_${s}`];
    if (v != null && Number.isFinite(v) && (!best || v > best.value)) best = { row: i, value: v };
  }
  return best;
}

// ---------- panel specs (shared by the HTML and the mount step, so both agree) ----------

const unsuitable = (clip) => ['unsuitable', 'fail'].includes(clip?.analysis?.captureQuality?.level);

function rowsById(model) {
  const m = new Map();
  for (const s of model?.sections || []) for (const r of s.rows) m.set(r.id, r);
  return m;
}

function panelSpecs(state, model) {
  const clips = state.session?.clips || {};
  const byId = rowsById(model);
  const specs = [];
  const make = (slot, phase, leg) => {
    const clip = clips[slot];
    const rep = representativeStride(clip, phase, leg);
    const view = viewOf(slot);
    const ids = PANEL_METRICS[view][phase] || [];
    const metrics = ids.map((id) => byId.get(id)).filter((r) => r && r.cells[leg]);
    return { id: `${phase}-${slot}-${leg}`, slot, view, phase, leg, clip, rep, metrics, byId };
  };
  for (const phase of PHASES) {
    for (const slot of ['lateral_left', 'lateral_right']) {
      const clip = clips[slot];
      if (!clip || unsuitable(clip)) continue;
      const leg = clip.analysis?.nearSide || CLIP_SLOTS[slot]?.leg;
      specs.push(make(slot, phase, leg));
    }
    if (phase === 'midstance') {
      for (const slot of ['posterior', 'anterior']) {
        const clip = clips[slot];
        if (!clip || unsuitable(clip)) continue;
        for (const leg of ['left', 'right']) specs.push(make(slot, phase, leg));
      }
    }
  }
  return specs;
}

// ---------- HTML ----------

function cellLine(r, c, sideWord) {
  if (!c.assessed) return `<div class="pp-m pp-na"><span class="pp-mname">${esc(r.label)}${sideWord}</span> <span class="r-na">not assessed: ${esc(c.why)}</span></div>`;
  const chip = c.status ? `<span class="chip chip-${c.status}">${STATUS_WORD[c.status]}</span>` : '';
  const hedge = c.hedge ? `<span class="hedge">${esc(c.hedge)}</span>` : !c.status && c.confidence !== 'high' ? `<span class="hedge">${esc(c.confidence)} confidence</span>` : '';
  const range = r.range?.green
    ? `<p><span class="dot dot-green"></span>Normal: ${esc(r.range.green)}${r.range.red ? ` · <span class="dot dot-red"></span>Flag: ${esc(r.range.red)}` : ''}${r.range.provisional ? ' <span class="prov">provisional</span>' : ''}</p>`
    : '';
  const bits = [`${esc(c.confidence)} confidence`, c.n ? `median of ${c.n} ${esc(c.countUnit)}` : null, c.source ? `from ${esc(c.source)}` : null].filter(Boolean).join(' · ');
  return `<details class="r-row pp-m${c.status === 'red' ? ' r-red' : c.status === 'yellow' ? ' r-yellow' : ''}">
    <summary><span class="r-name">${esc(r.label)}${sideWord}</span><span class="r-cell"><span class="r-val">${esc(c.text)}</span>${chip}${hedge}</span></summary>
    <div class="r-detail small">${range}<p>${bits}${c.why?.length ? `<br><span class="muted">${esc(c.why.join('; '))}</span>` : ''}${c.note ? `<br><span class="muted">${esc(c.note)}</span>` : ''}</p>${r.note ? `<p class="muted">${esc(r.note)}</p>` : ''}</div>
  </details>`;
}

const MISSING_LEG = /^needs a lateral clip filmed from the (left|right)$/;

function metricsHtml(spec) {
  if (spec.slot === 'anterior') return '<p class="muted small">Front-view values are experimental and are not listed or rated here; angles on the frame are for orientation only.</p>';
  const lines = spec.metrics
    .map((r) => [r, r.cells[spec.leg]])
    .filter(([, c]) => c.assessed || !MISSING_LEG.test(c.why))
    .map(([r, c]) => cellLine(r, c, ''));
  return lines.length ? `<div class="pp-metrics">${lines.join('')}</div>` : '<p class="muted small">No metrics for this phase from this view.</p>';
}

// Midline (single-value) rows of a view and phase, listed once under the pair of legs.
function midHtml(byId, view, phase, slot) {
  if (slot === 'anterior') return '';
  const lines = (PANEL_METRICS[view][phase] || [])
    .map((id) => byId.get(id))
    .filter((r) => r?.cells.mid && (r.cells.mid.assessed || !MISSING_LEG.test(r.cells.mid.why)))
    .map((r) => cellLine(r, r.cells.mid, ''));
  return lines.length ? `<div class="pp-metrics pp-mid"><h5 class="pp-sub">Trunk and both sides</h5>${lines.join('')}</div>` : '';
}

const ariaFor = (spec, offset = 0) =>
  `${PHASE_LABEL[spec.phase]}, ${spec.leg} leg, ${frontal(spec.slot) ? 'rear view' : 'side view'}${spec.rep ? `, ${spec.rep.label.replace(/^Stride/, 'stride')}${spec.rep.note ? `, ${spec.rep.note}` : ''}` : ''}${offset ? `, ${offset > 0 ? '+' : ''}${offset} frames from the event` : ''}`;

function figureHtml(spec) {
  const title = `${LEG_WORD[spec.leg]} leg`;
  if (!spec.rep || !spec.clip.debug?.rows) {
    const why = !spec.rep ? 'no valid stride with a detected event for this leg' : 'no frame data for this clip (older session)';
    return `<figure class="pp-fig" data-pp-id="${esc(spec.id)}"><figcaption class="pp-cap"><strong>${esc(title)}</strong> <span class="muted small">frame not shown: ${esc(why)}</span></figcaption>${metricsHtml(spec)}</figure>`;
  }
  return `<figure class="pp-fig" data-pp-id="${esc(spec.id)}">
    <figcaption class="pp-cap"><strong>${esc(title)}</strong> <span class="muted small">${esc(spec.rep.label)}</span>${spec.rep.note ? `<span class="pp-event small">${esc(spec.rep.note)}</span>` : ''}</figcaption>
    <div class="pp-stage"><canvas class="pp-canvas" role="img" aria-label="${esc(ariaFor(spec))}"></canvas></div>
    <p class="pp-note muted small" data-pp-note></p>
    <div class="pp-step" role="group" aria-label="Step frames around the event">
      ${STEPS.map((d) => `<button type="button" class="btn btn-link pp-btn" data-pp="step" data-d="${d}" aria-label="${d > 0 ? 'Forward' : 'Back'} ${Math.abs(d)} frame${Math.abs(d) > 1 ? 's' : ''}">${d > 0 ? '+' : '−'}${Math.abs(d)}</button>`).join('')}
      <span class="pp-offset small muted" data-pp-offset aria-live="polite">at event</span>
      <button type="button" class="btn btn-link pp-btn" data-pp="reset" aria-label="Back to the event frame">Reset</button>
    </div>
    ${metricsHtml(spec)}
  </figure>`;
}

export function phasePanelsHtml(state, model) {
  const clips = state.session?.clips || {};
  const specs = panelSpecs(state, model);
  const byId = rowsById(model);
  const lateralSlots = ['lateral_left', 'lateral_right'].filter((s) => clips[s]);
  const frontalSlots = ['posterior', 'anterior'].filter((s) => clips[s]);
  const notSuitable = (slot) => `<p class="muted small pp-missing">${esc(CLIP_SLOTS[slot]?.label || slot)}: video setup not suitable, so no panel is shown.</p>`;
  const blocks = PHASES.map((phase) => {
    const parts = [];
    if (!lateralSlots.length) parts.push('<p class="muted small pp-missing">Side view not uploaded: these panels need a side (lateral) video.</p>');
    else {
      const views = ['lateral_left', 'lateral_right']
        .map((slot) => {
          if (!clips[slot]) return `<p class="muted small pp-missing">${slot === 'lateral_left' ? 'Left' : 'Right'} leg: needs a side video filmed from the ${slot === 'lateral_left' ? 'left' : 'right'}.</p>`;
          if (unsuitable(clips[slot])) return notSuitable(slot);
          const figs = specs.filter((s) => s.slot === slot && s.phase === phase).map(figureHtml).join('');
          return `<div class="pp-view" id="panel-${phase}-${slot}"><h5 class="pp-sub">${esc(CLIP_SLOTS[slot].label)}</h5>${figs}</div>`;
        })
        .join('');
      parts.push(`<div class="pp-pair">${views}</div>${midHtml(byId, 'lateral', phase)}`);
    }
    if (phase === 'midstance') {
      if (!clips.posterior) parts.push('<p class="muted small pp-missing">Rear view not uploaded: midstance frontal-plane panel needs the rear view.</p>');
      for (const slot of frontalSlots) {
        if (unsuitable(clips[slot])) {
          parts.push(notSuitable(slot));
          continue;
        }
        const figs = specs.filter((s) => s.slot === slot && s.phase === phase).map(figureHtml).join('');
        const label = `${CLIP_SLOTS[slot]?.label || slot}${slot === 'anterior' ? ' (experimental)' : ''}`;
        parts.push(`<div class="pp-view pp-view-rear" id="panel-${phase}-${slot}"><h5 class="pp-sub">${esc(label)}: each leg at its own midstance</h5><div class="pp-pair">${figs}</div>${midHtml(byId, 'posterior', phase, slot)}</div>`);
      }
    }
    return `<div class="pp-phase" id="panel-${phase}"><h4 class="r-phase">${PHASE_LABEL[phase]}</h4>${parts.join('')}</div>`;
  });
  return `<section class="card pp-section" aria-label="Phase panels">
    <h3>Phase panels</h3>
    <p class="muted small">A representative stride at each event (the one closest to the runner's typical values). Angles on the frame are this frame's; listed values are medians across strides. Coloured arcs only where the value is reliable enough to rate; grey = not rated.</p>
    <div class="pp-controls" role="group" aria-label="Panel display">
      <button type="button" class="btn btn-secondary pp-btn" data-pp="overlay" aria-pressed="true">Hide overlay</button>
      <button type="button" class="btn btn-secondary pp-btn" data-pp="blur" aria-pressed="true">Head blur: on</button>
    </div>
    ${blocks.join('')}
  </section>`;
}

// ---------- drawing ----------

let filterOk = null;
// ctx.filter exists but is a no-op in some Safari versions: test that a blur actually spreads a pixel.
function canvasFilterWorks() {
  if (filterOk != null) return filterOk;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 9;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.filter = 'blur(2px)';
    x.fillStyle = '#000';
    x.fillRect(4, 4, 1, 1);
    filterOk = x.getImageData(2, 4, 1, 1).data[3] > 0;
  } catch {
    filterOk = false;
  }
  return filterOk;
}

function cssColour(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function palette() {
  return {
    green: cssColour('--green', '#1e7a4c'),
    yellow: cssColour('--yellow', '#8a6100'),
    red: cssColour('--red', '#b3261e'),
    neutral: '#b9c2cc',
  };
}

// Head region from the nose and shoulders (in analysed px): an ellipse around the head.
function headEllipse(row) {
  if (!seen(row, 0) || !row.lm) return null;
  const nose = P(row, 0);
  const sl = P(row, 11);
  const sr = P(row, 12);
  const sm = [(sl[0] + sr[0]) / 2, (sl[1] + sr[1]) / 2];
  const d = Math.hypot(nose[0] - sm[0], nose[1] - sm[1]);
  const sw = Math.hypot(sl[0] - sr[0], sl[1] - sr[1]);
  const r = Math.max(0.7 * d, 0.55 * sw, 12);
  // Side view: the head's centre sits behind the nose, toward the shoulders' x.
  return { cx: nose[0] + 0.35 * (sm[0] - nose[0]), cy: nose[1] - 0.15 * d, rx: r, ry: r * 1.15 };
}

function blurHead(ctx, src, e, tf) {
  const cx = (e.cx - tf.x0) * tf.k;
  const cy = (e.cy - tf.y0) * tf.k;
  const rx = e.rx * tf.k;
  const ry = e.ry * tf.k;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.clip();
  if (canvasFilterWorks()) {
    ctx.filter = `blur(${Math.max(8, Math.round(rx / 3))}px)`;
    ctx.drawImage(src, 0, 0);
    ctx.filter = 'none';
  } else {
    // Pixelate: shrink the head box to a few blocks and scale it back up without smoothing.
    const x0 = Math.max(0, Math.floor(cx - rx));
    const y0 = Math.max(0, Math.floor(cy - ry));
    const w = Math.max(1, Math.min(src.width - x0, Math.ceil(2 * rx)));
    const h = Math.max(1, Math.min(src.height - y0, Math.ceil(2 * ry)));
    const t = document.createElement('canvas');
    t.width = Math.max(2, Math.round(w / 14));
    t.height = Math.max(2, Math.round(h / 14));
    t.getContext('2d').drawImage(src, x0, y0, w, h, 0, 0, t.width, t.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(t, 0, 0, t.width, t.height, x0, y0, w, h);
  }
  ctx.restore();
}

// Arc at vertex v from direction a to direction b (vectors), with the angle text.
function arc(ctx, v, a, b, r, colour, text, side = 0) {
  const a0 = Math.atan2(a[1], a[0]);
  let a1 = Math.atan2(b[1], b[0]);
  let d = a1 - a0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  a1 = a0 + d;
  ctx.save();
  ctx.lineWidth = Math.max(2, r / 10);
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour + '33';
  ctx.beginPath();
  ctx.moveTo(v[0], v[1]);
  ctx.arc(v[0], v[1], r, a0, a1, d < 0);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(v[0], v[1], r, a0, a1, d < 0);
  ctx.stroke();
  if (text) {
    // Label beside the joint (horizontally), not along the bisector: for small angles the bisector
    // runs along the limb and the text would sit on the bone or on the next joint's label.
    const m = a0 + d / 2;
    const fs = Math.max(13, Math.round(ctx.canvas.height / 36)); // same size for every label
    ctx.font = `700 ${fs}px -apple-system, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width;
    const bx = Math.cos(m);
    const dir = side || (Math.abs(bx) > 0.2 ? Math.sign(bx) : 1);
    const tx = v[0] + dir * (r + 8 + tw / 2);
    const ty = v[1] + Math.sin(m) * r * 0.5;
    const pad = fs * 0.3;
    ctx.fillStyle = colour;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(tx - tw / 2 - pad, ty - fs / 2 - pad, tw + 2 * pad, fs + 2 * pad, fs / 2) : ctx.rect(tx - tw / 2 - pad, ty - fs / 2 - pad, tw + 2 * pad, fs + 2 * pad);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText(text, tx, ty);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, tx, ty);
  }
  ctx.restore();
}

function dashed(ctx, p, q, colour, w) {
  ctx.save();
  ctx.setLineDash([w * 3, w * 2]);
  ctx.lineWidth = w;
  ctx.strokeStyle = colour;
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  ctx.lineTo(q[0], q[1]);
  ctx.stroke();
  ctx.restore();
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (v) => Math.hypot(v[0], v[1]) || 1;
const along = (p, v, k) => [p[0] + (v[0] / len(v)) * k, p[1] + (v[1] / len(v)) * k];
const deg = (v) => `${Math.round(v)}°`;

function statusColour(spec, id, key, pal) {
  if (spec.slot === 'anterior') return pal.neutral; // front-view values are experimental: never rated
  const c = spec.byId.get(id)?.cells?.[key];
  return c?.status ? pal[c.status] : pal.neutral;
}

// tf: the panel's crop of the analysed frame { x0, y0, k } (canvas px = (analysed px - origin) * k).
const mapper = (row, tf) => (k) => [(row.lm[k * 4] - tf.x0) * tf.k, (row.lm[k * 4 + 1] - tf.y0) * tf.k];

function drawSkeleton(ctx, row, tf, scale, stanceSide) {
  const S = mapper(row, tf);
  ctx.save();
  ctx.lineCap = 'round';
  for (const pass of [0, 1]) {
    for (const [a, b] of BONES) {
      if (!seen(row, a, b)) continue;
      const stance = LEG_IDS[stanceSide].has(a) && LEG_IDS[stanceSide].has(b);
      ctx.lineWidth = (stance ? 4 : 2.5) * scale + (pass === 0 ? 2.5 * scale : 0);
      ctx.strokeStyle = pass === 0 ? 'rgba(0,0,0,0.55)' : stance ? '#ffffff' : 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.moveTo(...S(a));
      ctx.lineTo(...S(b));
      ctx.stroke();
    }
  }
  for (const k of [11, 12, 23, 24, 25, 26, 27, 28]) {
    if (!seen(row, k)) continue;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(...S(k), 3 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Angles for the panel's phase, drawn from this row's landmarks (so they move with the frame steps).
function drawAngles(ctx, spec, row, facing, tf, scale) {
  const pal = palette();
  const s = SIDE_KEY[spec.leg];
  const id = LANDMARKS[s];
  const S = mapper(row, tf);
  const w = 2 * scale;
  const r = 34 * scale;
  if (spec.view === 'lateral') {
    // Trunk: shoulder-midpoint to hip-midpoint line with a vertical reference.
    if (seen(row, 11, 12, 23, 24)) {
      const sm = [(S(11)[0] + S(12)[0]) / 2, (S(11)[1] + S(12)[1]) / 2];
      const hm = [(S(23)[0] + S(24)[0]) / 2, (S(23)[1] + S(24)[1]) / 2];
      const key = { initial_contact: 'ic_spine_lean', midstance: 'ms_spine_lean' }[spec.phase];
      const col = key ? statusColour(spec, key, 'mid', pal) : pal.neutral;
      const L = len(sub(sm, hm));
      dashed(ctx, hm, [hm[0], hm[1] - L], pal.neutral, w * 0.8);
      ctx.save();
      ctx.lineWidth = w * 1.5;
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.moveTo(...hm);
      ctx.lineTo(...sm);
      ctx.stroke();
      ctx.restore();
      if (key) arc(ctx, hm, [0, -1], sub(sm, hm), r * 1.4, col, deg(trunkLean(row, facing)));
    }
    if (spec.phase === 'initial_contact' || spec.phase === 'midstance') {
      if (seen(row, id.hip, id.knee, id.ank)) {
        const k = S(id.knee);
        const thigh = sub(k, S(id.hip));
        dashed(ctx, k, along(k, thigh, r * 1.8), pal.neutral, w * 0.8);
        const metric = spec.phase === 'initial_contact' ? 'ic_knee_flexion' : 'ms_max_knee_flexion';
        arc(ctx, k, thigh, sub(S(id.ank), k), r, statusColour(spec, metric, spec.leg, pal), deg(kneeFlexion(P(row, id.hip), P(row, id.knee), P(row, id.ank))));
      }
    }
    if (spec.phase === 'initial_contact' && seen(row, id.knee, id.ank)) {
      // Tibial inclination at the ankle: shank vs vertical.
      const a = S(id.ank);
      dashed(ctx, a, [a[0], a[1] - r * 2.2], pal.neutral, w * 0.8);
      arc(ctx, a, [0, -1], sub(S(id.knee), a), r * 1.6, statusColour(spec, 'ic_tibial_inclination', spec.leg, pal), deg(tibialInclination(row, id, facing)));
    }
    if (spec.phase === 'toe_off' && seen(row, id.sho, id.hip, id.knee)) {
      // Hip extension vs the trunk axis (shoulder -> hip line continued below the hip).
      const h = S(id.hip);
      const axis = sub(h, S(id.sho));
      dashed(ctx, h, along(h, axis, r * 2.6), pal.neutral, w * 0.8);
      arc(ctx, h, axis, sub(S(id.knee), h), r * 1.3, statusColour(spec, 'to_hip_extension', spec.leg, pal), deg(row[`hip_ext_${s}`] ?? hipExtensionSigned(P(row, id.sho), P(row, id.hip), P(row, id.knee), facing)));
    }
    return;
  }
  // Rear view: pelvis line, midline (perpendicular through the pelvis midpoint), hip adduction, knee FPPA.
  if (!seen(row, 23, 24)) return;
  const hl = S(23);
  const hr = S(24);
  const hm = [(hl[0] + hr[0]) / 2, (hl[1] + hr[1]) / 2];
  const u = sub(hr, hl);
  const n = [-u[1] / len(u), u[0] / len(u)];
  const down = n[1] > 0 ? n : [-n[0], -n[1]];
  const lateralDir = Math.sign(S(id.hip)[0] - hm[0]) || 1; // labels on the outside of the leg
  ctx.save();
  ctx.lineWidth = w * 1.5;
  ctx.strokeStyle = pal.neutral;
  ctx.beginPath();
  ctx.moveTo(...along(hl, sub(hl, hr), r));
  ctx.lineTo(...along(hr, u, r));
  ctx.stroke();
  ctx.restore();
  const footY = Math.max(...[27, 28, 29, 30].filter((k) => seen(row, k)).map((k) => S(k)[1]), hm[1] + r * 6);
  dashed(ctx, along(hm, down, -r * 4), along(hm, down, (footY - hm[1]) / Math.max(0.3, down[1]) + r), pal.neutral, w);
  if (seen(row, id.hip, id.knee)) {
    const h = S(id.hip);
    dashed(ctx, h, along(h, down, r * 2.2), pal.neutral, w * 0.8);
    arc(ctx, h, down, sub(S(id.knee), h), r * 1.6, statusColour(spec, 'ms_hip_adduction', spec.leg, pal), deg(POSTERIOR.hipAdduction(geomRow(spec.clip, row), s)), lateralDir);
  }
  if (seen(row, id.hip, id.knee, id.ank)) {
    const k = S(id.knee);
    const thigh = sub(k, S(id.hip));
    dashed(ctx, k, along(k, thigh, r * 1.8), pal.neutral, w * 0.8);
    arc(ctx, k, thigh, sub(S(id.ank), k), r * 1.1, statusColour(spec, 'ms_knee_varus_valgus', spec.leg, pal), deg(POSTERIOR.kneeValgus(geomRow(spec.clip, row), s)), lateralDir);
  }
}

// ---------- mount ----------

// Crop of the analysed frame around the runner (all visible landmarks over the event row ±3 rows),
// so the joints and arcs are large enough to read on a phone. Kept fixed while stepping.
function cropBox(rows, base, [aw, ah]) {
  const xs = [];
  const ys = [];
  for (let i = Math.max(0, base - 3); i <= Math.min(rows.length - 1, base + 3); i++) {
    const r = rows[i];
    if (!r?.lm) continue;
    for (const k of [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]) {
      if (r.lm[k * 4 + 3] > VIS) {
        xs.push(r.lm[k * 4]);
        ys.push(r.lm[k * 4 + 1]);
      }
    }
  }
  let x0 = 0;
  let y0 = 0;
  let bw = aw;
  let bh = ah;
  if (xs.length > 8) {
    const h = Math.max(...ys) - Math.min(...ys);
    // Head above the nose and feet below the ankles: more room at the top.
    y0 = Math.min(...ys) - 0.2 * h;
    bh = h * 1.32;
    x0 = Math.min(...xs) - 0.15 * h;
    bw = Math.max(...xs) - Math.min(...xs) + 0.3 * h;
    // At least 3:4 so the arcs and labels have room beside the body.
    if (bw < 0.75 * bh) {
      x0 -= (0.75 * bh - bw) / 2;
      bw = 0.75 * bh;
    }
    bw = Math.min(bw, aw);
    bh = Math.min(bh, ah);
    x0 = Math.max(0, Math.min(aw - bw, x0));
    y0 = Math.max(0, Math.min(ah - bh, y0));
  }
  const k = Math.max(1, Math.min(3, 800 / bh));
  return { x0, y0, bw, bh, k, W: Math.round(bw * k), H: Math.round(bh * k) };
}

let active = null; // the previous mount: its hidden videos are released on the next mount

function seekTo(video, t) {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      video.removeEventListener('seeked', done);
      resolve(true);
    };
    const timer = setTimeout(() => {
      video.removeEventListener('seeked', done);
      resolve(false);
    }, 4000);
    video.addEventListener('seeked', done);
    video.currentTime = t;
  });
}

function dropVideo(v) {
  v.removeAttribute('src');
  v.load();
}

function loadVideo(url) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    const timer = setTimeout(() => finish(null), 10000);
    const finish = (ok) => {
      clearTimeout(timer);
      resolve(ok);
    };
    v.addEventListener('loadeddata', () => finish(v), { once: true });
    v.addEventListener('error', () => finish(null), { once: true });
    v.src = url;
  });
}

export async function mountPhasePanels(root, state, model) {
  if (active) active.release();
  const section = root.querySelector('.pp-section');
  if (!section) return;
  const specs = new Map(panelSpecs(state, model).map((s) => [s.id, s]));
  const videos = {}; // slot -> promise of { video, chain }
  // Called again on every re-render: the previous mount's click listener is removed (abort) and its
  // hidden videos are emptied, including ones still loading.
  const listen = new AbortController();
  const mine = {
    release() {
      listen.abort();
      for (const v of Object.values(videos)) v.then((x) => x.video && dropVideo(x.video));
    },
  };
  active = mine;
  const ui = { overlay: true, blur: true };
  const panels = [];

  for (const fig of section.querySelectorAll('.pp-fig')) {
    const spec = specs.get(fig.dataset.ppId);
    const canvas = fig.querySelector('.pp-canvas');
    if (!spec || !canvas) continue;
    const { rows, meta } = spec.clip.debug;
    const key = EVENT_KEY[spec.phase];
    const base = Math.max(0, Math.min(rows.length - 1, spec.rep.row ?? Math.round(spec.rep.stride[key].row)));
    const tf = cropBox(rows, base, meta.analysedSize || [486, 864]);
    canvas.width = tf.W;
    canvas.height = tf.H;
    const frame = document.createElement('canvas');
    frame.width = tf.W;
    frame.height = tf.H;
    panels.push({ fig, spec, canvas, frame, rows, meta, base, tf, offset: 0, hasFrame: false });
  }

  const pal0 = '#3a434d';
  const compose = (p) => {
    const ctx = p.canvas.getContext('2d');
    const W = p.canvas.width;
    const H = p.canvas.height;
    const scale = H / 640;
    const idx = Math.max(0, Math.min(p.rows.length - 1, p.base + p.offset));
    const row = p.rows[idx];
    ctx.clearRect(0, 0, W, H);
    if (p.hasFrame) {
      ctx.drawImage(p.frame, 0, 0);
      const e = ui.blur ? headEllipse(row) || headEllipse(p.rows[p.base]) : null;
      if (e) blurHead(ctx, p.frame, e, p.tf);
    } else {
      ctx.fillStyle = pal0;
      ctx.fillRect(0, 0, W, H);
    }
    if (ui.overlay && row?.lm) {
      const stanceSide = SIDE_KEY[p.spec.leg];
      drawSkeleton(ctx, row, p.tf, scale, stanceSide);
      drawAngles(ctx, p.spec, row, facingOf(p.spec.clip, row), p.tf, scale);
    }
    p.canvas.setAttribute('aria-label', ariaFor(p.spec, p.offset));
    const off = p.fig.querySelector('[data-pp-offset]');
    if (off) off.textContent = `${p.offset === 0 ? (p.spec.rep.note ? 'at peak' : 'at event') : `${p.offset > 0 ? '+' : '−'}${Math.abs(p.offset)} frame${Math.abs(p.offset) > 1 ? 's' : ''}`} · ${Number.isFinite(row?.t) ? row.t.toFixed(2) : '—'} s${row?.lm ? '' : ' · no pose'}`;
    const note = p.fig.querySelector('[data-pp-note]');
    if (note) note.textContent = p.hasFrame ? '' : p.spec.clip.url ? 'Video frame could not be read: wireframe only.' : 'No video loaded: wireframe only.';
  };

  // One hidden video per clip; seeks run one after another (a <video> can only be at one place).
  const videoFor = (slot, url) => {
    if (!videos[slot]) {
      videos[slot] = loadVideo(url).then((video) => {
        if (video && active !== mine) dropVideo(video); // released while loading
        return { video: active === mine ? video : null, chain: Promise.resolve() };
      });
    }
    return videos[slot];
  };
  const grab = async (p) => {
    const url = p.spec.clip.url;
    if (!url) return false;
    const v = await videoFor(p.spec.slot, url);
    if (!v.video || active !== mine) return false;
    const idx = Math.max(0, Math.min(p.rows.length - 1, p.base + p.offset));
    const t = p.rows[idx]?.t;
    if (!Number.isFinite(t)) return false;
    const job = v.chain.then(async () => {
      // Seek half a frame in so the decoder lands on this frame, not the previous one (as debug.js).
      const ok = await seekTo(v.video, t + 0.5 / (p.meta.fps || 30));
      if (!ok || active !== mine) return false;
      // Stepped again while seeking: the newer request draws instead (null = stale, keep the old frame).
      if (p.rows[Math.max(0, Math.min(p.rows.length - 1, p.base + p.offset))]?.t !== t) return null;
      const fctx = p.frame.getContext('2d');
      // The <video> shows the upright frame (rotation applied), the same geometry as the analysed
      // frame, so the crop scales from analysed px to video px.
      const [aw, ah] = p.meta.analysedSize || [v.video.videoWidth, v.video.videoHeight];
      const fx = v.video.videoWidth / aw;
      const fy = v.video.videoHeight / ah;
      if (p.meta.mirrored) {
        // The decoder un-mirrored the frames before pose (decode.js), but <video> plays the mirrored
        // file: flip the picture so it matches the landmarks (un-mirrored x = width - video x).
        fctx.save();
        fctx.translate(p.frame.width, 0);
        fctx.scale(-1, 1);
        fctx.drawImage(v.video, (aw - p.tf.x0 - p.tf.bw) * fx, p.tf.y0 * fy, p.tf.bw * fx, p.tf.bh * fy, 0, 0, p.frame.width, p.frame.height);
        fctx.restore();
      } else fctx.drawImage(v.video, p.tf.x0 * fx, p.tf.y0 * fy, p.tf.bw * fx, p.tf.bh * fy, 0, 0, p.frame.width, p.frame.height);
      return true;
    });
    v.chain = job.catch(() => false);
    return job;
  };
  const refresh = async (p) => {
    compose(p); // overlay at once (steps feel instant), frame follows
    const ok = await grab(p);
    if (ok === null) return;
    p.hasFrame = !!ok;
    compose(p);
  };

  // Event delegation on the section only: the listener goes away with the section on re-render.
  section.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-pp]');
    if (!btn || !section.contains(btn)) return;
    const what = btn.dataset.pp;
    if (what === 'overlay' || what === 'blur') {
      ui[what] = !ui[what];
      btn.setAttribute('aria-pressed', String(ui[what]));
      btn.textContent = what === 'overlay' ? (ui.overlay ? 'Hide overlay' : 'Show overlay') : `Head blur: ${ui.blur ? 'on' : 'off'}`;
      panels.forEach(compose);
      return;
    }
    const p = panels.find((x) => x.fig.contains(btn));
    if (!p) return;
    const before = p.offset;
    p.offset = what === 'reset' ? 0 : Math.max(-p.base, Math.min(p.rows.length - 1 - p.base, p.offset + Number(btn.dataset.d)));
    if (p.offset !== before) refresh(p);
  }, { signal: listen.signal });

  panels.forEach(compose);
  await Promise.all(panels.map(refresh));
}

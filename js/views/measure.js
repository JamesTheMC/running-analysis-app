// Manual on-screen measurement on a paused video frame (review player): an angle from three taps, a
// segment's angle from vertical from two taps, and a distance from two taps. These are the
// clinician's own marks on a 2D image: listed apart as "manual on-screen measurements", never mixed
// with the automated metrics, never scored and never used for findings or the corrective section.
// Stored in memory with the session (session.manual); nothing is sent anywhere.
import { esc } from '../util.js';
import { CLIP_SLOTS } from '../config.js';

export const TOOLS = {
  angle: { label: 'Angle', points: 3, hint: 'Tap three points: end, vertex, end.' },
  vertical: { label: 'Line vs vertical', points: 2, hint: 'Tap two points along a segment.' },
  distance: { label: 'Distance', points: 2, hint: 'Tap two points.' },
};

const DEG = 180 / Math.PI;
export function angle3(a, b, c) {
  const u = [a[0] - b[0], a[1] - b[1]];
  const v = [c[0] - b[0], c[1] - b[1]];
  const cos = (u[0] * v[0] + u[1] * v[1]) / ((Math.hypot(...u) * Math.hypot(...v)) || 1);
  return Math.acos(Math.max(-1, Math.min(1, cos))) * DEG;
}
// Angle of the line a→b from the image vertical, 0–90° (image y points down).
export function fromVertical(a, b) {
  const d = Math.abs(Math.atan2(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) * DEG);
  return Math.min(d, 180 - d);
}
// Distance in analysed pixels and, when a body scale is known, approximate cm.
export function distance(a, b, pxPerCm) {
  const px = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return { px, cm: pxPerCm ? px / pxPerCm : null };
}

export function measurementText(m) {
  if (m.kind === 'angle') return `${m.value.toFixed(1)}°`;
  if (m.kind === 'vertical') return `${m.value.toFixed(1)}° from vertical`;
  return m.cm != null ? `≈${m.cm.toFixed(1)} cm (${Math.round(m.value)} px; scaled from height, approximate)` : `${Math.round(m.value)} px`;
}

// One line per measurement, for the copy text and the printable list.
export function manualLines(manual = []) {
  return manual.map((m, i) => `${i + 1}. ${CLIP_SLOTS[m.slot]?.short || m.slot}, ${m.t.toFixed(2)} s: ${TOOLS[m.kind].label.toLowerCase()} ${measurementText(m)}`);
}

export function manualCardHtml(manual = []) {
  if (!manual.length) return '';
  return `<section class="card mz-card" aria-label="Manual on-screen measurements">
    <h3>Manual on-screen measurements <span class="hedge">not validated</span></h3>
    <p class="muted small">Marked by hand on a paused frame of a 2D video. Not part of the automated analysis: never scored or used for findings.</p>
    <ol class="tight small mz-print">${manualLines(manual).map((l) => `<li>${esc(l.replace(/^\d+\.\s*/, ''))}</li>`).join('')}</ol>
  </section>`;
}

export function measureHtml(slot) {
  return `<div class="mz" data-mz-slot="${esc(slot)}">
    <div class="mz-tools" role="group" aria-label="Manual measurement tools">
      ${Object.entries(TOOLS).map(([k, t]) => `<button class="rv-chip" data-mz="${k}" aria-pressed="false">${esc(t.label)}</button>`).join('')}
      <button class="rv-chip" data-mz="clear">Clear this frame</button>
    </div>
    <p class="mz-hint small muted" aria-live="polite">Manual tools: pause on a frame, choose a tool, then tap on the picture.</p>
    <ul class="mz-list tight small"></ul>
  </div>`;
}

// Wire the tools of one player (p: { canvas, k, idx, rows, slot, clip, draw }). Returns { draw(ctx) }.
export function wireMeasure(el, p) {
  const session = p.session;
  const store = () => (session ? (session.manual ??= []) : (p.localManual ??= []));
  const box = el.querySelector('.mz');
  if (!box) return null;
  const hint = box.querySelector('.mz-hint');
  const list = box.querySelector('.mz-list');
  const st = { tool: null, pts: [], drag: null };
  const pxPerCm = (() => {
    const h = parseFloat(session?.intake?.heightValue);
    const cm = Number.isFinite(h) ? (session.intake.heightUnit === 'in' ? h * 2.54 : h) : null;
    return cm && p.clip?.analysis?.bodyHeightPx ? p.clip.analysis.bodyHeightPx / cm : null;
  })();
  const compute = (kind, pts) => {
    if (kind === 'angle') return { value: angle3(...pts) };
    if (kind === 'vertical') return { value: fromVertical(...pts) };
    const d = distance(...pts, pxPerCm);
    return { value: d.px, cm: d.cm };
  };
  const mine = () => store().filter((m) => m.slot === p.slot);
  const renderList = () => {
    list.innerHTML = mine()
      .map((m) => `<li>${esc(TOOLS[m.kind].label)} at ${m.t.toFixed(2)} s: <strong>${esc(measurementText(m))}</strong> <span class="muted">(manual)</span> <button class="btn btn-link mz-del" data-mz-del="${store().indexOf(m)}" aria-label="Delete this measurement">Delete</button></li>`)
      .join('');
    // The printable list on the Results tab, updated in place (no re-render of the players).
    const card = document.querySelector('[data-mz-card]');
    if (card) card.innerHTML = manualCardHtml(store());
    document.dispatchEvent(new CustomEvent('gait:manual-changed'));
  };
  const toAnalysed = (e) => {
    const r = p.canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * (p.canvas.width / p.k), ((e.clientY - r.top) / r.height) * (p.canvas.height / p.k)];
  };
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) * p.k < 22 * (p.canvas.width / p.canvas.getBoundingClientRect().width || 1);

  box.addEventListener('click', (e) => {
    const del = e.target.closest('[data-mz-del]');
    if (del) {
      store().splice(+del.dataset.mzDel, 1);
      renderList();
      p.draw();
      return;
    }
    const b = e.target.closest('[data-mz]');
    if (!b) return;
    if (b.dataset.mz === 'clear') {
      const keep = store().filter((m) => !(m.slot === p.slot && m.idx === p.idx));
      store().splice(0, store().length, ...keep);
      st.pts = [];
      renderList();
      p.draw();
      return;
    }
    st.tool = st.tool === b.dataset.mz ? null : b.dataset.mz;
    st.pts = [];
    for (const x of box.querySelectorAll('[data-mz]')) if (TOOLS[x.dataset.mz]) x.setAttribute('aria-pressed', String(x.dataset.mz === st.tool));
    p.canvas.classList.toggle('mz-active', !!st.tool);
    p.stop?.();
    hint.textContent = st.tool ? TOOLS[st.tool].hint : 'Manual tools: pause on a frame, choose a tool, then tap on the picture.';
    p.draw();
  });

  p.canvas.addEventListener('pointerdown', (e) => {
    const pt = toAnalysed(e);
    // Drag an existing point of a measurement on this frame.
    for (const m of mine().filter((x) => x.idx === p.idx)) {
      const i = m.pts.findIndex((q) => near(q, pt));
      if (i >= 0) {
        st.drag = { m, i };
        p.canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
    }
    if (!st.tool) return;
    e.preventDefault();
    st.pts.push(pt);
    if (st.pts.length === TOOLS[st.tool].points) {
      const row = p.rows[p.idx];
      store().push({ slot: p.slot, kind: st.tool, pts: st.pts, idx: p.idx, t: row?.t ?? 0, ...compute(st.tool, st.pts) });
      st.pts = [];
      renderList();
    }
    p.draw();
  });
  p.canvas.addEventListener('pointermove', (e) => {
    if (!st.drag) return;
    st.drag.m.pts[st.drag.i] = toAnalysed(e);
    Object.assign(st.drag.m, compute(st.drag.m.kind, st.drag.m.pts));
    p.draw();
  });
  const end = () => {
    if (st.drag) renderList();
    st.drag = null;
  };
  p.canvas.addEventListener('pointerup', end);
  p.canvas.addEventListener('pointercancel', end);

  renderList();
  return {
    draw(ctx) {
      const scale = p.canvas.height / 640;
      const S = (q) => [q[0] * p.k, q[1] * p.k];
      const items = [...mine().filter((m) => m.idx === p.idx), ...(st.pts.length ? [{ kind: st.tool, pts: st.pts, pending: true }] : [])];
      ctx.save();
      ctx.lineWidth = 2.5 * scale;
      ctx.font = `${Math.round(14 * scale)}px system-ui, sans-serif`;
      for (const m of items) {
        ctx.strokeStyle = '#ffd400';
        ctx.fillStyle = '#ffd400';
        const pts = m.pts.map(S);
        ctx.beginPath();
        pts.forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q)));
        ctx.stroke();
        for (const q of pts) {
          ctx.beginPath();
          ctx.arc(...q, 6 * scale, 0, Math.PI * 2);
          ctx.fill();
        }
        if (m.kind === 'vertical' && pts.length === 2) {
          ctx.setLineDash([6 * scale, 5 * scale]);
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          ctx.lineTo(pts[0][0], pts[1][1]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (!m.pending) {
          const at = m.kind === 'angle' ? pts[1] : pts[1];
          const text = `${measurementText(m).replace(/ \(.*\)$/, '')} manual`;
          const w = ctx.measureText(text).width + 10 * scale;
          ctx.fillStyle = 'rgba(15,20,25,0.85)';
          ctx.fillRect(at[0] + 8 * scale, at[1] - 26 * scale, w, 22 * scale);
          ctx.fillStyle = '#ffd400';
          ctx.fillText(text, at[0] + 13 * scale, at[1] - 10 * scale);
        }
      }
      ctx.restore();
    },
  };
}

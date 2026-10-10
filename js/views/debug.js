// Debug tab: why a number came out the way it did. Skeleton overlay on the clip's frames, detected
// events on a timeline, and the reconciled result (per-metric confidence, cross-view checks).
// Everything is computed from data already in memory; nothing is stored or sent anywhere.
import { CLIP_SLOTS } from '../config.js';
import { esc } from '../util.js';

const BONES = [
  [11, 12], [11, 23], [12, 24], [23, 24], // trunk
  [11, 13], [13, 15], [12, 14], [14, 16], // arms
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31], // left leg
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32], // right leg
];
const LEFT = new Set([11, 13, 15, 23, 25, 27, 29, 31]);
const fmt = (v, d = 1) => (v == null || !Number.isFinite(+v) ? '—' : (+v).toFixed(d));

function confBadge(c) {
  const cls = { high: 'g', medium: 'y', low: 'r', none: 'na' }[c] || 'na';
  return `<span class="dbg-conf dbg-${cls}">${esc(c || 'none')}</span>`;
}

function metricRows(rec) {
  return Object.entries(rec.metrics)
    .map(([id, m]) => {
      if (m.notAssessed) return `<tr class="dbg-na"><td>${esc(m.label)}</td><td colspan="3">${esc(m.notAssessed)}</td></tr>`;
      const cell = (k) => {
        const c = m.cells[k];
        if (!c) return '<td></td>';
        if (c.value == null) return `<td class="muted">${esc(c.notAssessed || '—')}</td>`;
        const v = c.display || `${typeof c.value === 'number' ? fmt(c.value, 2) : c.value}${c.unit ? ` ${c.unit}` : ''}`;
        return `<td>${esc(String(v))} ${confBadge(c.confidence)}${c.confidenceReasons?.length ? `<div class="dbg-why">${esc(c.confidenceReasons.join('; '))}</div>` : ''}<div class="dbg-why">n ${c.n ?? '—'}/${c.total ?? '—'} ${esc(c.countUnit || '')} · ${esc(c.source?.slot || '')}</div></td>`;
      };
      return `<tr><td>${esc(m.label)}${m.provisional ? ' <span class="prov">provisional</span>' : ''}<div class="dbg-why">${esc(m.plane)} · ${esc(m.authoritativeView)} · ${esc(m.phase)}</div></td>${cell('left')}${cell('right')}${cell('mid')}</tr>`;
    })
    .join('');
}

function checksTable(rec) {
  return rec.timing.crossChecks
    .map((c) => `<tr><td>${esc(c.quantity)}</td><td>${Object.entries(c.values).map(([s, v]) => `${esc(s)}: ${fmt(v, c.unit === 's' ? 3 : 1)}`).join('<br>') || '—'}${c.rearInformational && Object.keys(c.rearInformational).length ? `<div class="dbg-why">rear (information only): ${Object.values(c.rearInformational).map((v) => fmt(v)).join(', ')}</div>` : ''}</td><td>${esc(c.status)}${c.tolerance != null ? ` (±${fmt(c.tolerance, c.unit === 's' ? 3 : 1)})` : ''}</td><td>${c.reported == null ? '—' : `${fmt(c.reported, c.unit === 's' ? 3 : 1)} ${esc(c.unit)}`} ${c.confidence ? confBadge(c.confidence) : ''}${c.flag ? `<div class="dbg-why warn">${esc(c.flag)}</div>` : ''}</td></tr>`)
    .join('');
}

function clipViewer(slot, clip) {
  if (!clip.debug?.rows) return `<p class="muted small">${esc(CLIP_SLOTS[slot].label)}: no frame data (demo or older session).</p>`;
  const n = clip.debug.rows.length;
  return `
    <div class="dbg-clip" data-slot="${esc(slot)}">
      <h3>${esc(CLIP_SLOTS[slot].label)}</h3>
      <div class="dbg-stage"><canvas class="dbg-canvas" width="360" height="640" aria-label="Frame with detected skeleton"></canvas></div>
      <svg class="dbg-timeline" viewBox="0 0 1000 40" preserveAspectRatio="none" aria-label="Detected events"></svg>
      <input class="dbg-slider" type="range" min="0" max="${n - 1}" value="0" aria-label="Frame" />
      <div class="dbg-controls">
        <button class="btn btn-link" data-dbg="prev">‹ Prev event</button>
        <span class="dbg-readout small muted"></span>
        <button class="btn btn-link" data-dbg="next">Next event ›</button>
      </div>
      <p class="small muted">Left side drawn in blue, right in orange. Timeline: ▲ initial contact, ● midstance, ▼ toe-off (top row left leg, bottom row right); faded = low confidence.</p>
    </div>`;
}

export function renderDebug(state) {
  const s = state.session;
  const rec = s.reconciled;
  if (!rec) return '<p class="muted">Debug data is available for analysed clips (not for the demo).</p>';
  return `
    <div class="dbg">
      <h2>Clips</h2>
      <div class="dbg-scroll"><table class="dbg-table"><thead><tr><th>Slot</th><th>Video</th><th>Analysed</th><th>Near leg / facing</th><th>Pose</th></tr></thead><tbody>
      ${rec.clips.map((c) => `<tr><td>${esc(c.slot)}</td><td>${fmt(c.fps)} fps · rot ${c.rotation ?? '—'}°${c.mirrored ? ' · mirrored (undone)' : ''}${c.frameTiming?.variable ? ' · <span class="warn">variable frame rate</span>' : ''}</td><td>${fmt(c.analysedHz, 0)} Hz · ${fmt(c.durationSec)} s</td><td>${esc(c.nearLeg || (c.view === 'posterior' ? 'both (rear)' : '—'))}${c.facing ? ` / runs ${esc(c.facing)}` : ''}</td><td>${c.landmarkQuality ? `${Math.round(c.landmarkQuality.posedShare * 100)}% frames · vis ${fmt(c.landmarkQuality.meanVisibility, 2)}` : '—'}</td></tr>`).join('')}
      </tbody></table></div>
      ${rec.convention.issues.map((i) => `<p class="small warn">⚠ ${esc(i)}</p>`).join('')}
      ${Object.entries(s.clips).map(([slot, clip]) => clipViewer(slot, clip)).join('')}
      <h2>Timing across views</h2>
      <p class="small muted">${esc(rec.alignment.method)}.</p>
      <div class="dbg-scroll"><table class="dbg-table"><thead><tr><th>Quantity</th><th>Per view</th><th>Check</th><th>Reported</th></tr></thead><tbody>${checksTable(rec)}</tbody></table></div>
      <p class="small">Derived: step length ${fmt(rec.derived.stepLengthM, 2)} m · stride length ${fmt(rec.derived.strideLengthM, 2)} m · duty factor ${fmt(rec.derived.dutyFactor, 2)} · flight ${fmt(rec.derived.flightMs, 0)} ms${rec.derived.notes.length ? `<br><span class="muted">${esc(rec.derived.notes.join('; '))}</span>` : ''}</p>
      <h2>Metrics: value and confidence</h2>
      <div class="dbg-scroll"><table class="dbg-table"><thead><tr><th>Metric</th><th>Left</th><th>Right</th><th>Midline</th></tr></thead><tbody>${metricRows(rec)}</tbody></table></div>
      <p><button class="btn btn-secondary" data-action="copy-json">Copy result JSON</button></p>
    </div>`;
}

// After render: wire each clip viewer (video element off-screen, canvas overlay).
export function mountDebug(root, state) {
  for (const el of root.querySelectorAll('.dbg-clip')) {
    const clip = state.session.clips[el.dataset.slot];
    const { rows, meta } = clip.debug;
    const table = clip.analysis?.eventTable;
    const canvas = el.querySelector('.dbg-canvas');
    const ctx = canvas.getContext('2d');
    const slider = el.querySelector('.dbg-slider');
    const readout = el.querySelector('.dbg-readout');
    const [aw, ah] = meta.analysedSize || [486, 864];
    canvas.width = aw;
    canvas.height = ah;
    // Events: [row, leg, kind, confidence]
    const events = [];
    for (const [leg, l] of Object.entries(table?.legs || {})) {
      for (const s of l.strides) {
        for (const kind of ['ic', 'ms', 'to']) if (s[kind]?.row != null) events.push([Math.round(s[kind].row), leg, kind, s[kind].confidence || s.confidence]);
      }
    }
    events.sort((a, b) => a[0] - b[0]);
    const svg = el.querySelector('.dbg-timeline');
    const n = rows.length;
    svg.innerHTML = events
      .map(([r, leg, kind, c]) => {
        const x = (r / Math.max(1, n - 1)) * 1000;
        const y = leg === 'left' ? 12 : 30;
        const op = c === 'low' ? 0.35 : 1;
        const col = leg === 'left' ? 'var(--dbg-left)' : 'var(--dbg-right)';
        if (kind === 'ms') return `<circle cx="${x}" cy="${y}" r="3" fill="${col}" opacity="${op}"/>`;
        const pts = kind === 'ic' ? `${x - 4},${y + 5} ${x + 4},${y + 5} ${x},${y - 5}` : `${x - 4},${y - 5} ${x + 4},${y - 5} ${x},${y + 5}`;
        return `<polygon points="${pts}" fill="${col}" opacity="${op}"/>`;
      })
      .join('') + '<line class="dbg-cursor" x1="0" x2="0" y1="0" y2="40" stroke="currentColor" stroke-width="2"/>';
    const cursor = svg.querySelector('.dbg-cursor');

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = clip.url;
    let idx = 0;
    const draw = () => {
      ctx.clearRect(0, 0, aw, ah);
      if (video.readyState >= 2) ctx.drawImage(video, 0, 0, aw, ah);
      const row = rows[idx];
      if (row?.lm) {
        ctx.lineWidth = 3;
        for (const [a, b] of BONES) {
          if (row.lm[a * 4 + 3] < 0.5 || row.lm[b * 4 + 3] < 0.5) continue;
          ctx.strokeStyle = LEFT.has(a) && LEFT.has(b) ? '#3b82f6' : !LEFT.has(a) && !LEFT.has(b) ? '#f59e0b' : '#e5e7eb';
          ctx.beginPath();
          ctx.moveTo(row.lm[a * 4], row.lm[a * 4 + 1]);
          ctx.lineTo(row.lm[b * 4], row.lm[b * 4 + 1]);
          ctx.stroke();
        }
      }
      const here = events.filter((e) => e[0] === idx).map((e) => `${e[1]} ${e[2].toUpperCase()}${e[3] === 'low' ? ' (low)' : ''}`);
      readout.textContent = `frame ${row?.frame ?? idx} · ${fmt(row?.t, 2)} s${row?.lm ? '' : ' · no pose'}${here.length ? ` · ${here.join(', ')}` : ''}`;
      cursor.setAttribute('x1', (idx / Math.max(1, n - 1)) * 1000);
      cursor.setAttribute('x2', (idx / Math.max(1, n - 1)) * 1000);
    };
    const go = (i) => {
      idx = Math.max(0, Math.min(n - 1, i));
      slider.value = idx;
      const t = rows[idx]?.t ?? 0;
      // Seek half a frame in so the decoder lands on this frame, not the previous one.
      video.currentTime = t + 0.5 / (meta.fps || 30);
      draw();
    };
    video.addEventListener('seeked', draw);
    video.addEventListener('loadeddata', () => go(events[0]?.[0] ?? 0));
    slider.addEventListener('input', () => go(+slider.value));
    el.querySelector('[data-dbg="next"]').addEventListener('click', () => go((events.find((e) => e[0] > idx) || [idx])[0]));
    el.querySelector('[data-dbg="prev"]').addEventListener('click', () => go(([...events].reverse().find((e) => e[0] < idx) || [idx])[0]));
  }
}

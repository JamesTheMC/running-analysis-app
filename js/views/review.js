// Video review: each uploaded clip played back on the device with the pose overlay, in slow motion,
// frame by frame, with the detected gait events on the scrubber. Angle labels show the value at the
// frame on screen only: they are not the validated per-stride metrics and never carry a status colour.
// The video is drawn from the local file (object URL); nothing is stored or sent.
import { esc } from '../util.js';
import { CLIP_SLOTS } from '../config.js';
import { LANDMARKS, hipExtensionSigned, kneeFlexion } from '../pipeline/kinematics.js';
import { trunkLean } from '../pipeline/metrics.js';
import { POSTERIOR } from '../pipeline/posterior-metrics.js';
import { blurHead, drawSkeleton, dropVideo, headEllipse, loadVideo, seekTo } from './phase-panels.js';
import { measureHtml, wireMeasure } from './measure.js';

export const SPEEDS = [0.25, 0.5, 1];
const VIS = 0.5;
const SLOT_ORDER = ['lateral_left', 'lateral_right', 'posterior', 'anterior'];
const KIND_LABEL = { ic: 'initial contact', ms: 'midstance', to: 'toe-off' };
const failed = (clip) => ['unsuitable', 'fail'].includes(clip?.analysis?.captureQuality?.level);
const rowsOf = (clip) => clip?.debug?.rows || null;
const seen = (row, ...ks) => !!row?.lm && ks.every((k) => row.lm[k * 4 + 3] > VIS);
const P = (row, k) => [row.lm[k * 4], row.lm[k * 4 + 1]];

// Gait events of a clip as scrubber markers: side views the near leg's IC / MS / TO; rear and front
// views each leg's midstance (their IC / TO are low-confidence timing only). Valid strides only.
export function eventMarkers(clip) {
  const legs = clip?.analysis?.eventTable?.legs || {};
  const lateral = CLIP_SLOTS[clip?.slot]?.view === 'lateral' || clip?.analysis?.view === 'lateral';
  const out = [];
  for (const [leg, l] of Object.entries(legs)) {
    if (lateral && l.role !== 'near') continue;
    for (const s of l.strides || []) {
      if (!s.valid) continue;
      for (const kind of lateral ? ['ic', 'ms', 'to'] : ['ms']) if (s[kind]?.row != null) out.push({ row: Math.round(s[kind].row), leg, kind });
    }
  }
  return out.sort((a, b) => a.row - b.row);
}

// Analysed row nearest to time t (rows sorted by t).
export function rowAt(rows, t) {
  let lo = 0;
  let hi = rows.length - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (rows[m].t < t) lo = m + 1;
    else hi = m;
  }
  return lo > 0 && Math.abs(rows[lo - 1].t - t) < Math.abs(rows[lo].t - t) ? lo - 1 : lo;
}

// Angle labels for the frame on screen. Side views: the near leg's knee and hip and the trunk; rear
// view: each leg's hip adduction and knee frontal-plane angle. Front view: none (experimental).
export function frameAngles(slot, row, { nearSide = 'R', facing = 1 } = {}) {
  if (!row?.lm) return [];
  const view = CLIP_SLOTS[slot]?.view;
  const out = [];
  const r1 = (v) => Math.round(v);
  if (view === 'lateral') {
    const id = LANDMARKS[nearSide];
    if (seen(row, id.hip, id.knee, id.ank)) out.push({ at: id.knee, label: 'Knee', value: r1(kneeFlexion(P(row, id.hip), P(row, id.knee), P(row, id.ank))) });
    if (seen(row, id.sho, id.hip, id.knee)) out.push({ at: id.hip, label: 'Hip', value: r1(hipExtensionSigned(P(row, id.sho), P(row, id.hip), P(row, id.knee), facing)) });
    if (seen(row, 11, 12, 23, 24)) out.push({ at: id.sho, label: 'Trunk', value: r1(trunkLean(row, facing)) });
  } else if (view === 'posterior') {
    for (const s of ['L', 'R']) {
      const id = LANDMARKS[s];
      if (!seen(row, 23, 24, id.knee, id.ank)) continue;
      out.push({ at: id.hip, label: `${s} hip add`, value: r1(POSTERIOR.hipAdduction(row, s)) });
      out.push({ at: id.knee, label: `${s} knee`, value: r1(POSTERIOR.kneeValgus(row, s)) });
    }
  }
  return out;
}

function blockHtml(slot, clip) {
  const label = CLIP_SLOTS[slot].label;
  const rows = rowsOf(clip);
  if (!rows) return `<p class="muted small">${esc(label)}: no frame data for this clip.</p>`;
  const markers = eventMarkers({ ...clip, slot });
  const n = rows.length;
  const ticks = markers
    .map((m) => `<span class="rv-tick rv-${m.kind}${m.leg === 'left' ? ' rv-l' : ' rv-r'}" style="left:${((m.row / Math.max(1, n - 1)) * 100).toFixed(2)}%" title="${esc(`${m.leg} ${KIND_LABEL[m.kind]}`)}"></span>`)
    .join('');
  return `<div class="rv-clip" data-rv-slot="${esc(slot)}">
    <div class="rv-head"><h4>${esc(label)}</h4>${failed(clip) ? '<span class="chip chip-red">video check failed</span>' : ''}${CLIP_SLOTS[slot].experimental ? '<span class="hedge">experimental view</span>' : ''}</div>
    <div class="rv-stage"><canvas class="rv-canvas" aria-label="${esc(label)}: video frame with pose overlay"></canvas></div>
    <div class="rv-scrub">
      <div class="rv-ticks" aria-hidden="true">${ticks}</div>
      <input class="rv-slider" type="range" min="0" max="${n - 1}" value="0" step="1" aria-label="Frame" />
    </div>
    <div class="rv-controls" role="group" aria-label="Playback">
      <button class="rv-btn" data-rv="play" aria-label="Play">▶</button>
      <button class="rv-btn" data-rv="ev-prev" aria-label="Previous event">⏮</button>
      <button class="rv-btn" data-rv="back" aria-label="Back one frame">−1</button>
      <button class="rv-btn" data-rv="fwd" aria-label="Forward one frame">+1</button>
      <button class="rv-btn" data-rv="ev-next" aria-label="Next event">⏭</button>
      <label class="rv-speed">Speed <select data-rv="speed" aria-label="Playback speed">${SPEEDS.map((s) => `<option value="${s}"${s === 0.25 ? ' selected' : ''}>${s}×</option>`).join('')}</select></label>
    </div>
    <p class="rv-readout small muted" aria-live="polite"></p>
    ${measureHtml(slot)}
  </div>`;
}

export function reviewHtml(state) {
  const clips = state.session?.clips || {};
  const slots = SLOT_ORDER.filter((s) => clips[s]);
  if (!slots.length || state.session?.placeholder) return '';
  const missing = SLOT_ORDER.filter((s) => !clips[s] && !CLIP_SLOTS[s].experimental);
  return `<section class="card rv-section" id="video-review" aria-label="Video review">
    <h3>Video review</h3>
    <div class="rv-toggles" role="group" aria-label="Overlay options">
      <button class="rv-chip" data-rv="overlay" aria-pressed="true">Skeleton</button>
      <button class="rv-chip" data-rv="angles" aria-pressed="true">Angles</button>
      <button class="rv-chip" data-rv="blur" aria-pressed="true">Head blur</button>
      <button class="rv-chip" data-rv="pin" aria-pressed="false">Keep in view</button>
    </div>
    <p class="muted small">Played on this device from the original video. Marks on the scrubber: ▲ initial contact, ● midstance, ▼ toe-off (side views: the leg facing the camera; rear: each leg's midstance). Angle labels are this frame only, not the validated per-stride values.</p>
    ${slots.map((s) => blockHtml(s, clips[s])).join('')}
    ${missing.length ? `<p class="muted small">Not uploaded: ${esc(missing.map((s) => CLIP_SLOTS[s].short).join(', '))}.</p>` : ''}
  </section>`;
}

let active = null; // previous mount (released on re-render)

export async function mountReview(root, state) {
  if (active) active.release();
  const section = root.querySelector('.rv-section');
  if (!section) return;
  const ui = active?.ui || { overlay: true, angles: true, blur: true, pin: false };
  const players = [];
  const mount = {
    ui,
    release() {
      for (const p of players) {
        p.stop();
        if (p.video) dropVideo(p.video);
      }
      section.removeEventListener('click', onClick);
      section.removeEventListener('input', onInput);
      section.removeEventListener('change', onInput);
    },
  };
  active = mount;
  for (const b of section.querySelectorAll('.rv-toggles [data-rv]')) b.setAttribute('aria-pressed', String(!!ui[b.dataset.rv]));
  section.classList.toggle('rv-pinned', ui.pin);

  for (const el of section.querySelectorAll('.rv-clip')) {
    const slot = el.dataset.rvSlot;
    const clip = state.session.clips[slot];
    const rows = rowsOf(clip);
    const meta = clip.debug.meta || {};
    const [aw, ah] = meta.analysedSize || [486, 864];
    const canvas = el.querySelector('.rv-canvas');
    const k = Math.min(2, 720 / aw);
    canvas.width = Math.round(aw * k);
    canvas.height = Math.round(ah * k);
    const frame = document.createElement('canvas');
    frame.width = canvas.width;
    frame.height = canvas.height;
    const markers = eventMarkers({ ...clip, slot });
    const nearSide = clip.analysis?.nearSide === 'left' ? 'L' : 'R';
    const facing = clip.analysis?.clip?.facing === 'image-left' ? -1 : 1;
    const p = { session: state.session, el, slot, clip, rows, meta, canvas, frame, k, idx: markers[0]?.row ?? 0, video: null, hasFrame: false, playing: false, raf: 0, speed: 0.25, markers };
    p.stop = () => {
      p.playing = false;
      cancelAnimationFrame(p.raf);
      if (p.video && !p.video.paused) p.video.pause();
      const b = el.querySelector('[data-rv="play"]');
      if (b) {
        b.textContent = '▶';
        b.setAttribute('aria-label', 'Play');
      }
    };
    p.draw = () => {
      const ctx = canvas.getContext('2d');
      const row = rows[p.idx];
      const tf = { x0: 0, y0: 0, k };
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (p.hasFrame) {
        const f = frame.getContext('2d');
        f.save();
        if (meta.mirrored) {
          // Decoder un-mirrors frames before pose; the file plays mirrored, so flip it back.
          f.translate(frame.width, 0);
          f.scale(-1, 1);
        }
        f.drawImage(p.video, 0, 0, frame.width, frame.height);
        f.restore();
        ctx.drawImage(frame, 0, 0);
        const e = ui.blur ? headEllipse(row) : null;
        if (e) blurHead(ctx, frame, e, tf);
      } else {
        ctx.fillStyle = '#3a434d';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      const scale = canvas.height / 640;
      if (ui.overlay && row?.lm) {
        drawSkeleton(ctx, row, tf, scale, nearSide);
        if (CLIP_SLOTS[slot].view !== 'lateral' && seen(row, 23, 24)) {
          // Rear / front: vertical reference through the pelvis midpoint.
          const mx = ((row.lm[23 * 4] + row.lm[24 * 4]) / 2) * k;
          ctx.save();
          ctx.setLineDash([8 * scale, 6 * scale]);
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.lineWidth = 1.5 * scale;
          ctx.beginPath();
          ctx.moveTo(mx, 0);
          ctx.lineTo(mx, canvas.height);
          ctx.stroke();
          ctx.restore();
        }
      }
      if (ui.angles && !failed(clip)) {
        ctx.save();
        ctx.font = `${Math.round(13 * scale)}px system-ui, sans-serif`;
        ctx.textBaseline = 'middle';
        for (const a of frameAngles(slot, row, { nearSide, facing })) {
          const [x, y] = [row.lm[a.at * 4] * k, row.lm[a.at * 4 + 1] * k];
          const text = `${a.label} ${a.value}°`;
          const w = ctx.measureText(text).width + 10 * scale;
          const left = x + 10 * scale + w > canvas.width ? x - 10 * scale - w : x + 10 * scale;
          ctx.fillStyle = 'rgba(15,20,25,0.78)';
          ctx.fillRect(left, y - 11 * scale, w, 22 * scale);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(text, left + 5 * scale, y);
        }
        ctx.restore();
      }
      p.measure?.draw(ctx);
      const here = markers.filter((m) => m.row === p.idx).map((m) => `${m.leg} ${KIND_LABEL[m.kind]}`);
      el.querySelector('.rv-readout').textContent = `${Number.isFinite(row?.t) ? row.t.toFixed(2) : '—'} s · frame ${p.idx + 1} of ${rows.length}${row?.lm ? '' : ' · no pose'}${here.length ? ` · ${here.join(', ')}` : ''}${failed(clip) ? ' · video check failed: no angle labels' : ''}`;
      el.querySelector('.rv-slider').value = p.idx;
    };
    p.go = async (i) => {
      p.idx = Math.max(0, Math.min(rows.length - 1, i));
      if (p.video) {
        // Half a frame in, so the decoder lands on this frame and not the previous one.
        p.hasFrame = await seekTo(p.video, (rows[p.idx]?.t ?? 0) + 0.5 / (meta.fps || 30));
      }
      p.draw();
    };
    p.loop = () => {
      if (!p.playing) return;
      p.idx = rowAt(rows, p.video.currentTime);
      p.hasFrame = true;
      p.draw();
      if (p.video.ended) p.stop();
      else p.raf = requestAnimationFrame(p.loop);
    };
    p.measure = wireMeasure(el, p);
    players.push(p);
    p.draw();
    if (clip.url) {
      loadVideo(clip.url).then((v) => {
        if (active !== mount) return v && dropVideo(v);
        p.video = v;
        if (v) p.go(p.idx);
        else el.querySelector('.rv-readout').textContent = 'Video could not be read: wireframe only.';
      });
    } else el.querySelector('.rv-readout').textContent = 'No video loaded (wireframe only).';
  }

  const playerOf = (t) => players.find((p) => p.el.contains(t));
  function onClick(e) {
    const b = e.target.closest('[data-rv]');
    if (!b) return;
    const what = b.dataset.rv;
    if (['overlay', 'angles', 'blur', 'pin'].includes(what)) {
      ui[what] = !ui[what];
      b.setAttribute('aria-pressed', String(ui[what]));
      section.classList.toggle('rv-pinned', ui.pin);
      for (const p of players) p.draw();
      return;
    }
    const p = playerOf(b);
    if (!p) return;
    if (what === 'play') {
      if (p.playing) return p.stop();
      if (!p.video) return;
      for (const q of players) if (q !== p) q.stop();
      p.video.playbackRate = p.speed;
      if (p.idx >= p.rows.length - 1) p.video.currentTime = p.rows[0].t;
      p.video.play().then(() => {
        p.playing = true;
        b.textContent = '❚❚';
        b.setAttribute('aria-label', 'Pause');
        p.loop();
      }, () => {});
      return;
    }
    p.stop();
    if (what === 'back') p.go(p.idx - 1);
    else if (what === 'fwd') p.go(p.idx + 1);
    else if (what === 'ev-next') p.go((p.markers.find((m) => m.row > p.idx) || { row: p.idx }).row);
    else if (what === 'ev-prev') p.go(([...p.markers].reverse().find((m) => m.row < p.idx) || { row: p.idx }).row);
  }
  function onInput(e) {
    const p = playerOf(e.target);
    if (!p) return;
    if (e.target.matches('.rv-slider')) {
      p.stop();
      p.go(+e.target.value);
    } else if (e.target.matches('[data-rv="speed"]')) {
      p.speed = +e.target.value;
      if (p.video) p.video.playbackRate = p.speed;
    }
  }
  section.addEventListener('click', onClick);
  section.addEventListener('input', onInput);
  section.addEventListener('change', onInput);
}

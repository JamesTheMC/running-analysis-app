// Baseline report per cached clip (dev): runs the post-pose pipeline on test-data/debug/<id>.rows.json
// and summarises what works and what breaks. Used in the browser console / by tools.
import { CLIPS } from './clips.js';
import { postProcess, postProcessRear } from '../js/pipeline/run.js';
import { toAnalysis } from '../js/pipeline/measurements.js';
import { toPosteriorAnalysis } from '../js/pipeline/posterior.js';
import { LANDMARKS } from '../js/pipeline/kinematics.js';
import { median } from '../js/pipeline/stats.js';

export async function loadRows(id) {
  const res = await fetch(`../test-data/debug/${id}.rows.json`);
  if (!res.ok) return null;
  const { meta, rows } = await res.json();
  for (const r of rows) if (r.lm) r.lm = Float32Array.from(r.lm);
  return { meta, rows };
}

const r1 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);

// Landmark quality: share of frames with a pose, mean visibility and jitter of key points.
export function landmarkQuality(rows) {
  const keys = { hipL: LANDMARKS.L.hip, hipR: LANDMARKS.R.hip, kneeL: LANDMARKS.L.knee, kneeR: LANDMARKS.R.knee, ankL: LANDMARKS.L.ank, ankR: LANDMARKS.R.ank, heelL: LANDMARKS.L.heel, heelR: LANDMARKS.R.heel };
  const out = { posed: rows.filter((r) => r.lm).length / rows.length };
  for (const [name, k] of Object.entries(keys)) {
    const vis = rows.filter((r) => r.lm).map((r) => r.lm[k * 4 + 3]);
    // Jitter: median |second difference| in px (high = frame-to-frame noise).
    const x = rows.map((r) => (r.lm ? r.lm[k * 4] : NaN));
    const dd = [];
    for (let i = 1; i < x.length - 1; i++) if ([x[i - 1], x[i], x[i + 1]].every(Number.isFinite)) dd.push(Math.abs(x[i - 1] - 2 * x[i] + x[i + 1]));
    out[name] = { vis: r1(median(vis) * 100) / 100, lowVisShare: r1((100 * vis.filter((v) => v < 0.5).length) / vis.length), jitterPx: r1(median(dd)) };
  }
  return out;
}

export async function baseline(clip, opts = {}) {
  const data = await loadRows(clip.id);
  if (!data) return { id: clip.id, error: 'no cached landmarks' };
  const { meta, rows } = data;
  const rep = { id: clip.id, view: clip.view, fps: r1(meta.fps), fs: r1(meta.fs), frames: meta.frameCount, analysed: rows.length, size: meta.analysedSize, rotation: meta.rotation, quality: landmarkQuality(rows) };
  try {
    if (clip.view === 'lateral') {
      const r = postProcess(rows, meta, opts);
      rep.near = r.seg.near;
      rep.facing = r.seg.ref.facing;
      rep.excluded = r.bad.filter(Boolean).length;
      rep.strides = r.seg.cycles.length;
      rep.cadence = r1(r.cadence?.spm);
      const ev = r.events[r.seg.near.side].strides;
      rep.events = { total: ev.length, valid: ev.filter((s) => s.valid).length, reasons: Object.entries(ev.flatMap((s) => s.reasons).reduce((a, k) => ((a[k] = (a[k] || 0) + 1), a), {})) };
      const ct = ev.filter((s) => s.valid).map((s) => ((s.to - s.ic) / meta.fs) * 1000);
      rep.contactMs = r1(median(ct));
      const a = toAnalysis({ ...r, rows, meta }, { heightCm: opts.heightCm ?? 170 });
      rep.metrics = Object.fromEntries(Object.entries(a.measurements).map(([id, cells]) => [id, Object.fromEntries(Object.entries(cells).map(([s, c]) => [s, c.value == null ? c.reason || null : typeof c.value === 'number' ? r1(c.value) : c.value]))]));
    } else {
      const r = postProcessRear(rows, meta);
      rep.excluded = r.bad.filter(Boolean).length;
      rep.strides = r.seg.peaks?.length;
      rep.cadence = r1(r.cadence?.spm);
      rep.midstance = { L: r.midstancePelvis.L.filter((h) => h.valid).length, R: r.midstancePelvis.R.filter((h) => h.valid).length };
      rep.capture = { offCentreHW: r1(r.capture.offCentre?.median ?? r.capture.median), swaps: r.capture.swapFrames ?? r.capture.swaps };
      const a = toPosteriorAnalysis({ ...r, rows, meta }, { heightCm: opts.heightCm ?? 170 });
      rep.metrics = Object.fromEntries(Object.entries(a.measurements).map(([id, cells]) => [id, Object.fromEntries(Object.entries(cells).map(([s, c]) => [s, c.value == null ? c.reason || null : typeof c.value === 'number' ? r1(c.value) : c.value]))]));
    }
  } catch (e) {
    rep.error = e.stack || e.message;
  }
  return rep;
}

export async function baselineAll(opts) {
  const out = [];
  for (const c of CLIPS) out.push(await baseline(c, opts));
  return out;
}

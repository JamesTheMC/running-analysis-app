// Dev analysis: does a whole-leg landmark offset generalise across clients? Leave-one-client-out:
// offsets fitted on the other clients' hand-marked side frames, applied to the held-out client,
// angle errors compared with no correction. Inputs (test-data/debug, gitignored): annotation keys,
// crop indexes and blind hand marks for C0 (v1) and T1–T3 (v2).
import { compare } from './annotation-compare.js';
import { applyLegAnchor, legOffsetOf } from '../js/pipeline/hip-anchor.js';
import { LANDMARKS } from '../js/pipeline/kinematics.js';
import { median } from '../js/pipeline/stats.js';

const NAME = { hip: 'hip', knee: 'knee', ank: 'ankle', heel: 'heel', toe: 'toe' };
const j = async (n) => (await fetch(`../test-data/debug/${n}`)).json();

// Side frames per client: [{ key (with x0,y0,k,lm), marks, near, facing, client, kind }]
export async function loadSideFrames() {
  const out = [];
  const sets = [
    { key: 'annotation_key.json', idx: 'annotate_index_near.json', ann: 'annotations.json', client: () => 'C0', near: () => 'L', facing: -1 },
    { key: 'annotation_key_v2.json', idx: 'annotate_index_v2.json', ann: 'annotations_v2.json', client: (k) => k.clipId.split('-')[0], near: (k) => k.near, facing: 1 },
  ];
  for (const s of sets) {
    let keys, idx, ann;
    try {
      [keys, idx, ann] = await Promise.all([j(s.key), j(s.idx), j(s.ann)]);
    } catch {
      continue;
    }
    for (const k of keys) {
      if (k.clip && /rear/.test(k.clipId || '')) continue;
      if (!k.clipId && !/IMG_0639/.test(k.clip)) continue;
      const i = idx.find((x) => x.label === k.blind);
      const marks = ann.crops[k.blind];
      if (!i || !marks) continue;
      out.push({ key: { ...k, x0: i.x0, y0: i.y0 }, marks, near: s.near(k), facing: s.facing, client: s.client(k) });
    }
  }
  return out;
}

const thighPxOf = (f) => {
  const ids = LANDMARKS[f.near];
  return Math.hypot(f.key.lm[ids.knee * 4] - f.key.lm[ids.hip * 4], f.key.lm[ids.knee * 4 + 1] - f.key.lm[ids.hip * 4 + 1]);
};

export function fitOffsets(frames) {
  const o = {};
  for (const [p, n] of Object.entries(NAME)) {
    const d = frames
      .map((f) => {
        const m = f.marks[n];
        if (!Array.isArray(m)) return null;
        const ids = LANDMARKS[f.near];
        const pt = [(m[0] + f.key.x0) / f.key.k, (m[1] + f.key.y0) / f.key.k];
        return legOffsetOf([f.key.lm[ids[p] * 4], f.key.lm[ids[p] * 4 + 1]], pt, f.facing, thighPxOf(f));
      })
      .filter(Boolean);
    o[p] = { fwd: median(d.map((x) => x.fwd)), down: median(d.map((x) => x.down)), n: d.length };
  }
  return o;
}

function corrected(f, offsets) {
  if (!offsets) return f.key;
  const [row] = applyLegAnchor([{ lm: Float32Array.from(f.key.lm), facing: f.facing }], f.near, f.facing, offsets, thighPxOf(f));
  return { ...f.key, lm: Array.from(row.lm) };
}

const KEYS = [
  ['IC', 'kneeFlexion'],
  ['MS', 'kneeFlexion'],
  ['TO', 'kneeFlexion'],
  ['IC', 'tibialIC'],
  ['TO', 'hipExtension'],
  ['MS', 'trunkLeanAsReported'],
  ['MS', 'ankleDF'],
  ['IC', 'footToComCm'],
];

// Errors per client for one frame set and one offset rule.
export function errors(frames, offsetsFor) {
  const res = {};
  for (const client of [...new Set(frames.map((f) => f.client))]) {
    const fs = frames.filter((f) => f.client === client);
    const near = fs[0].near;
    const facing = fs[0].facing;
    const keys = fs.map((f) => ({ ...corrected(f, offsetsFor(client)), label: f.key.label.replace(/_TO$/, '_HIPPEAK') })); // compare() treats HIPPEAK as the side toe-off frame
    const ann = { crops: Object.fromEntries(fs.map((f) => [f.key.blind, f.marks])) };
    const cmp = compare(keys, ann, { near, facing, bodyHeightPx: 512, heightCm: 170 });
    for (const r of cmp.rows) r.kind = /_IC$/.test(r.truth) ? 'IC' : /_MS$/.test(r.truth) ? 'MS' : 'TO';
    // (side frames only: every row here is IC, MS or toe-off)
    res[client] = {};
    for (const [kind, k] of KEYS) {
      const name = k === 'tibialIC' ? 'tibialInclination' : k;
      const e = cmp.rows.filter((r) => r.kind === kind && r.values[name]).map((r) => r.values[name].error);
      if (e.length) res[client][`${kind} ${k}`] = { n: e.length, bias: e.reduce((a, b) => a + b, 0) / e.length, mae: e.reduce((a, b) => a + Math.abs(b), 0) / e.length };
    }
    const pts = {};
    for (const r of cmp.rows) for (const [p, v] of Object.entries(r.pointErrorPx)) (pts[p] ??= []).push(v);
    res[client].pointPx = Object.fromEntries(Object.entries(pts).map(([p, v]) => [p, Math.round(v.reduce((a, b) => a + b, 0) / v.length)]));
  }
  return res;
}

// Re-validation run (python3 tools/revalidate.py opens this page in headless Chrome).
// For every clip (the benchmark inventory in test/clips.js plus new clips in test-data/ named
// CODE_YYYY-MM-DD_VIEW_SPEED): pose (cached in test-data/debug/<id>.rows.json, gitignored), view
// detection, video check, full pipeline and reconciliation per session (client code + date), and
// validation against hand marks where they exist (test-data/debug/marks_<id>.json from
// test/mark-clip.html). Results are POSTed to the runner, which updates BENCHMARK.md. Codes only.
import { CLIPS, clipUrl } from './clips.js';
import { unpackRows } from './fixture-io.js';
import { analyzeVideo } from '../js/pipeline/run.js';
import { detectView } from '../js/pipeline/view-detect.js';
import { processClip } from '../js/pipeline/adapt.js';
import { reconcileSession } from '../js/pipeline/reconcile.js';
import { coverage } from '../js/pipeline/view-matrix.js';
import { CLIP_SLOTS } from '../js/config.js';
import { LANDMARKS, hipExtensionSigned, kneeFlexion } from '../js/pipeline/kinematics.js';
import { ankleDorsiflexion, tibialInclination, trunkLean } from '../js/pipeline/metrics.js';
import { POSTERIOR } from '../js/pipeline/posterior-metrics.js';

const log = (s) => (document.getElementById('log').textContent += `\n${s}`);
const VIEW_SLOT = { left: 'lateral_left', right: 'lateral_right', rear: 'posterior', front: 'anterior' };
const DEFAULT_HEIGHT = 170;
const r1 = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : v ?? null);

async function cachedRows(id) {
  const fx = await fetch(`fixtures/clips/${id}.lm.json`);
  if (fx.ok) return unpackRows(await fx.json());
  const res = await fetch(`../test-data/debug/${id}.rows.json`);
  if (!res.ok) return null;
  const { meta, rows } = await res.json();
  for (const r of rows) if (r.lm) r.lm = Float32Array.from(r.lm);
  return { meta, rows };
}

async function poseRows(c) {
  const t0 = performance.now();
  const file = await (await fetch(await clipUrl(c.file))).blob();
  const r = await analyzeVideo(file, { poseOnly: true });
  const rows = r.rows.map(({ lm, ...rest }) => ({ ...rest, lm: lm ? Array.from(lm, (v) => Math.round(v * 1e4) / 1e4) : undefined }));
  await fetch(`/__save?name=${c.id}.rows.json`, { method: 'POST', body: JSON.stringify({ meta: { ...r.meta, clipId: c.id }, rows }) });
  log(`${c.id}: pose ${rows.length} frames, ${((performance.now() - t0) / 1000).toFixed(0)} s (${r.meta.delegate})`);
  for (const row of r.rows) if (row.lm && !(row.lm instanceof Float32Array)) row.lm = Float32Array.from(row.lm);
  return { meta: r.meta, rows: r.rows };
}

// Hand marks (analysed-pixel points) -> errors of the app's landmarks at the same frames, with the
// pipeline's own formulas (as test/annotation-compare.js).
function markErrors(rows, marks, slot) {
  const errs = {};
  const add = (k, app, man) => {
    if (Number.isFinite(app) && Number.isFinite(man)) (errs[k] ??= []).push(app - man);
  };
  const lateral = CLIP_SLOTS[slot].view === 'lateral';
  const near = CLIP_SLOTS[slot].leg === 'left' ? 'L' : 'R';
  for (const [idx, m] of Object.entries(marks.frames || {})) {
    const row = rows[Number(idx)];
    if (!row?.lm) continue;
    const man = new Float32Array(132).fill(NaN);
    const put = (k, p) => p && man.set([p[0], p[1], 0, 1], k * 4);
    if (lateral) {
      const ids = LANDMARKS[near];
      for (const [name, id] of Object.entries({ shoulder: 'sho', hip: 'hip', knee: 'knee', ankle: 'ank', heel: 'heel', toe: 'toe' })) for (const s of ['L', 'R']) put(LANDMARKS[s][id], m.points[name]);
      const app = Float32Array.from(row.lm);
      // Near side copied to the far side, so trunk midpoints use the same points as the marks.
      const far = near === 'L' ? 'R' : 'L';
      for (const k of Object.keys(LANDMARKS[near])) app.set(row.lm.subarray(LANDMARKS[near][k] * 4, LANDMARKS[near][k] * 4 + 4), LANDMARKS[far][k] * 4);
      const facing = row.facing ?? 1;
      const at = (r, k) => [r.lm[k * 4], r.lm[k * 4 + 1]];
      const A = { lm: app };
      const M = { lm: man };
      add('knee flexion', kneeFlexion(at(A, ids.hip), at(A, ids.knee), at(A, ids.ank)), kneeFlexion(at(M, ids.hip), at(M, ids.knee), at(M, ids.ank)));
      add('hip extension', hipExtensionSigned(at(A, ids.sho), at(A, ids.hip), at(A, ids.knee), facing), hipExtensionSigned(at(M, ids.sho), at(M, ids.hip), at(M, ids.knee), facing));
      add('tibial inclination', tibialInclination(A, ids, facing), tibialInclination(M, ids, facing));
      add('ankle dorsiflexion', ankleDorsiflexion(A, ids), ankleDorsiflexion(M, ids));
      add('trunk lean', trunkLean(A, facing), trunkLean(M, facing));
    } else {
      for (const s of ['L', 'R']) for (const [name, id] of Object.entries({ shoulder: 'sho', hip: 'hip', knee: 'knee', ankle: 'ank', heel: 'heel' })) put(LANDMARKS[s][id], m.points[`${s}_${name}`]);
      const stance = m.stance || 'L';
      for (const [k, fn] of Object.entries(POSTERIOR)) add(k, fn({ lm: row.lm }, stance), fn({ lm: man }, stance));
    }
  }
  return Object.fromEntries(
    Object.entries(errs).map(([k, e]) => [k, { n: e.length, bias: r1(e.reduce((a, b) => a + b, 0) / e.length), mae: r1(e.reduce((a, b) => a + Math.abs(b), 0) / e.length) }]),
  );
}

async function run() {
  const found = await (await fetch('../test-data/debug/revalidate-clips.json')).json().catch(() => ({ clips: [] }));
  // Inventory clips: the earlier benchmark session of each client; new clips: one session per code + date.
  const all = [
    ...CLIPS.map((c) => ({ ...c, date: 'benchmark', requested: null })),
    ...found.clips.map((c) => ({ id: `${c.code}_${c.date}_${c.view}`, client: c.code, date: c.date, file: c.file, speed: c.speed, speedUnit: c.speedUnit || 'mph', requested: VIEW_SLOT[c.view], heightCm: null })),
  ];
  const sessions = {};
  const clipsOut = [];
  for (const c of all) {
    let d = await cachedRows(c.id);
    if (!d) {
      try {
        d = await poseRows(c);
      } catch (e) {
        log(`${c.id}: pose failed: ${e.message}`);
        clipsOut.push({ id: c.id, client: c.client, date: c.date, error: e.message });
        continue;
      }
    }
    const det = detectView(d.rows);
    const slot = c.requested || det.slot;
    const heightCm = c.heightCm ?? CLIPS.find((x) => x.client === c.client && x.heightCm)?.heightCm ?? DEFAULT_HEIGHT;
    const { analysis } = processClip(d.rows, d.meta, slot, { heightCm });
    const q = analysis.captureQuality;
    const marksRes = await fetch(`../test-data/debug/marks_${c.id}.json`);
    const marks = marksRes.ok ? await marksRes.json() : null;
    clipsOut.push({
      id: c.id,
      client: c.client,
      date: c.date,
      slot,
      detected: det.slot,
      detectedAgrees: !c.requested || c.requested === det.slot,
      gate: { level: q.level, score: r1(q.score * 100) / 100, reasons: q.reasons, fixes: q.fixes },
      fps: r1(d.meta.fps),
      errors: marks ? markErrors(d.rows, marks, slot) : null,
    });
    const key = `${c.client}|${c.date}`;
    sessions[key] ??= { client: c.client, date: c.date, heightCm, clips: {} };
    sessions[key].clips[slot] = { analysis, speed: c.speed, speedUnit: c.speedUnit, incline: 1 };
    log(`${c.id}: ${slot} (detected ${det.slot}), video check ${q.level}`);
  }
  const sessionsOut = Object.values(sessions).map((s) => {
    const intake = { clientCode: s.client, sessionDate: s.date, heightValue: String(s.heightCm), heightUnit: 'cm', speedValue: '', incline: '1' };
    const rec = reconcileSession({ intake, clips: s.clips });
    const values = {};
    for (const [id, m] of Object.entries(rec.metrics)) for (const [k, c] of Object.entries(m.cells)) if (typeof c.value === 'number' && c.source) values[`${id}|${k}`] = { value: r1(c.value), view: c.source.slot, confidence: c.confidence };
    for (const x of rec.timing.crossChecks) if (x.reported != null) values[`${x.quantity}|`] = { value: r1(x.reported * (x.unit === 's' ? 1000 : 1)), view: x.source, confidence: x.confidence };
    const cov = coverage(s.clips, { exclude: ['ms_pelvic_drop'] });
    return { client: s.client, date: s.date, coverage: { signature: cov.signature, usable: cov.usable, share: r1(cov.share * 100) / 100, assessable: cov.assessable, total: cov.total }, values };
  });
  return { ranAt: new Date().toISOString(), clips: clipsOut, sessions: sessionsOut };
}

const out = await run().catch((e) => ({ error: e.stack || e.message }));
log(out.error ? `ERROR ${out.error}` : 'Done.');
window.__revalidate = out;
if (new URLSearchParams(location.search).has('headless')) await fetch('/__results', { method: 'POST', body: JSON.stringify(out) });

// Cross-runner benchmark (dev): runs every client in test/clips.js through pipeline -> reconcile ->
// presentation model, from cached landmarks (test-data/debug/<id>.rows.json) or committed fixtures,
// and summarises event detection, view agreement, confidence and range territory per metric.
import { CLIPS } from './clips.js';
import { unpackRows } from './fixture-io.js';
import { postProcess, postProcessRear } from '../js/pipeline/run.js';
import { toAnalysis } from '../js/pipeline/measurements.js';
import { toPosteriorAnalysis } from '../js/pipeline/posterior.js';
import { reconcileSession } from '../js/pipeline/reconcile.js';
import { mergeSession } from '../js/pipeline/session.js';
import { analyze } from '../js/engine/analysis.js';
import { buildModel } from '../js/presentation/model.js';
import { CLIP_SLOTS } from '../js/config.js';

const DEFAULT_HEIGHT = 170;

async function loadClip(c) {
  const fx = await fetch(`/test/fixtures/clips/${c.id}.lm.json`);
  if (fx.ok) return unpackRows(await fx.json());
  const res = await fetch(`/test-data/debug/${c.id}.rows.json`);
  if (!res.ok) return null;
  const { meta, rows } = await res.json();
  for (const r of rows) if (r.lm) r.lm = Float32Array.from(r.lm);
  return { meta, rows };
}

export async function runClient(client) {
  const own = CLIPS.filter((c) => c.client === client);
  const heightCm = own[0]?.heightCm ?? DEFAULT_HEIGHT;
  const clips = {};
  const errors = [];
  for (const c of own) {
    const d = await loadClip(c);
    if (!d) {
      errors.push(`${c.id}: no landmarks`);
      continue;
    }
    try {
      if (c.view === 'lateral') {
        const r = postProcess(d.rows, d.meta, {});
        const a = toAnalysis({ ...r, rows: d.rows, meta: d.meta }, { heightCm });
        clips[a.nearSide === 'left' ? 'lateral_left' : 'lateral_right'] = { analysis: a, speed: c.speed, speedUnit: c.speedUnit, incline: 1 };
      } else {
        const r = postProcessRear(d.rows, d.meta);
        clips.posterior = { analysis: toPosteriorAnalysis({ ...r, rows: d.rows, meta: d.meta }, { heightCm }), speed: c.speed, speedUnit: c.speedUnit, incline: 1 };
      }
    } catch (e) {
      errors.push(`${c.id}: ${e.message}`);
    }
  }
  const intake = { clientCode: client, sessionDate: 'benchmark', heightValue: String(heightCm), heightUnit: 'cm', speedValue: String(own[0]?.speed ?? ''), speedUnit: 'mph', incline: '1' };
  const reconciled = reconcileSession({ intake, clips });
  const session = { intake, clips, reconciled };
  session.views = [...new Set(Object.keys(clips).map((s) => CLIP_SLOTS[s].view))];
  session.analysis = mergeSession(clips);
  const results = analyze(session);
  const model = buildModel(session, results);
  return { client, heightCm, heightKnown: own[0]?.heightCm != null, clips, reconciled, model, errors };
}

export async function runAll(clients) {
  const list = clients || [...new Set(CLIPS.map((c) => c.client))];
  const out = [];
  for (const c of list) out.push(await runClient(c));
  return out;
}

// Per-metric territory across runners: normal / caution / flag (status shown), borderline (hedged
// within error or timing-sensitive), low confidence, not assessed.
export function territory(runs) {
  const t = {};
  for (const run of runs) {
    for (const s of run.model.sections) {
      for (const r of s.rows) {
        for (const c of Object.values(r.cells)) {
          const k = `${r.id}`;
          t[k] ??= { label: r.label, normal: 0, caution: 0, flag: 0, borderline: 0, low: 0, notAssessed: 0, values: [] };
          if (!c.assessed) t[k].notAssessed++;
          else if (c.status === 'green') t[k].normal++;
          else if (c.status === 'yellow') t[k].caution++;
          else if (c.status === 'red') t[k].flag++;
          else if (/^borderline|pending/.test(c.hedge || '')) t[k].borderline++;
          else t[k].low++;
          if (c.assessed && typeof c.value === 'number') t[k].values.push(c.value);
        }
      }
    }
  }
  return t;
}

// Regression on committed derived data (test/fixtures/clips/*.lm.json; no videos needed).
// For each client: unpack landmarks -> pipeline -> adapters -> reconciliation, then read the values
// listed in test/fixtures/expected.json and check each is within its tolerance.
// `computeAll()` is also used to (re)generate expected.json after an intended change.
import { CLIPS } from './clips.js';
import { unpackRows } from './fixture-io.js';
import { postProcess, postProcessRear } from '../js/pipeline/run.js';
import { toAnalysis } from '../js/pipeline/measurements.js';
import { toPosteriorAnalysis } from '../js/pipeline/posterior.js';
import { reconcileSession } from '../js/pipeline/reconcile.js';

export const HEIGHT_CM = 170; // fixed for the fixtures (clients' heights are not recorded)

export async function sessionFor(client, base = '') {
  const clips = {};
  for (const c of CLIPS.filter((x) => x.client === client)) {
    const fx = await (await fetch(`${base}fixtures/clips/${c.id}.lm.json`)).json();
    const { meta, rows } = unpackRows(fx);
    if (c.view === 'lateral') {
      const r = postProcess(rows, meta, {});
      const a = toAnalysis({ ...r, rows, meta }, { heightCm: HEIGHT_CM });
      clips[a.nearSide === 'left' ? 'lateral_left' : 'lateral_right'] = { analysis: a, speed: c.speed, speedUnit: c.speedUnit, incline: 1 };
    } else {
      const r = postProcessRear(rows, meta);
      clips.posterior = { analysis: toPosteriorAnalysis({ ...r, rows, meta }, { heightCm: HEIGHT_CM }), speed: c.speed, speedUnit: c.speedUnit, incline: 1 };
    }
  }
  const intake = { clientCode: client, sessionDate: 'fixture', heightValue: String(HEIGHT_CM), heightUnit: 'cm', speedValue: '', incline: '1' };
  return { intake, clips, result: reconcileSession({ intake, clips }) };
}

// Values tracked per client (paths into the reconciled result) and their tolerances.
export const TRACKED = [
  ['timing.crossChecks.cadence.reported', 2],
  ['timing.crossChecks.step time, left.reported', 0.02],
  ['timing.crossChecks.step time, right.reported', 0.02],
  ['timing.crossChecks.contact time.reported', 40],
  ['derived.stepLengthM', 0.05],
  ...['ic_knee_flexion', 'ms_max_knee_flexion', 'ic_tibial_inclination', 'ms_ankle', 'to_hip_extension', 'arm_elbow_angle'].flatMap((id) => [[`metrics.${id}.cells.left.value`, 3], [`metrics.${id}.cells.right.value`, 3]]),
  ...['ic_spine_lean', 'ms_spine_lean', 'ms_trunk_lateral_lean'].map((id) => [`metrics.${id}.cells.mid.value`, 2]),
  ...['ms_hip_adduction', 'ms_knee_varus_valgus', 'ms_pelvic_drop'].flatMap((id) => [[`metrics.${id}.cells.left.value`, 2], [`metrics.${id}.cells.right.value`, 2]]),
  ['metrics.ms_step_width.cells.mid.value', 2],
];

export function read(result, path) {
  const parts = path.split('.');
  let v = result;
  for (let i = 0; i < parts.length && v != null; i++) {
    const p = parts[i];
    if (Array.isArray(v) && p !== 'length') {
      // crossChecks: select by quantity name
      v = v.find((x) => x.quantity === p);
    } else v = v[p];
  }
  return v ?? null;
}

export async function computeAll(base = '') {
  const out = {};
  for (const client of [...new Set(CLIPS.map((c) => c.client))]) {
    const { result } = await sessionFor(client, base);
    out[client] = Object.fromEntries(TRACKED.map(([path, tol]) => [path, { value: read(result, path), tol }]));
  }
  return out;
}

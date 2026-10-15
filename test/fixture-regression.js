// Regression on committed derived data (test/fixtures/clips/*.lm.json; no videos needed).
// For each client: unpack landmarks -> pipeline -> adapters -> reconciliation, then read the values
// listed in test/fixtures/expected.json and check each is within its tolerance.
// `computeAll()` is also used to (re)generate expected.json after an intended change.
import { CLIPS } from './clips.js';
import { unpackRows } from './fixture-io.js';
import { reconcileSession } from '../js/pipeline/reconcile.js';
import { detectView } from '../js/pipeline/view-detect.js';
import { processClip } from '../js/pipeline/adapt.js';
import { deriveAngles } from '../js/pipeline/pose.js';

export const DEFAULT_HEIGHT_CM = 170; // when a client's height is not recorded (C0)

export async function sessionFor(client, base = '') {
  const clips = {};
  const own = CLIPS.filter((x) => x.client === client);
  const HEIGHT_CM = own[0]?.heightCm ?? DEFAULT_HEIGHT_CM;
  for (const c of own) {
    const fx = await (await fetch(`${base}fixtures/clips/${c.id}.lm.json`)).json();
    const { meta, rows } = unpackRows(fx);
    // Same path as the app: the view is detected from the pose, then processed for that slot.
    const slot = detectView(rows).slot;
    clips[slot] = { analysis: processClip(rows, meta, slot, { heightCm: HEIGHT_CM }).analysis, speed: c.speed, speedUnit: c.speedUnit, incline: 1, debug: { rows, meta } };
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

// Derived view fixtures (no video): from a validated runner's side and rear clips, build the views
// that were not filmed, so every view combination can be tested.
//   other side view: mirror x and swap left/right labels (the near leg becomes the other leg);
//   front view: mirror x and negate depth (the runner turned 180°), labels unchanged.
// These test the pipeline and presentation for each combination; they are not validation data.
const PAIRS = [[11, 12], [13, 14], [15, 16], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32], [1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [17, 18], [19, 20], [21, 22]];
export function deriveRows(rows, width, { swapLabels = false, negateZ = false } = {}) {
  return rows.map((r) => {
    if (!r.lm) return { ...r };
    const lm = Float32Array.from(r.lm);
    for (let k = 0; k < 33; k++) {
      lm[k * 4] = width - lm[k * 4];
      if (negateZ) lm[k * 4 + 2] = -lm[k * 4 + 2];
    }
    if (swapLabels) {
      for (const [a, b] of PAIRS) {
        for (let c = 0; c < 4; c++) {
          const t = lm[a * 4 + c];
          lm[a * 4 + c] = lm[b * 4 + c];
          lm[b * 4 + c] = t;
        }
      }
    }
    return deriveAngles({ ...r, lm });
  });
}

const cache = {};
// All four views for a client: the filmed ones plus derived ones. Returns { intake, clips, derived: [slots] }.
export async function fourViewSession(client = 'T3', base = '') {
  if (cache[client]) return cache[client];
  const own = CLIPS.filter((x) => x.client === client);
  const HEIGHT_CM = own[0]?.heightCm ?? DEFAULT_HEIGHT_CM;
  const load = async (id) => unpackRows(await (await fetch(`${base}fixtures/clips/${id}.lm.json`)).json());
  const side = await load(`${client}-side`);
  const rear = await load(`${client}-rear`);
  const sideSlot = detectView(side.rows).slot;
  const otherSlot = sideSlot === 'lateral_right' ? 'lateral_left' : 'lateral_right';
  const src = {
    [sideSlot]: side,
    [otherSlot]: { meta: side.meta, rows: deriveRows(side.rows, side.meta.analysedSize[0], { swapLabels: true }) },
    posterior: rear,
    anterior: { meta: rear.meta, rows: deriveRows(rear.rows, rear.meta.analysedSize[0], { negateZ: true }) },
  };
  const clips = {};
  const c0 = own.find((x) => x.view === 'lateral');
  for (const [slot, d] of Object.entries(src)) {
    clips[slot] = { analysis: processClip(d.rows, d.meta, slot, { heightCm: HEIGHT_CM }).analysis, speed: c0.speed, speedUnit: c0.speedUnit, incline: 1, debug: d, detected: detectView(d.rows).slot };
  }
  const intake = { clientCode: client, sessionDate: 'fixture', heightValue: String(HEIGHT_CM), heightUnit: 'cm', speedValue: String(c0.speed), speedUnit: 'mph', incline: '1' };
  return (cache[client] = { intake, clips, derived: [otherSlot, 'anterior'] });
}

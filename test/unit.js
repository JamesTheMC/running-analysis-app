// Browser unit tests (no dependencies): view-to-metric map enforcement and regression.
// Open test/unit.html on the dev server. window.__unit holds the results for automation.

import { METRICS, NOT_MEASURABLE, PATTERNS, VALIDATION } from '../js/config.js';
import { EMIT, ViewViolation, allowed, createEmitter } from '../js/pipeline/emit.js';
import { analyze } from '../js/engine/analysis.js';
import { buildInterpretation, buildSections } from '../js/engine/summary.js';
import { toAnalysis } from '../js/pipeline/measurements.js';
import { postProcess, postProcessRear } from '../js/pipeline/run.js';
import { applyHipAnchor, offsetOf } from '../js/pipeline/hip-anchor.js';
import { CANDIDATES } from './rear-midstance.js';

const out = document.getElementById('out');
const results = [];
let section = '';
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

function test(name, fn) {
  try {
    const detail = fn();
    results.push({ section, name, ok: true, detail });
  } catch (e) {
    results.push({ section, name, ok: false, detail: e.message });
  }
}
async function testAsync(name, fn) {
  try {
    const detail = await fn();
    results.push({ section, name, ok: detail !== 'skip', skip: detail === 'skip', detail: detail === 'skip' ? 'skipped' : detail });
  } catch (e) {
    results.push({ section, name, ok: false, detail: e.message });
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const byId = new Map(METRICS.map((m) => [m.id, m]));
const VIEWS = ['lateral', 'posterior'];

// ---------------------------------------------------------------------------
// The map, as written in reference/VIEW_MAP.md. Hard-coded so config cannot drift from it silently.
// ---------------------------------------------------------------------------
const LATERAL = [
  'ic_foot_strike', 'ic_foot_inclination', 'ic_tibial_inclination', 'ic_knee_flexion', 'ms_max_knee_flexion',
  'ms_knee_flexion_excursion', 'ic_foot_to_com', 'ic_spine_lean', 'ms_spine_lean', 'to_hip_extension',
  'trunk_change_peak_hip_ext', 'ms_ankle', 'ms_knee_ankle_sync', 'arm_elbow_angle', 'arm_shoulder_rom',
];
const POSTERIOR = [
  'ms_hip_adduction', 'ms_pelvic_drop', 'ms_knee_varus_valgus', 'ms_trunk_lateral_lean', 'ms_lateral_shift',
  'ms_spine_shift', 'ms_foot_midline', 'ms_crossover', 'ms_out_toe', 'ms_achilles_angle', 'ms_rearfoot_eversion',
];
// "Never compute from a posterior clip": sagittal metrics.
const NEVER_POSTERIOR = [
  'to_hip_extension', 'ic_knee_flexion', 'ms_max_knee_flexion', 'ms_knee_flexion_excursion', 'ic_spine_lean',
  'ms_spine_lean', 'ic_tibial_inclination', 'ic_foot_strike', 'ic_foot_inclination', 'ic_foot_to_com', 'ms_ankle',
  'trunk_change_peak_hip_ext',
];
// "Never compute from a lateral clip": frontal-plane metrics.
const NEVER_LATERAL = ['ms_hip_adduction', 'ms_pelvic_drop', 'ms_knee_varus_valgus', 'ms_lateral_shift', 'ms_trunk_lateral_lean', 'ms_crossover', 'ms_foot_midline', 'ms_spine_shift'];
const NOT_BUILT = ['ms_rearfoot_eversion', 'ms_achilles_angle', 'ms_out_toe'];
const CAPS = {
  ic_knee_flexion: 'high', ic_tibial_inclination: 'high', ms_hip_adduction: 'medium', ms_pelvic_drop: 'low',
  ms_knee_varus_valgus: 'low', to_hip_extension: 'medium', ic_foot_strike: 'low', ic_foot_inclination: 'low',
};
const UNSCORED = ['to_hip_extension', 'ic_foot_strike', 'ms_knee_flexion_excursion'];

section = 'Map and config';
test('every metric declares allowedViews from {lateral, posterior}', () => {
  for (const m of METRICS) {
    assert(Array.isArray(m.allowedViews) && m.allowedViews.length, `${m.id}: no allowedViews`);
    for (const v of m.allowedViews) assert(VIEWS.includes(v), `${m.id}: unknown view ${v}`);
    assert(!('view' in m), `${m.id}: legacy 'view' field`);
  }
  return `${METRICS.length} metrics`;
});
test('lateral metrics in config match VIEW_MAP.md exactly', () => {
  const cfg = METRICS.filter((m) => m.allowedViews.includes('lateral')).map((m) => m.id).sort();
  assert(JSON.stringify(cfg) === JSON.stringify([...LATERAL].sort()), `config: ${cfg.join(', ')}`);
  return `${cfg.length} metrics`;
});
test('posterior metrics in config match VIEW_MAP.md exactly', () => {
  const cfg = METRICS.filter((m) => m.allowedViews.includes('posterior')).map((m) => m.id).sort();
  assert(JSON.stringify(cfg) === JSON.stringify([...POSTERIOR].sort()), `config: ${cfg.join(', ')}`);
  return `${cfg.length} metrics`;
});
test('never from a posterior clip: sagittal metrics', () => {
  for (const id of NEVER_POSTERIOR) assert(!byId.get(id).allowedViews.includes('posterior'), `${id} allows posterior`);
  return `${NEVER_POSTERIOR.length} checked`;
});
test('never from a lateral clip: frontal-plane metrics', () => {
  for (const id of NEVER_LATERAL) assert(!byId.get(id).allowedViews.includes('lateral'), `${id} allows lateral`);
  return `${NEVER_LATERAL.length} checked`;
});
test('rearfoot eversion, Achilles angle, out-toe are not built', () => {
  for (const id of NOT_BUILT) assert(byId.get(id).status === 'not-built', `${id}: status ${byId.get(id).status}`);
});
test('pelvic tilt, lordosis, transverse plane listed as not measurable', () => {
  const t = NOT_MEASURABLE.join(' ').toLowerCase();
  for (const w of ['pelvic tilt', 'lordosis', 'transverse']) assert(t.includes(w), `missing ${w}`);
});
test('confidence caps by view', () => {
  for (const [id, cap] of Object.entries(CAPS)) assert(byId.get(id).baselineConfidence === cap, `${id}: ${byId.get(id).baselineConfidence} (want ${cap})`);
});
test('unscored metrics', () => {
  for (const id of UNSCORED) assert(byId.get(id).scored === false, `${id} is scored`);
});

// ---------------------------------------------------------------------------
section = 'Emitter guard (pipeline choke point)';
test('every metric × view: disallowed or unbuilt values are refused', () => {
  EMIT.strict = true;
  let refused = 0;
  let accepted = 0;
  for (const m of METRICS) {
    for (const v of VIEWS) {
      const e = createEmitter(v);
      let threw = false;
      try {
        e.put(m.id, 'left', { value: 1, quality: 1 });
      } catch (err) {
        threw = err instanceof ViewViolation;
      }
      const ok = (m.status ?? 'built') === 'built' && m.allowedViews.includes(v);
      assert(threw === !ok, `${m.id} from ${v}: ${threw ? 'refused' : 'accepted'} (expected ${ok ? 'accepted' : 'refused'})`);
      if (threw) refused++;
      else accepted++;
    }
  }
  return `${accepted} accepted, ${refused} refused`;
});
test('non-strict mode drops and records the violation', () => {
  EMIT.strict = false;
  const e = createEmitter('lateral');
  const err = console.error;
  console.error = () => {};
  const okPut = e.put('ms_hip_adduction', 'left', { value: 5, quality: 1 });
  console.error = err;
  EMIT.strict = true;
  assert(okPut === false && !e.measurements.ms_hip_adduction && e.violations.length === 1, 'value was not dropped');
});

// ---------------------------------------------------------------------------
section = 'Engine enforcement';
const baseIntake = { clientCode: 'T', sessionDate: '2026-10-07', filmedFrom: 'left', heightValue: '170', heightUnit: 'cm' };
test('a value from a disallowed view is never shown (every built metric)', () => {
  let n = 0;
  for (const m of METRICS.filter((x) => (x.status ?? 'built') === 'built')) {
    for (const v of VIEWS.filter((x) => !m.allowedViews.includes(x))) {
      const key = m.sided === 'lr' ? 'left' : m.sided === 'near' ? 'near' : 'mid';
      const measurements = { [m.id]: { [key]: { value: 10, quality: 0.95, source: { view: v } } } };
      const res = analyze({ intake: baseIntake, views: VIEWS, analysis: { source: 'pipeline', measurements } });
      const c = res.rowsById[m.id].cells[key];
      assert(!c.assessed && c.value == null && c.reason === 'not assessed from this view', `${m.id} from ${v}: ${JSON.stringify(c)}`);
      assert(res.viewViolations.some((x) => x.metricId === m.id), `${m.id}: violation not recorded`);
      n++;
    }
  }
  return `${n} disallowed combinations checked`;
});
test('a pipeline value without a source is refused', () => {
  const measurements = { ic_knee_flexion: { left: { value: 20, quality: 0.95 } } };
  const res = analyze({ intake: baseIntake, views: VIEWS, analysis: { source: 'pipeline', measurements } });
  const c = res.rowsById.ic_knee_flexion.cells.left;
  assert(!c.assessed && c.reason === 'not assessed from this view', JSON.stringify(c));
});
test('missing view: posterior metrics need a posterior clip', () => {
  const res = analyze({ intake: baseIntake, views: ['lateral'], analysis: { source: 'pipeline', measurements: {} } });
  const c = res.rowsById.ms_hip_adduction.cells.left;
  // Planned posterior metrics report their build status before the missing view.
  assert(!c.assessed && c.value == null, JSON.stringify(c));
});

// ---------------------------------------------------------------------------
section = 'Lateral adapter (synthetic fixture, near leg = left)';
const sum = (median, n = 20, total = 25) => ({ median, iqr: [median - 1, median + 1], n, total, quality: n / total });
function fixture() {
  const keys = ['kneeIC', 'maxStanceKnee', 'kneeExcursion', 'tibialIC', 'footInclIC', 'ankleDFms', 'footToComPx', 'footToComShoe', 'trunkIC', 'trunkMS', 'trunkChange'];
  const summary = (base) => Object.fromEntries(keys.map((k, i) => [k, sum(base + i)]));
  return {
    seg: { near: { side: 'L', source: 'given' }, cycles: Array.from({ length: 25 }, () => ({ windows: {} })) },
    hipExt: { L: { median: 12, iqr: [10, 14], n: 20, total: 25, rising: 2 }, R: { median: 30, iqr: [28, 32], n: 20, total: 25, rising: 0 } },
    hipWindows: [{ end: 'late-stance', median: 12, n: 20, total: 25, rising: 0 }, { end: 0.05, median: 12, n: 20, total: 25, rising: 2 }],
    rows: Array.from({ length: 50 }, () => ({ elbow_L: 70, elbow_R: 90 })),
    bad: Array(50).fill(false),
    meta: {},
    metrics: { L: { summary: summary(10) }, R: { summary: summary(100) }, shoulderSwing: sum(60), bodyHeightPx: 500 },
    sweep: Object.fromEntries([0.2, 0.3, 0.4].map((t) => [t, { L: { summary: summary(10) } }])),
    cadence: { spm: 164 },
    events: { L: { footLength: 60 } },
  };
}
test('adapter emits only lateral-allowed metrics, near leg only (strict mode)', () => {
  EMIT.strict = true;
  const a = toAnalysis(fixture(), { heightCm: 170 });
  const ids = Object.keys(a.measurements);
  for (const id of ids) assert(allowed(id, 'lateral'), `${id} not allowed from lateral`);
  for (const [id, cells] of Object.entries(a.measurements)) {
    assert(!('right' in cells), `${id}: far-leg (right) value emitted`);
    for (const c of Object.values(cells)) assert(c.source?.view === 'lateral', `${id}: missing lateral source`);
  }
  assert(JSON.stringify(a.lateralLegs) === '["left"]', `lateralLegs ${a.lateralLegs}`);
  assert(a.violations.length === 0, `${a.violations.length} violations`);
  return `${ids.length} metrics emitted`;
});
test('engine: other leg reads "needs a lateral clip filmed from the right"', () => {
  const a = toAnalysis(fixture(), { heightCm: 170 });
  const res = analyze({ intake: baseIntake, views: ['lateral'], analysis: a });
  const lateralLr = res.rows.filter((r) => r.def.sided === 'lr' && r.def.allowedViews.includes('lateral') && (r.def.status ?? 'built') === 'built');
  for (const r of lateralLr) {
    const c = r.cells.right;
    assert(!c.assessed && c.value == null && c.reason === 'needs a lateral clip filmed from the right', `${r.def.id}: ${c.reason}`);
  }
  assert(res.viewViolations.length === 0, 'violations');
  return `${lateralLr.length} right-leg cells`;
});
test('foot strike: category changes across the IC sweep → IC-sensitive, unscored', () => {
  const f = fixture();
  f.metrics.L.summary.footInclIC = sum(6.9);
  f.sweep[0.2].L.summary.footInclIC = sum(3.1);
  f.sweep[0.3].L.summary.footInclIC = sum(6.9);
  f.sweep[0.4].L.summary.footInclIC = sum(14.8);
  const res = analyze({ intake: baseIntake, views: ['lateral'], analysis: toAnalysis(f, {}) });
  const c = res.rowsById.ic_foot_strike.cells.left;
  assert(c.status === 'ic-sensitive' && c.weight == null && /^non-rearfoot \/ rearfoot, /.test(c.display), JSON.stringify({ s: c.status, d: c.display, w: c.weight }));
  return c.display;
});
test('foot strike: stable category → shown, unscored', () => {
  const f = fixture();
  for (const t of [0.2, 0.3, 0.4]) f.sweep[t].L.summary.footInclIC = sum(10 + t * 10);
  f.metrics.L.summary.footInclIC = sum(12);
  const res = analyze({ intake: baseIntake, views: ['lateral'], analysis: toAnalysis(f, {}) });
  const c = res.rowsById.ic_foot_strike.cells.left;
  assert(c.assessed && c.category === 'rearfoot' && c.weight == null, JSON.stringify({ cat: c.category, w: c.weight, s: c.status }));
  return c.display;
});
test('hip extension is never scored', () => {
  const res = analyze({ intake: baseIntake, views: ['lateral'], analysis: toAnalysis(fixture(), {}) });
  const c = res.rowsById.to_hip_extension.cells.left;
  assert(c.assessed && c.weight == null, JSON.stringify({ s: c.status, w: c.weight }));
});

// ---------------------------------------------------------------------------
section = 'Hip extension validation flag';
function lowHipFixture() {
  const f = fixture();
  f.hipExt.L = { median: 3, iqr: [2, 4], n: 20, total: 25, rising: 1 };
  f.hipWindows = [{ end: 'late-stance', median: 3.5, n: 20, total: 25, rising: 0 }, { end: 0.05, median: 3, n: 20, total: 25, rising: 1 }];
  return f;
}
const fastCadence = { ...baseIntake, cadence: '200' }; // limited-hip-extension "any" trigger: cadence above 190
test('flag defaults to false', () => {
  assert(VALIDATION.hipExtensionValidated === false, `hipExtensionValidated = ${VALIDATION.hipExtensionValidated}`);
  assert(PATTERNS.find((p) => p.id === 'limited_hip_extension').requiresValidation === 'hipExtensionValidated', 'pattern not gated');
});
test('unvalidated: below 5° is informational only (no flag, score, prompt or pattern)', () => {
  const res = analyze({ intake: fastCadence, views: ['lateral'], analysis: toAnalysis(lowHipFixture(), {}) });
  const c = res.rowsById.to_hip_extension.cells.left;
  assert(c.status === 'pending-validation' && c.weight == null && !c.prompt, JSON.stringify({ s: c.status, w: c.weight, p: c.prompt }));
  assert(!res.patterns.some((p) => p.def.id === 'limited_hip_extension'), 'limited hip extension pattern fired');
  const text = buildInterpretation(res, fastCadence);
  assert(text.includes('Hip extension below 5°: pending validation'), 'informational line missing');
  assert(!/limited hip extension/i.test(text), 'pattern text present');
  return text.split('\n\n').find((p) => p.includes('pending validation'));
});
test('validated: the pattern can fire again', () => {
  VALIDATION.hipExtensionValidated = true;
  try {
    const res = analyze({ intake: fastCadence, views: ['lateral'], analysis: toAnalysis(lowHipFixture(), {}) });
    const c = res.rowsById.to_hip_extension.cells.left;
    assert(c.status === 'red', `status ${c.status}`);
    assert(res.patterns.some((p) => p.def.id === 'limited_hip_extension'), 'pattern did not fire');
  } finally {
    VALIDATION.hipExtensionValidated = false;
  }
});

section = 'Summary and wording';
test('foot-to-COM is in the ANKLE section, after tibial inclination', () => {
  const res = analyze({ intake: baseIntake, views: ['lateral'], analysis: toAnalysis(fixture(), { heightCm: 170 }) });
  const ankle = buildSections(res, baseIntake).find((x) => x.title === 'ANKLE').lines;
  const iT = ankle.findIndex((l) => l.startsWith('Tibial inclination'));
  const iF = ankle.findIndex((l) => l.startsWith('Foot-to-COM'));
  assert(iT >= 0 && iF === iT + 1, ankle.join(' | '));
  return ankle[iF];
});
test('no load-prediction language for foot or tibial inclination', () => {
  const LOAD = /load|impact|braking|shock|injur/i;
  const ids = ['ic_foot_strike', 'ic_foot_inclination', 'ic_tibial_inclination'];
  for (const id of ids) {
    const d = byId.get(id);
    for (const t of [d.label, d.summaryLabel, d.note, d.greenText, d.redText].filter(Boolean)) assert(!LOAD.test(t), `${id}: "${t}"`);
  }
  for (const p of PATTERNS) {
    const uses = [...p.all, ...p.any].filter((t) => ids.includes(t.metric));
    if (uses.length) for (const t of [p.label, ...p.considerations, ...uses.map((u) => u.text)]) assert(!LOAD.test(t), `${p.id}: "${t}"`);
  }
  const res = analyze({ intake: baseIntake, views: ['lateral'], analysis: toAnalysis(fixture(), { heightCm: 170 }) });
  const lines = buildSections(res, baseIntake).find((x) => x.title === 'ANKLE').lines.join(' ');
  assert(!LOAD.test(lines), `summary: ${lines}`);
});

// ---------------------------------------------------------------------------
section = 'Hip anchor';
function syntheticRow() {
  // Side view, runner facing -x: shoulder above hip, thigh straight down, knee and ankle below.
  const lm = new Float32Array(132);
  const put = (k, x, y) => lm.set([x, y, 0, 1], k * 4);
  for (const [k, x, y] of [[11, 200, 100], [12, 205, 100], [23, 200, 300], [24, 205, 300], [25, 200, 400], [26, 205, 400], [27, 200, 500], [28, 205, 500]]) put(k, x, y);
  return { frame: 0, facing: -1, lm };
}
test('offset sign: a point behind the hip gives a negative perpendicular offset', () => {
  const row = syntheticRow();
  const o = offsetOf(row, 'L', -1, [210, 300]); // +x = behind when facing -x
  assert(Math.abs(o.along) < 1e-9 && Math.abs(o.perp + 0.1) < 1e-9, JSON.stringify(o));
});
test('zero offset leaves every hip-dependent angle unchanged', () => {
  const row = syntheticRow();
  const [c] = applyHipAnchor([row], 'L', -1, { along: 0, perp: 0 });
  for (let k = 0; k < 132; k++) assert(c.lm[k] === row.lm[k], `lm[${k}] changed`);
});
await testAsync('corrected mode matches its fixture (IMG_0639_2)', async () => {
  const res = await fetch('../test-data/debug/IMG_0639_2.rows.json');
  if (!res.ok) return 'skip';
  const fx = await (await fetch('fixtures/IMG_0639_2.corrected.json')).json();
  const { meta, rows } = await res.json();
  for (const r of rows) if (r.lm) r.lm = Float32Array.from(r.lm);
  const r = postProcess(rows, meta, { nearSide: fx.near, hipAnchor: fx.hipAnchor });
  for (const [k, v] of Object.entries(fx.metrics)) assert(Math.abs(r.metrics[fx.near].summary[k].median - v.median) < 1e-9, `${k} changed`);
  for (const h of fx.hipExtension) assert(Math.abs(r.hipWindows.find((w) => w.end === h.end).median - h.median) < 1e-9, `hip ext ${h.end} changed`);
  return `offset ${JSON.stringify(fx.hipAnchor.offset)} (${fx.offsetSource})`;
});

// ---------------------------------------------------------------------------
section = 'Posterior symmetry (mirror x and swap left/right)';
const PAIRS = [[1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32]];
const swapIdx = Array.from({ length: 33 }, (_, i) => i);
for (const [a, b] of PAIRS) [swapIdx[a], swapIdx[b]] = [b, a];
const mirrorRow = (row, W) => {
  if (!row.lm) return row;
  const lm = new Float32Array(132);
  for (let k = 0; k < 33; k++) {
    const s = swapIdx[k];
    lm.set([W - row.lm[s * 4], row.lm[s * 4 + 1], row.lm[s * 4 + 2], row.lm[s * 4 + 3]], k * 4);
  }
  return { ...row, lm };
};
test('synthetic asymmetric pose: every candidate equals the mirrored other leg', () => {
  const lm = new Float32Array(132);
  const put = (k, x, y) => lm.set([x, y, 0, 1], k * 4);
  // Rear view, left on image left; deliberately asymmetric (tilted pelvis, knee in, heel out).
  for (const [k, x, y] of [[11, 180, 100], [12, 260, 104], [23, 195, 300], [24, 255, 292], [25, 215, 400], [26, 250, 395], [27, 205, 500], [28, 262, 497], [29, 200, 520], [30, 268, 515], [31, 207, 530], [32, 262, 527]]) put(k, x, y);
  const row = { lm };
  const m = mirrorRow(row, 480);
  for (const [name, fn] of Object.entries(CANDIDATES)) {
    for (const [a, b] of [['L', 'R'], ['R', 'L']]) {
      const d = Math.abs(fn(row, a) - fn(m, b));
      assert(d < 1e-4, `${name} ${a}: ${fn(row, a)} vs mirrored ${b}: ${fn(m, b)}`);
    }
  }
});
await testAsync('cached IMG_0640: candidates and midstance swap legs exactly under mirroring', async () => {
  const res = await fetch('../test-data/debug/IMG_0640.rows.json');
  if (!res.ok) return 'skip';
  const { meta, rows } = await res.json();
  for (const r of rows) if (r.lm) r.lm = Float32Array.from(r.lm);
  const W = meta.analysedSize[0];
  const a = postProcessRear(rows, meta);
  const mrows = rows.map((r) => mirrorRow(r, W));
  const b = postProcessRear(mrows, meta);
  let worst = 0;
  for (const [sd, other] of [['L', 'R'], ['R', 'L']]) {
    const fa = a.midstancePelvis[sd].filter((h) => h.valid).map((h) => h.ms);
    const fb = b.midstancePelvis[other].filter((h) => h.valid).map((h) => h.ms);
    assert(JSON.stringify(fa) === JSON.stringify(fb), `midstance frames differ for ${sd}`);
    for (const fn of Object.values(CANDIDATES)) for (const i of fa) worst = Math.max(worst, Math.abs(fn(rows[i], sd) - fn(mrows[i], other)));
  }
  assert(worst < 1e-3, `max difference ${worst}`);
  return `max per-frame difference ${worst.toExponential(1)}`;
});

// ---------------------------------------------------------------------------
section = 'Regression (cached IMG_0639_2 landmarks vs pre-refactor baseline)';
const regression = { rows: [] };
await testAsync('near-leg metrics match the pre-refactor values', async () => {
  const res = await fetch('../test-data/debug/IMG_0639_2.rows.json');
  if (!res.ok) return 'skip';
  const base = await (await fetch('fixtures/IMG_0639_2.baseline.json')).json();
  const { meta, rows } = await res.json();
  for (const r of rows) if (r.lm) r.lm = Float32Array.from(r.lm);
  const r = postProcess(rows, meta, { nearSide: base.near });
  const now = r.metrics[base.near].summary;
  const tol = 1e-9;
  let fails = 0;
  const add = (name, before, after) => {
    const d = before == null || after == null ? null : after - before;
    const ok = d != null && Math.abs(d) < tol;
    if (!ok) fails++;
    regression.rows.push({ name, before, after, d, ok });
  };
  for (const k of Object.keys(base.metrics)) {
    add(`${k} median`, base.metrics[k].median, now[k].median);
    add(`${k} n`, base.metrics[k].n, now[k].n);
  }
  for (const t of Object.keys(base.icSweep)) for (const k of ['kneeIC', 'tibialIC', 'footInclIC', 'footToComShoe', 'trunkIC']) add(`${k} @ tol ${t}`, base.icSweep[t][k], r.sweep[t][base.near].summary[k].median);
  add('shoulder swing median', base.shoulderSwing.median, r.metrics.shoulderSwing.median);
  add('body height (px)', base.bodyHeightPx, r.metrics.bodyHeightPx);
  for (const h of base.hipExtension) {
    const w = r.hipWindows.find((x) => x.end === h.end);
    add(`hip extension, window ${h.end === 'late-stance' ? 'late stance' : `TO+${h.end * 1000} ms`}`, h.median, w?.median);
  }
  add('valid near-leg strides', base.events.valid, r.events[base.near].validCount);
  assert(fails === 0, `${fails} value(s) changed`);
  return `${regression.rows.length} values identical`;
});

// ---------------------------------------------------------------------------
EMIT.strict = false;
const fails = results.filter((r) => !r.ok && !r.skip);
const skips = results.filter((r) => r.skip);
document.getElementById('summary').innerHTML =
  fails.length === 0 ? `<span class="pass">All ${results.length - skips.length} tests passed${skips.length ? ` (${skips.length} skipped)` : ''}.</span>` : `<span class="fail">${fails.length} of ${results.length} tests failed.</span>`;
const sections = [...new Set(results.map((r) => r.section))];
out.innerHTML = sections
  .map(
    (s) => `<h2>${esc(s)}</h2><table>${results
      .filter((r) => r.section === s)
      .map((r) => `<tr><td class="${r.skip ? 'skip' : r.ok ? 'pass' : 'fail'}">${r.skip ? 'SKIP' : r.ok ? 'PASS' : 'FAIL'}</td><td>${esc(r.name)}</td><td class="muted">${esc(r.detail ?? '')}</td></tr>`)
      .join('')}</table>`,
  )
  .join('');
if (regression.rows.length) {
  const f = (v) => (v == null ? '–' : Number.isInteger(v) ? String(v) : v.toFixed(4));
  out.insertAdjacentHTML(
    'beforeend',
    `<h2>Regression: before / after</h2><table><tr><th>Value</th><th>Before</th><th>After</th><th>Δ</th><th></th></tr>${regression.rows
      .map((x) => `<tr><td>${esc(x.name)}</td><td>${f(x.before)}</td><td>${f(x.after)}</td><td>${x.d == null ? '–' : x.d.toExponential(1)}</td><td class="${x.ok ? 'pass' : 'fail'}">${x.ok ? 'same' : 'CHANGED'}</td></tr>`)
      .join('')}</table>`,
  );
}
window.__unit = { results, regression, passed: fails.length === 0 };

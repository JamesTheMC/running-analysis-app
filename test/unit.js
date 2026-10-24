// Browser unit tests (no dependencies): view-to-metric map enforcement and regression.
// Open test/unit.html on the dev server. window.__unit holds the results for automation.

import { METRICS, NOT_MEASURABLE, PATTERNS, VALIDATION } from '../js/config.js';
import { EMIT, ViewViolation, allowed, createEmitter } from '../js/pipeline/emit.js';
import { analyze } from '../js/engine/analysis.js';
import { buildInterpretation, buildSections } from '../js/engine/summary.js';
import { toAnalysis } from '../js/pipeline/measurements.js';
import { postProcess, postProcessRear } from '../js/pipeline/run.js';
import { estimatePeriod } from '../js/pipeline/strides.js';
import { orientationFromMatrix } from '../js/pipeline/mp4.js';
import { cadenceFromDurations } from '../js/pipeline/metrics.js';
import { applyHipAnchor, applyLegAnchor, offsetOf } from '../js/pipeline/hip-anchor.js';
import { LEG_ANCHOR } from '../js/config.js';
import { CANDIDATES } from './rear-midstance.js';
import { mergeSession } from '../js/pipeline/session.js';
import { POSTERIOR as POSTERIOR_MEASURES, pelvisDropAngle } from '../js/pipeline/posterior-metrics.js';
import { toPosteriorAnalysis } from '../js/pipeline/posterior.js';

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
  'ms_step_width', 'arm_crossover',
];
// "Never compute from a posterior clip": sagittal metrics.
const NEVER_POSTERIOR = [
  'to_hip_extension', 'ic_knee_flexion', 'ms_max_knee_flexion', 'ms_knee_flexion_excursion', 'ic_spine_lean',
  'ms_spine_lean', 'ic_tibial_inclination', 'ic_foot_strike', 'ic_foot_inclination', 'ic_foot_to_com', 'ms_ankle',
  'trunk_change_peak_hip_ext',
];
// "Never compute from a lateral clip": frontal-plane metrics.
const NEVER_LATERAL = ['ms_hip_adduction', 'ms_pelvic_drop', 'ms_knee_varus_valgus', 'ms_lateral_shift', 'ms_trunk_lateral_lean', 'ms_crossover', 'ms_foot_midline', 'ms_spine_shift', 'ms_step_width', 'arm_crossover'];
const NOT_BUILT = ['ms_rearfoot_eversion', 'ms_achilles_angle', 'ms_out_toe'];
const CAPS = {
  ic_knee_flexion: 'medium', ic_tibial_inclination: 'medium', ms_hip_adduction: 'medium', ms_pelvic_drop: 'low',
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
const sum = (median, n = 20, total = 25) => ({ median, mean: median, iqr: [median - 1, median + 1], n, total, quality: n / total });
function fixture(near = 'L', base = 10) {
  const keys = ['kneeIC', 'maxStanceKnee', 'kneeExcursion', 'tibialIC', 'footInclIC', 'ankleDFms', 'footToComPx', 'footToComShoe', 'trunkIC', 'trunkMS', 'trunkChange'];
  const summary = (b) => ({ ...Object.fromEntries(keys.map((k, i) => [k, sum(b + i)])), kneeAnkleSync: sum(0.8) });
  return {
    seg: { near: { side: near, source: 'given' }, cycles: Array.from({ length: 25 }, () => ({ windows: {} })) },
    hipExt: { [near]: { median: 12, iqr: [10, 14], n: 20, total: 25, rising: 2 } },
    hipWindows: [{ end: 'late-stance', median: 12, n: 20, total: 25, rising: 0 }, { end: 0.05, median: 12, n: 20, total: 25, rising: 2 }],
    rows: Array.from({ length: 50 }, () => ({ [`elbow_${near}`]: 70 })),
    bad: Array(50).fill(false),
    meta: {},
    metrics: { [near]: { summary: summary(base) }, shoulderSwing: sum(60), bodyHeightPx: 500 },
    sweep: Object.fromEntries([0.2, 0.3, 0.4].map((t) => [t, { [near]: { summary: summary(base) } }])),
    cadence: { spm: 164 },
    events: { [near]: { footLength: 60 } },
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
test('engine: other leg reads "needs the right side view"', () => {
  const a = toAnalysis(fixture(), { heightCm: 170 });
  const res = analyze({ intake: baseIntake, views: ['lateral'], analysis: a });
  const lateralLr = res.rows.filter((r) => r.def.sided === 'lr' && r.def.allowedViews.includes('lateral') && (r.def.status ?? 'built') === 'built');
  for (const r of lateralLr) {
    const c = r.cells.right;
    assert(!c.assessed && c.value == null && c.reason === 'needs the right side view', `${r.def.id}: ${c.reason}`);
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
section = 'Session: two lateral clips + posterior';
test('left-side and right-side clips supply each leg; midline combined; L/R difference on separate clips', () => {
  const left = toAnalysis(fixture('L', 10), { heightCm: 170 });
  const right = toAnalysis(fixture('R', 14), { heightCm: 170 });
  const merged = mergeSession({
    lateral_left: { analysis: left, speed: '6.5', speedUnit: 'mph', incline: '1' },
    lateral_right: { analysis: right, speed: '7.0', speedUnit: 'mph', incline: '1' },
  });
  const res = analyze({ intake: baseIntake, views: ['lateral'], analysis: merged });
  const knee = res.rowsById.ic_knee_flexion;
  assert(knee.cells.left.assessed && knee.cells.right.assessed, 'both legs not assessed');
  assert(knee.cells.left.source.filmedFrom === 'left' && knee.cells.right.source.filmedFrom === 'right', 'wrong clip provenance');
  assert(knee.asymmetry?.separateClips === true, 'L/R difference not labelled separate clips');
  const arm = res.rowsById.arm_elbow_angle;
  assert(arm.cells.left.assessed && arm.cells.right.assessed, 'arms not bilateral');
  const trunk = res.rowsById.ic_spine_lean.cells.mid;
  // trunkIC medians are base + 8: 18 (left clip) and 22 (right clip), equal strides -> 20, differ by 4 > 3
  assert(Math.abs(trunk.value - 20) < 1e-9 && /differ/.test(trunk.note || ''), JSON.stringify({ v: trunk.value, note: trunk.note }));
  assert(merged.sessionWarnings.some((w) => /speed differs/.test(w)), 'no speed warning');
  return `${merged.sessionWarnings.length} warning(s)`;
});
test('knee/ankle sync: share of strides in sync → yes/no', () => {
  const res = analyze({ intake: baseIntake, views: ['lateral'], analysis: mergeSession({ lateral_left: { analysis: toAnalysis(fixture(), {}) } }) });
  const c = res.rowsById.ms_knee_ankle_sync.cells.left;
  assert(c.assessed && c.value === true && /80% of strides/.test(c.display), JSON.stringify({ v: c.value, d: c.display }));
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

section = 'Intake feeds the analysis (height, speed, incline, cadence)';
const intakeRun = (intake, { heightCm = 170, footPx } = {}) => {
  const f = fixture();
  if (footPx != null) for (const m of [f.metrics, ...Object.values(f.sweep)]) m.L.summary.footToComPx = sum(footPx);
  const res = analyze({ intake, views: ['lateral'], analysis: mergeSession({ lateral_left: { analysis: toAnalysis(f, { heightCm }) } }) });
  return { res, text: buildInterpretation(res, intake) };
};
test('height: foot-to-COM scored in cm with height, unscored (shoe lengths) without', () => {
  const withH = intakeRun(baseIntake).res.rowsById.ic_foot_to_com.cells.left;
  const noH = intakeRun({ ...baseIntake, heightValue: '' }, { heightCm: null }).res.rowsById.ic_foot_to_com.cells.left;
  assert(withH.assessed && / cm /.test(withH.display), JSON.stringify(withH));
  assert(!noH.assessed && /height/.test(noH.reason) && /shoe lengths/.test(noH.reason), JSON.stringify(noH));
  return `${withH.display} | without height: ${noH.reason}`;
});
test('speed: step length = speed / step rate, from the entered speed', () => {
  const a = intakeRun({ ...baseIntake, speedValue: '6.5', speedUnit: 'mph' }).text;
  const b = intakeRun({ ...baseIntake, speedValue: '12', speedUnit: 'km/h' }).text;
  // 6.5 mph = 2.906 m/s at 164 spm (video) -> 1.06 m; 12 km/h = 3.333 m/s -> 1.22 m
  assert(/Step length is about 1\.06 m/.test(a), a);
  assert(/Step length is about 1\.22 m/.test(b), b);
  assert(!/Step length/.test(intakeRun(baseIntake).text), 'step length without speed');
});
test('cadence: entered cadence is used and triggers the overstride pattern (with low knee flexion at IC)', () => {
  const intake = { ...baseIntake, speedValue: '10', speedUnit: 'km/h', cadence: '150' };
  const { res, text } = intakeRun(intake, { footPx: 60 }); // 60 px / (500/170) = 20.4 cm
  assert(res.patterns.some((p) => p.def.id === 'overstride'), res.patterns.map((p) => p.def.id).join());
  assert(/150 steps\/min \(entered\)/.test(text) && /from about 150 to 158–165 steps\/min/.test(text), text);
  const none = intakeRun({ ...intake, cadence: '' }, { footPx: 60 });
  assert(!none.res.patterns.some((p) => p.def.id === 'overstride' && p.matched?.some?.((m) => /cadence/.test(m))), 'cadence trigger without cadence');
  return text.split('\n\n').find((l) => l.startsWith('Mechanics'));
});
test('foot-to-COM above range is pending validation: no flag, no pattern trigger', () => {
  const { res, text } = intakeRun(baseIntake, { footPx: 60 });
  const c = res.rowsById.ic_foot_to_com.cells.left;
  assert(c.status === 'pending-validation' && c.weight == null, JSON.stringify({ s: c.status, w: c.weight }));
  const o = res.patterns.find((p) => p.def.id === 'overstride');
  assert(!o || !JSON.stringify(o.triggers).includes('foot-to-COM'), `foot-to-COM used as a trigger: ${JSON.stringify(o?.triggers)}`);
  assert(/pending validation/.test(text), text);
  return c.display;
});
test('incline: mentioned in the interpretation when above 0', () => {
  assert(/incline was 1%/.test(intakeRun({ ...baseIntake, incline: '1' }).text), 'no incline sentence');
  assert(!/incline was/.test(intakeRun({ ...baseIntake, incline: '0' }).text), 'incline sentence at 0%');
});
test('limits statement is always present', () => {
  assert(/not a diagnosis/.test(intakeRun(baseIntake).text), 'missing limits statement');
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
  const r = postProcess(rows, meta, { nearSide: fx.near, hipAnchor: fx.hipAnchor, stabilize: false });
  for (const [k, v] of Object.entries(fx.metrics)) assert(Math.abs(r.metrics[fx.near].summary[k].median - v.median) < 1e-9, `${k} changed`);
  for (const h of fx.hipExtension) assert(Math.abs(r.hipWindows.find((w) => w.end === h.end).median - h.median) < 1e-9, `hip ext ${h.end} changed`);
  return `offset ${JSON.stringify(fx.hipAnchor.offset)} (${fx.offsetSource})`;
});

test('leg anchor: zero offsets leave the landmarks unchanged; offsets move only the near leg', () => {
  const row = syntheticRow();
  const zero = Object.fromEntries(['hip', 'knee', 'ank', 'heel', 'toe'].map((p) => [p, { fwd: 0, down: 0 }]));
  const [z] = applyLegAnchor([row], 'L', -1, zero, 100);
  for (let k = 0; k < 132; k++) assert(z.lm[k] === row.lm[k], `lm[${k}] changed`);
  const [c] = applyLegAnchor([row], 'L', -1, { knee: { fwd: 0.1, down: 0.2 } }, 100);
  assert(Math.abs(c.lm[25 * 4] - (row.lm[25 * 4] - 10)) < 1e-4 && Math.abs(c.lm[25 * 4 + 1] - (row.lm[25 * 4 + 1] + 20)) < 1e-4, 'near knee not moved forward/down');
  assert(c.lm[26 * 4] === row.lm[26 * 4], 'far knee moved');
});
await testAsync('leg anchor on cached IMG_0639_2: gait events unchanged', async () => {
  const res = await fetch('../test-data/debug/IMG_0639_2.rows.json');
  if (!res.ok) return 'skip';
  const { meta, rows } = await res.json();
  for (const r of rows) if (r.lm) r.lm = Float32Array.from(r.lm);
  const a = postProcess(rows, meta, { nearSide: 'L', hipAnchor: { mode: 'landmark' }, legAnchor: { mode: 'landmark' } });
  const b = postProcess(rows, meta, { nearSide: 'L', hipAnchor: { mode: 'landmark' }, legAnchor: LEG_ANCHOR });
  const ev = (r) => JSON.stringify(r.events.L.strides.map((s) => [s.ic, s.ms, s.to]));
  assert(ev(a) === ev(b), 'events changed');
  return `${b.events.L.strides.length} strides, same IC/MS/TO`;
});

section = 'Timing at 30 fps';
test('orientation: rotation and mirroring from the track matrix', () => {
  const F = 65536;
  const cases = [
    [[0, F, -F, 0], 90, false], // iPhone portrait
    [[F, 0, 0, F], 0, false],
    [[-F, 0, 0, F], 0, true], // horizontal mirror
    [[0, -F, -F, 0], 90, true], // portrait + mirror
    [[-F, 0, 0, -F], 180, false],
  ];
  for (const [[a, b, c, d], rot, mir] of cases) {
    const o = orientationFromMatrix(a, b, c, d);
    assert(o.rotation === rot && o.mirrored === mir, `${[a, b, c, d]} -> ${JSON.stringify(o)}`);
  }
});
await testAsync('stabilise: low-confidence points are dropped and short gaps filled, long gaps left missing', async () => {
  const { stabilizeRows } = await import('../js/pipeline/stabilize.js');
  const rows = Array.from({ length: 30 }, (_, i) => {
    const lm = new Float32Array(132);
    for (let k = 0; k < 33; k++) lm.set([100 + i, 200, 0, 0.9], k * 4);
    return { t: i / 30, lm };
  });
  rows[10].lm[25 * 4 + 3] = 0.1; // one low-confidence knee point (1 frame gap)
  for (let i = 18; i < 26; i++) rows[i].lm[27 * 4 + 3] = 0.1; // 8-frame ankle dropout (0.27 s)
  const s = stabilizeRows(rows, 30);
  assert(Math.abs(s[10].lm[25 * 4] - 110) < 1e-6 && s[10].filled.includes(25), `knee not filled: ${s[10].lm[25 * 4]}`);
  assert(!(s[22].lm[27 * 4 + 3] > 0.5), 'long ankle gap was filled');
});
test('period: the shortest strong autocorrelation peak wins over a period multiple', () => {
  // Stride 20 frames at 30 Hz; alternate strides differ, so lag 40 correlates slightly better.
  const x = Array.from({ length: 600 }, (_, i) => Math.sin((2 * Math.PI * i) / 20) * (Math.floor(i / 20) % 2 ? 1 : 0.8));
  const lag = estimatePeriod(x, 30);
  assert(lag === 20, `lag ${lag}`);
});
test('cadence: mean of whole-frame stride durations removes 30 fps quantisation', () => {
  // True stride 0.65 s sampled at 30 fps -> durations of 19 or 20 frames.
  const secs = Array.from({ length: 40 }, (_, i) => (i % 2 ? 20 : 19) / 30);
  const c = cadenceFromDurations(secs);
  assert(Math.abs(c.spm - 184.6) < 0.5, `spm ${c.spm}`);
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
  for (const [name, fn] of Object.entries({ ...POSTERIOR_MEASURES, pelvisDropAngle })) {
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
    for (const fn of Object.values({ ...POSTERIOR_MEASURES, pelvisDropAngle })) for (const i of fa) worst = Math.max(worst, Math.abs(fn(rows[i], sd) - fn(mrows[i], other)));
  }
  assert(worst < 1e-3, `max difference ${worst}`);
  return `max per-frame difference ${worst.toExponential(1)}`;
});

// ---------------------------------------------------------------------------
section = 'Posterior adapter';
await testAsync('cached IMG_0640: only posterior metrics, both legs, swap check, timing sweep (strict)', async () => {
  const res = await fetch('../test-data/debug/IMG_0640.rows.json');
  if (!res.ok) return 'skip';
  const { meta, rows } = await res.json();
  for (const r of rows) if (r.lm) r.lm = Float32Array.from(r.lm);
  EMIT.strict = true;
  const a = toPosteriorAnalysis(postProcessRear(rows, meta), { heightCm: 170 });
  for (const id of Object.keys(a.measurements)) assert(allowed(id, 'posterior'), `${id} not allowed from posterior`);
  for (const id of ['ms_hip_adduction', 'ms_knee_varus_valgus', 'ms_pelvic_drop', 'ms_foot_midline', 'ms_crossover']) {
    for (const leg of ['left', 'right']) assert(a.measurements[id]?.[leg]?.value != null, `${id} ${leg} missing`);
  }
  assert(a.measurements.ms_hip_adduction.left.sweep?.kind === 'timing', 'no timing sweep');
  assert(a.captureChecks.posterior.swapCheckPassed === true, 'swap check');
  const res2 = analyze({ intake: baseIntake, views: ['posterior'], analysis: mergeSession({ posterior: { analysis: a } }) });
  const lateralRow = res2.rowsById.ic_knee_flexion.cells.left;
  assert(!lateralRow.assessed && /needs the left side view/.test(lateralRow.reason), `lateral metric from posterior session: ${lateralRow.reason}`);
  assert(res2.viewViolations.length === 0, 'violations');
  const h = res2.rowsById.ms_hip_adduction;
  return `hip adduction L ${h.cells.left.display ?? h.cells.left.value?.toFixed(1)} / R ${h.cells.right.display ?? h.cells.right.value?.toFixed(1)}; shift ${a.measurements.ms_lateral_shift.mid.display}`;
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
  const r = postProcess(rows, meta, { nearSide: base.near, hipAnchor: { mode: 'landmark' }, legAnchor: { mode: 'landmark' }, stabilize: false }); // baseline: raw landmarks
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
section = 'Fixture regression (committed landmark fixtures, all clients; no video needed)';
{
  const { sessionFor, read } = await import('./fixture-regression.js');
  const expRes = await fetch('fixtures/expected.json');
  const expected = expRes.ok ? await expRes.json() : null;
  for (const client of ['C0', 'T1', 'T2', 'T3']) {
    await testAsync(`${client}: pipeline + reconciliation runs and matches expected values`, async () => {
      const { result } = await sessionFor(client);
      assert(result.schema === 'gait-session/1', 'schema');
      assert(result.views.includes('lateral') && result.views.includes('posterior'), `views ${result.views}`);
      if (!expected) return 'skip';
      const bad = [];
      for (const [path, { value, tol }] of Object.entries(expected[client])) {
        const now = read(result, path);
        if (value == null ? now != null : now == null || typeof now !== 'number' || Math.abs(now - value) > tol) bad.push(`${path}: expected ${value} ±${tol}, got ${now}`);
      }
      assert(!bad.length, bad.slice(0, 4).join('; '));
      return `${Object.keys(expected[client]).length} values within tolerance`;
    });
  }
  await testAsync('capture gate: floor-level wide-angle clips (8 runners) give no values, only the reason', async () => {
    for (const client of ['AR', 'AZ', 'CD', 'CH', 'JW', 'ML', 'RQ', 'RY']) {
      const { clips, result } = await sessionFor(client);
      for (const [slot, c] of Object.entries(clips)) {
        assert(c.analysis.captureQuality?.level === 'fail', `${client} ${slot}: ${c.analysis.captureQuality?.level}`);
        for (const cells of Object.values(c.analysis.measurements)) for (const cell of Object.values(cells)) assert(cell.value == null, `${client} ${slot}: value leaked`);
      }
      assert(result.convention.issues.some((i) => /video check failed/.test(i)), `${client}: no capture warning`);
      assert(!result.timing.crossChecks.some((x) => x.reported != null), `${client}: timing from unsuitable clips`);
    }
  });
  await testAsync('capture gate: validated clips (C0, T1–T3) pass', async () => {
    for (const client of ['C0', 'T1', 'T2', 'T3']) {
      const { clips } = await sessionFor(client);
      for (const [slot, c] of Object.entries(clips)) assert(c.analysis.captureQuality?.level === 'pass', `${client} ${slot}: ${c.analysis.captureQuality?.level} ${c.analysis.captureQuality?.reasons}`);
    }
  });
  await testAsync('one view only: missing view reported as not assessed', async () => {
    const { reconcileSession } = await import('../js/pipeline/reconcile.js');
    const { clips, intake } = await sessionFor('T3');
    const only = reconcileSession({ intake, clips: { lateral_right: clips.lateral_right } });
    assert(only.views.length === 1 && only.metrics.ms_hip_adduction.notAssessed === 'needs the rear view', JSON.stringify(only.metrics.ms_hip_adduction));
    assert(only.metrics.ic_knee_flexion.cells.right.value != null, 'lateral metric missing');
    const cad = only.timing.crossChecks.find((c) => c.quantity === 'cadence');
    assert(cad.status === 'single view', cad.status);
  });
  await testAsync('blank intake degrades gracefully (no height, no speed)', async () => {
    const { reconcileSession } = await import('../js/pipeline/reconcile.js');
    const { clips } = await sessionFor('T2');
    const r = reconcileSession({ intake: { clientCode: 'X' }, clips: Object.fromEntries(Object.entries(clips).map(([k, c]) => [k, { ...c, speed: '' }])) });
    assert(r.derived.stepLengthM == null && r.derived.notes.some((n) => /speed/.test(n)) && r.derived.notes.some((n) => /height/.test(n)), JSON.stringify(r.derived));
  });
}

section = 'Presentation model and text (fixtures)';
{
  const { sessionFor } = await import('./fixture-regression.js');
  const { buildModel, NOT_RELIABLE } = await import('../js/presentation/model.js');
  const { buildSummaryText, buildInterpretation } = await import('../js/presentation/text.js');
  const { CLIP_SLOTS: SLOTS } = await import('../js/config.js');
  const modelFor = async (client, keep) => {
    const { intake, clips, result } = await sessionFor(client);
    const use = keep ? Object.fromEntries(Object.entries(clips).filter(([k]) => keep.includes(k))) : clips;
    const { reconcileSession } = await import('../js/pipeline/reconcile.js');
    const session = { intake: { ...intake, speedValue: '6', speedUnit: 'mph' }, clips: use, reconciled: keep ? reconcileSession({ intake, clips: use }) : result };
    session.views = [...new Set(Object.keys(use).map((k) => SLOTS[k].view))];
    session.analysis = mergeSession(use);
    return buildModel(session, analyze(session));
  };
  const cellsOf = (m) => m.sections.flatMap((s) => s.rows.flatMap((r) => Object.values(r.cells).map((c) => ({ r, c }))));
  await testAsync('not-reliable metrics are listed, never shown as values', async () => {
    const m = await modelFor('T3');
    for (const id of Object.keys(NOT_RELIABLE)) {
      assert(!m.sections.some((s) => s.rows.some((r) => r.id === id)), `${id} shown`);
      assert(m.notReliable.some((n) => n.id === id), `${id} not listed`);
    }
  });
  await testAsync('a coloured status only on trustworthy values (medium+ confidence, no hedge)', async () => {
    for (const client of ['C0', 'T1', 'T2', 'T3']) {
      const m = await modelFor(client);
      for (const { r, c } of cellsOf(m)) {
        if (!c.assessed || !c.status) continue;
        assert(c.confidence === 'high' || c.confidence === 'medium', `${client} ${r.id}: status on ${c.confidence}`);
        assert(!c.hedge, `${client} ${r.id}: status with hedge "${c.hedge}"`);
      }
      for (const { r, c } of cellsOf(m)) if (c.assessed && c.confidence === 'low') assert(!c.status && c.hedge, `${client} ${r.id}: low confidence without hedge`);
    }
  });
  await testAsync('value within measurement error of a threshold is borderline, not flagged', async () => {
    const m = await modelFor('T3');
    const knee = m.sections.flatMap((s) => s.rows).find((r) => r.id === 'ms_max_knee_flexion').cells.right; // 51.1° vs red > 45°, error ±6.7°
    assert(!knee.status && /within measurement error/.test(knee.hedge || ''), JSON.stringify(knee));
  });
  await testAsync('text follows the template order; every missing value says which view it needs', async () => {
    const m = await modelFor('T3');
    const t = buildSummaryText(m, buildInterpretation(m));
    const order = ['ANKLE AND FOOT', 'KNEE', 'HIP AND PELVIS', 'TRUNK (LUMBAR PROXY)', 'ARMS', 'TIMING AND MECHANICS', 'INTERPRETATION', 'Limits:'];
    let at = -1;
    for (const h of order) {
      const i = t.indexOf(`\n${h}`);
      assert(i > at, `${h} out of order`);
      at = i;
    }
    assert(/L Not assessed: needs the left side view/.test(t), 'missing-leg cells not stated');
    assert(/COVERAGE: Partial analysis/.test(t), 'coverage line');
    assert(/not a diagnosis/.test(t), 'limits statement');
  });
  await testAsync('corrections: verified evidence only, personalised step-rate targets, no primary on borderline findings', async () => {
    const { correctionsFor } = await import('../js/presentation/corrections.js');
    for (const client of ['C0', 'T1', 'T2', 'T3']) {
      const m = await modelFor(client);
      const cs = correctionsFor(m);
      for (const c of cs) {
        assert(c.evidence.length && c.evidence.every((e) => e.verified && e.url), `${client} ${c.key}: unverified or unlinked evidence`);
        if (/borderline|awaiting|low-confidence/.test(c.forText) && !/\b(above range|large|crossover foot placement)\b/.test(c.forText)) assert(c.priority === 'consider', `${client} ${c.key}: primary on borderline values`);
        if (/step rate/i.test(c.cue) && m.timing?.rows.some((r) => r.label === 'Cadence')) assert(/steps\/min\)/.test(c.cue), `${client}: no cadence target in "${c.cue}"`);
      }
    }
  });
  await testAsync('one view only: rear-only session renders, side sections say not assessed', async () => {
    const m = await modelFor('T2', ['posterior']);
    const t = buildSummaryText(m, buildInterpretation(m));
    assert(/HIP AND PELVIS/.test(t) && /Hip adduction: L/.test(t), 'rear metrics missing');
    assert(m.timing.rows.some((r) => r.label === 'Cadence'), 'cadence missing');
  });
}

section = 'Why it may be happening and what to work on';
{
  const { buildExplanations, explanationsText } = await import('../js/presentation/explain.js');
  const { VERIFIED_PMIDS } = await import('../js/presentation/limitations.js');
  // Minimal models: one cell per metric, with or without a trustworthy shown status.
  const cell = (key, value, status, extra = {}) => ({ key, assessed: true, value, text: `${value}`, status, rawStatus: status, confidence: 'medium', hedge: null, ...extra });
  const row = (id, phase, cells, green = 'x') => ({ id, label: id, phase, range: { green }, cells: Object.fromEntries(cells.map((c) => [c.key, c])) });
  const mk = (rows, cadence) => ({ sections: [{ id: 'X', rows }], timing: { rows: cadence ? [{ label: 'Cadence', text: `${cadence} steps/min`, confidence: 'high', agreement: 'agree' }] : [] }, findings: [], notReliable: [] });
  test('a full entry only when the measurement is trusted; otherwise a screening note', () => {
    const trusted = buildExplanations(mk([row('ms_hip_adduction', 'midstance', [cell('left', 16, 'red')])]));
    assert(trusted.entries.length === 1 && trusted.entries[0].kind === 'full' && trusted.entries[0].work.length, JSON.stringify(trusted.entries.map((e) => e.kind)));
    const hedged = buildExplanations(mk([row('ms_hip_adduction', 'midstance', [cell('left', 16, null, { rawStatus: 'red', hedge: 'borderline: within measurement error' })])]));
    assert(hedged.entries[0].kind === 'screen' && !hedged.priorities.length, 'hedged finding produced a full entry');
    const t = explanationsText(hedged);
    assert(/Worth screening/.test(t) && !/What to work on/.test(t), t);
  });
  test('merged entry lists every finding it may explain (one step-rate priority, not three lists)', () => {
    const ex = buildExplanations(mk([row('ic_foot_to_com', 'initial_contact', [cell('right', 22, 'red')]), row('ic_tibial_inclination', 'initial_contact', [cell('right', 12, 'red')])], 150));
    const step = ex.entries.filter((e) => e.id === 'step_rate');
    assert(step.length === 1 && step[0].findings.length === 3, JSON.stringify(ex.entries.map((e) => [e.id, e.findings.length])));
    assert(ex.priorities[0].id === 'step_rate' && ex.priorities[0].explains.length === 3, JSON.stringify(ex.priorities));
  });
  test('findings common to nearly all runners are softened, not given a full plan', () => {
    const ex = buildExplanations(mk([row('ms_max_knee_flexion', 'midstance', [cell('right', 58, 'red')])]));
    assert(ex.entries[0].kind === 'screen' && ex.entries[0].softened, JSON.stringify(ex.entries[0]));
  });
  test('no opposite advice in one entry (excess knee bend never suggests stiff-knee work)', () => {
    const ex = buildExplanations(mk([row('ic_foot_to_com', 'initial_contact', [cell('right', 22, 'red')]), row('ms_max_knee_flexion', 'midstance', [cell('right', 58, 'red')])]));
    const txt = JSON.stringify(ex.entries);
    assert(!/stiff-knee|too little knee flexion|for TOO LITTLE/i.test(txt), 'opposite advice present');
  });
  test('every cited paper is in the verified PubMed list', () => {
    const verified = new Set(VERIFIED_PMIDS);
    const all = [buildExplanations(mk([row('ms_hip_adduction', 'midstance', [cell('left', 16, 'red')]), row('ms_crossover', 'midstance', [cell('left', true, 'yellow')]), row('ic_foot_to_com', 'initial_contact', [cell('right', 22, 'red')]), row('to_hip_extension', 'toe_off', [cell('right', 3, 'red')]), row('ic_spine_lean', 'initial_contact', [cell('mid', 25, 'red')])], 150))];
    let n = 0;
    for (const ex of all) for (const e of ex.entries) for (const src of e.sources) {
      n++;
      assert(verified.has(String(src.pmid)), `${e.id}: PMID ${src.pmid} (${src.short}) not verified`);
    }
    return `${n} citations checked`;
  });
  await testAsync('screen and Summary text match (titles, findings, work items)', async () => {
    const { sessionFor } = await import('./fixture-regression.js');
    const { buildModel } = await import('../js/presentation/model.js');
    const { buildSummaryText, buildInterpretation } = await import('../js/presentation/text.js');
    const { renderResults } = await import('../js/views/results.js');
    const { CLIP_SLOTS: SL } = await import('../js/config.js');
    const { intake, clips, result } = await sessionFor('T2');
    const session = { intake, clips, reconciled: result };
    session.views = [...new Set(Object.keys(clips).map((k) => SL[k].view))];
    session.analysis = mergeSession(clips);
    const res = analyze(session);
    const m = buildModel(session, res);
    const explainText = explanationsText(m.explanations);
    const state = { session, tab: 'results', interpretation: buildInterpretation(m), explainText, model: m };
    const html = renderResults(state, res, m);
    const text = buildSummaryText(m, state.interpretation, explainText);
    const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
    const screen = strip(html);
    for (const e of m.explanations.entries) {
      assert(screen.includes(e.title) && text.toLowerCase().includes(e.title.toLowerCase()), `title ${e.title}`);
      for (const f of e.findings) assert(screen.includes(f.label) && text.includes(f.label), `finding ${f.label}`);
      for (const w of e.kind === 'full' ? e.work : []) assert(screen.includes(w.item) && text.includes(w.item), `work ${w.item}`);
    }
    assert(text.includes(explainText), 'Summary text does not carry the editable section');
    return `${m.explanations.entries.length} entries`;
  });
}

section = 'View combinations (derived fixtures: T3 right side + rear filmed; left side and front derived)';
{
  const { fourViewSession } = await import('./fixture-regression.js');
  const { reconcileSession } = await import('../js/pipeline/reconcile.js');
  const { buildModel } = await import('../js/presentation/model.js');
  const { buildSummaryText, buildInterpretation } = await import('../js/presentation/text.js');
  const { explanationsText } = await import('../js/presentation/explain.js');
  const { renderResults } = await import('../js/views/results.js');
  const { CLIP_SLOTS: SL } = await import('../js/config.js');
  const { cellSources, compareCoverage, coverage, SLOT_SHORT } = await import('../js/pipeline/view-matrix.js');
  const { correctionsFor } = await import('../js/presentation/corrections.js');
  const all = ['lateral_left', 'lateral_right', 'posterior', 'anterior'];
  const subsets = [];
  for (let mask = 1; mask < 16; mask++) subsets.push(all.filter((_, i) => mask & (1 << i)));
  const build = async (slots) => {
    const { intake, clips } = await fourViewSession('T3');
    const use = Object.fromEntries(slots.map((s) => [s, clips[s]]));
    const session = { intake, clips: use, placeholder: false };
    session.views = [...new Set(slots.map((s) => SL[s].view))];
    session.analysis = mergeSession(use);
    session.reconciled = reconcileSession(session);
    const res = analyze(session);
    const m = buildModel(session, res, { corrections: correctionsFor });
    const interpretation = buildInterpretation(m);
    const explainText = explanationsText(m.explanations);
    const html = renderResults({ session, tab: 'results', interpretation, explainText, model: m }, res, m);
    const text = buildSummaryText(m, interpretation, explainText);
    const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
    return { session, res, m, html, screen: strip(html), text };
  };
  await testAsync('derived views are detected as the view they stand for', async () => {
    const { clips } = await fourViewSession('T3');
    for (const s of all) assert(clips[s].detected === s, `${s} detected as ${clips[s].detected}`);
  });
  await testAsync('front view through the rear pipeline reproduces the rear values (mirror is exact)', async () => {
    const { clips } = await fourViewSession('T3');
    const a = clips.anterior.analysis.measurements;
    const p = clips.posterior.analysis.measurements;
    for (const id of ['ms_hip_adduction', 'ms_knee_varus_valgus']) for (const k of ['left', 'right']) assert(Math.abs(a[id][k].value - p[id][k].value) < 0.01 && a[id][k].experimental, `${id} ${k}: ${a[id][k].value} vs ${p[id][k].value}`);
  });
  for (const slots of subsets) {
    const name = slots.map((s) => SLOT_SHORT[s]).join(' + ');
    await testAsync(`${name}: renders; "Not assessed: needs …" correct; coverage; no unassessed or experimental value in scores; screen = text`, async () => {
      const { session, res, m, html, screen, text } = await build(slots);
      assert(html.length && text.length, 'empty output');
      // Coverage: views used and share of the metric set.
      const cov = coverage(session.clips, { exclude: ['ms_pelvic_drop'] });
      assert(m.coverage.usable.join() === slots.join(), `usable ${m.coverage.usable}`);
      assert(m.coverage.assessable === cov.assessable && m.coverage.full === (slots.length >= 3 && !slots.includes('anterior') ? true : slots.length === 4), `coverage ${m.coverage.assessable}/${m.coverage.total} full=${m.coverage.full}`);
      assert(screen.includes(`${m.coverage.pct}% of the metric set assessable`) && text.includes(m.coverage.label), 'coverage indicator missing on screen or in text');
      // Every cell: assessed only if its authoritative view is present; otherwise a reason naming the view.
      for (const sec of m.sections) {
        for (const r of sec.rows) {
          const def = res.rowsById[r.id].def;
          for (const c of Object.values(r.cells)) {
            const src = cellSources(def, c.key).authoritative;
            const has = src.some((x) => slots.includes(x));
            if (!has) {
              assert(!c.assessed, `${r.id} ${c.key} assessed without its view`);
              assert(/^needs (the|a side view)/.test(c.why), `${r.id} ${c.key}: "${c.why}"`);
              const need = src.length === 2 ? 'a side view' : SLOT_SHORT[src[0]];
              assert(c.why.includes(need), `${r.id} ${c.key}: "${c.why}" does not name ${need}`);
              assert(text.includes(`Not assessed: ${c.why}`) || (/side view$/.test(c.why) && text.includes('Not assessed: needs the left and right side views')), `text lacks reason for ${r.id} ${c.key}`);
              assert(screen.includes(`Not assessed: ${c.why}`), `screen lacks reason for ${r.id} ${c.key}`);
            } else if (c.assessed) {
              assert(text.includes(c.text) && screen.includes(c.text), `${r.id} ${c.key}: value ${c.text} not on both screen and text`);
            } else assert(c.why && c.why.length > 3, `${r.id} ${c.key}: blank reason`);
          }
        }
      }
      // Scores: only assessed cells from non-experimental views carry weight.
      let weighted = 0;
      for (const row of res.rows) for (const c of Object.values(row.cells)) if (c.weight != null) {
        weighted++;
        assert(c.assessed && c.source && c.source.view !== 'anterior', `${row.def.id}: weight on unassessed/experimental`);
        assert(slots.includes(c.source.slot) || (c.source.slot || '').split('+').every((x) => slots.includes(x)) || (c.source.view === 'lateral' && slots.some((x) => x.startsWith('lateral'))), `${row.def.id}: weight from ${c.source.slot}`);
      }
      if (!weighted) assert(res.overall.overall == null, 'score without scored values');
      assert(text.includes(m.scores.basis) && screen.includes(m.scores.basis), 'score basis');
      // Experimental (front) values never in sections, findings or the corrective section.
      if (slots.includes('anterior')) {
        assert(m.experimental.length && /FRONT VIEW \(EXPERIMENTAL/.test(text) && /Front view/.test(screen), 'front view block missing');
        for (const f of m.findings) for (const t of f.triggers) assert(!/front/i.test(t.text), 'front-view trigger');
      }
      if (slots.length === 1 && slots[0] === 'anterior') {
        assert(weighted === 0 && !m.explanations.entries.length && !m.findings.length, 'front-only session produced scores or findings');
      }
      // Corrective entries only from assessed values.
      for (const e of m.explanations.entries) for (const f of e.findings) assert(!/not assessed/i.test(f.value || ''), `${e.id}: unassessed finding`);
      return `${m.coverage.assessable}/${m.coverage.total} assessable, ${weighted} scored`;
    });
  }
  await testAsync('HANDOFF.md §9 matrix is identical to the code', async () => {
    const { matrixMarkdownRows } = await import('../js/pipeline/view-matrix.js');
    const doc = await (await fetch('../HANDOFF.md')).text();
    const missing = matrixMarkdownRows().filter((r) => !doc.includes(r));
    assert(!missing.length, `not in HANDOFF.md: ${missing.slice(0, 2).join(' / ')}`);
    return `${matrixMarkdownRows().length} rows`;
  });
  test('comparing sessions with different view coverage warns', () => {
    const a = { signature: 'lateral_right', usable: ['lateral_right'], share: 0.4 };
    const b = { signature: 'lateral_right+posterior', usable: ['lateral_right', 'posterior'], share: 0.7 };
    assert(compareCoverage(a, a).same && !compareCoverage(a, a).warning, 'same coverage warned');
    const w = compareCoverage(a, b);
    assert(!w.same && /Different view coverage/.test(w.warning) && /rear view/.test(w.warning), w.warning);
  });
}

section = 'Capture-quality gate (video check) on all 24 benchmark clips';
{
  const { sessionFor, fourViewSession } = await import('./fixture-regression.js');
  const { footageChecks, summariseChecks, lumaFromImageData } = await import('../js/pipeline/footage-checks.js');
  const { quickCapture, scoreCap } = await import('../js/pipeline/capture-quality.js');
  const { CLIPS } = await import('./clips.js');
  const { unpackRows } = await import('./fixture-io.js');
  const { detectView } = await import('../js/pipeline/view-detect.js');
  const GOOD = ['C0', 'T1', 'T2', 'T3'];
  // Expected reasons (check ids) per problem clip: floor-level camera everywhere; CD side also the head
  // out of frame (framing).
  const expectReason = (id) => (id === 'CD-side' ? ['framing', 'camera_height'] : ['camera_height']);
  const load = async (id) => unpackRows(await (await fetch(`fixtures/clips/${id}.lm.json`)).json());
  await testAsync('verdicts: 8 good clips pass, 16 floor-level wide-angle clips fail with the right reasons and a fix', async () => {
    let right = 0;
    for (const c of CLIPS) {
      const { rows, meta } = await load(c.id);
      const view = detectView(rows).view;
      assert(view === c.view, `${c.id}: detected ${view}`);
      const checks = footageChecks(view, { rows, meta });
      const q = summariseChecks(checks);
      if (GOOD.includes(c.client)) assert(q.level === 'pass', `${c.id}: ${q.level} (${q.reasons})`);
      else {
        assert(q.level === 'fail', `${c.id}: ${q.level}`);
        for (const id of expectReason(c.id)) assert(checks.find((x) => x.id === id)?.status === 'fail', `${c.id}: ${id} not failed`);
        assert(q.fixes.some((f) => /hip height|whole body|move the camera back/i.test(f)), `${c.id}: no fix (${q.fixes})`);
      }
      right++;
    }
    return `${right}/24 correct`;
  });
  await testAsync('quick check (first 150 frames): good clips pass, problem clips warn or fail', async () => {
    for (const c of CLIPS) {
      const { rows, meta } = await load(c.id);
      const q = quickCapture(c.view, rows.slice(0, 150), meta, detectView(rows.slice(0, 150)));
      if (GOOD.includes(c.client)) assert(q.level === 'pass', `${c.id}: ${q.level} ${q.reasons}`);
      else assert(q.level !== 'pass', `${c.id}: quick check passed`);
    }
  });
  await testAsync('warn lowers confidence; quality score caps confidence; fail reports nothing', async () => {
    const { reconcileSession } = await import('../js/pipeline/reconcile.js');
    const { intake, clips } = await sessionFor('T3');
    const slot = 'lateral_right';
    const a = clips[slot].analysis;
    assert(a.captureQuality.score >= 0.85 && scoreCap(a.captureQuality.score) == null, `T3 score ${a.captureQuality.score}`);
    assert(scoreCap(0.7) === 'medium' && scoreCap(0.4) === 'low', 'score caps');
    // Simulate a warned clip: every value capped at low with the reason.
    const { applyCaptureGate } = await import('../js/pipeline/capture-quality.js');
    const warned = structuredClone(a.measurements);
    applyCaptureGate(warned, { level: 'warn', score: 0.72, reasons: ['camera tilted 4°'], upperBodyOk: true });
    const r = reconcileSession({ intake, clips: { [slot]: { ...clips[slot], analysis: { ...a, measurements: warned } } } });
    const knee = r.metrics.ic_knee_flexion.cells.right;
    assert(knee.value != null && knee.confidence === 'low' && knee.confidenceReasons.some((x) => /video check warning/.test(x)), JSON.stringify(knee.confidenceReasons));
  });
  test('lighting: not judged without brightness data; luma helper', () => {
    const d = new Uint8ClampedArray(4 * 64).fill(100);
    const l = lumaFromImageData(d);
    assert(Math.abs(l.mean - 100) < 1, JSON.stringify(l));
  });
  await testAsync('phase panels: representative stride is a valid stride of the near leg, for every phase', async () => {
    const { representativeStride } = await import('../js/views/phase-panels.js');
    const { clips } = await fourViewSession('T3');
    for (const [slot, phases] of [['lateral_right', ['initial_contact', 'midstance', 'toe_off']], ['posterior', ['midstance']]]) {
      for (const ph of phases) for (const leg of slot === 'posterior' ? ['left', 'right'] : ['right']) {
        const r = representativeStride(clips[slot], ph, leg);
        assert(r && r.stride && r.stride.valid !== false && /Stride \d+ of \d+/.test(r.label), `${slot} ${ph} ${leg}: ${JSON.stringify(r && r.label)}`);
      }
    }
    assert(representativeStride(clips.lateral_right, 'midstance', 'left') == null, 'far leg must never be drawn');
  });
}

section = 'Video review player and manual measurements';
{
  const { fourViewSession } = await import('./fixture-regression.js');
  const { eventMarkers, rowAt, frameAngles, reviewHtml } = await import('../js/views/review.js');
  const { angle3, fromVertical, distance, manualLines, measurementText } = await import('../js/views/measure.js');
  const { buildModel } = await import('../js/presentation/model.js');
  const { buildSummaryText, buildInterpretation } = await import('../js/presentation/text.js');
  const { reconcileSession } = await import('../js/pipeline/reconcile.js');
  const { CLIP_SLOTS: SL } = await import('../js/config.js');
  const { clips, intake } = await fourViewSession('T3');
  await testAsync('event markers: side view = near leg IC / MS / TO; rear = each leg midstance; valid strides only', async () => {
    const side = eventMarkers({ ...clips.lateral_right, slot: 'lateral_right' });
    assert(side.length > 100 && side.every((m) => m.leg === 'right') && new Set(side.map((m) => m.kind)).size === 3, `side ${side.length}`);
    const rear = eventMarkers({ ...clips.posterior, slot: 'posterior' });
    assert(rear.every((m) => m.kind === 'ms') && rear.some((m) => m.leg === 'left') && rear.some((m) => m.leg === 'right'), 'rear');
    for (let i = 1; i < side.length; i++) assert(side[i].row >= side[i - 1].row, 'markers not sorted');
    return `${side.length} side, ${rear.length} rear markers`;
  });
  test('rowAt finds the nearest analysed row by time', () => {
    const rows = [0, 0.033, 0.067, 0.1].map((t) => ({ t }));
    assert(rowAt(rows, 0) === 0 && rowAt(rows, 0.05) === 2 && rowAt(rows, 0.04) === 1 && rowAt(rows, 9) === 3, 'rowAt');
  });
  await testAsync('frame angle labels: side knee/hip/trunk, rear hip adduction and knee per leg, front none', async () => {
    const row = clips.lateral_right.debug.rows.find((r) => r.lm);
    const a = frameAngles('lateral_right', row, { nearSide: 'R', facing: 1 });
    assert(a.map((x) => x.label).join() === 'Knee,Hip,Trunk', JSON.stringify(a));
    const rrow = clips.posterior.debug.rows.find((r) => r.lm);
    assert(frameAngles('posterior', rrow).length === 4, 'rear labels');
    assert(frameAngles('anterior', rrow).length === 0, 'front labels must be none (experimental)');
  });
  test('measurement maths: angle, line vs vertical, distance (cm only with a scale)', () => {
    assert(Math.abs(angle3([0, 0], [1, 0], [1, 1]) - 90) < 1e-9, 'angle');
    assert(Math.abs(fromVertical([0, 0], [0, 10])) < 1e-9 && Math.abs(fromVertical([0, 0], [10, 10]) - 45) < 1e-9 && Math.abs(fromVertical([0, 10], [0, 0])) < 1e-9, 'vertical');
    const d = distance([0, 0], [30, 40], 2);
    assert(d.px === 50 && d.cm === 25 && distance([0, 0], [3, 4]).cm == null, 'distance');
    assert(/manual|°/.test(measurementText({ kind: 'angle', value: 12.34 })), 'text');
  });
  await testAsync('manual measurements stay apart: model, scores, findings and corrective section unchanged; text has its own section', async () => {
    const use = { lateral_right: clips.lateral_right, posterior: clips.posterior };
    const mk = (manual) => {
      const session = { intake, clips: use, manual };
      session.views = [...new Set(Object.keys(use).map((k) => SL[k].view))];
      session.analysis = mergeSession(use);
      session.reconciled = reconcileSession(session);
      return { session, m: buildModel(session, analyze(session)) };
    };
    const a = mk(undefined);
    const manual = [{ slot: 'lateral_right', kind: 'angle', pts: [[0, 0], [1, 0], [1, 1]], idx: 10, t: 0.33, value: 90 }, { slot: 'posterior', kind: 'vertical', pts: [[0, 0], [0, 1]], idx: 4, t: 0.13, value: 0 }];
    const b = mk(manual);
    assert(JSON.stringify(a.m) === JSON.stringify(b.m), 'model changed by manual measurements');
    const t = buildSummaryText(b.m, buildInterpretation(b.m), undefined, manual);
    const sec = t.indexOf('MANUAL ON-SCREEN MEASUREMENTS');
    assert(sec > t.indexOf('WHY IT MAY BE HAPPENING') && sec < t.indexOf('INTERPRETATION') && /not validated, not scored, not used for findings/.test(t), 'manual section');
    assert(manualLines(manual).length === 2 && /right side view, 0.33 s: angle 90.0°/.test(manualLines(manual)[0]), manualLines(manual)[0]);
    assert(!/MANUAL/.test(buildSummaryText(a.m, buildInterpretation(a.m))), 'manual section without measurements');
  });
  await testAsync('review section renders one player per uploaded view and names the missing ones', async () => {
    const html = reviewHtml({ session: { clips: { lateral_right: clips.lateral_right, posterior: clips.posterior } } });
    assert((html.match(/class="rv-clip"/g) || []).length === 2 && /Not uploaded: left side view/.test(html), 'players');
    assert(/this frame only, not the validated per-stride values/.test(html), 'frame-only wording');
    assert(reviewHtml({ session: { clips: {}, placeholder: true } }) === '', 'demo');
  });
}

section = 'Range scale';
{
  const { scaleZones, rangeScaleHtml } = await import('../js/views/range-scale.js');
  const { sessionFor } = await import('./fixture-regression.js');
  const { buildModel } = await import('../js/presentation/model.js');
  const { renderResults } = await import('../js/views/results.js');
  const { CLIP_SLOTS: SL } = await import('../js/config.js');
  test('zones follow the config ranges (red below, caution, normal, caution above)', () => {
    const z = scaleZones({ green: { min: 14, max: 30 }, red: { below: 10 } }, 19).zones.map((x) => `${x.kind}:${Math.round(x.from)}-${Math.round(x.to)}`);
    assert(z[0].startsWith('red:') && z[1] === 'yellow:10-14' && z[2] === 'green:14-30' && z[3].startsWith('yellow:30'), z.join(' '));
    const f = scaleZones({ green: { max: 13 }, red: { above: 17 } }, 24).zones.map((x) => x.kind).join();
    assert(f === 'green,yellow,red', f);
  });
  test('marker coloured only for trusted values; untrusted is neutral with its hedge', () => {
    const t = rangeScaleHtml({ green: { min: 0, max: 8 }, red: { above: 10 } }, 4, { status: 'green', unit: '°' });
    assert(/rs-m-green/.test(t) && !/rs-m-neutral/.test(t), 'trusted');
    const u = rangeScaleHtml({ green: { min: 0, max: 8 }, red: { above: 10 } }, 9.1, { status: null, unit: '°', hedge: 'borderline: changes with the exact moment of foot contact' });
    assert(/rs-m-neutral/.test(u) && !/rs-m-(green|yellow|red)/.test(u) && /borderline/.test(u), 'untrusted');
  });
  await testAsync('results screen shows a scale for every assessed numeric range value', async () => {
    const { intake, clips, result } = await sessionFor('T3');
    const session = { intake, clips, reconciled: result };
    session.views = [...new Set(Object.keys(clips).map((k) => SL[k].view))];
    session.analysis = mergeSession(clips);
    const res = analyze(session);
    const m = buildModel(session, res);
    const html = renderResults({ session, tab: 'results', interpretation: '', explainText: '', model: m }, res, m);
    const want = m.sections.flatMap((s) => s.rows).filter((r) => r.range?.bounds).flatMap((r) => Object.values(r.cells).filter((c) => c.assessed && typeof c.value === 'number')).length;
    const got = (html.match(/class="rs"/g) || []).length;
    assert(got >= want && want > 5, `${got} scales for ${want} values`);
    return `${want} values`;
  });
}

section = '"What is this?" explainers';
{
  const { explainerFor, TIMING_MEANING } = await import('../js/presentation/explainers.js');
  const { sessionFor } = await import('./fixture-regression.js');
  const { buildModel } = await import('../js/presentation/model.js');
  const { CLIP_SLOTS: SL } = await import('../js/config.js');
  await testAsync('every displayed metric row and timing row has an explainer naming its view', async () => {
    const { intake, clips, result } = await sessionFor('T2');
    const session = { intake: { ...intake, speedValue: '7', speedUnit: 'mph' }, clips, reconciled: result };
    session.views = [...new Set(Object.keys(clips).map((k) => SL[k].view))];
    session.analysis = mergeSession(clips);
    const m = buildModel(session, analyze(session));
    const rows = m.sections.flatMap((s) => s.rows);
    for (const r of rows) {
      const e = explainerFor(r.id);
      assert(e && / From: (left side view|rear view|side view)/.test(e), `${r.id}: ${e}`);
    }
    for (const t of m.timing.rows) assert(TIMING_MEANING[t.label], `timing: ${t.label}`);
    return `${rows.length} metrics, ${m.timing.rows.length} timing rows`;
  });
}

section = 'Saved sessions on this device and comparison';
{
  const lib = await import('../js/storage/library.js');
  const { compareModels, compareText } = await import('../js/presentation/compare.js');
  const { fourViewSession } = await import('./fixture-regression.js');
  const { buildModel } = await import('../js/presentation/model.js');
  const { buildSummaryText, buildInterpretation } = await import('../js/presentation/text.js');
  const { reconcileSession } = await import('../js/pipeline/reconcile.js');
  const { CLIP_SLOTS: SL } = await import('../js/config.js');
  const modelOf = (s) => {
    s.views = [...new Set(Object.keys(s.clips).map((k) => SL[k].view))];
    s.analysis = mergeSession(s.clips);
    s.reconciled = reconcileSession(s);
    return buildModel(s, analyze(s));
  };
  const base = await fourViewSession('T3');
  const session = { intake: { ...base.intake, runningHistory: 'free text', goals: 'free text' }, clips: { lateral_right: { ...base.clips.lateral_right, name: 'some file name.mov', url: 'blob:x' }, posterior: base.clips.posterior }, manual: [{ slot: 'posterior', kind: 'angle', pts: [[0, 0], [1, 1], [2, 0]], idx: 3, t: 0.1, value: 90 }] };
  test('stored record: results only (no video, landmarks, file names or free-text fields)', () => {
    const rec = lib.toRecord(session, { savedAt: '2026-10-23T10:00:00Z' });
    const json = JSON.stringify(rec);
    assert(!/free text|some file name|blob:|"debug"|"rows"/.test(json), 'something private was stored');
    assert(rec.clientCode === 'T3' && rec.views.join() === 'lateral_right,posterior' && rec.manual.length === 1, 'record');
  });
  await testAsync('save → list → open gives the same summary text; delete removes it', async () => {
    const before = modelOf({ ...session, clips: { ...session.clips } });
    const rec = await lib.saveSession(session);
    const list = await lib.listSessions();
    assert(list.some((r) => r.id === rec.id), 'not listed');
    const back = lib.fromRecord(await lib.getSession(rec.id));
    const after = modelOf(back);
    const t1 = buildSummaryText(before, buildInterpretation(before), undefined, session.manual);
    const t2 = buildSummaryText(after, buildInterpretation(after), undefined, back.manual);
    assert(t1 === t2, 'summary differs after reopening');
    await lib.deleteSession(rec.id);
    assert(!(await lib.listSessions()).some((r) => r.id === rec.id), 'not deleted');
  });
  await testAsync('comparison: only values in both sessions; small changes within error; coverage warning', async () => {
    const a = modelOf({ intake: base.intake, clips: { lateral_right: base.clips.lateral_right } });
    const b = modelOf({ intake: { ...base.intake, sessionDate: 'later' }, clips: { lateral_right: base.clips.lateral_right, posterior: base.clips.posterior } });
    const cmp = compareModels(a, b);
    assert(cmp.rows.length > 5 && cmp.rows.every((r) => r.delta == null || Math.abs(r.delta) < 1e-9), 'same clip must give zero change');
    assert(cmp.rows.filter((r) => r.withinError != null).every((r) => r.withinError === true), 'zero change within error');
    assert(!cmp.rows.some((r) => r.id === 'ms_hip_adduction'), 'rear metric compared although only one session has it');
    assert(cmp.onlyOne > 0 && /Different view coverage/.test(cmp.coverage.warning || ''), 'coverage warning');
    assert(/within measurement error/.test(compareText(cmp, a, b)), 'text');
  });
}

section = 'Angle curves over the gait cycle';
{
  const { fourViewSession, sessionFor } = await import('./fixture-regression.js');
  const { curvesHtml } = await import('../js/views/curves-chart.js');
  await testAsync('side clips get knee and hip curves: 101 points, knee peaks in swing, band around the median', async () => {
    const { clips } = await sessionFor('T3');
    const c = clips.lateral_right.analysis.curves;
    assert(c && !c.reason && c.strides >= 10, JSON.stringify(c && (c.reason || c.strides)));
    const k = c.knee.median;
    assert(k.length === 101, 'points');
    const peak = k.indexOf(Math.max(...k));
    assert(peak > 55 && peak < 90 && Math.max(...k) > 70, `knee peak ${Math.max(...k)} at ${peak}%`);
    assert(c.knee.p25.every((v, j) => v <= k[j] + 1e-9) && c.knee.p75.every((v, j) => v >= k[j] - 1e-9), 'band');
    assert(c.hip.median.length === 101, 'hip');
    return `${c.strides} strides, knee peak ${Math.max(...k)}° at ${peak}%`;
  });
  await testAsync('no curves from a clip that failed the video check; missing side says which view it needs', async () => {
    const { clips } = await sessionFor('AR');
    assert(Object.values(clips).every((c) => c.analysis.curves == null), 'curves from a failed clip');
    const four = await fourViewSession('T3');
    const html = curvesHtml({ session: { clips: { lateral_right: four.clips.lateral_right } } });
    assert(/Not assessed: needs the left side view/.test(html) && /measured, not scored/.test(html), 'missing side wording');
    assert(/Not assessed: needs a side view/.test(curvesHtml({ session: { clips: { posterior: four.clips.posterior } } })), 'rear only');
  });
}

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
// Machine-readable results for the one-command runner (tools/test.py reads the dumped DOM).
const tag = document.createElement('script');
tag.type = 'application/json';
tag.id = 'results';
tag.textContent = JSON.stringify({ results: results.map(({ section: s, name, ok, skip, detail }) => ({ section: s, name, ok, skip: !!skip, detail: detail == null ? null : String(detail) })) }).replace(/</g, '\\u003c');
document.body.append(tag);
if (new URLSearchParams(location.search).has('headless')) fetch('/__results', { method: 'POST', body: tag.textContent.replace(/\\u003c/g, '<') });

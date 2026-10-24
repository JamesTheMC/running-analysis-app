// Presentation model: ONE view of a session's results, built from the reconciled result
// (pipeline/reconcile.js: values, confidence, cross-view timing) and the engine results
// (engine/analysis.js: statuses incl. sensitivity, scores, pattern flags). The results screen and
// the copy-paste text are both rendered from this model, so they always agree.
//
// Display rules (HANDOFF.md §4):
//   - a coloured status (green / caution / red) is shown only for a scored metric whose value has
//     medium or high confidence and is not timing-sensitive or awaiting validation;
//   - anything else shows its value with a plain-language hedge (never a bare number that looks solid);
//   - metrics known to be unreliable from 2D video are listed separately with the reason, not shown
//     as values.
import { PHASES, SUMMARY_SECTIONS, CLIP_SLOTS, NOT_MEASURABLE } from '../config.js';
import { cellValue, formatDiff } from '../engine/format.js';
import { statusFor } from '../engine/analysis.js';
import { VALIDATION_ERROR } from '../pipeline/reconcile.js';
import { coverage as viewCoverage, SLOT_SHORT } from '../pipeline/view-matrix.js';
import { buildExplanations } from './explain.js';

// Shown in "Not reliable from video" instead of as values (validation, reference/VALIDATION.md).
export const NOT_RELIABLE = {
  ms_pelvic_drop: 'reads the opposite way to expected running mechanics on every validated clip (2D hip points follow the thighs); needs PSIS markers to check',
};

// Region for metrics without a template section line.
const REGION = { ms_step_width: 'ANKLE', arm_crossover: 'ARMS' };

const PHASE_LABEL = { initial_contact: 'Initial contact', midstance: 'Midstance', toe_off: 'Toe-off', swing: 'Swing' };
const PHASE_ORDER = { initial_contact: 0, midstance: 1, toe_off: 2, swing: 3 };
const REGION_TITLE = { ANKLE: 'Ankle and foot', KNEE: 'Knee', HIP: 'Hip and pelvis', LUMBAR: 'Trunk (lumbar proxy)', ARMS: 'Arms' };
const RANK = { none: -1, low: 0, medium: 1, high: 2 };
const SHOWN_STATUS = ['green', 'yellow', 'red'];
export const STATUS_WORD = { green: 'normal', yellow: 'caution', red: 'flag' };

// Plain-language hedge for a value that must not look solid; null when the value can stand alone.
function hedgeFor(def, engineCell, rec) {
  const s = engineCell.status;
  if (s === 'ic-sensitive') return 'borderline: changes with the exact moment of foot contact';
  if (s === 'timing-sensitive') return 'borderline: changes with the exact midstance frame';
  if (s === 'window-sensitive') return 'borderline: changes with how late stance is defined';
  if (s === 'pending-validation') return engineCell.pendingText || 'awaiting validation';
  if (s === 'review') return 'reference under review';
  if (rec?.confidence === 'low') return 'low confidence: indicative only';
  if (def.id === 'to_hip_extension') return 'awaiting clinician validation; not scored';
  if (def.scored === false && def.type !== 'record') return 'not scored (2D limits)';
  return null;
}

// Measurement error vs thresholds: a green value is hedged only if its validated error band reaches
// the flag (red) level; a caution/flag value is hedged if the band reaches normal (green).
export function withinError(def, value) {
  const e = VALIDATION_ERROR[def.id];
  if (!e || def.type !== 'range' || typeof value !== 'number') return null;
  const now = statusFor(def, value);
  const band = [statusFor(def, value - e), statusFor(def, value + e)];
  if (now === 'green') return band.includes('red') ? e : null;
  return band.includes('green') ? e : null;
}

function cellModel(def, key, engineCell, rec) {
  if (!engineCell?.assessed) {
    const why = rec?.notAssessed || engineCell?.reason || 'not measured';
    return { key, assessed: false, text: 'not assessed', why, needsView: /^needs |video check/.test(why) };
  }
  const conf = rec?.confidence ?? engineCell.confidence ?? 'low';
  const err = SHOWN_STATUS.includes(engineCell.status) ? withinError(def, engineCell.value) : null;
  const statusShown = def.scored !== false && SHOWN_STATUS.includes(engineCell.status) && RANK[conf] >= RANK.medium && !err;
  return {
    key,
    assessed: true,
    text: cellValue(def, engineCell, { short: true }),
    value: engineCell.value,
    status: statusShown ? engineCell.status : null,
    rawStatus: engineCell.status,
    confidence: conf,
    hedge: hedgeFor(def, engineCell, rec) || (err && def.scored !== false && RANK[conf] >= RANK.medium ? `borderline: within measurement error (±${err}${def.unit === 'deg' ? '°' : ` ${def.unit}`}) of the threshold` : null),
    why: rec?.confidenceReasons || [],
    n: engineCell.strides ?? rec?.n ?? null,
    countUnit: engineCell.countUnit || rec?.countUnit || 'strides',
    source: rec?.source?.slot ? CLIP_SLOTS[rec.source.slot]?.label : null,
    note: engineCell.note || null,
    prompt: engineCell.prompt || null,
  };
}

function rowModel(row, recMetric) {
  const { def } = row;
  const keys = def.sided === 'lr' ? ['left', 'right'] : ['mid'];
  const cells = Object.fromEntries(keys.map((k) => [k, cellModel(def, k, row.cells[k], recMetric?.cells?.[k])]));
  const diff = def.sided === 'lr' ? formatDiff(def, row.asymmetry) : null;
  return {
    id: def.id,
    label: def.summaryLabel || def.label,
    phase: def.phase || null,
    phaseLabel: PHASE_LABEL[def.phase] || 'Whole stride',
    view: def.allowedViews?.[0] || null,
    sided: def.sided,
    type: def.type,
    range: def.type === 'range' || def.type === 'boolean' || def.type === 'category' ? { green: def.greenText || null, red: def.redText && def.redText !== '—' ? def.redText : null, provisional: !!def.provisional, bounds: def.type === 'range' && (def.green || def.red) ? { green: def.green || {}, red: def.red || {}, review: def.aboveGreen === 'review' } : null } : null,
    unitSymbol: def.unit === 'deg' ? '°' : def.unit === 'cm' ? ' cm' : '',
    priority: !!def.priority,
    note: def.note || null,
    cells,
    diff: diff && Object.values(cells).every((c) => c.assessed && RANK[c.confidence] >= RANK.medium) ? diff : null,
    diffNote: row.asymmetry?.separateClips ? 'measured on separate clips' : null,
  };
}

// Timing and mechanics (cross-view checks and intake-derived values).
function timingModel(rec) {
  if (!rec) return null;
  const q = (name) => rec.timing.crossChecks.find((c) => c.quantity.startsWith(name));
  const names = (vals) => Object.keys(vals || {}).map((s) => SLOT_SHORT[s] || s);
  const agreementText = (c) => {
    const v = names(c.values);
    const exp = c.experimental ? `; front view (experimental): ${Object.values(c.experimental).map((x) => fmtExp(c, x)).join(', ')}` : '';
    if (c.status === 'agree') return `${v.join(' and ')} agree${exp}`;
    if (c.status === 'single view') return `${v[0]} only; no second view to cross-check${exp}`;
    return exp ? exp.slice(2) : null;
  };
  const fmtExp = (c, x) => (c.unit === 's' ? `${Math.round(x * 1000)} ms` : c.unit === 'spm' ? `${Math.round(x)} steps/min` : `${x}${c.unit === '%' ? '%' : ` ${c.unit}`}`);
  const row = (label, c, fmt, extra) =>
    c && c.reported != null
      ? { label, text: fmt(c.reported), confidence: c.confidence || 'medium', agreement: c.status, agreementText: agreementText(c), flag: c.flag || null, views: c.values, ...extra }
      : null;
  const d = rec.derived;
  const rows = [
    row('Cadence', q('cadence'), (v) => `${Math.round(v)} steps/min`),
    row('Step time, left', q('step time, left'), (v) => `${Math.round(v * 1000)} ms`),
    row('Step time, right', q('step time, right'), (v) => `${Math.round(v * 1000)} ms`),
    row('Step-time difference (left vs right)', q('step-time asymmetry'), (v) => `${Math.abs(v).toFixed(1)}% ${v > 0 ? 'longer on the left' : v < 0 ? 'longer on the right' : ''}`.trim()),
    row('Ground contact time', q('contact time'), (v) => `${Math.round(v)} ms`, { note: '± one video frame' }),
    row('Vertical oscillation (pelvis)', q('vertical oscillation'), (v) => (rec.intake.heightCm ? `${v.toFixed(1)} cm` : `${v.toFixed(1)}% of height`)),
    d.stepLengthM != null ? { label: 'Step length', text: `${d.stepLengthM.toFixed(2)} m`, confidence: 'medium', note: 'treadmill speed ÷ step rate' } : null,
    d.dutyFactor != null ? { label: 'Contact share of the stride', text: `${Math.round(d.dutyFactor * 100)}%${d.flightMs === 0 ? ' (no flight phase)' : ''}`, confidence: 'medium' } : null,
  ].filter(Boolean);
  return { rows, notes: d.notes };
}

// Coverage: which views were used and what share of the metric set they can assess, so a one-view
// result is never mistaken for a full analysis.
function coverageModel(session, rec, results) {
  const c = viewCoverage(session.clips || {}, { exclude: Object.keys(NOT_RELIABLE) });
  const names = (slots) => slots.map((s) => SLOT_SHORT[s] || s);
  const assessed = results.rows.filter((r) => (r.def.status ?? 'built') === 'built' && !NOT_RELIABLE[r.def.id]).reduce((n, r) => n + Object.values(r.cells).filter((x) => x.assessed).length, 0);
  const pct = Math.round(c.share * 100);
  const used = names(c.usable);
  return {
    ...c,
    assessed,
    pct,
    usedText: used.length ? used.join(', ') : 'none',
    missingText: names(c.missing).join(', '),
    failedText: names(c.failed).join(', '),
    label: session.placeholder
      ? 'Demo data'
      : `${c.full ? 'Full analysis' : 'Partial analysis'}: ${used.length ? used.join(' + ') : 'no usable view'} · ${pct}% of the metric set assessable (${c.assessable} of ${c.total} values)`,
  };
}

function scoreBasis(results, cov) {
  const n = results.rows.filter((r) => r.def.phase).reduce((k, r) => k + Object.values(r.cells).filter((c) => c.weight != null).length, 0);
  if (!n) return 'No score: no scored value was assessed.';
  return `Scored over ${n} assessed value${n === 1 ? '' : 's'} only${cov.full ? '' : ` (partial coverage: ${cov.usedText}; ${cov.pct}% of the metric set assessable)`}; values not assessed are left out, never counted as normal or abnormal.`;
}

// Front-view (experimental) values: shown apart, never scored, never findings.
function experimentalModel(rec, results) {
  if (!rec) return [];
  const out = [];
  for (const [id, m] of Object.entries(rec.metrics)) {
    if (!m.experimental || NOT_RELIABLE[id]) continue;
    const def = results.rowsById[id]?.def;
    if (!def) continue;
    out.push({ id, label: def.summaryLabel || def.label, cells: Object.entries(m.experimental).map(([key, c]) => ({ key, text: cellValue(def, c, { short: true }), source: SLOT_SHORT[c.source.slot] })) });
  }
  return out;
}

// Video check per clip (capture-quality gate): verdict, plain-language reasons and fixes.
function clipChecksModel(session) {
  return Object.entries(session.clips || {})
    .filter(([, c]) => c.analysis?.captureQuality)
    .map(([slot, c]) => {
      const q = c.analysis.captureQuality;
      const level = { suitable: 'pass', degraded: 'warn', unsuitable: 'fail' }[q.level] || q.level;
      return { slot, label: CLIP_SLOTS[slot]?.label || slot, short: SLOT_SHORT[slot] || slot, level, score: q.score ?? null, reasons: q.reasons || [], fixes: q.fixes || q.advice || [], checks: q.checks || [] };
    });
}

// Correlated findings: the engine's pattern flags, with the confidence of their weakest trigger.
function findingsModel(results, rec, cellOf) {
  return results.patterns.map((p) => {
    const triggers = Object.entries(p.triggers).flatMap(([side, ts]) => ts.map((t) => ({ ...t, side })));
    const confs = triggers.filter((t) => t.metric).map((t) => rec?.metrics?.[t.metric]?.cells?.[t.cell?.side || t.side]?.confidence ?? t.cell?.confidence ?? 'low');
    let confidence = confs.length ? confs.reduce((a, b) => (RANK[b] < RANK[a] ? b : a)) : 'medium';
    // A finding is never firmer than the values behind it: any borderline / hedged trigger -> low.
    if (triggers.some((t) => t.metric && cellOf(t.metric, t.cell?.side || t.side)?.hedge)) confidence = 'low';
    return {
      id: p.def.id,
      label: p.def.label,
      scope: p.scope,
      confidence,
      triggers: triggers.map((t) => ({
        text: t.text,
        side: t.cell?.side === 'mid' ? 'mid' : t.side,
        value: t.cell && results.rowsById[t.metric] ? cellValue(results.rowsById[t.metric].def, t.cell, { short: true }) : t.value != null ? `${t.value}${t.intake === 'cadence' ? ' spm' : ''}` : null,
      })),
      considerations: p.def.considerations,
    };
  });
}

/**
 * @param {object} session  app session { intake, clips, reconciled, analysis, placeholder }
 * @param {object} results  engine analyze() output
 * @param {object} [extras] { corrections: fn(model) -> [] } (research-linked suggestions)
 */
export function buildModel(session, results, extras = {}) {
  const rec = session.reconciled || null;
  const rows = results.rows.filter((r) => (r.def.status ?? 'built') === 'built');
  const notReliable = [];
  const sections = SUMMARY_SECTIONS.map((s) => {
    const regionRows = rows
      .filter((r) => (r.def.summary || REGION[r.def.id]) === s.id)
      .filter((r) => {
        if (!NOT_RELIABLE[r.def.id]) return true;
        notReliable.push({ id: r.def.id, label: r.def.label, why: NOT_RELIABLE[r.def.id] });
        return false;
      })
      .sort((a, b) => (PHASE_ORDER[a.def.phase] ?? 9) - (PHASE_ORDER[b.def.phase] ?? 9))
      .map((r) => rowModel(r, rec?.metrics?.[r.def.id]));
    return { id: s.id, title: REGION_TITLE[s.id] || s.id, rows: regionRows, footer: s.footer || null, empty: s.emptyNote };
  });
  const notBuilt = results.rows.filter((r) => r.def.status && r.def.status !== 'built').map((r) => ({ id: r.def.id, label: r.def.label, why: r.def.status === 'not-measurable' ? 'not measurable in 2D' : 'not built: foot landmarks too small and unreliable from behind' }));
  const intake = session.intake || {};
  const cov = coverageModel(session, rec, results);
  const model = {
    header: {
      client: intake.clientCode || '',
      date: intake.sessionDate || '',
      clips: Object.keys(session.clips || {}).map((slot) => CLIP_SLOTS[slot]?.label || slot),
      height: rec?.intake?.heightCm ?? null,
      speed: intake.speedValue ? `${intake.speedValue} ${intake.speedUnit || ''}`.trim() : null,
      incline: intake.incline !== '' && intake.incline != null ? `${intake.incline}%` : null,
      cadenceEntered: intake.cadence || null,
      warnings: [...(session.analysis?.sessionWarnings || []), ...(rec?.convention?.issues || [])],
      demo: !!session.placeholder,
    },
    coverage: cov,
    // Scores rest only on assessed, scored values; the basis says how many and from which views.
    scores: { overall: results.overall, phases: results.phases.map((p) => ({ id: p.id, label: PHASE_LABEL[p.id] || p.label, score: p.score })), basis: scoreBasis(results, cov) },
    experimental: experimentalModel(rec, results),
    clipChecks: clipChecksModel(session),
    sections,
    timing: timingModel(rec),
    findings: findingsModel(results, rec, (id, key) => sections.flatMap((s) => s.rows).find((r) => r.id === id)?.cells[key]),
    notReliable,
    notBuilt,
    notMeasurable: NOT_MEASURABLE,
    limits: rec?.limits || ['Movement analysis to support clinical judgment, not a diagnosis.'],
    phases: PHASES.map((p) => ({ id: p.id, label: PHASE_LABEL[p.id] })),
  };
  model.corrections = extras.corrections ? extras.corrections(model, { results, rec }) : [];
  model.explanations = buildExplanations(model);
  return model;
}

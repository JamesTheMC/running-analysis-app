// Turns raw measurements + intake into statuses, confidence tags, scores and pattern flags.
// Pure functions; all thresholds come from config.js.

import { METRICS, PHASES, PATTERNS, SCORING, ASYMMETRY, STATUS_REASONS } from '../config.js';
import { formatRange, formatValue } from './format.js';

// Statuses for values whose colour depends on an analysis choice (IC timing, window end): range shown,
// no flag, no score weight, no pattern triggers, no L/R difference.
export const SENSITIVE = ['ic-sensitive', 'window-sensitive'];

const SIDE_KEYS = { lr: ['left', 'right'], mid: ['mid'], near: ['near'] };
const CONF_RANK = { low: 0, medium: 1, high: 2 };

export function metricById(id) {
  return METRICS.find((m) => m.id === id);
}

// Category label for 'category' metrics (first matching rule; the last rule is the fallback).
export function categoryFor(def, value) {
  return (def.categories.find((c) => c.above == null || value > c.above) || def.categories.at(-1)).label;
}

export function statusFor(def, value) {
  if (def.type === 'record' || def.type === 'category') return 'record';
  if (def.type === 'boolean') return value === def.expected ? 'green' : def.mismatchStatus;
  const { red = {}, green = {} } = def;
  // Above the template range while the reference is under review: shown, never scored.
  if (def.aboveGreen === 'review' && green.max != null && value > green.max) return 'review';
  if (red.below != null && value < red.below) return 'red';
  if (red.above != null && value > red.above) return 'red';
  const aboveMin = green.min == null || value >= green.min;
  const belowMax = green.max == null || value <= green.max;
  return aboveMin && belowMax ? 'green' : 'yellow';
}

export function confidenceFor(def, quality) {
  const q = SCORING.quality;
  if (quality == null || quality < q.floor) return null;
  const measured = quality >= q.high ? 'high' : quality >= q.medium ? 'medium' : 'low';
  const cap = def.baselineConfidence || 'high';
  return CONF_RANK[measured] <= CONF_RANK[cap] ? measured : cap;
}

// Parse the intake into the numbers the engine needs.
export function intakeNumbers(intake) {
  const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };
  let heightCm = num(intake.heightValue);
  if (heightCm != null && intake.heightUnit === 'in') heightCm *= 2.54;
  return {
    heightCm,
    speed: num(intake.speedValue),
    incline: num(intake.incline),
    cadence: num(intake.cadence),
  };
}

const viewLabel = (v) => (v === 'lateral' ? 'lateral (side)' : v === 'posterior' ? 'posterior (rear)' : v);

function evaluateCell(def, side, measurement, ctx) {
  const cell = { side, assessed: false, value: null, status: null, confidence: null, reason: null };
  const status = def.status ?? 'built';
  if (status !== 'built') {
    cell.reason = def.statusReason || STATUS_REASONS[status] || 'not measured';
    cell.notBuilt = true;
    return cell;
  }
  const allowed = def.allowedViews || [];
  if (!allowed.some((v) => ctx.views.includes(v))) {
    cell.reason = `needs a ${allowed.map(viewLabel).join(' or ')} clip`;
    cell.missingView = allowed[0];
    return cell;
  }
  // View enforcement: a value from a view the metric does not allow is never shown.
  if (measurement && (!measurement.source ? !ctx.allowUnsourced : !allowed.includes(measurement.source.view))) {
    ctx.violations.push({ metricId: def.id, side, view: measurement.source?.view ?? 'unknown' });
    cell.reason = 'not assessed from this view';
    cell.viewViolation = true;
    return cell;
  }
  const missing = (def.requires || []).filter((f) => ctx.numbers[`${f}Cm`] == null && ctx.numbers[f] == null);
  if (missing.length) {
    cell.reason = `needs ${missing.join(', ')} from intake for pixel-to-cm scale`;
    return cell;
  }
  if (!measurement) {
    // Lateral clips cover their near leg only: the other leg needs a clip filmed from its side.
    const lateralOnly = allowed.length === 1 && allowed[0] === 'lateral';
    if (lateralOnly && (side === 'left' || side === 'right') && ctx.lateralLegs && !ctx.lateralLegs.includes(side)) {
      cell.reason = `needs a lateral clip filmed from the ${side}`;
    } else cell.reason = ctx.unmeasuredReason || 'not measured';
    return cell;
  }
  const confidence = confidenceFor(def, measurement.quality);
  cell.source = measurement.source;
  if (confidence == null || measurement.value == null) {
    cell.unreliable = true;
    cell.reason = measurement.reason || 'tracking quality below the confidence floor';
    return cell;
  }
  cell.assessed = true;
  cell.value = measurement.value;
  cell.display = measurement.display;
  cell.strides = measurement.strides;
  cell.iqr = measurement.iqr;
  cell.excluded = measurement.excluded; // e.g. { rising: 12 } strides excluded and why
  cell.confidence = confidence;
  cell.status = statusFor(def, measurement.value);
  if (def.type === 'category') {
    cell.category = categoryFor(def, measurement.value);
    cell.display = `${cell.category}, ${formatValue(def, measurement.value, { short: true })}`;
  }
  // Timing-dependent metrics: if the status (or category) changes anywhere across the sweep, the value
  // is not stable enough to flag. Show the range, no prompt, no score weight, no pattern triggers.
  if (measurement.sweep && (def.type === 'range' || def.type === 'category')) {
    const values = measurement.sweep.values;
    const known = values.filter((v) => v != null);
    const classes = new Set(known.map((v) => (def.type === 'category' ? categoryFor(def, v) : statusFor(def, v))));
    cell.sweep = measurement.sweep;
    if (classes.size > 1 || known.length < values.length) {
      cell.status = measurement.sweep.kind === 'window' ? 'window-sensitive' : 'ic-sensitive';
      const range = formatRange(def, Math.min(...known), Math.max(...known));
      cell.display =
        def.type === 'category' ? `${[...classes].join(' / ')}, ${range}` : (measurement.sweep.display ?? range);
      return cell;
    }
  }
  if (def.clinicalPrompt && def.clinicalPrompt.when.includes(cell.status)) {
    cell.prompt = def.clinicalPrompt.text;
  }
  // Unscored metrics and values awaiting a reference decision never affect the score.
  if (!['record', 'review', ...SENSITIVE].includes(cell.status) && def.scored !== false) {
    cell.weight = (def.priority ? SCORING.priorityMultiplier : 1) * SCORING.confidenceWeight[confidence];
    cell.credit = SCORING.credit[cell.status];
  }
  return cell;
}

export function asymmetry(left, right) {
  if (!left?.assessed || !right?.assessed) return null;
  if (SENSITIVE.includes(left.status) || SENSITIVE.includes(right.status)) return null;
  // Posterior: both legs from one clip, compared only when that clip passed the left/right swap check.
  const views = [left.source?.view, right.source?.view];
  if (views.includes('posterior') && !(left.source?.swapCheckPassed && right.source?.swapCheckPassed)) return null;
  // Lateral: each leg must come from its own near-side clip (planned two-clip session).
  const separateClips = views[0] === 'lateral' && views[1] === 'lateral';
  if (separateClips && left.source.filmedFrom === right.source.filmedFrom) return null;
  if (typeof left.value !== 'number' || typeof right.value !== 'number') return null;
  const absDiff = Math.abs(left.value - right.value);
  const mean = (Math.abs(left.value) + Math.abs(right.value)) / 2;
  if (mean < ASYMMETRY.minMeanForPercent) return { absDiff, percent: null, separateClips };
  return { absDiff, percent: (absDiff / mean) * 100, separateClips };
}

function score(cells) {
  let num = 0;
  let den = 0;
  for (const c of cells) {
    if (c.weight == null) continue;
    num += c.weight * c.credit;
    den += c.weight;
  }
  return den > 0 ? Math.round((num / den) * 100) : null;
}

function scoreSet(rows) {
  const cells = rows.flatMap((r) => Object.values(r.cells));
  // A side score needs at least one scored value for that limb; midline cells alone don't make one
  // (e.g. the far side of a single side-view clip has no scored values).
  const forSide = (side) => (cells.some((c) => c.side === side && c.weight != null) ? cells.filter((c) => c.side === side || c.side === 'mid') : []);
  return { overall: score(cells), left: score(forSide('left')), right: score(forSide('right')) };
}

function cellForSide(row, side) {
  if (!row) return null;
  return row.cells[side] || row.cells.mid || null;
}

function evalTrigger(trigger, side, rowsById, numbers, fired) {
  if (trigger.pattern) {
    return fired[trigger.pattern]?.[side] ? { text: trigger.text } : null;
  }
  if (trigger.intake) {
    const v = numbers[trigger.intake];
    if (v == null) return null;
    const hit = (trigger.below != null && v < trigger.below) || (trigger.above != null && v > trigger.above);
    return hit ? { text: trigger.text, intake: trigger.intake, value: v } : null;
  }
  const row = rowsById[trigger.metric];
  const cell = cellForSide(row, side);
  // Far-side and IC-sensitive values never trigger patterns.
  if (!cell?.assessed || SENSITIVE.includes(cell.status)) return null;
  let hit = false;
  if (trigger.status) hit = trigger.status.includes(cell.status);
  if (trigger.below != null) hit = typeof cell.value === 'number' && cell.value < trigger.below;
  if (trigger.above != null) hit = typeof cell.value === 'number' && cell.value > trigger.above;
  return hit ? { text: trigger.text, metric: trigger.metric, cell, sided: cell.side !== 'mid' } : null;
}

export function evaluatePatterns(rowsById, numbers) {
  const fired = {};
  const results = [];
  for (const p of PATTERNS) {
    fired[p.id] = {};
    const bySide = {};
    for (const side of ['left', 'right']) {
      const allHits = p.all.map((t) => evalTrigger(t, side, rowsById, numbers, fired));
      if (allHits.some((h) => !h)) continue;
      const anyHits = p.any.map((t) => evalTrigger(t, side, rowsById, numbers, fired)).filter(Boolean);
      if (anyHits.length < p.minAny) continue;
      fired[p.id][side] = true;
      bySide[side] = [...allHits, ...anyHits];
    }
    const sides = Object.keys(bySide);
    if (!sides.length) continue;
    // If no limb-specific metric contributed, the finding is midline/bilateral, not per leg.
    const sided = sides.some((s) => bySide[s].some((h) => h.sided));
    const scope = !sided ? 'midline' : sides.length === 2 ? 'both' : sides[0];
    results.push({ def: p, scope, triggers: bySide });
  }
  return results;
}

// session = { intake, views: ['lateral', 'posterior'], analysis: { measurements, lateralLegs } }
export function analyze(session) {
  const numbers = intakeNumbers(session.intake);
  const ctx = {
    views: session.views,
    numbers,
    unmeasuredReason: session.analysis.unmeasuredReason,
    lateralLegs: session.analysis.lateralLegs,
    allowUnsourced: session.analysis.source === 'placeholder', // demo data only
    violations: [],
  };
  const rows = METRICS.map((def) => {
    const m = session.analysis.measurements[def.id] || {};
    const cells = {};
    for (const side of SIDE_KEYS[def.sided]) cells[side] = evaluateCell(def, side, m[side], ctx);
    const row = { def, cells };
    if (def.sided === 'lr' && def.type !== 'boolean') row.asymmetry = asymmetry(cells.left, cells.right);
    return row;
  });
  const rowsById = Object.fromEntries(rows.map((r) => [r.def.id, r]));

  const phases = PHASES.map((ph) => {
    const phaseRows = rows.filter((r) => r.def.phase === ph.id);
    return { ...ph, rows: phaseRows, score: scoreSet(phaseRows) };
  });
  const scoredRows = rows.filter((r) => r.def.phase);
  const overall = scoreSet(scoredRows);

  const notAssessed = [];
  for (const r of rows) {
    for (const c of Object.values(r.cells)) {
      if (!c.assessed) notAssessed.push({ def: r.def, side: c.side, reason: c.reason, unreliable: !!c.unreliable, notBuilt: !!c.notBuilt, missingView: c.missingView });
    }
  }

  return {
    rows,
    rowsById,
    phases,
    overall,
    notAssessed,
    patterns: evaluatePatterns(rowsById, numbers),
    numbers,
    viewViolations: ctx.violations,
  };
}

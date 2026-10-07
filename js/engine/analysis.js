// Turns raw measurements + intake into statuses, confidence tags, scores and pattern flags.
// Pure functions; all thresholds come from config.js.

import { METRICS, PHASES, PATTERNS, SCORING, ASYMMETRY } from '../config.js';
import { formatRange } from './format.js';

// Statuses for values whose colour depends on an analysis choice (IC timing, window end): range shown,
// no flag, no score weight, no pattern triggers, no L/R difference.
export const SENSITIVE = ['ic-sensitive', 'window-sensitive'];

const SIDE_KEYS = { lr: ['left', 'right'], mid: ['mid'], near: ['near'] };
const CONF_RANK = { low: 0, medium: 1, high: 2 };

export function metricById(id) {
  return METRICS.find((m) => m.id === id);
}

export function statusFor(def, value) {
  if (def.type === 'record') return 'record';
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

export function confidenceFor(def, quality, { farSide = false } = {}) {
  const q = SCORING.quality;
  if (quality == null || quality < q.floor) return null;
  const measured = quality >= q.high ? 'high' : quality >= q.medium ? 'medium' : 'low';
  // Far-side limbs (further from a side camera) are capped at low confidence.
  const cap = farSide ? 'low' : def.baselineConfidence || 'high';
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

function evaluateCell(def, side, measurement, ctx) {
  const cell = { side, assessed: false, value: null, status: null, confidence: null, reason: null };
  if (!ctx.views.includes(def.view)) {
    cell.reason = `no ${def.view}-view clip in this session`;
    return cell;
  }
  const missing = (def.requires || []).filter((f) => ctx.numbers[`${f}Cm`] == null && ctx.numbers[f] == null);
  if (missing.length) {
    cell.reason = `needs ${missing.join(', ')} from intake for pixel-to-cm scale`;
    return cell;
  }
  if (!measurement) {
    cell.reason = ctx.unmeasuredReason || 'not measured';
    return cell;
  }
  const confidence = confidenceFor(def, measurement.quality, { farSide: measurement.farSide });
  cell.farSide = !!measurement.farSide;
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
  // IC-dependent metrics: if the status changes anywhere across the IC-tolerance sweep, the value is
  // not stable enough to flag. Show the range, no prompt, no score weight, no pattern triggers.
  if (measurement.sweep && def.type === 'range') {
    const values = measurement.sweep.values;
    const known = values.filter((v) => v != null);
    const statuses = new Set(known.map((v) => statusFor(def, v)));
    cell.sweep = measurement.sweep;
    if (statuses.size > 1 || known.length < values.length) {
      cell.status = measurement.sweep.kind === 'window' ? 'window-sensitive' : 'ic-sensitive';
      cell.display = measurement.sweep.display ?? formatRange(def, Math.min(...known), Math.max(...known));
      return cell;
    }
  }
  if (def.clinicalPrompt && def.clinicalPrompt.when.includes(cell.status)) {
    cell.prompt = def.clinicalPrompt.text;
  }
  // Far-side values and values awaiting a reference decision never affect the score.
  if (!['record', 'review', ...SENSITIVE].includes(cell.status) && !cell.farSide) {
    cell.weight = (def.priority ? SCORING.priorityMultiplier : 1) * SCORING.confidenceWeight[confidence];
    cell.credit = SCORING.credit[cell.status];
  }
  return cell;
}

export function asymmetry(left, right) {
  if (!left?.assessed || !right?.assessed) return null;
  if (left.farSide || right.farSide) return null; // far-side values are not comparable
  if (SENSITIVE.includes(left.status) || SENSITIVE.includes(right.status)) return null;
  if (typeof left.value !== 'number' || typeof right.value !== 'number') return null;
  const absDiff = Math.abs(left.value - right.value);
  const mean = (Math.abs(left.value) + Math.abs(right.value)) / 2;
  if (mean < ASYMMETRY.minMeanForPercent) return { absDiff, percent: null };
  return { absDiff, percent: (absDiff / mean) * 100 };
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
  if (!cell?.assessed || cell.farSide || SENSITIVE.includes(cell.status)) return null;
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

// session = { intake, views: ['side', 'rear'], analysis: { measurements } }
export function analyze(session) {
  const numbers = intakeNumbers(session.intake);
  const ctx = { views: session.views, numbers, unmeasuredReason: session.analysis.unmeasuredReason };
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
      if (!c.assessed) notAssessed.push({ def: r.def, side: c.side, reason: c.reason, unreliable: !!c.unreliable, farSide: !!c.farSide });
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
  };
}

import { UNITS, STATUS_LABELS } from '../config.js';

export function formatValue(def, value, { short = false } = {}) {
  if (value == null) return '—';
  if (def.type === 'boolean') return def.display?.[String(value)] ?? (value ? 'Yes' : 'No');
  const unit = UNITS[def.unit] || { suffix: '', decimals: 1 };
  let suffix = short && unit.short ? unit.short : unit.suffix;
  if (value === 1 && unit.singular) suffix = unit.singular;
  const text = value.toFixed(unit.decimals);
  return `${/^-0\.?0*$/.test(text) ? text.slice(1) : text}${suffix}`; // no "-0.0"
}

// "27.7–33.0°": a range in the metric's unit, suffix once.
export function formatRange(def, lo, hi) {
  const unit = UNITS[def.unit] || { suffix: '', decimals: 1 };
  const f = (v) => {
    const t = v.toFixed(unit.decimals);
    return /^-0\.?0*$/.test(t) ? t.slice(1) : t;
  };
  return `${f(lo)}–${f(hi)}${unit.suffix}`;
}

// A cell's value text: the pipeline may supply its own display (e.g. "12.3 cm (≈0.45 shoe lengths)").
export function cellValue(def, cell, opts) {
  return cell.display ?? formatValue(def, cell.value, opts);
}

export function formatDiff(def, asym) {
  if (!asym) return null;
  if (asym.percent != null) return `${asym.percent.toFixed(0)}%`;
  const unit = UNITS[def.unit] || { suffix: '', decimals: 1 };
  return `${asym.absDiff.toFixed(unit.decimals)}${unit.suffix} abs`;
}

export function statusLabel(status, kind = 'report') {
  return STATUS_LABELS[status]?.[kind] ?? '';
}

// Map a cell side to a display label. `filmedFrom` is the runner's side facing the camera.
export function sideLabel(side, filmedFrom, { short = false } = {}) {
  if (side === 'left') return short ? 'L' : 'Left';
  if (side === 'right') return short ? 'R' : 'Right';
  if (side === 'near') {
    if (filmedFrom === 'left') return short ? 'L (near)' : 'Left (near side)';
    if (filmedFrom === 'right') return short ? 'R (near)' : 'Right (near side)';
    return 'Near side';
  }
  return short ? '' : 'Midline';
}

export function formatSpeed(intake) {
  if (!intake.speedValue) return 'not entered';
  return `${intake.speedValue} ${intake.speedUnit}`;
}

export function formatIncline(intake) {
  return intake.incline !== '' && intake.incline != null ? `${intake.incline}%` : 'not entered';
}

export function formatCadence(intake) {
  return intake.cadence ? `${intake.cadence} spm` : 'not entered';
}

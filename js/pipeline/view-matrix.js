// Metric-to-view matrix: which views can provide each metric, which view is authoritative, and which
// cross-checks exist when several views cover the same quantity. One table, used by reconciliation
// (reconcile.js), the presentation model ("Not assessed: needs …", coverage) and the tests; the same
// table is in HANDOFF.md §9 (a test keeps the two identical).
//
// Rules (owner brief 2026-10-15):
//   - left side view (lateral_left) is authoritative for left-leg sagittal values, right side view for
//     right-leg values; the far leg of a side view is never used;
//   - midline sagittal values (trunk lean) come from either side view; with both, they are combined
//     and cross-checked (> 3° apart = noted, session.js MIDLINE_DISAGREE);
//   - frontal-plane values come from the rear view (posterior); the front view (anterior) gives an
//     experimental value only (never scored, never a finding) until validated on real front video;
//   - timing: cadence and step times from every view, cross-checked when several exist (two side
//     views cross-check cadence, step times and left/right symmetry); contact time and vertical
//     oscillation from side views only.
import { CLIP_SLOTS, METRICS } from '../config.js';

export const SLOTS = Object.keys(CLIP_SLOTS); // lateral_left, lateral_right, posterior, anterior
export const SLOT_SHORT = Object.fromEntries(SLOTS.map((s) => [s, CLIP_SLOTS[s].short]));

const built = (def) => (def.status ?? 'built') === 'built';
const keysOf = (def) => (def.sided === 'mid' ? ['mid'] : ['left', 'right']);

// Per metric and cell (left / right / mid): authoritative slot(s), experimental slot(s), cross-check.
export function cellSources(def, key) {
  const v = def.allowedViews || [];
  if (v.includes('lateral')) {
    if (key === 'mid') return { authoritative: ['lateral_left', 'lateral_right'], experimental: [], crossCheck: 'both side views: combined; noted when more than 3° apart' };
    return { authoritative: [`lateral_${key}`], experimental: [], crossCheck: null };
  }
  if (v.includes('posterior')) return { authoritative: ['posterior'], experimental: (def.experimentalViews || []).filter((x) => x === 'anterior'), crossCheck: null };
  return { authoritative: [], experimental: [], crossCheck: null };
}

// Timing quantities (reconcile.js crossChecks).
export const TIMING_MATRIX = [
  { quantity: 'cadence', authoritative: ['lateral_left', 'lateral_right', 'posterior'], experimental: ['anterior'], crossCheck: 'all views agree within 3%; otherwise the higher-confidence view' },
  { quantity: 'step time, left', authoritative: ['lateral_left', 'lateral_right', 'posterior'], experimental: ['anterior'], crossCheck: 'within one frame of the coarser clip' },
  { quantity: 'step time, right', authoritative: ['lateral_left', 'lateral_right', 'posterior'], experimental: ['anterior'], crossCheck: 'within one frame of the coarser clip' },
  { quantity: 'step-time asymmetry (+ = left longer)', authoritative: ['lateral_left', 'lateral_right', 'posterior'], experimental: ['anterior'], crossCheck: 'within 5 percentage points (left/right symmetry)' },
  { quantity: 'contact time', authoritative: ['lateral_left', 'lateral_right'], experimental: [], crossCheck: 'two side views within 25 ms; rear/front not observable' },
  { quantity: 'vertical oscillation (pelvis)', authoritative: ['lateral_left', 'lateral_right'], experimental: [], crossCheck: 'two side views within 1.5 cm; rear reads high (perspective), information only' },
];

// The full matrix, one row per built metric.
export function viewMatrix() {
  return METRICS.filter(built).map((def) => ({
    id: def.id,
    label: def.label,
    cells: Object.fromEntries(keysOf(def).map((k) => [k, cellSources(def, k)])),
  }));
}

// Plain-language name of the view(s) a cell needs, e.g. "the left side view", "a side view (left or right)".
export function needsText(def, key) {
  const { authoritative } = cellSources(def, key);
  if (!authoritative.length) return null;
  if (authoritative.length === 2) return 'a side view (left or right)';
  return `the ${SLOT_SHORT[authoritative[0]]}`;
}

// Usable slots: clips present whose capture gate did not fail.
export function usableSlots(clips) {
  return SLOTS.filter((s) => clips?.[s]?.analysis && !['unsuitable', 'fail'].includes(clips[s].analysis.captureQuality?.level));
}

// Coverage: share of the metric set (built, reportable cells; experimental excluded) whose
// authoritative view is among the usable clips. `exclude` = metric ids never reported (not reliable).
export function coverage(clips, { exclude = [] } = {}) {
  const present = SLOTS.filter((s) => clips?.[s]?.analysis);
  const usable = usableSlots(clips);
  let total = 0;
  let assessable = 0;
  const byView = {};
  for (const def of METRICS.filter(built)) {
    if (exclude.includes(def.id)) continue;
    for (const k of keysOf(def)) {
      const { authoritative } = cellSources(def, k);
      total++;
      if (authoritative.some((s) => usable.includes(s))) assessable++;
      for (const s of authoritative) byView[s] = (byView[s] || 0) + 1 / authoritative.length;
    }
  }
  const missing = SLOTS.filter((s) => !present.includes(s) && !CLIP_SLOTS[s].experimental);
  return {
    present,
    usable,
    failed: present.filter((s) => !usable.includes(s)),
    missing,
    total,
    assessable,
    share: total ? assessable / total : 0,
    signature: usable.join('+') || 'none',
    full: SLOTS.filter((s) => !CLIP_SLOTS[s].experimental).every((s) => usable.includes(s)),
  };
}

// Comparing two sessions: a warning when their view coverage differs (values missing in one are not
// comparable, and coverage-limited scores rest on different metric sets).
export function compareCoverage(a, b) {
  if (a.signature === b.signature) return { same: true, warning: null };
  const name = (c) => (c.usable.length ? c.usable.map((s) => SLOT_SHORT[s]).join(', ') : 'no usable view');
  return {
    same: false,
    warning: `Different view coverage: ${name(a)} (${Math.round(a.share * 100)}% of the metric set) vs ${name(b)} (${Math.round(b.share * 100)}%). Compare only metrics assessed in both; scores rest on different metric sets.`,
  };
}

// The matrix as Markdown table rows (HANDOFF.md §9 must contain exactly these; checked by a test).
export function matrixMarkdownRows() {
  const names = (slots) => (slots.length ? slots.map((s) => SLOT_SHORT[s]).join(', ') : '—');
  const rows = viewMatrix().map(({ id, label, cells }) => {
    const keys = Object.keys(cells);
    const c = cells[keys[0]];
    const lateralLr = keys.length === 2 && c.authoritative[0]?.startsWith('lateral');
    const auth = lateralLr ? 'L: left side view; R: right side view' : c.authoritative.length === 2 ? 'left or right side view' : names(c.authoritative);
    const cross = c.crossCheck || (lateralLr ? 'none (far leg never used)' : '—');
    return `| \`${id}\` | ${label} | ${keys.length === 2 ? 'L, R' : 'mid'} | ${auth} | ${names(c.experimental)} | ${cross} |`;
  });
  const timing = TIMING_MATRIX.map((t) => `| ${t.quantity} | (timing) | — | ${names(t.authoritative)} | ${names(t.experimental)} | ${t.crossCheck} |`);
  return [...rows, ...timing];
}

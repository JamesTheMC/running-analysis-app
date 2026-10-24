// Compare two sessions (e.g. the same client before and after a block of work). Only values assessed
// in BOTH sessions are compared; a change smaller than the metric's validated measurement error is
// labelled "within measurement error", not a change. Different view coverage gets a warning
// (view-matrix.js compareCoverage). Statuses are shown only as each session showed them.
import { VALIDATION_ERROR } from '../pipeline/reconcile.js';
import { compareCoverage } from '../pipeline/view-matrix.js';
import { STATUS_WORD } from './model.js';

const SIDE = { left: 'L', right: 'R', mid: '' };

export function compareModels(a, b) {
  const rowsA = new Map(a.sections.flatMap((s) => s.rows).map((r) => [r.id, r]));
  const out = [];
  let onlyOne = 0;
  for (const s of b.sections) {
    for (const rb of s.rows) {
      const ra = rowsA.get(rb.id);
      if (!ra) continue;
      for (const [key, cb] of Object.entries(rb.cells)) {
        const ca = ra.cells[key];
        if (!ca?.assessed || !cb.assessed) {
          if (ca?.assessed || cb.assessed) onlyOne++;
          continue;
        }
        const numeric = typeof ca.value === 'number' && typeof cb.value === 'number';
        const delta = numeric ? cb.value - ca.value : null;
        const err = VALIDATION_ERROR[rb.id];
        out.push({
          id: rb.id,
          section: s.title,
          label: `${rb.label}${SIDE[key] ? ` (${SIDE[key]})` : ''}`,
          a: ca.text,
          b: cb.text,
          aStatus: ca.status ? STATUS_WORD[ca.status] : null,
          bStatus: cb.status ? STATUS_WORD[cb.status] : null,
          delta,
          unit: rb.unitSymbol || '',
          withinError: numeric && err != null ? Math.abs(delta) <= err : null,
          error: err ?? null,
          changedText: !numeric && ca.text !== cb.text,
        });
      }
    }
  }
  const timing = [];
  for (const tb of b.timing?.rows || []) {
    const ta = a.timing?.rows.find((x) => x.label === tb.label);
    if (ta) timing.push({ label: tb.label, a: ta.text, b: tb.text });
  }
  return { rows: out, timing, onlyOne, coverage: compareCoverage(a.coverage, b.coverage) };
}

export function compareText(cmp, a, b) {
  const head = `COMPARISON | ${a.header.client} | ${a.header.date} → ${b.header.date}`;
  const lines = [head];
  if (cmp.coverage.warning) lines.push(`Note: ${cmp.coverage.warning}`);
  if (cmp.onlyOne) lines.push(`${cmp.onlyOne} value(s) were assessed in only one session and are not compared.`);
  for (const r of cmp.rows) {
    const d = r.delta == null ? (r.changedText ? 'changed' : 'same') : `${r.delta > 0 ? '+' : ''}${r.delta.toFixed(1)}${r.unit}${r.withinError ? ' (within measurement error)' : r.withinError === false ? '' : ' (error not validated)'}`;
    lines.push(`${r.label}: ${r.a} → ${r.b} | ${d}`);
  }
  for (const t of cmp.timing) lines.push(`${t.label}: ${t.a} → ${t.b}`);
  lines.push('Movement analysis from 2D video to support clinical judgment, not a diagnosis.');
  return lines.join('\n');
}

// Copy-paste summary and plain-language interpretation, both rendered from the presentation model
// (model.js), in the clinic template order: ankle, knee, hip, lumbar (trunk), arms, then timing,
// correlated findings, suggestions, interpretation and limits.
import { STATUS_WORD } from './model.js';

const SIDE = { left: 'L', right: 'R', mid: '' };
const MISSING_LEG = /^needs a lateral clip filmed from the (left|right)$/;

function cellText(c) {
  if (!c.assessed) return `not assessed (${c.why})`;
  const tags = [c.status ? STATUS_WORD[c.status] : null, c.hedge, !c.hedge && c.confidence !== 'high' && !c.status ? `${c.confidence} confidence` : null].filter(Boolean);
  return `${c.text}${tags.length ? ` (${tags.join('; ')})` : ''}`;
}

function rangeText(r) {
  if (!r.range?.green || r.type === 'boolean') return '';
  return ` | ref ${r.range.green}${r.range.red ? `, flag ${r.range.red}` : ''}${r.range.provisional ? ' (provisional)' : ''}`;
}

// One metric line; sides that only need the other lateral clip are left out (stated in the header).
function rowLine(r) {
  const cells = Object.values(r.cells).filter((c) => c.assessed || !MISSING_LEG.test(c.why));
  if (!cells.length) return null;
  const body = cells.map((c) => `${SIDE[c.key] ? `${SIDE[c.key]} ` : ''}${cellText(c)}`).join(' / ');
  return `${r.label}: ${body}${r.diff ? ` | L–R diff ${r.diff}${r.diffNote ? ` (${r.diffNote})` : ''}` : ''}${rangeText(r)}`;
}

export function missingLegs(model) {
  const legs = new Set();
  for (const s of model.sections) for (const r of s.rows) for (const c of Object.values(r.cells)) if (!c.assessed && MISSING_LEG.test(c.why)) legs.add(c.why.match(MISSING_LEG)[1]);
  return [...legs];
}

const list = (items) => (items.length <= 1 ? items.join('') : items.length === 2 ? `${items[0]} and ${items[1]}` : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const lower = (t) => (/^[A-Z][a-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t);

function cellsWhere(model, pred) {
  const out = [];
  for (const s of model.sections) for (const r of s.rows) for (const c of Object.values(r.cells)) if (c.assessed && pred(c, r)) out.push({ r, c });
  return out;
}
const named = ({ r, c }) => `${lower(r.label)}${SIDE[c.key] ? ` (${c.key})` : ''} ${c.text}`;

// Plain-language interpretation (editable on screen before copying).
export function buildInterpretation(model) {
  const p = [];
  const t = model.timing?.rows || [];
  const get = (label) => t.find((x) => x.label === label);
  const cad = get('Cadence');
  const contact = get('Ground contact time');
  const share = get('Contact share of the stride');
  if (cad) p.push(`Cadence was ${cad.text}${cad.agreement === 'agree' ? ' (side and rear videos agree)' : ''}${contact ? `, with ${contact.text} of ground contact per step` : ''}${share && /no flight/.test(share.text) ? ', and no flight phase (each foot lands as the other leaves)' : ''}.`);
  const reds = cellsWhere(model, (c) => c.status === 'red');
  const yellows = cellsWhere(model, (c) => c.status === 'yellow');
  if (reds.length) p.push(`Outside the usual range: ${list(reds.map(named))}.`);
  if (yellows.length) p.push(`Worth watching: ${list(yellows.map(named))}.`);
  if (!reds.length && !yellows.length) p.push('No measured value was clearly outside its usual range.');
  const border = cellsWhere(model, (c) => /^borderline/.test(c.hedge || ''));
  if (border.length) p.push(`Close to a threshold, so not flagged: ${list(border.map(named))}.`);
  const solidFindings = model.findings.filter((f) => f.confidence !== 'low');
  if (solidFindings.length) p.push(`Findings that occur together: ${list(solidFindings.map((f) => lower(f.label)))}.`);
  const weakFindings = model.findings.filter((f) => f.confidence === 'low');
  if (weakFindings.length) p.push(`Possible, but resting on borderline or low-confidence values: ${list(weakFindings.map((f) => lower(f.label)))}.`);
  const top = (model.corrections || []).filter((c) => c.priority === 'primary').slice(0, 3);
  if (top.length) p.push(`Suggested focus: ${list(top.map((c) => lower(c.cue)))}.`);
  p.push('This is movement analysis from 2D video to support clinical judgment, not a diagnosis; values marked low confidence or borderline are indicative only.');
  return p.join(' ');
}

export function buildSummaryText(model, interpretation) {
  const h = model.header;
  const out = [];
  out.push(`GAIT ANALYSIS SUMMARY | ${h.client} | ${h.date}`);
  out.push([`Clips: ${h.clips.join(', ') || 'none'}`, h.height ? `Height ${Math.round(h.height)} cm` : null, h.speed ? `Speed ${h.speed}` : null, h.incline ? `Incline ${h.incline}` : null].filter(Boolean).join(' | '));
  const legs = missingLegs(model);
  if (legs.length) out.push(`Side-view values for the ${list(legs)} leg need a clip filmed from that side.`);
  for (const w of h.warnings) out.push(`Note: ${w}`);
  if (h.demo) out.push('DEMO DATA: invented numbers, not from any video.');

  for (const s of model.sections) {
    out.push('', s.title.toUpperCase());
    const lines = s.rows.map((r) => ({ r, line: rowLine(r) })).filter((x) => x.line);
    if (!lines.length) out.push(s.empty || 'Nothing assessed.');
    let phase = null;
    for (const { r, line } of lines) {
      if (r.phaseLabel !== phase) {
        phase = r.phaseLabel;
        out.push(`${phase}:`);
      }
      out.push(`  ${line}`);
    }
  }

  if (model.timing?.rows.length) {
    out.push('', 'TIMING AND MECHANICS');
    for (const r of model.timing.rows) out.push(`${r.label}: ${r.text}${r.agreement === 'agree' ? ' (side and rear agree)' : r.flag ? ` (${r.flag})` : ''}${r.note ? ` (${r.note})` : ''}`);
    for (const n of model.timing.notes || []) out.push(`Note: ${n}`);
  }

  if (model.findings.length) {
    out.push('', 'CORRELATED FINDINGS');
    for (const f of model.findings) out.push(`${f.label}${f.confidence === 'low' ? ' (low confidence)' : ''}: ${f.triggers.map((t) => `${t.text}${t.value ? ` (${t.value})` : ''}`).join('; ')}`);
  }

  if (model.corrections?.length) {
    out.push('', 'WHAT TO WORK ON (research-linked; clinician to confirm)');
    for (const c of model.corrections) out.push(`- ${c.priority === 'consider' ? 'Consider: ' : ''}${c.cue} [for: ${c.forText}; evidence: ${c.strength}${c.refs?.length ? `; ${c.refs.join('; ')}` : ''}]`);
  }

  if (model.notReliable.length) {
    out.push('', 'NOT REPORTED (not reliable from video)');
    for (const n of model.notReliable) out.push(`${n.label}: ${n.why}`);
  }

  out.push('', 'INTERPRETATION', interpretation || buildInterpretation(model));
  out.push('', `Limits: ${model.limits.join(' ')}`);
  return out.join('\n');
}

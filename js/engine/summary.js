// Builds the plain-text copy-paste summary (SPEC Section 5) and the auto-generated interpretation.

import { SUMMARY_SECTIONS, ASYMMETRY } from '../config.js';
import { cellValue, formatDiff, statusLabel, sideLabel, formatSpeed, formatIncline, formatCadence } from './format.js';

function cellText(def, cell) {
  const value = cellValue(def, cell, { short: true });
  const strides = cell.strides ? `median of ${cell.strides} strides` : '';
  if (cell.status === 'ic-sensitive') return `${value} (${statusLabel(cell.status, 'summary')}: range across initial-contact timing, not scored)`;
  if (cell.status === 'window-sensitive') return `${value} (${statusLabel(cell.status, 'summary')}: range across analysis-window choices, not scored${excludedText(cell)})`;
  const conf = cell.confidence !== 'high' ? `${cell.confidence} confidence` : '';
  const status = def.type === 'record' || def.type === 'category' ? '' : statusLabel(cell.status, 'summary');
  const unscored = def.scored === false && status && cell.status !== 'review' ? 'not scored' : '';
  const parts = [status, unscored, conf, strides + excludedText(cell)].filter(Boolean);
  return parts.length ? `${value} (${parts.join(', ')})` : value;
}

// Strides left out of a median, stated so they are never dropped silently.
function excludedText(cell) {
  return cell.excluded?.rising ? `; ${cell.excluded.rising} strides excluded: angle still rising at the window end` : '';
}

// Anything below the confidence floor (or not measured) says "not assessed" and never shows a number.
function notAssessedText(cell) {
  return `not assessed (${cell.reason})`;
}

// Lowercase the first letter for use mid-sentence, leaving acronyms (COM, IC, DF) intact.
const PROPER = ['Achilles'];
function midSentence(text) {
  if (PROPER.some((p) => text.startsWith(p))) return text;
  return /^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text;
}

function metricLine(row, filmedFrom) {
  const { def, cells } = row;
  const name = def.summaryLabel || def.label;
  const ref =
    def.type === 'range' && def.greenText
      ? ` | ref ${def.greenText}`
      : def.type === 'record'
        ? ` | recorded${def.baselineConfidence === 'low' ? ', trend only' : ''}`
        : '';
  const prompts = Object.values(cells)
    .filter((c) => c.prompt)
    .map((c) => `${sideLabel(c.side, filmedFrom, { short: true })}: ${c.prompt}`);
  const promptText = prompts.length ? ` | ${prompts.join('; ')}` : '';

  if (def.sided === 'lr') {
    const { left, right } = cells;
    if (!left.assessed && !right.assessed && left.reason === right.reason) {
      return `${name}: ${notAssessedText(left)}`;
    }
    const side = (c, l) => `${l} ${c.assessed ? cellText(def, c) : notAssessedText(c)}`;
    const diff = formatDiff(def, row.asymmetry);
    const diffText = diff ? ` | diff ${diff}` : '';
    return `${name}: ${side(left, 'L')} / ${side(right, 'R')}${diffText}${ref}${promptText}`;
  }

  const [cell] = Object.values(cells);
  const label = def.sided === 'near' ? `, ${sideLabel('near', filmedFrom)}` : '';
  if (!cell.assessed) return `${name}${label}: ${notAssessedText(cell)}`;
  return `${name}${label}: ${cellText(def, cell)}${ref}${promptText}`;
}

export function buildSections(results, intake) {
  return SUMMARY_SECTIONS.map((s) => {
    const rows = results.rows.filter((r) => r.def.summary === s.id);
    const lines = rows.map((r) => metricLine(r, intake.filmedFrom));
    if (!lines.length) lines.push(s.emptyNote);
    if (s.footer) lines.push(s.footer);
    return { title: s.id, lines };
  });
}

export function buildHeader(intake, { placeholder, analysis } = {}) {
  const lines = [
    `GAIT ANALYSIS SUMMARY | ${intake.clientCode} | ${intake.sessionDate}`,
    `Speed: ${formatSpeed(intake)} | Incline: ${formatIncline(intake)} | Cadence: ${formatCadence(intake)}`,
  ];
  const clips = analysis?.clipsUsed;
  if (clips?.length) lines.push(`Clips: ${clips.join(' | ')}`);
  const v = analysis?.cadenceVideo;
  if (v) {
    lines.push(`Video: ${analysis.cyclesDetected} strides analysed | Cadence from stride period: ${Math.round(v.spm)} spm (unvalidated, not used for scoring)`);
  }
  if (placeholder) lines.unshift('[PLACEHOLDER DATA - NOT A REAL ANALYSIS]');
  return lines;
}

function describeCell(def, cell, filmedFrom) {
  const who = cell.side === 'mid' ? '' : `${sideLabel(cell.side, filmedFrom)} `;
  return `${who}${midSentence(def.summaryLabel || def.label)} ${cellValue(def, cell, { short: true })}`;
}

function sentenceList(items) {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join('; ')}; and ${items[items.length - 1]}`;
}

export function buildInterpretation(results, intake) {
  const fp = intake.filmedFrom;
  const paras = [];
  const scored = results.rows.filter((r) => r.def.phase);
  const cellsWith = (status) =>
    scored.flatMap((r) =>
      Object.values(r.cells)
        .filter((c) => c.status === status)
        .map((c) => ({ def: r.def, cell: c })),
    );

  const reds = cellsWith('red');
  const yellows = cellsWith('yellow');
  if (reds.length) {
    paras.push(
      `Key findings outside the clinic template range: ${sentenceList(
        reds.map(({ def, cell }) => `${describeCell(def, cell, fp)} (ref ${def.greenText})`),
      )}.`,
    );
  } else {
    paras.push('No assessed metrics fell in the flag range.');
  }
  if (yellows.length) {
    paras.push(`Borderline (caution): ${sentenceList(yellows.map(({ def, cell }) => describeCell(def, cell, fp)))}.`);
  }
  const reviews = cellsWith('review');
  if (reviews.length) {
    paras.push(
      `Above the clinic template range, reference under review (not scored): ${sentenceList(
        reviews.map(({ def, cell }) => `${describeCell(def, cell, fp)} (template ${def.greenText})`),
      )}.`,
    );
  }
  const icSensitive = results.rows.flatMap((r) =>
    Object.values(r.cells)
      .filter((c) => c.status === 'ic-sensitive')
      .map((c) => describeCell(r.def, c, fp)),
  );
  if (icSensitive.length) {
    paras.push(
      `Borderline, IC-sensitive (the green/yellow/red status changes with small shifts in detected initial-contact timing, so no flag is shown and these are not scored or used for patterns until validated): ${sentenceList(icSensitive)}.`,
    );
  }
  const windowSensitive = results.rows.flatMap((r) =>
    Object.values(r.cells)
      .filter((c) => c.status === 'window-sensitive')
      .map((c) => describeCell(r.def, c, fp)),
  );
  if (windowSensitive.length) {
    paras.push(
      `Borderline, window-sensitive (the status changes with how the late-stance window is defined, so no status is shown and these are not scored or used for patterns until validated): ${sentenceList(windowSensitive)}.`,
    );
  }

  for (const p of results.patterns) {
    const scope = { left: 'left side', right: 'right side', both: 'both sides', midline: 'trunk/midline' }[p.scope];
    const triggerSides = p.scope === 'both' ? ['left', 'right'] : [Object.keys(p.triggers)[0]];
    const triggers = triggerSides.flatMap((s) =>
      p.triggers[s].map((t) => {
        if (t.cell) return `${t.text} (${cellValue(results.rowsById[t.metric].def, t.cell, { short: true })})`;
        if (t.intake) return `${t.text} (${t.value}${t.intake === 'cadence' ? ' spm' : ''})`;
        return t.text;
      }),
    );
    const uniqueTriggers = [...new Set(triggers)];
    paras.push(
      `${p.def.label} pattern may be present (${scope}), based on ${sentenceList(uniqueTriggers)}. ${p.def.considerations.join(' ')}`,
    );
  }

  const asyms = results.rows
    .filter((r) => r.asymmetry?.percent >= ASYMMETRY.mentionAbovePercent)
    .map((r) => `${midSentence(r.def.summaryLabel || r.def.label)} ${r.asymmetry.percent.toFixed(0)}%`);
  if (asyms.length) {
    paras.push(
      `Side-to-side differences worth watching as a trend (no validated pass/fail threshold in running): ${sentenceList(asyms)}.`,
    );
  }

  const prompts = results.rows.flatMap((r) =>
    Object.values(r.cells)
      .filter((c) => c.prompt)
      .map((c) => `${describeCell(r.def, c, fp)}: ${c.prompt} (not measurable from 2D video)`),
  );
  if (prompts.length) paras.push(`Clinical checks: ${sentenceList(prompts)}.`);

  // Not assessed, grouped by reason. Missing-view metrics collapse into one line per view.
  const missingViews = new Set();
  const reshoot = new Map();
  const byReason = new Map();
  for (const na of results.notAssessed) {
    if (na.missingView) {
      missingViews.add(na.missingView);
      continue;
    }
    const map = na.unreliable ? reshoot : byReason;
    const key = na.reason;
    const entry = map.get(key) || { reason: na.reason, items: new Map() };
    const name = midSentence(na.def.summaryLabel || na.def.label);
    const item = entry.items.get(na.def.id) || { name, sides: [] };
    if (na.side === 'left' || na.side === 'right') item.sides.push(sideLabel(na.side, fp));
    entry.items.set(na.def.id, item);
    map.set(key, entry);
  }
  const itemText = (it) => `${it.sides.length === 1 ? `${it.sides[0]} ` : ''}${it.name}`;
  for (const e of reshoot.values()) {
    paras.push(`Not assessed (${e.reason}; consider re-shoot): ${sentenceList([...e.items.values()].map(itemText))}.`);
  }
  for (const e of byReason.values()) {
    paras.push(`Not assessed (${e.reason}): ${sentenceList([...e.items.values()].map(itemText))}.`);
  }
  if (missingViews.size) {
    const label = { lateral: 'lateral (side)', posterior: 'posterior (rear)' };
    paras.push(`No ${[...missingViews].map((v) => label[v] || v).join(' or ')} clip in this session, so those metrics were not assessed.`);
  }

  const context = [];
  if (results.numbers.incline > 0) {
    context.push(`Treadmill incline was ${results.numbers.incline}%, which changes hip extension expectations.`);
  }
  if (results.numbers.cadence == null) context.push('Cadence was not entered, so cadence-based pattern triggers were skipped.');
  if (context.length) paras.push(context.join(' '));

  paras.push('These are considerations for clinician review, not diagnoses.');
  return paras.join('\n\n');
}

export function buildSummaryText({ intake, results, interpretation, placeholder, analysis }) {
  const out = [...buildHeader(intake, { placeholder, analysis }), ''];
  for (const s of buildSections(results, intake)) {
    out.push(s.title, ...s.lines, '');
  }
  out.push('INTERPRETATION', interpretation.trim());
  return out.join('\n');
}

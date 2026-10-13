// Results screen, rendered from the presentation model (js/presentation/model.js). The copy-paste
// text (Summary text tab) comes from the same model, so screen and text always agree.
import { esc } from '../util.js';
import { CLIP_SLOTS, SCORING } from '../config.js';
import { STATUS_WORD } from '../presentation/model.js';
import { buildSummaryText, missingLegs } from '../presentation/text.js';
import { renderDebug } from './debug.js';

const SIDE = { left: 'Left', right: 'Right', mid: '' };
const MISSING_LEG = /^needs a lateral clip filmed from the (left|right)$/;

function scoreChip(label, value) {
  const band = value == null ? 'none' : value >= SCORING.bands.green ? 'green' : value >= SCORING.bands.yellow ? 'yellow' : 'red';
  return `<div class="score score-${band}"><span class="score-label">${esc(label)}</span><span class="score-value">${value == null ? '—' : value}</span></div>`;
}

function valueHtml(c) {
  if (!c.assessed) return `<span class="r-na">Not assessed</span>`;
  const chip = c.status ? `<span class="chip chip-${c.status}">${STATUS_WORD[c.status]}</span>` : '';
  const hedge = c.hedge ? `<span class="hedge">${esc(c.hedge)}</span>` : !c.status && c.confidence !== 'high' ? `<span class="hedge">${esc(c.confidence)} confidence</span>` : '';
  return `<span class="r-val">${esc(c.text)}</span>${chip}${hedge}`;
}

function detailHtml(r) {
  const parts = [];
  if (r.range?.green) parts.push(`<p><span class="dot dot-green"></span>Normal: ${esc(r.range.green)}${r.range.red ? ` · <span class="dot dot-red"></span>Flag: ${esc(r.range.red)}` : ''}${r.range.provisional ? ' <span class="prov">provisional</span>' : ''}</p>`);
  if (r.diff) parts.push(`<p>Left–right difference: ${esc(r.diff)}${r.diffNote ? ` (${esc(r.diffNote)})` : ''}</p>`);
  for (const c of Object.values(r.cells)) {
    if (!c.assessed) {
      if (!MISSING_LEG.test(c.why)) parts.push(`<p>${SIDE[c.key] ? `${SIDE[c.key]}: ` : ''}not assessed: ${esc(c.why)}</p>`);
      continue;
    }
    const bits = [`${esc(c.confidence)} confidence`, c.n ? `median of ${c.n} ${esc(c.countUnit)}` : null, c.source ? `from ${esc(c.source)}` : null].filter(Boolean).join(' · ');
    parts.push(`<p>${SIDE[c.key] ? `<strong>${SIDE[c.key]}:</strong> ` : ''}${bits}${c.why?.length ? `<br><span class="muted">${esc(c.why.join('; '))}</span>` : ''}${c.note ? `<br><span class="muted">${esc(c.note)}</span>` : ''}${c.prompt ? `<br>${esc(c.prompt)}` : ''}</p>`);
  }
  if (r.note) parts.push(`<p class="muted">${esc(r.note)}</p>`);
  return parts.join('');
}

function rowHtml(r) {
  const cells = Object.values(r.cells).filter((c) => c.assessed || !MISSING_LEG.test(c.why));
  if (!cells.length) return '';
  const flagged = cells.some((c) => c.status === 'red') ? ' r-red' : cells.some((c) => c.status === 'yellow') ? ' r-yellow' : '';
  return `<details class="r-row${flagged}">
    <summary>
      <span class="r-name">${esc(r.label)}${r.priority ? ' <abbr class="p" title="Priority metric">P</abbr>' : ''}</span>
      <span class="r-cells">${cells.map((c) => `<span class="r-cell">${SIDE[c.key] ? `<span class="r-side">${SIDE[c.key][0]}</span>` : ''}${valueHtml(c)}</span>`).join('')}</span>
    </summary>
    <div class="r-detail small">${detailHtml(r)}</div>
  </details>`;
}

function sectionHtml(s) {
  const rows = s.rows.map((r) => ({ r, html: rowHtml(r) })).filter((x) => x.html);
  let phase = null;
  const body = rows
    .map(({ r, html }) => {
      const head = r.phaseLabel !== phase ? `<h4 class="r-phase">${esc((phase = r.phaseLabel))}</h4>` : '';
      return head + html;
    })
    .join('');
  return `<section class="card r-section"><h3>${esc(s.title)}</h3>${body || `<p class="muted small">${esc(s.empty || 'Nothing assessed.')}</p>`}${s.footer ? `<p class="muted small">${esc(s.footer)}</p>` : ''}</section>`;
}

function timingHtml(t) {
  if (!t?.rows.length) return '';
  return `<section class="card"><h3>Timing and mechanics</h3>
    <div class="t-grid">${t.rows
      .map((r) => `<div class="t-item"><span class="t-label">${esc(r.label)}</span><span class="t-val">${esc(r.text)}</span><span class="t-sub">${r.agreement === 'agree' ? 'side and rear agree' : r.flag ? esc(r.flag) : r.note ? esc(r.note) : ''}</span></div>`)
      .join('')}</div>
    ${(t.notes || []).map((n) => `<p class="muted small">${esc(n)}</p>`).join('')}
  </section>`;
}

function findingsHtml(m) {
  if (!m.findings.length) return '';
  return `<section class="card"><h3>Correlated findings</h3>${m.findings
    .map(
      (f) => `<article class="finding"><h4>${esc(f.label)} <span class="badge">${esc({ left: 'Left', right: 'Right', both: 'Both sides', midline: 'Midline' }[f.scope] || f.scope)}</span>${f.confidence === 'low' ? ' <span class="hedge">low confidence</span>' : ''}</h4>
      <p class="small">${f.triggers.map((t) => `${esc(t.text)}${t.value ? ` <span class="muted">(${esc(t.value)})</span>` : ''}`).join(' · ')}</p></article>`,
    )
    .join('')}<p class="muted small">Findings that occur together; considerations for clinical review, not diagnoses.</p></section>`;
}

const STRENGTH = (s) => (s === 'none' ? 'no tested link' : s);
const link = (e) => (e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(e.short)}</a>` : esc(e.short));

function explainHtml(state, m) {
  const ex = m.explanations;
  if (!ex) return '';
  const pri = ex.priorities.length
    ? `<ol class="small pri">${ex.priorities.map((p) => `<li><strong>${esc(p.title)}</strong>: may explain ${esc(p.explains.join('; '))} <span class="chip chip-ev">${esc(p.strength)} evidence</span></li>`).join('')}</ol>`
    : '<p class="muted small">No finding here is firm enough for a full plan; see the screening notes below.</p>';
  const entry = (e) => `<details class="r-row x-entry"${e.kind === 'full' ? ' open' : ''}>
    <summary><span class="r-name">${e.kind === 'screen' ? '<span class="hedge">Worth screening:</span> ' : ''}${esc(e.title)}</span><span class="r-cells"><span class="chip chip-ev">${esc(e.strength)} evidence</span></span></summary>
    <div class="r-detail small">
      <p><strong>What we saw:</strong> ${e.findings.map((f) => `${esc(f.label)} ${esc(f.value)}${f.range ? ` <span class="muted">(${esc(f.range)})</span>` : ''}${f.phase ? ` <span class="muted">at ${esc(f.phase)}</span>` : ''}${f.hedge ? ` <span class="hedge">${esc(f.hedge)}</span>` : ''}`).join('; ')}</p>
      ${e.softened ? `<p class="hedge">${esc(e.softened)}</p>` : ''}
      ${e.context ? `<p class="muted">${esc(e.context)}</p>` : ''}
      ${(e.caveats || []).map((c) => `<p class="muted">Caveat: ${esc(c)}.</p>`).join('')}
      ${e.kind === 'full' ? `<p><strong>Could be contributing</strong> <span class="muted">(unconfirmed until screened)</span>:</p><ul class="tight">${e.limitations.map((l) => `<li>${esc(l.name)} <span class="muted">[${esc(STRENGTH(l.strength))}]</span></li>`).join('')}</ul>` : ''}
      ${e.kind === 'full' && e.compensations.length ? `<p><strong>It may also show up as:</strong></p><ul class="tight">${e.compensations.map((c) => `<li>${esc(c.text)} <span class="muted">[${esc(STRENGTH(c.strength))}]</span></li>`).join('')}</ul>` : ''}
      ${e.screens.length ? `<p><strong>Screen to confirm:</strong></p><ul class="tight">${e.screens.map((x) => `<li>${esc(x.name)}${x.how ? `: ${esc(x.how)}` : ''}${x.positiveIf ? ` <span class="muted">(positive if: ${esc(x.positiveIf)})</span>` : ''}</li>`).join('')}</ul>` : ''}
      ${e.kind === 'full' && e.work.length ? `<p><strong>What to work on</strong> (in order):</p><ol class="tight">${e.work.map((w) => `<li>${esc(w.item)}: ${esc(w.dose)} <span class="muted">[${esc(w.type)}; dose: ${esc(w.doseLabel)}; changes the running pattern: ${esc(w.changesRunning)}]</span></li>`).join('')}</ol>` : ''}
      ${e.sources.length ? `<p class="muted">Sources: ${e.sources.map(link).join(', ')}</p>` : ''}
    </div></details>`;
  return `<section class="card x-section"><h3>Why it may be happening and what to work on</h3>
    <p class="banner small" role="note"><strong>Clinician to review before sharing.</strong> ${esc(ex.reviewNote.replace(/^Clinician to review before sharing\. /, ''))}</p>
    <h4 class="r-phase">Top priorities</h4>${pri}
    ${ex.entries.map(entry).join('')}
    <h4 class="r-phase">Text to share (edit before sharing)</h4>
    <textarea class="interpretation explain-text" data-action="edit-explain" aria-label="Why it may be happening and what to work on (editable)">${esc(state.explainText ?? '')}</textarea>
    <div class="explain-meta small"><span class="muted">${state.explainEdited ? 'Edited' : 'Auto-generated'}. Exercise lists and doses are editable here.</span>${state.explainEdited ? '<button class="btn btn-link" data-action="reset-explain">Reset</button>' : ''}</div>
  </section>`;
}

function limitsHtml(m) {
  const items = [
    ...m.notReliable.map((n) => `<li><strong>${esc(n.label)}</strong>: not reported, ${esc(n.why)}</li>`),
    ...m.notBuilt.map((n) => `<li><strong>${esc(n.label)}</strong>: ${esc(n.why)}</li>`),
    `<li><strong>Not measurable in 2D</strong>: ${esc(m.notMeasurable.join(', '))}</li>`,
  ];
  return `<section class="card"><h3>Not reported and limits</h3><ul class="tight small">${items.join('')}</ul><p class="muted small">${esc(m.limits.join(' '))}</p></section>`;
}

function resultsTab(state, m) {
  const sc = m.scores;
  return `
    <section class="card">
      <h3>Interpretation</h3>
      <textarea class="interpretation" data-action="edit-interpretation" aria-label="Interpretation (editable)">${esc(state.interpretation)}</textarea>
      <div class="interp-meta small"><span class="muted">${state.interpretationEdited ? 'Edited' : 'Auto-generated'}. Edit before copying.</span>${state.interpretationEdited ? '<button class="btn btn-link" data-action="reset-interpretation">Reset</button>' : ''}</div>
      <div class="scores">${scoreChip('Overall', sc.overall.overall)}${scoreChip('Left', sc.overall.left)}${scoreChip('Right', sc.overall.right)}</div>
      <p class="muted small">Score: normal = full credit, caution = half, flag = none, weighted by confidence; unscored and timing-sensitive values are left out. First-draft formula.</p>
    </section>
    ${timingHtml(m.timing)}
    ${m.sections.map(sectionHtml).join('')}
    ${findingsHtml(m)}
    ${explainHtml(state, m)}
    ${limitsHtml(m)}
    <div class="actions sticky"><button class="btn btn-primary btn-copy" data-action="copy">Copy summary</button><button class="btn btn-secondary" data-action="print">Print / Save as PDF</button></div>`;
}

function textTab(state, m) {
  return `<section class="card summary"><pre class="summary-text">${esc(buildSummaryText(m, state.interpretation, state.explainText))}</pre></section>
    <div class="actions sticky"><button class="btn btn-primary btn-copy" data-action="copy">Copy summary</button></div>`;
}

export function renderResults(state, results, model) {
  const { session } = state;
  const m = model;
  const missing = Object.keys(CLIP_SLOTS).filter((s) => !session.clips[s]);
  const legs = missingLegs(m);
  const facts = [m.header.height ? `${Math.round(m.header.height)} cm` : null, m.header.speed, m.header.incline ? `incline ${m.header.incline}` : null].filter(Boolean);
  const tab = ['results', 'text', 'debug'].includes(state.tab) ? state.tab : 'results';
  return `
    <section class="screen">
      <header class="screen-head">
        <h1>${esc(m.header.client)} <span class="muted">· ${esc(m.header.date)}</span></h1>
        <p class="muted small">${m.header.clips.map(esc).join(' · ')}${facts.length ? ` · ${facts.map(esc).join(' · ')}` : ''}</p>
        ${legs.length ? `<p class="muted small">Side-view values for the ${esc(legs.join(' and '))} leg need a clip filmed from that side.</p>` : ''}
        ${m.header.warnings.map((w) => `<p class="small warn">⚠ ${esc(w)}</p>`).join('')}
      </header>
      ${m.header.demo ? '<div class="banner" role="note"><strong>Demo data.</strong> Numbers are invented to show the layout and are not from any video. Upload a clip for a real analysis.</div>' : ''}
      <nav class="tabs" role="tablist">
        <button role="tab" aria-selected="${tab === 'results'}" data-action="tab" data-tab="results">Results</button>
        <button role="tab" aria-selected="${tab === 'text'}" data-action="tab" data-tab="text">Summary text</button>
        <button role="tab" aria-selected="${tab === 'debug'}" data-action="tab" data-tab="debug">Debug</button>
      </nav>
      ${tab === 'results' ? resultsTab(state, m) : tab === 'text' ? textTab(state, m) : renderDebug(state)}
      <div class="actions">
        ${missing.length ? `<button class="btn btn-secondary" data-action="add-clip">Add clip (${esc(missing.map((s) => CLIP_SLOTS[s].label.toLowerCase()).join(' / '))})</button>` : ''}
        <button class="btn btn-link" data-action="new-session">New session</button>
      </div>
    </section>`;
}

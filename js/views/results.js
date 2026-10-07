import { esc } from '../util.js';
import { VIEWS, SCORING } from '../config.js';
import { cellValue, formatDiff, formatValue, statusLabel, sideLabel } from '../engine/format.js';
import { FAR_SIDE_LABEL } from '../engine/summary.js';
import { buildHeader, buildSections } from '../engine/summary.js';

function scoreChip(label, value) {
  const band = value == null ? 'none' : value >= SCORING.bands.green ? 'green' : value >= SCORING.bands.yellow ? 'yellow' : 'red';
  return `<div class="score score-${band}">
    <span class="score-label">${esc(label)}</span>
    <span class="score-value">${value == null ? '—' : value}</span>
  </div>`;
}

function scoreRow(score) {
  return `<div class="scores">
    ${scoreChip('Overall', score.overall)}
    ${scoreChip('Left', score.left)}
    ${scoreChip('Right', score.right)}
  </div>`;
}

function sweepText(def, cell) {
  const f = (v) => (v == null ? '–' : formatValue(def, v, { short: true }));
  const label = cell.sweep.kind === 'window' ? 'Window end' : 'IC tolerance';
  return `${label} ${cell.sweep.tolerances.join(' / ')}: ${cell.sweep.values.map(f).join(' / ')}`;
}

function cellHtml(def, cell, colspan = 1) {
  const span = colspan > 1 ? ` colspan="${colspan}"` : '';
  if (!cell.assessed) {
    return `<td${span} class="cell cell-na"><span class="na">Not assessed</span><span class="why">${esc(cell.reason)}</span></td>`;
  }
  // Far-side values are reference only: neutral styling, no status, not scored.
  const status = cell.farSide ? 'far' : cell.status;
  const statusText = cell.farSide ? FAR_SIDE_LABEL : statusLabel(status);
  const iqr = cell.iqr && def.unit === 'deg' ? `, IQR ${cell.iqr[0].toFixed(1)}–${cell.iqr[1].toFixed(1)}°` : '';
  return `<td${span} class="cell cell-${status}">
    <span class="val">${esc(cellValue(def, cell, { short: true }))}</span>
    <span class="tags">
      <span class="status status-${status}">${esc(statusText)}</span>
      <span class="conf conf-${cell.confidence}" title="Confidence">${esc(cell.confidence)}</span>
    </span>
    ${cell.strides ? `<span class="detail">Median of ${cell.strides} strides${esc(iqr)}</span>` : ''}
    ${cell.status === 'review' && !cell.farSide ? '<span class="detail">Reference under review; not scored</span>' : ''}
    ${cell.sweep ? `<span class="detail">${esc(sweepText(def, cell))}</span>` : ''}
    ${cell.status === 'ic-sensitive' ? '<span class="detail">Status changes with IC timing; no flag, not scored or used for patterns until validated</span>' : ''}
    ${cell.status === 'window-sensitive' ? '<span class="detail">Status changes with the analysis window; not scored or used for patterns until validated</span>' : ''}
    ${cell.excluded?.rising ? `<span class="detail">${cell.excluded.rising} strides excluded: angle still rising at the window end</span>` : ''}
    ${cell.prompt ? `<span class="prompt">${esc(cell.prompt)}</span>` : ''}
  </td>`;
}

function metricRow(row) {
  const { def, cells } = row;
  const diff = formatDiff(def, row.asymmetry);
  const head = `<th scope="row">
    <span class="metric-name">${esc(def.label)}${def.priority ? ' <abbr class="p" title="Priority metric (double weight)">P</abbr>' : ''}</span>
    <span class="range"><span class="dot dot-green"></span>${esc(def.greenText)}${
      def.redText && def.redText !== '—' ? ` <span class="dot dot-red"></span>${esc(def.redText)}` : ''
    }</span>
    ${diff ? `<span class="diff">L/R diff ${esc(diff)} <span class="muted">(trend)</span></span>` : ''}
    ${def.note ? `<span class="note">${esc(def.note)}</span>` : ''}
  </th>`;
  const body = def.sided === 'lr' ? cellHtml(def, cells.left) + cellHtml(def, cells.right) : cellHtml(def, cells.mid, 2);
  return `<tr>${head}${body}</tr>`;
}

function phaseSection(phase, views) {
  const groups = Object.keys(VIEWS)
    .map((view) => ({ view, rows: phase.rows.filter((r) => r.def.view === view) }))
    .filter((g) => g.rows.length);
  return `<section class="phase card">
    <header class="phase-head">
      <h3>${esc(phase.label)}</h3>
      ${scoreRow(phase.score)}
    </header>
    ${groups
      .map(
        (g) => `<table class="metrics">
          <caption>${esc(VIEWS[g.view].label)} view${views.includes(g.view) ? '' : ' · no clip'}</caption>
          <thead><tr><th scope="col">Metric</th><th scope="col">Left</th><th scope="col">Right</th></tr></thead>
          <tbody>${g.rows.map(metricRow).join('')}</tbody>
        </table>`,
      )
      .join('')}
  </section>`;
}

function patternCard(p, results, filmedFrom) {
  const scopeLabel = { left: 'Left', right: 'Right', both: 'Both sides', midline: 'Midline' }[p.scope];
  const sides = Object.keys(p.triggers);
  const showSides = p.scope === 'both' ? sides : [sides[0]];
  return `<article class="pattern">
    <header><h4>${esc(p.def.label)}</h4><span class="badge">${esc(scopeLabel)}</span></header>
    ${showSides
      .map(
        (s) => `<p class="small"><strong>Triggered by${p.scope === 'both' ? ` (${esc(sideLabel(s, filmedFrom))})` : ''}:</strong>
          ${p.triggers[s]
            .map((t) => {
              if (t.cell) return `${esc(t.text)} <span class="muted">(${esc(cellValue(results.rowsById[t.metric].def, t.cell, { short: true }))})</span>`;
              if (t.intake) return `${esc(t.text)} <span class="muted">(${esc(t.value)}${t.intake === 'cadence' ? ' spm' : ''})</span>`;
              return esc(t.text);
            })
            .join(' · ')}</p>`,
      )
      .join('')}
    <ul class="tight small">${p.def.considerations.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
  </article>`;
}

function reportTab(state, results) {
  const { session } = state;
  const fp = session.intake.filmedFrom;
  const na = results.notAssessed.filter((n) => n.def.phase);
  return `
    <section class="card">
      <h2>Overall score</h2>
      ${scoreRow(results.overall)}
      <p class="hint">Green = full credit, yellow = ${SCORING.credit.yellow * 100}%, red = 0. Priority (P) ×${SCORING.priorityMultiplier}.
      Confidence weight: high ${SCORING.confidenceWeight.high}, medium ${SCORING.confidenceWeight.medium}, low ${SCORING.confidenceWeight.low}.
      Not-assessed metrics are excluded. First-draft formula.</p>
    </section>

    <section class="card">
      <h2>Pattern flags</h2>
      ${
        results.patterns.length
          ? results.patterns.map((p) => patternCard(p, results, fp)).join('')
          : '<p class="muted">No pattern combinations triggered.</p>'
      }
      <p class="hint">Considerations for clinician review, not diagnoses.</p>
    </section>

    ${results.phases.map((ph) => phaseSection(ph, session.views)).join('')}

    <section class="card">
      <h2>Not assessed</h2>
      ${
        na.length
          ? `<ul class="tight small">${na
              .map(
                (n) =>
                  `<li><strong>${esc(n.def.label)}</strong>${n.side === 'mid' ? '' : ` (${esc(sideLabel(n.side, fp))})`}: ${esc(n.reason)}</li>`,
              )
              .join('')}</ul>`
          : '<p class="muted">All metrics assessed.</p>'
      }
    </section>

    <section class="card">
      <h2>Session details</h2>
      <dl class="details small">
        ${[
          ['Running history', session.intake.runningHistory],
          ['Shoe history', session.intake.shoeHistory],
          ['Insoles / orthotics', session.intake.orthotics],
          ['Goals', session.intake.goals],
        ]
          .map(([k, v]) => `<dt>${k}</dt><dd>${v ? esc(v) : '<span class="muted">—</span>'}</dd>`)
          .join('')}
      </dl>
    </section>`;
}

function summaryTab(state, results) {
  const { session } = state;
  const header = buildHeader(session.intake, { placeholder: session.placeholder, analysis: session.analysis }).join('\n');
  const sections = buildSections(results, session.intake);
  return `
    <section class="card summary">
      <pre class="summary-text">${esc(header)}

${sections.map((s) => `<strong>${esc(s.title)}</strong>\n${esc(s.lines.join('\n'))}`).join('\n\n')}

<strong>INTERPRETATION</strong></pre>
      <textarea class="interpretation" data-action="edit-interpretation" aria-label="Interpretation (editable)">${esc(state.interpretation)}</textarea>
      <div class="interp-meta small">
        <span class="muted">${state.interpretationEdited ? 'Edited' : 'Auto-generated'}. Edit before copying.</span>
        ${state.interpretationEdited ? '<button class="btn btn-link" data-action="reset-interpretation">Reset</button>' : ''}
      </div>
    </section>
    <div class="actions sticky">
      <button class="btn btn-primary btn-copy" data-action="copy">Copy summary</button>
    </div>`;
}

export function renderResults(state, results) {
  const { session } = state;
  const missing = Object.keys(VIEWS).filter((v) => !session.views.includes(v));
  return `
    <section class="screen">
      <header class="screen-head">
        <h1>${esc(session.intake.clientCode)} <span class="muted">· ${esc(session.intake.sessionDate)}</span></h1>
        <p class="muted small">Clips: ${session.views.map((v) => esc(VIEWS[v].label)).join(', ')}</p>
        ${
          session.analysis?.cadenceVideo
            ? `<p class="muted small">${session.analysis.cyclesDetected} strides analysed · cadence from stride period ${Math.round(session.analysis.cadenceVideo.spm)} spm <em>(unvalidated, not used for scoring)</em></p>`
            : ''
        }
      </header>
      ${
        session.placeholder
          ? '<div class="banner" role="note"><strong>Demo data.</strong> Numbers are invented to show the layout and are not from any video. Upload a clip for a real analysis.</div>'
          : ''
      }
      <nav class="tabs" role="tablist">
        <button role="tab" aria-selected="${state.tab === 'summary'}" data-action="tab" data-tab="summary">Summary</button>
        <button role="tab" aria-selected="${state.tab === 'report'}" data-action="tab" data-tab="report">Scored report</button>
      </nav>
      ${state.tab === 'summary' ? summaryTab(state, results) : reportTab(state, results)}
      <div class="actions">
        ${missing.map((v) => `<button class="btn btn-secondary" data-action="add-clip">Add ${esc(v)}-view clip</button>`).join('')}
        <button class="btn btn-link" data-action="new-session">New session</button>
      </div>
    </section>`;
}

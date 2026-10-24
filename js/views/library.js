// Saved sessions on this device (upload screen) and the two-session comparison screen.
import { esc } from '../util.js';
import { CLIP_SLOTS } from '../config.js';

const shortViews = (views) => views.map((s) => CLIP_SLOTS[s]?.short || s).join(', ');

export function libraryHtml(list, { error, selected = [] } = {}) {
  if (error) return `<h3>Saved on this device</h3><p class="small warn">${esc(error)}</p>`;
  if (!list) return '<h3>Saved on this device</h3><p class="muted small">Loading…</p>';
  if (!list.length) return '<h3>Saved on this device</h3><p class="muted small">No saved sessions yet. After an analysis, use "Save on this device" on the results.</p>';
  const byClient = {};
  for (const r of list) (byClient[r.clientCode] ??= []).push(r);
  const sel = new Set(selected);
  const selRecs = list.filter((r) => sel.has(r.id));
  const canCompare = selRecs.length === 2 && selRecs[0].clientCode === selRecs[1].clientCode;
  return `<h3>Saved on this device</h3>
    <p class="muted small">Results only (no video), stored in this browser. Clearing the browser's site data removes them.</p>
    ${Object.entries(byClient)
      .map(
        ([code, recs]) => `<div class="lib-client"><h4>${esc(code)}</h4><ul class="lib-list">${recs
          .map(
            (r) => `<li class="lib-item">
              <label class="lib-pick"><input type="checkbox" data-action="lib-select" value="${esc(r.id)}" ${sel.has(r.id) ? 'checked' : ''} aria-label="Select ${esc(code)} ${esc(r.sessionDate)} for comparison" /></label>
              <span class="lib-what"><strong>${esc(r.sessionDate)}</strong><span class="muted small">${esc(shortViews(r.views))}</span></span>
              <span class="lib-actions"><button class="btn btn-secondary btn-small" data-action="lib-open" data-id="${esc(r.id)}">Open</button><button class="btn btn-link btn-small" data-action="lib-delete" data-id="${esc(r.id)}">Delete</button></span>
            </li>`,
          )
          .join('')}</ul></div>`,
      )
      .join('')}
    <div class="actions"><button class="btn btn-secondary" data-action="lib-compare" ${canCompare ? '' : 'disabled'}>Compare selected</button><span class="muted small">${canCompare ? '' : 'Select two sessions of the same client to compare.'}</span></div>`;
}

export function renderCompare(state) {
  const { a, b, cmp } = state.compare;
  const delta = (r) => {
    if (r.delta == null) return r.changedText ? 'changed' : 'same';
    const d = `${r.delta > 0 ? '+' : ''}${r.delta.toFixed(1)}${r.unit}`;
    return r.withinError ? `${d} <span class="hedge">within measurement error (±${r.error}${r.unit})</span>` : r.withinError === false ? `<strong>${d}</strong>` : `${d} <span class="hedge">error not validated</span>`;
  };
  const st = (s) => (s ? ` <span class="muted small">(${esc(s)})</span>` : '');
  let section = null;
  return `<section class="screen">
    <header class="screen-head">
      <button class="btn btn-link back" data-action="go-upload">‹ Back</button>
      <h1>${esc(a.header.client)} <span class="muted">· ${esc(a.header.date)} → ${esc(b.header.date)}</span></h1>
      <p class="muted small">Earlier: ${esc(a.coverage.usedText)} · Later: ${esc(b.coverage.usedText)}</p>
      ${cmp.coverage.warning ? `<p class="small warn">⚠ ${esc(cmp.coverage.warning)}</p>` : ''}
      ${cmp.onlyOne ? `<p class="muted small">${cmp.onlyOne} value(s) were assessed in only one of the two sessions and are not compared.</p>` : ''}
    </header>
    <section class="card"><h3>Values assessed in both sessions</h3>
      ${
        cmp.rows.length
          ? `<div class="cmp-table" role="table">${cmp.rows
              .map((r) => {
                const head = r.section !== section ? `<h4 class="r-phase">${esc((section = r.section))}</h4>` : '';
                return `${head}<div class="cmp-row" role="row"><span class="cmp-label" role="cell">${esc(r.label)}</span><span role="cell">${esc(r.a)}${st(r.aStatus)}</span><span role="cell">→ ${esc(r.b)}${st(r.bStatus)}</span><span class="cmp-d" role="cell">${delta(r)}</span></div>`;
              })
              .join('')}</div>`
          : '<p class="muted small">No value was assessed in both sessions.</p>'
      }
      <p class="muted small">A change within the measurement error (validated against hand-marked frames) is not a real change. Statuses are as each session showed them.</p>
    </section>
    ${cmp.timing.length ? `<section class="card"><h3>Timing</h3><ul class="tight small">${cmp.timing.map((t) => `<li>${esc(t.label)}: ${esc(t.a)} → ${esc(t.b)}</li>`).join('')}</ul></section>` : ''}
    <div class="actions sticky"><button class="btn btn-primary" data-action="copy-compare">Copy comparison</button></div>
  </section>`;
}

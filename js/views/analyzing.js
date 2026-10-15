import { esc } from '../util.js';

const PHASES = {
  starting: 'Starting…',
  reading: 'Reading video…',
  'loading model': 'Loading pose model…',
  analysing: 'Tracking pose frame by frame…',
  summarising: 'Segmenting strides…',
};

export function renderAnalyzing(state) {
  const p = state.progress || {};
  if (p.error) {
    return `
      <section class="screen">
        <header class="screen-head"><h1>Analysis failed</h1></header>
        <div class="banner" role="alert">${esc(p.error)}</div>
        <div class="actions"><button class="btn btn-secondary" data-action="analysis-back">Back</button></div>
      </section>`;
  }
  const pct = p.total ? Math.round((100 * p.done) / p.total) : 0;
  return `
    <section class="screen">
      <header class="screen-head">
        <h1>Analysing clip</h1>
        <p class="muted small">${esc(p.clipName || '')}</p>
      </header>
      <div class="card">
        <p>${esc(PHASES[p.phase] || p.phase || '')}</p>
        <progress class="progress" max="100" value="${pct}" aria-label="Analysis progress"></progress>
        <p class="muted small">${p.total ? `${p.done} of ${p.total} frames · ${pct}%` : '&nbsp;'}</p>
      </div>
      ${quickHtml(p.quick)}
      <p class="privacy"><strong>Stays on this device.</strong> Pose tracking runs in this browser; the video is not uploaded. Keep this screen open until it finishes.</p>
      <div class="actions"><button class="btn btn-secondary" data-action="cancel-analysis">Cancel</button></div>
    </section>`;
}

// Quick video check from the first seconds of the clip (capture-quality gate on a partial clip), so a
// setup problem is visible straight away instead of after the whole analysis.
function quickHtml(q) {
  if (!q) return '<div class="card"><p class="muted small">Quick video check: after the first few seconds of the clip…</p></div>';
  const chip = { pass: 'green', warn: 'yellow', fail: 'red' }[q.level];
  return `<div class="card quick-check" role="status">
    <p><strong>Quick video check</strong> <span class="chip chip-${chip}">${esc({ pass: 'looks good', warn: 'warning', fail: 'likely to fail' }[q.level])}</span> <span class="muted small">first ${esc(q.seconds)} s · looks like the ${esc(q.viewText)}</span></p>
    ${q.reasons.length ? `<p class="small">${esc(q.reasons.join('; '))}</p>` : ''}
    ${q.level !== 'pass' && q.fixes.length ? `<ul class="tight small">${q.fixes.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
    ${q.level === 'fail' ? '<p class="muted small">The full check runs on the whole clip. You can stop now and re-film, or let it finish.</p>' : ''}
  </div>`;
}

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
      <p class="privacy"><strong>Stays on this device.</strong> Pose tracking runs in this browser; the video is not uploaded. Keep this screen open until it finishes.</p>
      <div class="actions"><button class="btn btn-secondary" data-action="cancel-analysis">Cancel</button></div>
    </section>`;
}

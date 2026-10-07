import { esc } from '../util.js';
import { VIEWS } from '../config.js';
import { protocolHtml } from './intake.js';

export function renderUpload(state) {
  const adding = state.session && Object.keys(state.session.clips).length > 0;
  const remaining = Object.keys(VIEWS).filter((v) => !state.session?.clips[v]);
  return `
    <section class="screen">
      <header class="screen-head">
        <h1>${adding ? `Add ${esc(remaining.join(' / '))}-view clip` : 'New analysis'}</h1>
        ${adding ? `<p class="muted">Session ${esc(state.session.intake.clientCode)} · ${esc(state.session.intake.sessionDate)}</p>` : ''}
      </header>

      <label class="dropzone">
        <input type="file" accept="video/*" data-action="pick-video" />
        <span class="dropzone-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="32" height="32"><path d="M12 16V4m0 0l-4.5 4.5M12 4l4.5 4.5M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
        <span class="dropzone-title">Choose treadmill video</span>
        <span class="muted small">From Photos or Files. Native camera file, ideally 60 fps.</span>
      </label>

      <p class="privacy">
        <strong>Stays on this device.</strong> The video is never uploaded. Sessions are labeled by client code and date only.
      </p>

      <details class="card">
        <summary>Capture protocol</summary>
        <ul class="tight">
          <li>${protocolHtml('lateral')}</li>
          <li>${protocolHtml('posterior')}</li>
          <li>A side camera only tracks the near-side arm. Film the other side in a second pass for bilateral arms.</li>
        </ul>
      </details>

      <div class="actions">
        ${
          adding
            ? '<button class="btn btn-secondary" data-action="back-to-results">Cancel</button>'
            : '<button class="btn btn-link" data-action="demo">Try with demo data (no video)</button>'
        }
      </div>
    </section>`;
}

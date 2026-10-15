// Clip check: shown after pose tracking, before the clip joins the session. The detected view (with
// its evidence) and the video check (pass / warning / fail, with what to fix); the clinician can
// change the view, which re-runs the view-specific analysis on the same pose data.
import { esc } from '../util.js';
import { CLIP_SLOTS } from '../config.js';

const LEVEL = { pass: ['green', 'Pass'], warn: ['yellow', 'Warning'], fail: ['red', 'Fail'] };

export function renderClipCheck(state) {
  const c = state.check;
  const q = c.analysis.captureQuality || { level: 'pass', reasons: [], fixes: [], checks: [] };
  const [chip, word] = LEVEL[q.level] || LEVEL.pass;
  const used = Object.keys(state.session?.clips || {});
  const d = c.detect;
  return `
    <section class="screen">
      <header class="screen-head">
        <h1>Clip check</h1>
        <p class="muted small">${esc(c.clip.name)}</p>
      </header>

      <section class="card">
        <h3>View</h3>
        <p class="small">${d.view ? `Detected: <strong>${esc(CLIP_SLOTS[d.slot].label)}</strong>${d.confidence === 'low' ? ' <span class="hedge">unsure: please check</span>' : ''}<br><span class="muted">${esc(d.evidence)}</span>` : `<span class="warn">${esc(d.evidence)}</span>`}</p>
        <form class="form" data-check-form>
          <div class="segmented" role="radiogroup" aria-label="Camera view">
            ${Object.entries(CLIP_SLOTS)
              .map(([slot, v]) => `<label><input type="radio" name="slot" value="${slot}" ${slot === c.slot ? 'checked' : ''} data-action="check-slot" /><span>${esc(v.label)}${used.includes(slot) ? ' (replaces current)' : ''}${slot === d.slot ? ' ✓' : ''}</span></label>`)
              .join('')}
          </div>
        </form>
        ${CLIP_SLOTS[c.slot].experimental ? '<p class="muted small">Front-view values are experimental: shown separately, never scored or used for findings.</p>' : ''}
      </section>

      <section class="card">
        <h3>Video check <span class="chip chip-${chip}">${word}</span>${q.score != null ? ` <span class="hedge">quality ${Math.round(q.score * 100)}%</span>` : ''}</h3>
        <p class="small">${q.level === 'fail' ? '<strong>No measurements will be reported from this clip</strong>, only the reason below.' : q.level === 'warn' ? 'Measurements will be reported at lowered confidence.' : 'Good enough for measurement.'}</p>
        ${q.reasons.length ? `<p class="small">${esc(q.reasons.join('; '))}</p>` : ''}
        ${(q.fixes || []).length && q.level !== 'pass' ? `<p class="small"><strong>To fix when re-filming:</strong></p><ul class="tight small">${q.fixes.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
        ${(q.checks || []).length ? `<details class="small"><summary>All checks</summary><ul class="tight checks">${q.checks.map((x) => `<li><span class="dot dot-${x.status === 'pass' ? 'green' : x.status === 'warn' ? 'yellow' : x.status === 'fail' ? 'red' : 'none'}"></span>${esc(x.label)}: ${esc(x.detail || x.status)}</li>`).join('')}</ul></details>` : ''}
      </section>

      <div class="actions sticky">
        <button class="btn btn-primary" data-action="use-clip">${used.includes(c.slot) ? 'Replace the clip in this view' : 'Use this clip'}</button>
        <button class="btn btn-secondary" data-action="discard-clip">Choose another video</button>
      </div>
    </section>`;
}

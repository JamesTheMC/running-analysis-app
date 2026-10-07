import { esc, formatBytes, formatDuration } from '../util.js';
import { VIEWS } from '../config.js';

function radios(name, options, value, { disabled = [] } = {}) {
  return `<div class="segmented" role="radiogroup">
    ${options
      .map(
        ([v, label]) => `<label class="${disabled.includes(v) ? 'is-disabled' : ''}">
          <input type="radio" name="${name}" value="${v}" ${v === value ? 'checked' : ''} ${disabled.includes(v) ? 'disabled' : ''} />
          <span>${esc(label)}</span>
        </label>`,
      )
      .join('')}
  </div>`;
}

function select(name, options, value) {
  return `<select name="${name}" class="unit">${options
    .map(([v, l]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${esc(l)}</option>`)
    .join('')}</select>`;
}

export function renderIntake(state) {
  const clip = state.pendingClip;
  const f = state.draftIntake;
  const usedViews = Object.keys(state.session?.clips || {});
  const sharedLocked = usedViews.length > 0;
  const view = f.view && !usedViews.includes(f.view) ? f.view : Object.keys(VIEWS).find((v) => !usedViews.includes(v));

  return `
    <section class="screen">
      <header class="screen-head">
        <button class="btn btn-link back" data-action="go-upload">‹ Back</button>
        <h1>Session intake</h1>
      </header>

      <div class="card clip">
        <video src="${esc(clip.url)}" playsinline muted controls preload="metadata"></video>
        <div class="clip-meta small muted">
          <span>${esc(formatBytes(clip.size))}</span>
          <span data-clip-meta>${clip.duration ? `${formatDuration(clip.duration)} · ${clip.width}×${clip.height}` : ''}</span>
        </div>
      </div>

      <form id="intake-form" class="form" novalidate>
        <fieldset ${sharedLocked ? 'disabled' : ''}>
          <legend>Session</legend>
          <div class="field">
            <label for="clientCode">Client code <span class="req">required</span></label>
            <input id="clientCode" name="clientCode" required autocomplete="off" autocapitalize="characters"
              spellcheck="false" pattern="[A-Za-z0-9_\\-]{1,20}" maxlength="20" value="${esc(f.clientCode)}" placeholder="e.g. C-1042" />
            <p class="hint">No names. Letters, numbers, - and _ only.</p>
          </div>
          <div class="field">
            <label for="sessionDate">Session date <span class="req">required</span></label>
            <input id="sessionDate" name="sessionDate" type="date" required value="${esc(f.sessionDate)}" />
          </div>
        </fieldset>

        <fieldset>
          <legend>Clip</legend>
          <div class="field">
            <span class="label">Camera view <span class="req">required</span></span>
            ${radios('view', Object.entries(VIEWS).map(([v, d]) => [v, d.label]), view, { disabled: usedViews })}
          </div>
          <div class="field" data-show-for="side" ${view === 'side' ? '' : 'hidden'}>
            <span class="label">Runner's side facing the camera</span>
            ${radios('filmedFrom', [['left', 'Left'], ['right', 'Right']], f.filmedFrom)}
            <p class="hint">Maps near/far limb to anatomical left/right.</p>
          </div>
        </fieldset>

        <fieldset ${sharedLocked ? 'disabled' : ''}>
          <legend>Treadmill and runner <span class="muted small">optional</span></legend>
          <div class="field">
            <label for="heightValue">Height</label>
            <div class="with-unit">
              <input id="heightValue" name="heightValue" type="number" inputmode="decimal" min="0" step="0.1" value="${esc(f.heightValue)}" />
              ${select('heightUnit', [['cm', 'cm'], ['in', 'in']], f.heightUnit)}
            </div>
            <p class="hint">Scales pixels to cm for foot-to-COM distance.</p>
          </div>
          <div class="grid-2">
            <div class="field">
              <label for="speedValue">Speed</label>
              <div class="with-unit">
                <input id="speedValue" name="speedValue" type="number" inputmode="decimal" min="0" step="0.1" value="${esc(f.speedValue)}" />
                ${select('speedUnit', [['mph', 'mph'], ['km/h', 'km/h']], f.speedUnit)}
              </div>
            </div>
            <div class="field">
              <label for="incline">Incline</label>
              <div class="with-unit">
                <input id="incline" name="incline" type="number" inputmode="decimal" step="0.5" value="${esc(f.incline)}" />
                <span class="unit-static">%</span>
              </div>
            </div>
          </div>
          <div class="field">
            <label for="cadence">Cadence</label>
            <div class="with-unit">
              <input id="cadence" name="cadence" type="number" inputmode="numeric" min="0" step="1" value="${esc(f.cadence)}" />
              <span class="unit-static">spm</span>
            </div>
            <p class="hint">From a footpod or the treadmill display. Not derived from video in v1.</p>
          </div>
        </fieldset>

        <fieldset ${sharedLocked ? 'disabled' : ''}>
          <legend>History and goals <span class="muted small">optional</span></legend>
          ${[
            ['runningHistory', 'Running history'],
            ['shoeHistory', 'Shoe history'],
            ['orthotics', 'Insoles / orthotics'],
            ['goals', 'Goals'],
          ]
            .map(
              ([n, l]) => `<div class="field">
                <label for="${n}">${l}</label>
                <textarea id="${n}" name="${n}" rows="2">${esc(f[n])}</textarea>
              </div>`,
            )
            .join('')}
        </fieldset>

        <p class="form-error" data-form-error hidden></p>
        <div class="actions sticky">
          <button type="submit" class="btn btn-primary">Analyze</button>
        </div>
      </form>
    </section>`;
}

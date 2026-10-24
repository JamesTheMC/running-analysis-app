import { PLACEHOLDER_ANALYSIS, DEMO_INTAKE } from './placeholder.js';
import { analyze, intakeNumbers } from './engine/analysis.js';
import { buildModel } from './presentation/model.js';
import { buildInterpretation, buildSummaryText } from './presentation/text.js';
import { explanationsText } from './presentation/explain.js';
import { correctionsFor } from './presentation/corrections.js';
import { renderUpload } from './views/upload.js';
import { renderIntake } from './views/intake.js';
import { renderResults } from './views/results.js';
import { renderAnalyzing } from './views/analyzing.js';
import { mountDebug } from './views/debug.js';
import { analyzeVideo } from './pipeline/run.js';
import { reconcileSession } from './pipeline/reconcile.js';
import { mergeSession } from './pipeline/session.js';
import { CLIP_SLOTS } from './config.js';
import { detectView } from './pipeline/view-detect.js';
import { processClip } from './pipeline/adapt.js';
import { quickCapture } from './pipeline/capture-quality.js';
import { renderClipCheck } from './views/clip-check.js';
import { mountPhasePanels } from './views/phase-panels.js';
import { mountReview } from './views/review.js';
import { checkVideoFile } from './pipeline/file-check.js';
import { fileCheckHtml, protocolHtml } from './views/intake.js';
import { copyText, today } from './util.js';

const EMPTY_INTAKE = {
  clientCode: '',
  sessionDate: today(),
  slot: 'auto',
  heightValue: '',
  heightUnit: 'cm',
  speedValue: '',
  speedUnit: 'mph',
  incline: '',
  cadence: '',
  runningHistory: '',
  shoeHistory: '',
  orthotics: '',
  goals: '',
};

// Everything lives in memory only. Video files are referenced by local object URLs and never leave the device.
const state = {
  screen: 'upload',
  session: null, // { intake, clips: { lateral_left?, lateral_right?, posterior? }, views, placeholder, analysis }
  pendingClip: null,
  draftIntake: { ...EMPTY_INTAKE },
  interpretation: '',
  interpretationEdited: false,
  tab: 'results',
  progress: null, // { phase, done, total, error? } while a clip is analysed
};

let abortAnalysis = null;


let results = null;
const root = document.getElementById('app');

function go(screen) {
  if (screen === 'intake' && !state.pendingClip) screen = 'upload';
  if (screen === 'results' && !state.session) screen = 'upload';
  if (screen === 'analyzing' && !state.progress) screen = state.session ? 'results' : 'upload';
  if (screen === 'check' && !state.check) screen = state.session ? 'results' : 'upload';
  state.screen = screen;
  if (location.hash !== `#${screen}`) history.pushState(null, '', `#${screen}`);
  render();
  window.scrollTo(0, 0);
}

function render() {
  if (state.screen === 'intake') root.innerHTML = renderIntake(state);
  else if (state.screen === 'results') root.innerHTML = renderResults(state, results, state.model);
  else if (state.screen === 'analyzing') root.innerHTML = renderAnalyzing(state);
  else if (state.screen === 'check') root.innerHTML = renderClipCheck(state);
  else root.innerHTML = renderUpload(state);
  if (state.screen === 'intake') wireIntake();
  if (state.screen === 'results') for (const t of root.querySelectorAll('textarea.interpretation')) autosize(t);
  if (state.screen === 'results' && state.tab === 'debug' && state.session?.reconciled) mountDebug(root, state);
  // Phase panels: stills are drawn on the device from the local video (never stored or sent).
  if (state.screen === 'results' && (state.tab || 'results') === 'results' && !state.session?.placeholder) {
    mountPhasePanels(root, state, state.model).catch((e) => console.error(e));
    mountReview(root, state).catch((e) => console.error(e));
  }
}

function recompute({ resetInterpretation = false } = {}) {
  const s = state.session;
  s.views = [...new Set(Object.keys(s.clips).map((slot) => CLIP_SLOTS[slot].view))];
  // Real sessions: merge every clip's analysis (each lateral clip supplies its own leg and arm).
  if (!s.placeholder) {
    s.analysis = mergeSession(s.clips);
    // One reconciled per-client result (data foundation; shown in the debug view).
    s.reconciled = reconcileSession(s);
  }
  results = analyze(s);
  // One presentation model feeds the results screen and the copy-paste text.
  state.model = buildModel(s, results, { corrections: correctionsFor });
  if (resetInterpretation || !state.explainEdited) {
    state.explainText = explanationsText(state.model.explanations);
    state.explainEdited = false;
  }
  if (resetInterpretation || !state.interpretationEdited) {
    state.interpretation = buildInterpretation(state.model);
    state.interpretationEdited = false;
  }
}

function revokeClips() {
  for (const clip of Object.values(state.session?.clips || {})) if (clip.url) URL.revokeObjectURL(clip.url);
  if (state.pendingClip?.url) URL.revokeObjectURL(state.pendingClip.url);
}

function pickVideo(file) {
  if (!file) return;
  if (state.pendingClip?.url) URL.revokeObjectURL(state.pendingClip.url);
  // The File stays in memory for on-device analysis; it is never uploaded.
  const clip = { name: file.name, size: file.size, type: file.type, url: URL.createObjectURL(file), file, check: 'pending' };
  state.pendingClip = clip;
  checkVideoFile(file)
    .catch((e) => ({ error: e.message || String(e) }))
    .then((check) => {
      clip.check = check;
      const el = state.screen === 'intake' && state.pendingClip === clip && root.querySelector('[data-file-check]');
      if (el) el.innerHTML = fileCheckHtml(check);
    });
  if (state.session) {
    const last = Object.values(state.session.clips).at(-1) || {};
    state.draftIntake = {
      ...state.session.intake,
      slot: 'auto',
      speedValue: last.speed ?? state.session.intake.speedValue,
      speedUnit: last.speedUnit ?? state.session.intake.speedUnit,
      incline: last.incline ?? state.session.intake.incline,
    };
  }
  go('intake');
}

function wireIntake() {
  const form = root.querySelector('#intake-form');
  const video = root.querySelector('video');
  video.addEventListener('loadedmetadata', () => {
    Object.assign(state.pendingClip, { duration: video.duration, width: video.videoWidth, height: video.videoHeight });
    const meta = root.querySelector('[data-clip-meta]');
    if (meta) meta.textContent = `${Math.floor(video.duration / 60)}:${String(Math.round(video.duration % 60)).padStart(2, '0')} · ${video.videoWidth}×${video.videoHeight}`;
  });
  form.addEventListener('change', () => {
    const data = Object.fromEntries(new FormData(form));
    Object.assign(state.draftIntake, data);
    const protocol = root.querySelector('[data-protocol]');
    if (protocol && data.slot) protocol.innerHTML = protocolHtml(data.slot === 'auto' ? 'auto' : CLIP_SLOTS[data.slot].view);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitIntake(form);
  });
}

function submitIntake(form) {
  const data = Object.fromEntries(new FormData(form));
  const errorEl = root.querySelector('[data-form-error]');
  const shared = state.session ? state.session.intake : data;
  const errors = [];
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(shared.clientCode || '')) errors.push('Enter a client code (letters, numbers, - or _; no names).');
  if (!shared.sessionDate) errors.push('Enter the session date.');
  if (!data.slot) errors.push('Choose the camera view.');
  if (errors.length) {
    errorEl.textContent = errors.join(' ');
    errorEl.hidden = false;
    errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  // Speed and incline are recorded per clip (the two lateral clips may be filmed at different speeds).
  const clip = {
    ...state.pendingClip,
    requestedSlot: data.slot,
    speed: data.speedValue,
    speedUnit: data.speedUnit,
    incline: data.incline,
  };
  // Both views run pose on-device. Posterior clips give capture checks only for now (metrics are
  // awaiting validation).
  analyzeClip(clip, data);
}

function addClip(clip, data, analysis) {
  state.pendingClip = null;
  clip.analysis = analysis;
  if (state.session) {
    // A view can be added (or replaced) at any time; results update for the new set of views.
    state.session.clips[clip.slot] = clip;
  } else {
    const { slot: _slot, ...intake } = { ...EMPTY_INTAKE, ...data };
    intake.clientCode = intake.clientCode.toUpperCase();
    state.session = { intake, clips: { [clip.slot]: clip }, placeholder: false };
  }
  state.tab = 'results';
  recompute();
  go('results');
}

const heightOf = (data) => intakeNumbers(state.session ? state.session.intake : data).heightCm;

// View-specific analysis of the tracked pose for a slot (re-run when the clinician changes the view).
function analyseAs(check, slot) {
  check.slot = slot;
  // Lateral: the slot's leg is the near leg (the clinician confirmed or chose it); depth disagreement
  // is still reported by the reconciliation (convention issues).
  const { result, analysis } = processClip(check.rows, check.meta, slot, { heightCm: heightOf(check.data) });
  check.result = result;
  check.analysis = analysis;
}

async function analyzeClip(clip, data) {
  const controller = new AbortController();
  abortAnalysis = () => controller.abort();
  state.progress = { phase: 'starting', done: 0, total: 0, clipName: clip.name };
  go('analyzing');
  let lastPaint = 0;
  try {
    // Pose once; the view is decided afterwards (detected, then confirmed or changed on the clip check).
    const { rows, meta } = await analyzeVideo(clip.file, {
      poseOnly: true,
      signal: controller.signal,
      onPartial: (partRows, partMeta) => {
        const guess = detectView(partRows);
        const slot = clip.requestedSlot !== 'auto' ? clip.requestedSlot : guess.slot || 'lateral_right';
        state.progress.quick = quickCapture(CLIP_SLOTS[slot].view, partRows, partMeta, guess);
        if (state.screen === 'analyzing') render();
      },
      onProgress: (p) => {
        Object.assign(state.progress, p);
        const now = performance.now();
        if (state.screen === 'analyzing' && now - lastPaint > 250) {
          lastPaint = now;
          render();
        }
      },
    });
    state.progress = null;
    const detect = detectView(rows);
    const check = { clip, data, rows, meta, detect };
    analyseAs(check, clip.requestedSlot !== 'auto' ? clip.requestedSlot : detect.slot || 'lateral_right');
    state.check = check;
    go('check');
  } catch (e) {
    if (e.name === 'AbortError') {
      state.progress = null;
      go('intake');
      return;
    }
    console.error(e);
    state.progress.error = e.message || String(e);
    render();
  } finally {
    abortAnalysis = null;
  }
}

function useCheckedClip() {
  const c = state.check;
  if (state.session?.clips[c.slot] && !confirm(`Replace the ${CLIP_SLOTS[c.slot].short} clip already in this session?`)) return;
  const clip = { ...c.clip, slot: c.slot, view: CLIP_SLOTS[c.slot].view };
  if (c.detect.slot && c.detect.slot !== c.slot) clip.slotNote = `View set to "${CLIP_SLOTS[c.slot].label}" by the clinician; the app had detected ${CLIP_SLOTS[c.detect.slot].short}.`;
  // Kept in memory for the debug view and the phase panels; never stored or sent anywhere.
  clip.debug = { rows: c.rows, meta: { ...c.meta, view: clip.view }, bad: c.result.bad };
  state.check = null;
  if (state.session?.clips[c.slot]?.url && state.session.clips[c.slot].url !== clip.url) URL.revokeObjectURL(state.session.clips[c.slot].url);
  addClip(clip, c.data, c.analysis);
}

function startDemo() {
  revokeClips();
  state.pendingClip = null;
  state.session = {
    intake: { ...EMPTY_INTAKE, ...DEMO_INTAKE },
    clips: { lateral_left: { name: 'demo-left', demo: true }, posterior: { name: 'demo-posterior', demo: true } },
    placeholder: true,
    analysis: PLACEHOLDER_ANALYSIS,
  };
  state.tab = 'results';
  recompute({ resetInterpretation: true });
  go('results');
}

function newSession() {
  if (!confirm('Start a new session? The current results are not saved.')) return;
  revokeClips();
  state.session = null;
  state.pendingClip = null;
  state.draftIntake = { ...EMPTY_INTAKE, sessionDate: today() };
  state.interpretation = '';
  state.interpretationEdited = false;
  results = null;
  go('upload');
}

async function copySummary(button) {
  const text = buildSummaryText(state.model, state.interpretation, state.explainText, state.session?.manual);
  const ok = await copyText(text);
  button.textContent = ok ? 'Copied ✓' : 'Copy failed. Select the text manually.';
  button.classList.toggle('is-done', ok);
  setTimeout(() => {
    button.textContent = 'Copy summary';
    button.classList.remove('is-done');
  }, 2000);
}

function autosize(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight + 2}px`;
}

root.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  if (action === 'demo') startDemo();
  else if (action === 'go-upload') go(state.session ? 'results' : 'upload');
  else if (action === 'back-to-results') go('results');
  else if (action === 'add-clip') go('upload');
  else if (action === 'new-session') newSession();
  else if (action === 'cancel-analysis') abortAnalysis?.();
  else if (action === 'analysis-back') {
    state.progress = null;
    go('intake');
  }
  else if (action === 'copy') copySummary(el);
  else if (action === 'use-clip') useCheckedClip();
  else if (action === 'goto-panel') {
    e.preventDefault();
    const target = document.getElementById(el.dataset.panel);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  else if (action === 'discard-clip') {
    if (state.check?.clip.url) URL.revokeObjectURL(state.check.clip.url);
    state.check = null;
    state.pendingClip = null;
    go('upload');
  }
  else if (action === 'print') {
    // Export: the browser's print dialog (Save as PDF); every detail is expanded for printing.
    for (const d of root.querySelectorAll('details')) d.open = true;
    window.print();
  } else if (action === 'reset-explain') {
    state.explainText = explanationsText(state.model.explanations);
    state.explainEdited = false;
    render();
  }
  else if (action === 'copy-json') {
    copyText(JSON.stringify(state.session.reconciled, null, 1)).then((ok) => (el.textContent = ok ? 'Copied ✓' : 'Copy failed'));
  }
  else if (action === 'tab') {
    state.tab = el.dataset.tab;
    render();
  } else if (action === 'reset-interpretation') {
    recompute({ resetInterpretation: true });
    render();
  }
});

root.addEventListener('change', (e) => {
  if (e.target.matches('[data-action="pick-video"]')) pickVideo(e.target.files[0]);
  if (e.target.matches('[data-action="check-slot"]') && state.check) {
    analyseAs(state.check, e.target.value);
    render();
  }
});

root.addEventListener('input', (e) => {
  if (e.target.matches('[data-action="edit-explain"]')) {
    state.explainText = e.target.value;
    autosize(e.target);
    if (!state.explainEdited) {
      state.explainEdited = true;
      const meta = root.querySelector('.explain-meta');
      if (meta) meta.innerHTML = '<span class="muted">Edited. Exercise lists and doses are editable here.</span><button class="btn btn-link" data-action="reset-explain">Reset</button>';
    }
  }
  if (e.target.matches('[data-action="edit-interpretation"]')) {
    state.interpretation = e.target.value;
    autosize(e.target);
    if (!state.interpretationEdited) {
      state.interpretationEdited = true;
      const meta = root.querySelector('.interp-meta');
      meta.innerHTML = '<span class="muted">Edited. Edit before copying.</span><button class="btn btn-link" data-action="reset-interpretation">Reset</button>';
    }
  }
});

window.addEventListener('popstate', () => {
  const screen = location.hash.slice(1) || 'upload';
  if (screen === 'intake' && !state.pendingClip) state.screen = state.session ? 'results' : 'upload';
  else if (screen === 'results' && !state.session) state.screen = 'upload';
  else if (screen === 'check' && !state.check) state.screen = state.session ? 'results' : 'upload';
  else if (state.progress && !state.progress.error) state.screen = 'analyzing'; // stay put while analysing
  else state.screen = screen;
  render();
});

window.addEventListener('beforeunload', (e) => {
  if (state.session || state.progress) e.preventDefault();
});

history.replaceState(null, '', '#upload');
render();

// Offline support. Service workers need https (or localhost, where we skip it to avoid stale caches while developing).
const isLocalDev = ['localhost', '127.0.0.1'].includes(location.hostname);
if ('serviceWorker' in navigator && window.isSecureContext && !isLocalDev) {
  navigator.serviceWorker.register('./sw.js');
}

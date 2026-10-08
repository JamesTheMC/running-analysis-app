import { PLACEHOLDER_ANALYSIS, DEMO_INTAKE } from './placeholder.js';
import { analyze, intakeNumbers } from './engine/analysis.js';
import { buildInterpretation, buildSummaryText } from './engine/summary.js';
import { renderUpload } from './views/upload.js';
import { renderIntake } from './views/intake.js';
import { renderResults } from './views/results.js';
import { renderAnalyzing } from './views/analyzing.js';
import { analyzeVideo } from './pipeline/run.js';
import { toAnalysis } from './pipeline/measurements.js';
import { toPosteriorAnalysis } from './pipeline/posterior.js';
import { mergeSession } from './pipeline/session.js';
import { CLIP_SLOTS } from './config.js';
import { checkVideoFile } from './pipeline/file-check.js';
import { fileCheckHtml, protocolHtml } from './views/intake.js';
import { copyText, today } from './util.js';

const EMPTY_INTAKE = {
  clientCode: '',
  sessionDate: today(),
  slot: 'lateral_left',
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
  tab: 'summary',
  progress: null, // { phase, done, total, error? } while a clip is analysed
};

let abortAnalysis = null;


let results = null;
const root = document.getElementById('app');

function go(screen) {
  if (screen === 'intake' && !state.pendingClip) screen = 'upload';
  if (screen === 'results' && !state.session) screen = 'upload';
  if (screen === 'analyzing' && !state.progress) screen = state.session ? 'results' : 'upload';
  state.screen = screen;
  if (location.hash !== `#${screen}`) history.pushState(null, '', `#${screen}`);
  render();
  window.scrollTo(0, 0);
}

function render() {
  if (state.screen === 'intake') root.innerHTML = renderIntake(state);
  else if (state.screen === 'results') root.innerHTML = renderResults(state, results);
  else if (state.screen === 'analyzing') root.innerHTML = renderAnalyzing(state);
  else root.innerHTML = renderUpload(state);
  if (state.screen === 'intake') wireIntake();
  if (state.screen === 'results') autosize(root.querySelector('.interpretation'));
}

function recompute({ resetInterpretation = false } = {}) {
  const s = state.session;
  s.views = [...new Set(Object.keys(s.clips).map((slot) => CLIP_SLOTS[slot].view))];
  // Real sessions: merge every clip's analysis (each lateral clip supplies its own leg and arm).
  if (!s.placeholder) s.analysis = mergeSession(s.clips);
  results = analyze(s);
  if (resetInterpretation || !state.interpretationEdited) {
    state.interpretation = buildInterpretation(results, s.intake);
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
    const used = Object.keys(state.session.clips);
    const last = Object.values(state.session.clips).at(-1) || {};
    state.draftIntake = {
      ...state.session.intake,
      slot: Object.keys(CLIP_SLOTS).find((s) => !used.includes(s)) || '',
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
    if (protocol && data.slot) protocol.innerHTML = protocolHtml(CLIP_SLOTS[data.slot].view);
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
    slot: data.slot,
    view: CLIP_SLOTS[data.slot].view,
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
    state.session.clips[clip.slot] = clip;
  } else {
    const { slot, ...intake } = { ...EMPTY_INTAKE, ...data };
    intake.clientCode = intake.clientCode.toUpperCase();
    state.session = { intake, clips: { [slot]: clip }, placeholder: false };
  }
  state.tab = 'summary';
  recompute();
  go('results');
}

async function analyzeClip(clip, data) {
  const { view, leg } = CLIP_SLOTS[clip.slot];
  const controller = new AbortController();
  abortAnalysis = () => controller.abort();
  state.progress = { phase: 'starting', done: 0, total: 0, clipName: clip.name };
  go('analyzing');
  let lastPaint = 0;
  try {
    const result = await analyzeVideo(clip.file, {
      view,
      nearSide: leg === 'left' ? 'L' : leg === 'right' ? 'R' : undefined,
      signal: controller.signal,
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
    const intake = state.session ? state.session.intake : data;
    addClip(clip, data, view === 'posterior' ? toPosteriorAnalysis(result, { heightCm: intakeNumbers(intake).heightCm }) : toAnalysis(result, { heightCm: intakeNumbers(intake).heightCm }));
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

function startDemo() {
  revokeClips();
  state.pendingClip = null;
  state.session = {
    intake: { ...EMPTY_INTAKE, ...DEMO_INTAKE },
    clips: { lateral_left: { name: 'demo-left', demo: true }, posterior: { name: 'demo-posterior', demo: true } },
    placeholder: true,
    analysis: PLACEHOLDER_ANALYSIS,
  };
  state.tab = 'summary';
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
  const text = buildSummaryText({
    intake: state.session.intake,
    results,
    interpretation: state.interpretation,
    placeholder: state.session.placeholder,
    analysis: state.session.analysis,
  });
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
});

root.addEventListener('input', (e) => {
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

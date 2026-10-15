// Dev page: the phase panels for a fixture client (committed landmark fixtures; a local video is used
// for the real frame when one is on this machine). ?client=T3 (default) | T1 | T2 | C0 | AR | ...
// ?novideo=1 draws the wireframe only (what a fixture session shows without a video).
// Videos are read locally into object URLs, as in the app; nothing is saved or sent anywhere.
import { sessionFor } from './fixture-regression.js';
import { CLIPS, clipUrl } from './clips.js';
import { unpackRows } from './fixture-io.js';
import { CLIP_SLOTS } from '../js/config.js';
import { mergeSession } from '../js/pipeline/session.js';
import { postProcess, postProcessRear } from '../js/pipeline/run.js';
import { analyze } from '../js/engine/analysis.js';
import { buildModel } from '../js/presentation/model.js';
import { correctionsFor } from '../js/presentation/corrections.js';
import { phasePanelsHtml, mountPhasePanels, representativeStride, PANEL_METRICS } from '../js/views/phase-panels.js';

const q = new URLSearchParams(location.search);
const client = q.get('client') || 'T3';
const { intake, clips, result } = await sessionFor(client, './');
const own = CLIPS.filter((x) => x.client === client);
const c0 = own[0];
const session = { intake: { ...intake, sessionDate: new Date().toISOString().slice(0, 10), speedValue: String(c0.speed), speedUnit: c0.speedUnit, incline: '1' }, clips, reconciled: result };
session.views = [...new Set(Object.keys(clips).map((s) => CLIP_SLOTS[s].view))];
session.analysis = mergeSession(clips);
const model = buildModel(session, analyze(session), { corrections: correctionsFor });

// Frame data: the same corrected rows the pipeline used (leg-identity fixes are applied in place).
for (const c of own) {
  const slot = c.view === 'posterior' ? 'posterior' : Object.keys(clips).find((s) => s.startsWith('lateral_'));
  if (!clips[slot]) continue;
  const { meta, rows } = unpackRows(await (await fetch(`fixtures/clips/${c.id}.lm.json`)).json());
  const r = c.view === 'posterior' ? postProcessRear(rows, meta) : postProcess(rows, meta, {});
  clips[slot].debug = { rows: r.rows || rows, meta: r.meta || meta };
  if (q.has('novideo')) continue;
  try {
    const res = await fetch(await clipUrl(c.file));
    if (res.ok) clips[slot].url = URL.createObjectURL(await res.blob());
  } catch {
    // no local video: wireframe only
  }
}

const state = { session };
const app = document.getElementById('app');
app.innerHTML = `<h1>Phase panels · ${client}</h1>${phasePanelsHtml(state, model)}`;
await mountPhasePanels(app, state, model);
// The app re-renders the whole screen on every edit: render and mount again, as it would.
if (!q.has('once')) {
  app.innerHTML = `<h1>Phase panels · ${client}</h1>${phasePanelsHtml(state, model)}`;
  await mountPhasePanels(app, state, model);
}

// Quick self-checks (also visible to a headless run via window.__checks).
const checks = [];
for (const [slot, clip] of Object.entries(clips)) {
  const legs = slot === 'posterior' ? ['left', 'right'] : [clip.analysis.nearSide];
  const phases = slot === 'posterior' ? Object.keys(PANEL_METRICS.posterior) : Object.keys(PANEL_METRICS.lateral);
  for (const leg of legs) for (const phase of phases) {
    const rep = representativeStride(clip, phase, leg);
    checks.push({ slot, leg, phase, ok: !!rep && rep.stride.valid, label: rep?.label });
  }
}
window.__checks = checks;
window.__ready = true;

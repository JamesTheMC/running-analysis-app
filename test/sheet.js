// Dev page: the Results screen for a fixture client (no video needed), every metric expanded.
// ?client=T3 (default) | T1 | T2 | C0. ?save=1 also writes a standalone HTML copy to test-data/debug/.
import { sessionFor } from './fixture-regression.js';
import { CLIPS } from './clips.js';
import { CLIP_SLOTS } from '../js/config.js';
import { mergeSession } from '../js/pipeline/session.js';
import { analyze } from '../js/engine/analysis.js';
import { buildModel } from '../js/presentation/model.js';
import { buildInterpretation } from '../js/presentation/text.js';
import { explanationsText } from '../js/presentation/explain.js';
import { correctionsFor } from '../js/presentation/corrections.js';
import { renderResults } from '../js/views/results.js';

const q = new URLSearchParams(location.search);
const client = q.get('client') || 'T3';
const { intake, clips, result } = await sessionFor(client, './');
const c = CLIPS.find((x) => x.client === client);
const session = { intake: { ...intake, sessionDate: new Date().toISOString().slice(0, 10), speedValue: String(c.speed), speedUnit: c.speedUnit, incline: '1' }, clips, reconciled: result };
session.views = [...new Set(Object.keys(clips).map((s) => CLIP_SLOTS[s].view))];
session.analysis = mergeSession(clips);
const results = analyze(session);
const model = buildModel(session, results, { corrections: correctionsFor });
const state = { session, tab: q.get('tab') || 'results', interpretation: buildInterpretation(model), interpretationEdited: false, explainText: explanationsText(model.explanations), explainEdited: false, model };
const app = document.getElementById('app');
app.innerHTML = renderResults(state, results, model);
if (!q.has('collapsed')) for (const d of app.querySelectorAll('details')) d.open = true;
for (const el of app.querySelectorAll('.actions, nav.tabs')) el.remove(); // a sheet, not the app

if (q.has('save')) {
  const css = await (await fetch('../css/styles.css')).text();
  const ta = app.querySelector('textarea.interpretation');
  if (ta) ta.outerHTML = `<p class="interpretation-text">${ta.value.replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m])}</p>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Results ${client}</title><style>${css}\nbody{padding:16px;max-width:860px;margin:0 auto}</style></head><body>${app.innerHTML}</body></html>`;
  await fetch(`/__save?name=results-sheet-${client}.html`, { method: 'POST', body: html });
  window.__saved = `results-sheet-${client}.html`;
}
window.__ready = true;

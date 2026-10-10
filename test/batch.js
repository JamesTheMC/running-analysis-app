// Batch pose run over the local clip inventory; caches landmark rows (derived data only).
import { CLIPS } from './clips.js';
import { analyzeVideo } from '../js/pipeline/run.js';

const log = (s) => (document.getElementById('log').textContent += `\n${s}`);
const q = new URLSearchParams(location.search);
const only = q.get('only')?.split(',');
const force = q.has('force');
const status = {};
window.__batch = status;

for (const c of CLIPS.filter((c) => !only || only.includes(c.id))) {
  const cached = await fetch(`../test-data/debug/${c.id}.rows.json`, { method: 'HEAD' });
  if (cached.ok && !force) {
    log(`${c.id}: cached, skipped`);
    status[c.id] = 'cached';
    continue;
  }
  const t0 = performance.now();
  try {
    const file = await (await fetch(`../test-data/${encodeURIComponent(c.file)}`)).blob();
    let last = 0;
    const r = await analyzeVideo(file, {
      view: c.view,
      onProgress: ({ done, total }) => {
        if (total && done - last >= total / 10) (last = done), log(`  ${c.id} ${Math.round((100 * done) / total)}%`);
      },
    });
    const rows = r.rows.map(({ lm, ...rest }) => ({ ...rest, lm: lm ? Array.from(lm, (v) => Math.round(v * 1e4) / 1e4) : undefined }));
    await fetch(`/__save?name=${c.id}.rows.json`, { method: 'POST', body: JSON.stringify({ meta: { ...r.meta, clipId: c.id }, rows }) });
    status[c.id] = 'ok';
    log(`${c.id}: ${rows.length} rows, ${rows.filter((x) => x.lm).length} with a pose, ${((performance.now() - t0) / 1000).toFixed(0)} s`);
  } catch (e) {
    status[c.id] = `error: ${e.message}`;
    log(`${c.id}: ERROR ${e.stack || e.message}`);
  }
}
status.__done = true;
log('Done.');

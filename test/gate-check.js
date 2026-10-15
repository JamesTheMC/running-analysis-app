// Footage-quality gate on the 24 committed landmark fixtures: verdict + reasons per clip, full clip and
// the first 150 analysed frames (quick preliminary check). Same expectations as
// `python3 tools/gate_features.py --checks` (the research script mirrors the module).
import { unpackRows } from './fixture-io.js';
import { footageChecks, summariseChecks, lumaFromImageData } from '../js/pipeline/footage-checks.js';

const GOOD = ['C0', 'T1', 'T2', 'T3'];
const PROBLEM = ['AR', 'AZ', 'CD', 'CH', 'JW', 'ML', 'RQ', 'RY'];
// Reasons that must be flagged (warn/fail) on a problem clip: at least one id from each list.
const NEED = { side: [['camera_height', 'hip_occlusion', 'wide_angle']], rear: [['camera_height', 'wide_angle']] };
const NEED_EXTRA = { 'CD-side': [['framing']] };
const PARTIAL = 150;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (v) => (v == null ? '–' : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(3));

function judge(code, v, checks, summary) {
  const flagged = new Set(checks.filter((c) => c.status === 'warn' || c.status === 'fail').map((c) => c.id));
  if (GOOD.includes(code)) return summary.level === 'pass';
  const need = [...NEED[v], ...(NEED_EXTRA[`${code}-${v}`] || [])];
  return summary.level !== 'pass' && need.every((ids) => ids.some((id) => flagged.has(id)));
}

const results = [];
for (const code of [...GOOD, ...PROBLEM]) {
  for (const [v, view] of [['side', 'lateral'], ['rear', 'posterior']]) {
    const id = `${code}-${v}`;
    const fx = await (await fetch(`fixtures/clips/${id}.lm.json`)).json();
    const { meta, rows } = unpackRows(fx);
    for (const [mode, rs] of [['full', rows], ['partial', rows.slice(0, PARTIAL)]]) {
      const checks = footageChecks(view, { rows: rs, meta });
      const summary = summariseChecks(checks);
      results.push({ id, code, view: v, mode, group: GOOD.includes(code) ? 'good' : 'problem', level: summary.level, score: summary.score, correct: judge(code, v, checks, summary), checks: checks.map(({ id: cid, status, value, detail }) => ({ id: cid, status, value, detail })), reasons: summary.reasons, fixes: summary.fixes });
    }
  }
}

// lumaFromImageData sanity: 2×2-pixel blocks of known grey levels.
const grey = (vals) => {
  const d = new Uint8ClampedArray(vals.length * 16);
  vals.forEach((g, i) => {
    for (let k = 0; k < 4; k++) d.set([g, g, g, 255], (i * 4 + k) * 4);
  });
  return d;
};
const luma = lumaFromImageData(grey(Array.from({ length: 100 }, (_, i) => i * 2)));
const lumaOk = Math.abs(luma.mean - 99) < 0.01 && luma.p5 === 8 && luma.p95 === 188;

const tally = (mode, group) => results.filter((r) => r.mode === mode && r.group === group);
const line = (mode) => {
  const g = tally(mode, 'good');
  const p = tally(mode, 'problem');
  return { mode, goodPass: g.filter((r) => r.correct).length, good: g.length, problemFlagged: p.filter((r) => r.correct).length, problem: p.length };
};
const lines = [line('full'), line('partial')];
const allOk = lines.every((l) => l.goodPass === l.good && l.problemFlagged === l.problem) && lumaOk;

document.getElementById('summary').innerHTML =
  `<span class="${allOk ? 'pass' : 'fail'}">${lines.map((l) => `${l.mode}: good clips passing ${l.goodPass}/${l.good}, problem clips flagged with a correct reason ${l.problemFlagged}/${l.problem}`).join(' · ')} · luma helper ${lumaOk ? 'ok' : 'WRONG'}</span>`;

const ids = results[0].checks.map((c) => c.id);
const out = document.getElementById('out');
for (const mode of ['full', 'partial']) {
  const rs = results.filter((r) => r.mode === mode);
  out.insertAdjacentHTML(
    'beforeend',
    `<h2>${mode === 'full' ? 'Whole fixture' : `First ${PARTIAL} analysed frames`}</h2><div class="wrap"><table><tr><th>Clip</th><th>Verdict</th><th>Score</th><th>Correct</th>${ids.map((i) => `<th>${esc(i)}</th>`).join('')}</tr>${rs
      .map(
        (r) =>
          `<tr><td>${esc(r.id)}</td><td class="${r.level}">${r.level}</td><td>${r.score.toFixed(2)}</td><td class="${r.correct ? 'pass' : 'fail'}">${r.correct ? 'yes' : 'NO'}</td>${r.checks
            .map((c) => `<td class="${c.status}" title="${esc(c.detail)}">${c.status} ${fmt(c.value)}</td>`)
            .join('')}</tr>`,
      )
      .join('')}</table></div>`,
  );
}
out.insertAdjacentHTML(
  'beforeend',
  `<h2>Reasons and fixes (whole fixture)</h2><table>${results
    .filter((r) => r.mode === 'full' && r.level !== 'pass')
    .map((r) => `<tr><td>${esc(r.id)}</td><td>${r.reasons.map(esc).join('<br>')}</td><td>${r.fixes.map(esc).join('<br>')}</td></tr>`)
    .join('')}</table>`,
);

const payload = JSON.stringify({ allOk, lines, lumaOk, luma, results });
window.__gate = JSON.parse(payload);
if (new URLSearchParams(location.search).has('headless')) fetch('/__results', { method: 'POST', body: payload });

// "Why it may be happening and what to work on": connects each trustworthy finding to possible
// contributing limitations, the compensations they may produce, a clinical screen to confirm, and a
// short prioritised work list. Evidence: js/presentation/limitations.js (generated from
// reference/limitations-evidence.json; every citation checked against its PubMed record).
//
// Rules (DECISIONS.md, 2026-10-13):
//   - a FULL entry only when at least one of its findings has a shown status (trustworthy, flagged);
//     borderline / low-confidence findings give a short "worth screening" note; "not reported"
//     metrics give nothing;
//   - findings sharing a likely limitation are merged into ONE entry that lists every finding it
//     may explain; top priorities ranked by findings explained, then evidence strength;
//   - findings seen in nearly every benchmarked runner are softened (likely measurement bias or a
//     range that is too tight, not a runner problem);
//   - wording is "may / could / consider / screen for"; limitations are unconfirmed until screened.
import { CHAINS } from './limitations.js';

const RANK = { strong: 4, moderate: 3, limited: 2, 'very limited': 1, none: 0 };
const best = (a, b) => (RANK[b] > RANK[a] ? b : a);

// Benchmark (BENCHMARK.md, 2026-10-13): flagged or borderline in every validated session (4 of 4
// sessions, 2 runners). Softened: likely a measurement bias (the app reads knees ≈ 7° high,
// foot-to-COM 2–9 cm high) or a range that is too tight, not a runner-specific problem.
export const COMMON_ACROSS_RUNNERS = {
  ms_max_knee_flexion: 'flagged or borderline in every analysed runner; the app reads knee flexion about 7° high and the 35–45° range sits below published healthy averages (~45°)',
  ic_tibial_inclination: 'borderline in every analysed runner; may reflect a camera or landmark bias rather than this runner',
  ic_foot_to_com: 'borderline in every analysed runner; the measurement is still awaiting validation on a second camera setup',
};

// Plain-language names (no codes such as IC or HW).
const PLAIN = {
  ic_foot_to_com: 'Foot landing ahead of the body',
  ic_tibial_inclination: 'Shin angle at foot landing',
  ic_knee_flexion: 'Knee bend at foot landing',
  ms_max_knee_flexion: 'Knee bend during stance',
  ms_hip_adduction: 'Thigh angling inward (hip adduction)',
  ms_knee_varus_valgus: 'Knee moving inward (knee valgus, 2D view)',
  ms_crossover: 'Feet crossing the midline (crossover)',
  to_hip_extension: 'Hip extension at push-off',
  ic_spine_lean: 'Forward trunk lean at landing',
  ms_spine_lean: 'Forward trunk lean at midstance',
  trunk_change_peak_hip_ext: 'Trunk tipping back at push-off',
  arm_crossover: 'Arms crossing the body',
  cadence: 'Step rate',
  asymmetry: 'Left/right step-time difference',
};
const PHASE = { initial_contact: 'foot landing', midstance: 'midstance', toe_off: 'push-off', swing: 'swing' };

// Which chain(s) a finding may belong to, and when it counts (status on the model cell).
const TRIGGERS = [
  { id: 'ic_foot_to_com', chains: ['overstride'], when: ['yellow', 'red', 'pending-validation'], sense: 'high' },
  { id: 'ic_tibial_inclination', chains: ['overstride'], when: ['yellow', 'red'], sense: 'high', test: (v) => v > 8 },
  { id: 'ic_knee_flexion', chains: ['overstride'], when: ['yellow', 'red'], sense: 'low', test: (v) => v < 14 },
  { id: 'ms_max_knee_flexion', chains: ['knee_flexion_midstance'], when: ['red'], sense: 'high' },
  { id: 'ms_max_knee_flexion', chains: ['ankle_dorsiflexion'], when: ['yellow'], sense: 'low', test: (v) => v < 35 },
  { id: 'ms_hip_adduction', chains: ['hip_frontal_control'], when: ['yellow', 'red'], sense: 'high' },
  { id: 'ms_knee_varus_valgus', chains: ['hip_frontal_control'], when: ['yellow', 'red'], sense: 'high' },
  { id: 'ms_crossover', chains: ['crossover_step_width'], when: ['yellow', 'red'], sense: 'yes', test: (v) => v === true },
  { id: 'to_hip_extension', chains: ['hip_extension_trunk_lean'], when: ['yellow', 'red', 'pending-validation'], sense: 'low' },
  { id: 'ic_spine_lean', chains: ['hip_extension_trunk_lean'], when: ['red'], sense: 'high' },
  { id: 'ms_spine_lean', chains: ['hip_extension_trunk_lean'], when: ['red'], sense: 'high' },
  { id: 'trunk_change_peak_hip_ext', chains: ['hip_extension_trunk_lean'], when: ['yellow', 'red'], sense: 'high' },
  { id: 'arm_crossover', chains: ['arm_crossover'], when: ['yellow', 'red', 'record'], sense: 'yes', test: (v) => v === true },
];

// Chains merged into one entry when they share a likely limitation.
const GROUPS = [
  { id: 'step_rate', title: 'Step rate may be low for the speed (overstriding)', chains: ['overstride', 'knee_flexion_midstance', 'contact_time_cadence', 'vertical_oscillation'] },
  { id: 'frontal_control', title: 'Hip and pelvis control from the side-to-side view', chains: ['hip_frontal_control', 'crossover_step_width', 'trunk_lateral_lean'] },
  { id: 'trunk_hip', title: 'Trunk posture and hip extension at push-off', chains: ['hip_extension_trunk_lean'] },
  { id: 'ankle', title: 'Ankle mobility and calf capacity', chains: ['ankle_dorsiflexion'] },
  { id: 'arms', title: 'Arm swing', chains: ['arm_crossover'] },
  { id: 'asymmetry', title: 'Left/right difference', chains: ['asymmetry'] },
];

function cellsOf(model, id) {
  for (const s of model.sections) for (const r of s.rows) if (r.id === id) return { row: r, cells: Object.values(r.cells).filter((c) => c.assessed) };
  return null;
}

// Findings present in the model, with trust level.
function findings(model) {
  const out = [];
  if (model.notReliable?.length) {
    // nothing from "not reported" metrics
  }
  for (const t of TRIGGERS) {
    const found = cellsOf(model, t.id);
    if (!found) continue;
    for (const c of found.cells) {
      const status = c.status || c.rawStatus;
      if (!t.when.includes(status)) continue;
      if (t.test && !t.test(c.value)) continue;
      const trusted = !!c.status && !c.hedge; // shown status = trustworthy (display rules)
      const side = c.key === 'mid' ? '' : ` (${c.key})`;
      out.push({
        id: t.id,
        chains: t.chains,
        label: `${PLAIN[t.id] || found.row.label}${side}`,
        value: c.text,
        range: found.row.range?.green ? `usual range ${found.row.range.green}` : null,
        phase: PHASE[found.row.phase] || null,
        phaseId: found.row.phase || null,
        trusted,
        hedge: c.hedge || (c.confidence === 'low' ? 'low confidence' : null),
        common: COMMON_ACROSS_RUNNERS[t.id] || null,
        sense: t.sense,
      });
    }
  }
  // Timing-based findings.
  const cad = model.timing?.rows.find((r) => r.label === 'Cadence');
  const spm = cad ? parseFloat(cad.text) : null;
  if (spm && spm < 160) out.push({ id: 'cadence', chains: ['contact_time_cadence', 'overstride'], label: PLAIN.cadence, value: cad.text, range: 'commonly 160–190 steps/min', phase: null, trusted: cad.confidence !== 'low', hedge: null, common: null, sense: 'low' });
  const asym = model.timing?.rows.find((r) => r.label.startsWith('Step-time difference'));
  const pct = asym ? parseFloat(asym.text) : null;
  if (pct != null && pct > 5 && asym.agreement === 'agree') out.push({ id: 'asymmetry', chains: ['asymmetry'], label: PLAIN.asymmetry, value: asym.text, range: 'some difference is normal', phase: null, trusted: true, hedge: null, common: null, sense: 'yes' });
  return out;
}

// Some chains cover both directions (e.g. knee flexion: too much vs too little). Keep only items that
// fit the direction of the findings (avoids recommending opposite work in one entry).
const TOO_LITTLE = /too little|stiff|for TOO LITTLE|reduced knee flexion/i;
const EXCESS = /\bexcess|for EXCESS|too much/i;
function fitsDirection(text, senses) {
  if (senses.has('high') && !senses.has('low') && TOO_LITTLE.test(text)) return false;
  if (senses.has('low') && !senses.has('high') && EXCESS.test(text)) return false;
  return true;
}
// Screens that only point to another chain's screen are replaced by that screen.
function resolveScreens(screens) {
  return screens.flatMap((x) => {
    const m = /See (\w+)/.exec(`${x.how} ${x.positiveIf}`);
    if (!m || !CHAINS[m[1]]) return [x];
    return CHAINS[m[1]].screens.filter((y) => !/^See /.test(y.how));
  });
}

const uniqBy = (arr, key) => {
  const seen = new Set();
  return arr.filter((x) => (seen.has(key(x)) ? false : (seen.add(key(x)), true)));
};
const evOf = (items) => uniqBy(items.flatMap((x) => x.evidence || []).filter((e) => e.pmid), (e) => e.pmid);

// Where another view would strengthen an entry: the chain's other trigger metrics that were not
// assessed because their view is missing, and the other leg of a one-sided side-view finding.
function strengthenText(model, g, fs) {
  const views = new Set();
  const ids = TRIGGERS.filter((t) => t.chains.some((c) => g.chains.includes(c))).map((t) => t.id);
  for (const id of ids) {
    const found = (() => {
      for (const s of model.sections) for (const r of s.rows) if (r.id === id) return r;
      return null;
    })();
    if (!found) continue;
    for (const c of Object.values(found.cells)) {
      const m = !c.assessed && /^needs (the [a-z ]+ view|a side view \(left or right\))/.exec(c.why || '');
      if (m) views.add(m[1]);
    }
  }
  // A side-view finding on one leg: the other leg needs its own side view.
  for (const f of fs) {
    const other = / \((left|right)\)$/.exec(f.label)?.[1] === 'left' ? 'right' : / \((left|right)\)$/.exec(f.label) ? 'left' : null;
    const row = model.sections.flatMap((s) => s.rows).find((r) => r.id === f.id);
    if (other && row?.cells[other] && !row.cells[other].assessed && /side view/.test(row.cells[other].why)) views.add(`the ${other} side view`);
  }
  if (!views.size) return null;
  return `Confirm with ${[...views].join(' and ')}: ${views.size > 1 ? 'they show' : 'it shows'} related measures not assessed in this session.`;
}

export function buildExplanations(model) {
  const found = findings(model);
  const entries = [];
  for (const g of GROUPS) {
    const fs = found.filter((f) => f.chains.some((c) => g.chains.includes(c)));
    if (!fs.length) continue;
    const chainKeys = g.chains.filter((k) => fs.some((f) => f.chains.includes(k)) && CHAINS[k]);
    const chains = chainKeys.map((k) => CHAINS[k]);
    const trusted = fs.filter((f) => f.trusted && !f.common);
    const full = trusted.length > 0;
    const strength = chains.reduce((s, c) => best(s, c.strength), 'none');
    const senses = new Set(fs.map((f) => f.sense));
    const fit = (x) => fitsDirection(`${x.name || x.text || x.item || ''} ${x.note || ''} ${x.how || ''}`, senses);
    // Context, not limitations to screen or train (speed, fatigue); measurement caveats, not compensations.
    const CONTEXT = /^(running speed|fatigue)\b/i;
    const CAVEAT = /does not equal/i;
    const allLims = chains.flatMap((c) => c.limitations).filter(fit);
    const context = allLims.filter((x) => CONTEXT.test(x.name)).map((x) => x.name.replace(/\s*\(.*\)$/, '').toLowerCase());
    const limitations = uniqBy(allLims.filter((x) => !CONTEXT.test(x.name)), (x) => x.name.toLowerCase().replace(/\s*\(.*?\)/g, '').slice(0, 14)).sort((a, b) => RANK[b.strength] - RANK[a.strength]);
    const allComps = chains.flatMap((c) => c.compensations).filter(fit);
    const caveats = allComps.filter((x) => CAVEAT.test(x.text)).map((x) => x.text);
    const compensations = uniqBy(allComps.filter((x) => !CAVEAT.test(x.text)), (x) => x.text).sort((a, b) => RANK[b.strength] - RANK[a.strength]);
    const screens = uniqBy(resolveScreens(chains.flatMap((c) => c.screens).filter((x) => x.name && !/^none/i.test(x.name)).filter(fit)), (x) => x.name).slice(0, 3);
    const work = uniqBy(chains.flatMap((c) => c.work).filter(fit), (x) => x.item.toLowerCase().slice(0, 24))
      .sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9))
      .slice(0, 4)
      .map((w) => ({
        ...w,
        doseLabel: /clinical practice/i.test(w.doseSource) ? 'clinical practice, no trial' : w.evidence.length ? `from trial: ${uniqBy(w.evidence, (e) => e.short).map((e) => e.short).join(', ')}` : w.doseSource,
      }));
    // Sources: only the evidence behind what is shown (full entries show causes, compensations and work).
    const shownLims = limitations.slice(0, 4);
    const shownComps = compensations.slice(0, 4);
    const sources = evOf(full ? [...shownLims, ...shownComps, ...screens, ...work] : screens);
    entries.push({
      id: g.id,
      title: g.title,
      kind: full ? 'full' : 'screen',
      findings: fs,
      strength,
      limitations: shownLims,
      compensations: shownComps,
      context: context.length ? `Also depends on ${[...new Set(context)].join(' and ')}, which are not limitations to train.` : null,
      caveats,
      screens,
      work,
      sources,
      strengthen: strengthenText(model, g, fs),
      softened: fs.length && fs.every((f) => f.common) ? 'All findings here are seen in nearly every analysed runner, which suggests a measurement bias or a range that is too tight rather than a problem specific to this runner.' : null,
    });
  }
  const priorities = entries
    .filter((e) => e.kind === 'full')
    .sort((a, b) => b.findings.length - a.findings.length || RANK[b.strength] - RANK[a.strength])
    .map((e) => ({ id: e.id, title: e.title, explains: e.findings.map((f) => f.label), strength: e.strength }));
  return { entries, priorities, reviewNote: 'Clinician to review before sharing. Possibilities to screen for, not conclusions; a running-video angle is not a range-of-motion test.' };
}

// Plain-language, editable text for one session (used on screen, in the copy text and the export).
export function explanationsText(ex) {
  if (!ex.entries.length) return 'No finding needs a corrective plan from this analysis.';
  const out = [`(${ex.reviewNote})`];
  if (ex.priorities.length) {
    out.push('Top priorities:');
    ex.priorities.forEach((p, i) => out.push(`${i + 1}. ${p.title}: may explain ${p.explains.join('; ')} (evidence: ${p.strength}).`));
  }
  for (const e of ex.entries) {
    out.push('', e.kind === 'full' ? e.title.toUpperCase() : `Worth screening: ${e.title.toLowerCase()}`);
    out.push(`What we saw: ${e.findings.map((f) => `${f.label} ${f.value}${f.range ? ` (${f.range})` : ''}${f.phase ? `, at ${f.phase}` : ''}${f.hedge ? ` [${f.hedge}]` : ''}`).join('; ')}.`);
    if (e.softened) out.push(`Note: ${e.softened}`);
    if (e.strengthen) out.push(`Note: ${e.strengthen}`);
    if (e.context) out.push(`Note: ${e.context}`);
    for (const c of e.caveats || []) out.push(`Caveat: ${c}.`);
    if (e.kind === 'full') {
      out.push(`Could be contributing (unconfirmed until screened): ${e.limitations.map((l) => `${l.name} [evidence: ${l.strength === 'none' ? 'no tested link' : l.strength}]`).join('; ')}.`);
      if (e.compensations.length) out.push(`It may also show up as: ${e.compensations.map((c) => `${c.text} [${c.strength === 'none' ? 'no tested link' : c.strength}]`).join('; ')}.`);
    }
    if (e.screens.length) out.push(`Screen to confirm: ${e.screens.map((s) => `${s.name}${s.how ? ` (${s.how})` : ''}`).join('; ')}.`);
    if (e.kind === 'full' && e.work.length) {
      out.push('What to work on (in order):');
      e.work.forEach((w, i) => out.push(`  ${i + 1}. ${w.item}: ${w.dose} [${w.type}; dose: ${w.doseLabel}; changes the running pattern: ${w.changesRunning}]`));
    }
    const names = uniqBy(e.sources, (s) => s.short).map((s) => s.short);
    out.push(`Evidence: ${e.strength}${names.length ? `; ${names.slice(0, 8).join(', ')}${names.length > 8 ? ` and ${names.length - 8} more (links on screen)` : ''}` : ''}.`);
  }
  return out.join('\n');
}

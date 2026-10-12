// Research-linked suggestions for the findings in the presentation model.
// Evidence: js/presentation/evidence.js (generated from reference/corrections-evidence.json; every
// citation checked against its PubMed record, abstracts only). Rules here decide WHEN a finding
// applies; the evidence decides WHAT is suggested and how strongly.
//
//   primary  = the finding rests on values shown with a status (trustworthy);
//   consider = the finding rests on borderline or low-confidence values (shown, clearly hedged).
// Suggestions never claim more than the evidence: lab changes in mechanics are not injury reduction.
import { EVIDENCE } from './evidence.js';

const RANK = { strong: 4, moderate: 3, limited: 2, 'very limited': 1, none: 0 };

// Cells of a metric in the model (all sides).
function cells(model, id) {
  for (const s of model.sections) for (const r of s.rows) if (r.id === id) return Object.values(r.cells).filter((c) => c.assessed);
  return [];
}
const shown = (cs, statuses) => cs.some((c) => c.status && statuses.includes(c.status));
const hedged = (cs, statuses) => cs.some((c) => !c.status && statuses.includes(c.rawStatus));
const finding = (model, id) => model.findings.find((f) => f.id === id);

// Each rule: which finding key applies and why; returns null when it does not apply.
const RULES = [
  {
    key: 'overstride',
    test(model) {
      const why = [];
      let firm = false;
      const f = finding(model, 'overstride');
      if (f) {
        why.push('overstride pattern');
        firm ||= f.confidence !== 'low';
      }
      for (const [id, label] of [['ic_foot_to_com', 'foot landing ahead of the body'], ['ic_tibial_inclination', 'shin angled forward at contact'], ['ic_knee_flexion', 'straight knee at contact']]) {
        const cs = cells(model, id);
        if (shown(cs, ['yellow', 'red'])) {
          why.push(label);
          firm = true;
        } else if (hedged(cs, ['yellow', 'red', 'pending-validation', 'ic-sensitive'])) why.push(`${label} (borderline)`);
      }
      return why.length ? { why, firm, take: 2 } : null;
    },
  },
  {
    key: 'hip_adduction',
    test(model) {
      const cs = cells(model, 'ms_hip_adduction');
      if (shown(cs, ['yellow', 'red'])) return { why: ['hip adduction above range'], firm: true, take: 2 };
      if (hedged(cs, ['yellow', 'red'])) return { why: ['hip adduction near the flag threshold'], firm: false, take: 1 };
      return null;
    },
  },
  {
    key: 'crossover_step_width',
    test(model) {
      const cs = cells(model, 'ms_crossover');
      if (cs.some((c) => c.value === true)) return { why: ['crossover foot placement'], firm: shown(cs, ['yellow', 'red']), take: 1 };
      return null;
    },
  },
  {
    key: 'trunk_forward_lean',
    test(model) {
      const cs = [...cells(model, 'ic_spine_lean'), ...cells(model, 'ms_spine_lean')];
      if (shown(cs, ['red'])) return { why: ['large forward trunk lean'], firm: true, pick: 1 };
      if (cs.some((c) => typeof c.value === 'number' && c.value < 0)) return { why: ['very upright or backward-leaning trunk'], firm: false, pick: 0 };
      return null;
    },
  },
  {
    key: 'rearfoot_strike',
    test(model) {
      const cs = cells(model, 'ic_foot_strike');
      return cs.some((c) => /^rearfoot/.test(c.text)) ? { why: ['rearfoot strike (low-confidence measurement)'], firm: false, take: 1 } : null;
    },
  },
  {
    key: 'limited_hip_extension',
    test(model) {
      const cs = cells(model, 'to_hip_extension');
      return cs.some((c) => c.rawStatus === 'pending-validation') ? { why: ['hip extension below 5° (awaiting validation)'], firm: false, take: 1 } : null;
    },
  },
  {
    key: 'arm_crossover',
    test(model) {
      return cells(model, 'arm_crossover').some((c) => c.value === true) ? { why: ['arms swing across the midline'], firm: false, take: 1 } : null;
    },
  },
];

// Step-rate targets from the runner's own cadence.
function personalise(cue, model) {
  const cad = model.timing?.rows.find((r) => r.label === 'Cadence');
  const spm = cad ? parseFloat(cad.text) : null;
  if (!spm || !/step rate/i.test(cue)) return cue;
  // "5-10%", "~7.5-10%" or "10%" in the cue text.
  const m = cue.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)%/) || cue.match(/(\d+(?:\.\d+)?)%/);
  if (!m) return cue;
  const pct = [parseFloat(m[1]), parseFloat(m[2] ?? m[1])].map((v) => v / 100);
  const [a, b] = pct.map((p) => Math.round(spm * (1 + p)));
  return `${cue} (from about ${Math.round(spm)} to ${a === b ? a : `${a}–${b}`} steps/min)`;
}

export function correctionsFor(model) {
  const out = [];
  for (const rule of RULES) {
    const hit = rule.test(model);
    const ev = EVIDENCE[rule.key];
    if (!hit || !ev) continue;
    const list = hit.pick != null ? [ev.suggestions[hit.pick]] : ev.suggestions.slice(0, hit.take ?? 1);
    for (const s of list.filter(Boolean)) {
      out.push({
        key: rule.key,
        cue: personalise(s.cue, model),
        type: s.type,
        strength: s.strength,
        priority: hit.firm && RANK[s.strength] >= RANK.limited ? 'primary' : 'consider',
        forText: hit.why.join(', '),
        caveats: s.caveats,
        evidence: s.evidence.map((e) => ({ short: e.short, url: e.url, result: e.result, design: e.design, verified: e.verified })),
        refs: s.evidence.map((e) => e.short),
      });
    }
  }
  // Primary first, then by evidence strength.
  return out.sort((a, b) => (a.priority === b.priority ? RANK[b.strength] - RANK[a.strength] : a.priority === 'primary' ? -1 : 1));
}

// Reconciliation layer: the per-clip analyses of one session -> ONE result per client.
//
// Inputs: session clips { lateral_left?, lateral_right?, posterior? }, each { analysis, speed?,
// speedUnit?, incline? } (analysis from measurements.js toAnalysis / posterior.js
// toPosteriorAnalysis), plus the intake. Output: a plain JSON object (schema below, documented in
// HANDOFF.md). The text summary keeps using mergeSession + engine/analysis.js; this object is the
// data foundation for the presentation phase and the debug view.
//
// 1. Left/right convention: anatomical left/right everywhere. Lateral clips: the near leg is the
//    leg facing the camera; the slot says which, and MediaPipe depth (z) checks it. Posterior clips:
//    the runner's left is image-left (rear view, un-mirrored at decode); the per-frame left/right
//    order check counts swaps.
// 2. Time alignment: the clips are separate recordings, so they are never synchronised in clock
//    time. They are aligned on the gait cycle: each view's events are expressed in its own strides,
//    and the shared timing quantities (cadence, step times, step-time symmetry, vertical
//    oscillation) are cross-checked.
// 3. Authoritative view per metric: sagittal from lateral, frontal from posterior (config
//    allowedViews, enforced in the emitters). Timing quantities are cross-checked across views.
// 4. Cross-checks: within tolerance -> agreed value (stride-weighted); otherwise the view with the
//    higher timing confidence, with the discrepancy recorded.
// 5. Confidence per metric value: the lowest of landmark quality, event quality, timing/IC
//    sensitivity, validation error, and cross-view agreement where applicable; every downgrade
//    keeps its reason.
// 6. One view only: metrics of the missing view are listed as not assessed, with the reason.

import { CLIP_SLOTS, METRICS, VALIDATION } from '../config.js';
import { confidenceFor, intakeNumbers, statusFor } from '../engine/analysis.js';

export const SCHEMA = 'gait-session/1';

// Tolerances for cross-view checks (DECISIONS.md, 2026-10-10).
export const RECONCILE = {
  cadencePct: 3, // separate recordings: cadence drifts a little between clips
  stepTimeMs: (fsMin) => Math.max(20, 1000 / fsMin), // one analysed frame of the coarser clip
  stepAsymmetryPts: 5, // percentage points
  oscillationCm: 1.5, // between two lateral clips (left and right side)
  oscillationPct: 25, // used when height is not entered (share of body height)
  nearSideMinZGap: 0.2, // MediaPipe depth gap that makes the near-side check decisive
};

// Mean absolute error vs manual measurement (reference/VALIDATION.md); filled by the validation
// step. Units as the metric. A metric's confidence is capped by its error: > 10 (deg) -> low,
// > 5 -> medium. Missing = not yet validated -> capped at medium.
// Values: worst credible mean absolute error across the validated clients (reference/VALIDATION.md,
// 2026-10-10). Side-view knee-based values use C0 only (T1–T3 hand-marked knees were not plausible).
export const VALIDATION_ERROR = {
  ic_knee_flexion: 9.1,
  ms_max_knee_flexion: 6.7,
  ms_knee_flexion_excursion: 6.6,
  ic_tibial_inclination: 7.9,
  to_hip_extension: 8.3,
  ic_spine_lean: 7.1,
  ms_spine_lean: 7.1,
  trunk_change_peak_hip_ext: 7.1,
  ms_ankle: 20.8,
  ic_foot_inclination: 12.8,
  ic_foot_strike: 12.8,
  ic_foot_to_com: 9.1, // cm
  ms_hip_adduction: 3.1,
  ms_knee_varus_valgus: 1.9,
  ms_trunk_lateral_lean: 3.2,
  ms_lateral_shift: 3.5, // cm (0.1 hip widths)
  ms_foot_midline: 0.2, // hip widths
};

const RANK = { none: -1, low: 0, medium: 1, high: 2 };
const minConf = (...c) => c.filter(Boolean).reduce((a, b) => (RANK[b] < RANK[a] ? b : a), 'high');
const viewSlots = (clips, view) => Object.keys(CLIP_SLOTS).filter((s) => clips[s]?.analysis && CLIP_SLOTS[s].view === view);
const r1 = (v, d = 1) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

function plane(def) {
  if (def.allowedViews?.includes('posterior') && !def.allowedViews.includes('lateral')) return 'frontal';
  if (def.allowedViews?.includes('lateral')) return 'sagittal';
  return 'other';
}

// --- 1. convention --------------------------------------------------------------------------
function convention(clips) {
  const lateral = viewSlots(clips, 'lateral').map((slot) => {
    const a = clips[slot].analysis;
    const auto = a.nearSideAuto;
    const slotLeg = CLIP_SLOTS[slot].leg;
    const decisive = auto && auto.zGap >= RECONCILE.nearSideMinZGap;
    return {
      slot,
      nearLeg: a.nearSide,
      slotLeg,
      depthCheck: auto ? { leg: auto.leg, zGap: r1(auto.zGap, 2), decisive } : null,
      agrees: !auto || !decisive || auto.leg === a.nearSide,
      runnerFaces: a.clip?.facing ?? null,
      mirrored: !!a.clip?.mirrored,
    };
  });
  const posterior = viewSlots(clips, 'posterior').map((slot) => {
    const a = clips[slot].analysis;
    const swaps = a.captureChecks?.posterior?.swapFrames ?? a.clip?.swapFrames ?? null;
    return { slot, leftOnImage: 'left', mirrored: !!a.clip?.mirrored, swapFrames: swaps, swapCheckPassed: swaps === 0 };
  });
  const issues = [
    ...lateral.filter((l) => !l.agrees).map((l) => `${l.slot}: depth says the ${l.depthCheck.leg} leg faces the camera, but the clip is in the ${l.slotLeg}-side slot`),
    ...posterior.filter((p) => !p.swapCheckPassed).map((p) => `${p.slot}: left/right landmark order swapped in ${p.swapFrames} frame(s); left-right differences from this clip are not reported`),
  ];
  return { rule: 'anatomical left/right in every view', lateral, posterior, issues };
}

// --- 2/4. timing and cross-checks -----------------------------------------------------------
function viewTiming(clips) {
  const out = {};
  for (const slot of Object.keys(CLIP_SLOTS)) {
    const a = clips[slot]?.analysis;
    const t = a?.eventTable;
    if (!t) continue;
    const legConf = Object.fromEntries(Object.entries(t.legs).map(([leg, l]) => [leg, l.summary.confidence]));
    // Timing confidence of the view: the best leg's event confidence, low if step timing is unreliable.
    const best = Object.values(legConf).reduce((x, y) => (RANK[y] > RANK[x] ? y : x), 'none');
    out[slot] = {
      view: t.view,
      analysedHz: t.fs,
      cadenceSpm: r1(t.timing.cadence?.spm),
      strides: t.timing.cadence?.strides ?? null,
      stepSecL: r1(t.timing.stepSecL, 3),
      stepSecR: r1(t.timing.stepSecR, 3),
      stepAsymmetryPct: r1(t.timing.stepAsymmetryPct),
      stepTimingReliable: t.timing.stepTimingReliable,
      contactMs: Object.fromEntries(Object.entries(t.timing.contactMs).map(([k, v]) => [k, r1(v, 0)])),
      oscillation: a.oscillation ? { px: r1(a.oscillation.px), shareOfHeight: r1(a.oscillation.shareOfHeight, 4), strides: a.oscillation.strides } : null,
      legEvents: Object.fromEntries(Object.entries(t.legs).map(([leg, l]) => [leg, { role: l.role, ...l.summary }])),
      confidence: t.timing.stepTimingReliable === false ? minConf(best, 'low') : best === 'none' ? 'low' : best,
      landmarkVisibility: a.landmarkQuality ? r1(a.landmarkQuality.meanVisibility, 3) : null,
      method: t.timing.method,
    };
  }
  return out;
}

function crossCheck(name, unit, entries, tol, note) {
  // entries: [{ slot, value, weight, confidence }]
  const ok = entries.filter((e) => e.value != null && Number.isFinite(e.value));
  if (!ok.length) return { quantity: name, unit, status: 'not available', values: {}, reported: null };
  const values = Object.fromEntries(ok.map((e) => [e.slot, r1(e.value, unit === 's' ? 3 : 1)]));
  if (ok.length === 1) return { quantity: name, unit, status: 'single view', values, reported: values[ok[0].slot], source: ok[0].slot, confidence: ok[0].confidence, note };
  const vals = ok.map((e) => e.value);
  const spread = Math.max(...vals) - Math.min(...vals);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const limit = typeof tol === 'function' ? tol(mean) : tol;
  if (spread <= limit) {
    const w = ok.reduce((s, e) => s + (e.weight || 1), 0);
    const agreed = ok.reduce((s, e) => s + e.value * (e.weight || 1), 0) / w;
    return { quantity: name, unit, status: 'agree', values, tolerance: r1(limit, 3), difference: r1(spread, 3), reported: r1(agreed, unit === 's' ? 3 : 1), source: 'agreed', confidence: minConf(...ok.map((e) => e.confidence)) === 'low' ? 'medium' : 'high', note };
  }
  // Disagreement: the view with the higher timing confidence; tie -> higher landmark visibility.
  const better = (x, y) => RANK[y.confidence] > RANK[x.confidence] || (RANK[y.confidence] === RANK[x.confidence] && (y.vis ?? 0) > (x.vis ?? 0));
  const best = ok.reduce((x, y) => (better(x, y) ? y : x));
  return {
    quantity: name,
    unit,
    status: 'disagree',
    values,
    tolerance: r1(limit, 3),
    difference: r1(spread, 3),
    reported: r1(best.value, unit === 's' ? 3 : 1),
    source: best.slot,
    confidence: minConf(best.confidence, 'medium'),
    flag: `views differ by ${r1(spread, unit === 's' ? 3 : 1)} ${unit} (tolerance ${r1(limit, unit === 's' ? 3 : 1)}); reported from ${best.slot} (higher event/landmark confidence)`,
    note,
  };
}

function crossChecks(timing, heightCm) {
  const slots = Object.keys(timing);
  const fsMin = Math.min(...slots.map((s) => timing[s].analysedHz || 60));
  const e = (fn) => slots.map((s) => ({ slot: s, value: fn(timing[s]), weight: timing[s].strides || 1, confidence: timing[s].confidence, vis: timing[s].landmarkVisibility }));
  const usableStep = (t, v) => (t.stepTimingReliable === false ? null : v);
  const osc = (t) => (t.oscillation?.shareOfHeight == null ? null : heightCm ? t.oscillation.shareOfHeight * heightCm : t.oscillation.shareOfHeight * 100);
  return [
    crossCheck('cadence', 'spm', e((t) => t.cadenceSpm), (m) => (m * RECONCILE.cadencePct) / 100, 'separate recordings: small drift between clips is expected'),
    crossCheck('step time, left', 's', e((t) => usableStep(t, t.stepSecL)), RECONCILE.stepTimeMs(fsMin) / 1000),
    crossCheck('step time, right', 's', e((t) => usableStep(t, t.stepSecR)), RECONCILE.stepTimeMs(fsMin) / 1000),
    crossCheck('step-time asymmetry (+ = left longer)', '%', e((t) => usableStep(t, t.stepAsymmetryPct)), RECONCILE.stepAsymmetryPts),
    // Side view only: from behind, fore-aft drift toward the camera also moves the pelvis in the image;
    // rear values read 40–75% higher than side on all four clients (2026-10-10), so they are shown
    // for information and never reported.
    {
      ...crossCheck(heightCm ? 'vertical oscillation (pelvis)' : 'vertical oscillation (pelvis, % of height)', heightCm ? 'cm' : '%', e(osc).filter((x) => timing[x.slot].view === 'lateral'), heightCm ? RECONCILE.oscillationCm : (m) => (m * RECONCILE.oscillationPct) / 100, 'side view; rear value shown for information only (perspective inflates it)'),
      rearInformational: Object.fromEntries(e(osc).filter((x) => timing[x.slot].view === 'posterior' && x.value != null).map((x) => [x.slot, r1(x.value)])),
    },
    crossCheck('contact time', 'ms', slots.map((s) => {
      const c = Object.values(timing[s].contactMs).find((v) => v != null);
      return { slot: s, value: c ?? null, weight: timing[s].strides, confidence: timing[s].confidence, vis: timing[s].landmarkVisibility };
    }), 25, 'side view only: from behind, foot contact is not observable reliably (see gait-events.js)'),
  ];
}

// --- 5. metric confidence -------------------------------------------------------------------
function cellConfidence(def, cell, eventConf) {
  const reasons = [];
  let conf = confidenceFor(def, cell.quality);
  if (!conf) return { confidence: 'none', reasons: ['too few measurable strides'] };
  if (def.baselineConfidence && RANK[def.baselineConfidence] < RANK.high) reasons.push(`metric capped at ${def.baselineConfidence} (2D reliability)`);
  if (cell.quality != null && cell.quality < 0.7) reasons.push(`${Math.round(cell.quality * 100)}% of strides measurable`);
  if (eventConf && RANK[eventConf] < RANK[conf]) {
    conf = eventConf;
    reasons.push(`gait events ${eventConf} confidence`);
  }
  if (cell.sweep?.values?.length && (def.type === 'range' || def.type === 'category')) {
    const known = cell.sweep.values.filter((v) => v != null);
    const classes = new Set(known.map((v) => statusFor(def, v)));
    if (classes.size > 1 || known.length < cell.sweep.values.length) {
      conf = 'low';
      reasons.push(`${cell.sweep.kind === 'window' ? 'window' : cell.sweep.kind === 'timing' ? 'midstance-timing' : 'IC-timing'} sensitive (status changes across ${cell.sweep.tolerances?.join(' / ') || 'the sweep'})`);
    }
  }
  const err = VALIDATION_ERROR[def.id];
  if (err == null) {
    if (RANK[conf] > RANK.medium) reasons.push('not yet validated against manual measurement');
    conf = minConf(conf, 'medium');
  } else if (err > 10) {
    conf = 'low';
    reasons.push(`validation error ${err}${def.unit === 'deg' ? '°' : ` ${def.unit}`} (> 10)`);
  } else if (err > 5) {
    conf = minConf(conf, 'medium');
    reasons.push(`validation error ${err}${def.unit === 'deg' ? '°' : ` ${def.unit}`} (> 5)`);
  }
  const pv = def.pendingValidation;
  if (pv && !VALIDATION[pv.flag]) {
    conf = minConf(conf, 'medium');
    reasons.push(`awaiting clinician validation (${pv.flag})`);
    if ((pv.when || ['red']).includes(statusFor(def, cell.value))) {
      conf = 'low';
      reasons.push(pv.text);
    }
  }
  return { confidence: conf, reasons };
}

function metricsBlock(clips, timing) {
  const out = {};
  const present = new Set(Object.keys(CLIP_SLOTS).filter((s) => clips[s]?.analysis).map((s) => CLIP_SLOTS[s].view));
  for (const def of METRICS) {
    const build = def.status ?? 'built';
    const views = def.allowedViews || [];
    const authoritativeView = views.length === 1 ? views[0] : views.join('+');
    const entry = { label: def.label, unit: def.unit ?? null, phase: def.phase, plane: plane(def), authoritativeView, type: def.type, provisional: !!def.provisional, scored: def.scored !== false, cells: {} };
    if (build !== 'built') {
      entry.notAssessed = build === 'not-measurable' ? 'not measurable in 2D' : build === 'not-built' ? 'not built: poor 2D reliability' : 'not built yet';
      out[def.id] = entry;
      continue;
    }
    if (!views.some((v) => present.has(v))) {
      entry.notAssessed = `needs a ${views.includes('posterior') ? 'posterior (rear)' : 'lateral (side)'} clip`;
      out[def.id] = entry;
      continue;
    }
    const keys = def.sided === 'mid' ? ['mid'] : ['left', 'right'];
    for (const key of keys) {
      // The cell comes from the authoritative view's clip(s); a lateral leg from its own near-side clip.
      let cell = null;
      let slot = null;
      for (const s of Object.keys(CLIP_SLOTS)) {
        const c = clips[s]?.analysis?.measurements?.[def.id]?.[key];
        if (c && (cell == null || (cell.value == null && c.value != null))) {
          cell = c;
          slot = s;
        }
      }
      if (!cell) {
        const lateralOnly = views.length === 1 && views[0] === 'lateral';
        entry.cells[key] = { value: null, confidence: 'none', notAssessed: lateralOnly && key !== 'mid' ? `needs a lateral clip filmed from the ${key}` : 'not measured' };
        continue;
      }
      const t = timing[slot];
      const eventConf = t ? (key === 'mid' ? t.confidence : t.legEvents[key]?.confidence ?? t.confidence) : null;
      const { confidence, reasons } = cell.value == null ? { confidence: 'none', reasons: [cell.reason || 'not measurable'] } : cellConfidence(def, cell, eventConf === 'none' ? 'low' : eventConf);
      entry.cells[key] = {
        value: typeof cell.value === 'number' ? r1(cell.value, 2) : cell.value,
        display: cell.display ?? null,
        unit: cell.unitOverride ?? def.unit ?? null,
        n: cell.strides ?? null,
        total: cell.totalStrides ?? null,
        countUnit: cell.countUnit ?? 'strides',
        iqr: cell.iqr ? cell.iqr.map((v) => r1(v, 2)) : null,
        sweep: cell.sweep ? { kind: cell.sweep.kind ?? 'ic', at: cell.sweep.tolerances ?? null, values: cell.sweep.values.map((v) => r1(v, 2)) } : null,
        status: cell.value == null ? null : statusFor(def, cell.value),
        confidence,
        confidenceReasons: reasons,
        source: { slot, view: CLIP_SLOTS[slot].view },
        note: cell.note ?? null,
        ...(cell.value == null ? { notAssessed: cell.reason || 'not measurable' } : {}),
      };
    }
    out[def.id] = entry;
  }
  return out;
}

// --- 6. intake-derived quantities -----------------------------------------------------------
function derived(intakeN, clips, checks) {
  const get = (q) => checks.find((c) => c.quantity === q);
  const cad = get('cadence')?.reported;
  const speedMs = (() => {
    for (const s of Object.keys(CLIP_SLOTS)) {
      const c = clips[s];
      if (c?.speed != null && c.speed !== '') return intakeNumbers({ speedValue: c.speed, speedUnit: c.speedUnit }).speedMs;
    }
    return intakeNumbers({ speedValue: intakeN.speed, speedUnit: intakeN.speedUnit }).speedMs ?? intakeN.speedMs;
  })();
  const contact = get('contact time')?.reported;
  const out = {
    speedMs: r1(speedMs, 2),
    stepLengthM: speedMs && cad ? r1(speedMs / (cad / 60), 2) : null,
    strideLengthM: speedMs && cad ? r1((2 * speedMs) / (cad / 60), 2) : null,
    contactMs: contact ?? null,
    dutyFactor: contact && cad ? r1(contact / 1000 / (120 / cad), 2) : null, // contact / stride time
    flightMs: contact && cad ? r1(Math.max(0, 60000 / cad - contact), 0) : null,
    notes: [],
  };
  if (!speedMs) out.notes.push('treadmill speed not entered: step and stride length not computed');
  if (!intakeN.heightCm) out.notes.push('height not entered: distances in body-relative units (hip widths, % of height, shoe lengths)');
  if (intakeN.incline != null) out.inclinePct = intakeN.incline;
  return out;
}

/**
 * @param {{ intake: object, clips: object }} session
 * @returns the reconciled per-client result (schema gait-session/1)
 */
export function reconcileSession(session) {
  const { intake = {}, clips = {} } = session;
  const n = intakeNumbers(intake);
  const timing = viewTiming(clips);
  const checks = crossChecks(timing, n.heightCm);
  const conv = convention(clips);
  const metrics = metricsBlock(clips, timing);
  const slots = Object.keys(CLIP_SLOTS).filter((s) => clips[s]?.analysis);
  const views = [...new Set(slots.map((s) => CLIP_SLOTS[s].view))];
  return {
    schema: SCHEMA,
    client: { code: intake.clientCode ?? null, sessionDate: intake.sessionDate ?? null },
    intake: { heightCm: n.heightCm, speed: n.speed, speedUnit: intake.speedUnit ?? null, inclinePct: n.incline, cadenceEntered: n.cadence },
    views,
    clips: slots.map((s) => {
      const a = clips[s].analysis;
      return { slot: s, view: CLIP_SLOTS[s].view, speed: clips[s].speed ?? null, speedUnit: clips[s].speedUnit ?? null, inclinePct: clips[s].incline ?? null, ...(a.clip || {}), nearLeg: a.nearSide ?? null, landmarkQuality: a.landmarkQuality ?? null, reconErrors: a.reconErrors?.length ? a.reconErrors : undefined };
    }),
    convention: conv,
    alignment: {
      synchronised: false,
      method: 'gait-cycle alignment: each view is segmented into its own strides; views are compared on cadence, step times, step-time symmetry and vertical oscillation, never on clock time',
    },
    timing: { perView: timing, crossChecks: checks },
    derived: derived({ ...n, speedUnit: intake.speedUnit }, clips, checks),
    metrics,
    notAssessed: Object.entries(metrics).filter(([, m]) => m.notAssessed).map(([id, m]) => ({ id, reason: m.notAssessed })),
    limits: [
      'Single-camera 2D estimates: rotation (transverse plane) is not measured; frontal-plane angles are projections and depend on camera alignment.',
      'Side-view values come from the leg facing the camera only; the far leg is occluded and not reported.',
      'Rear-view foot contact and toe-off are approximate (step timing only); contact time comes from the side view.',
      'Movement analysis to support clinical judgment, not a diagnosis.',
    ],
  };
}

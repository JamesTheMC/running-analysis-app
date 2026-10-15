// Capture-quality gate: decides from measurable signals whether a clip's numbers can be used, and
// tells the clinician in plain language what to fix.
//
// Two kinds of check:
//   footage checks (footage-checks.js): visibility of hips/knees/ankles/feet, hips hidden by the
//     console, framing, camera height, tilt, squareness, wide-angle signs, runner size, frame rate,
//     motion blur, lighting; calibrated on the 24 benchmark clips (reference/GATE_CALIBRATION.md);
//   event checks (here): share of strides with valid events (side) or of expected midstances (rear),
//     left/right label swaps, plausible cadence. Thresholds from the 24-clip benchmark (2026-10-13):
//     the clips that validated (C0, T1–T3) had 84–100% valid side strides and 76–99% of expected rear
//     midstances; the floor-level wide-angle clips (AR, AZ, CD, CH, JW, ML, RQ, RY) had 9–42% and
//     0–15%, with impossible rear cadences (86–338 spm).
//
//   pass -> values used as measured (the quality score still feeds per-metric confidence);
//   warn -> values reported at lowered confidence, the issue noted;
//   fail -> no values or timing from this clip; only the reason and what to fix.
import { footageChecks, summariseChecks } from './footage-checks.js';

export const CAPTURE = {
  side: { suitable: 0.75, degraded: 0.5 }, // share of strides with valid events
  rear: { suitable: 0.7, degraded: 0.5 }, // share of expected midstances found
  cadence: [120, 220], // plausible running cadence, spm
  swapShare: { degraded: 0.05, unsuitable: 0.1 },
  upper: { minVisibility: 0.8, maxOutOfFrame: 0.05 },
  nominalSpm: 170, // to estimate expected steps when cadence itself is not trusted
  // Clip quality score -> per-metric confidence cap (reconcile.js): at or above `noCap` no cap,
  // at or above `medium` capped at medium, below: low.
  scoreCap: { noCap: 0.85, medium: 0.6 },
};

const ADVICE = {
  events: 'Re-film per the capture guide: phone at hip height on a tripod, main 1x lens, square to the belt (side) or centred on it (rear/front), whole body in frame, nothing hiding the legs.',
  upper: 'Keep the head and shoulders in frame for trunk measures: move the camera back.',
};
const check = (id, label, status, value, detail, fix) => ({ id, label, status, value, detail, fix: status === 'pass' || status === 'na' ? null : fix });

function upperBody(rows) {
  const posed = rows.filter((r) => r.lm);
  if (!posed.length) return { vis: 0, out: 1 };
  const vis = posed.reduce((a, r) => a + (r.lm[3] + r.lm[11 * 4 + 3] + r.lm[12 * 4 + 3]) / 3, 0) / posed.length;
  const out = posed.filter((r) => r.lm[1] < 0 || r.lm[11 * 4 + 1] < 0 || r.lm[12 * 4 + 1] < 0).length / posed.length;
  return { vis, out };
}

export function assessCapture(view, { rows, meta, events, nearSide, cadenceSpm, midstanceValid, swapFrames }) {
  const n = rows.length;
  const signals = {};
  const evChecks = [];
  if (view === 'lateral') {
    const st = events?.[nearSide]?.strides || [];
    // Only signals that exist are judged (partial inputs, e.g. unit-test fixtures, are not penalised).
    const share = st.length ? st.filter((s) => s.valid).length / st.length : null;
    signals.validStrideShare = share;
    if (share != null) {
      const status = share < CAPTURE.side.degraded ? 'fail' : share < CAPTURE.side.suitable ? 'warn' : 'pass';
      evChecks.push(check('event_detection', 'Foot contacts found', status, share, `foot contact found in ${status === 'fail' ? 'only ' : ''}${Math.round(share * 100)}% of strides`, ADVICE.events));
    }
  } else if (n && rows.some((r) => r.lm)) {
    const durationSec = n / (meta?.fs || 30);
    const expected = (durationSec * CAPTURE.nominalSpm) / 60;
    const share = expected ? (midstanceValid ?? 0) / expected : 0;
    signals.midstanceShare = share;
    const status = share < CAPTURE.rear.degraded ? 'fail' : share < CAPTURE.rear.suitable ? 'warn' : 'pass';
    evChecks.push(check('event_detection', 'Midstances found', status, share, `midstance found for ${status === 'fail' ? 'only ' : ''}${Math.round(share * 100)}% of steps`, ADVICE.events));
    const swap = n ? (swapFrames ?? 0) / n : 0;
    signals.swapShare = swap;
    const sw = swap > CAPTURE.swapShare.unsuitable ? 'fail' : swap > CAPTURE.swapShare.degraded ? 'warn' : 'pass';
    evChecks.push(check('leg_swaps', 'Left/right legs kept apart', sw, swap, `left/right legs mixed up in ${Math.round(swap * 100)}% of frames`, 'Centre the camera on the belt at hip height so the legs do not overlap in the image.'));
  }
  signals.cadenceSpm = cadenceSpm ?? null;
  const judged = signals.validStrideShare != null || signals.midstanceShare != null;
  if (judged) {
    const ok = cadenceSpm != null && cadenceSpm >= CAPTURE.cadence[0] && cadenceSpm <= CAPTURE.cadence[1];
    evChecks.push(check('cadence_plausible', 'Step rate plausible', ok ? 'pass' : 'fail', cadenceSpm ?? null, cadenceSpm == null ? 'no stride rhythm found' : ok ? `${Math.round(cadenceSpm)} steps/min` : `implausible step rate (${Math.round(cadenceSpm)} steps/min)`, 'The stride rhythm could not be followed: check the whole body is visible and the camera is steady.'));
  }
  const up = rows.some((r) => r.lm) ? upperBody(rows) : { vis: 1, out: 0 };
  signals.upperVisibility = up.vis;
  signals.upperOutOfFrame = up.out;
  const upperOk = up.vis >= CAPTURE.upper.minVisibility && up.out <= CAPTURE.upper.maxOutOfFrame;
  // Footage checks need landmarks across frames; skipped for event-only inputs (unit fixtures).
  const footage = rows.some((r) => r.lm) && meta?.analysedSize ? footageChecks(view, { rows, meta, nearSide }) : [];
  return combine([...footage, ...evChecks], { upperOk, signals });
}

// Overall verdict from the checks: the worst status decides; score from footage-checks.js.
function combine(checks, { upperOk = true, signals = {} } = {}) {
  const sum = summariseChecks(checks);
  const fixes = [...sum.fixes];
  if (!upperOk && !fixes.includes(ADVICE.upper)) fixes.push(ADVICE.upper);
  return {
    level: sum.level,
    score: sum.score,
    upperBodyOk: upperOk,
    reasons: [...sum.reasons, ...(!upperOk ? ['head or shoulders out of frame or hidden'] : [])],
    fixes,
    advice: fixes,
    checks,
    signals,
  };
}

// Quick check on the first seconds of a clip (while pose tracking continues): footage checks only.
export function quickCapture(view, rows, meta, guess) {
  const q = combine(footageChecks(view, { rows, meta }), { upperOk: true });
  const names = { lateral_left: 'left side view', lateral_right: 'right side view', posterior: 'rear view', anterior: 'front view' };
  return { ...q, seconds: Math.round(rows.length / (meta.fs || 30)), viewText: names[guess?.slot] || view };
}

// Clip quality score -> confidence cap for every value from the clip (null = no cap).
export function scoreCap(score) {
  if (score == null || score >= CAPTURE.scoreCap.noCap) return null;
  return score >= CAPTURE.scoreCap.medium ? 'medium' : 'low';
}

// Trunk/upper-body metrics, suppressed when the head or shoulders are out of frame.
export const UPPER_BODY_METRICS = ['ic_spine_lean', 'ms_spine_lean', 'trunk_change_peak_hip_ext', 'to_hip_extension', 'arm_elbow_angle', 'arm_shoulder_rom', 'ms_trunk_lateral_lean', 'ms_lateral_shift', 'ms_spine_shift', 'arm_crossover'];

// Apply the gate to an adapter's measurements (in place) and return the assessment.
export function applyCaptureGate(measurements, q) {
  const cap = q.level === 'warn' ? 'low' : scoreCap(q.score);
  for (const [id, cells] of Object.entries(measurements)) {
    for (const [key, cell] of Object.entries(cells)) {
      if (q.level === 'fail') cells[key] = { ...cell, value: null, reason: `video check failed (${q.reasons.join('; ')})`, sweep: undefined };
      else if (!q.upperBodyOk && UPPER_BODY_METRICS.includes(id)) cells[key] = { ...cell, value: null, reason: 'head or shoulders out of frame', sweep: undefined };
      else if (cap) cells[key] = { ...cell, qualityCap: cap, qualityNote: q.level === 'warn' ? `video check warning (${q.reasons.join('; ')})` : `clip quality score ${Math.round(q.score * 100)}%` };
    }
  }
  return q;
}

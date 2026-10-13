// Capture-quality gate: decides from measurable signals whether a clip's numbers can be used.
// Thresholds from the 24-clip benchmark (2026-10-13): the clips that validated (C0, T1–T3) had
// 84–100% valid side strides and 76–99% of expected rear midstances; the floor-level wide-angle clips
// (AR, AZ, CD, CH, JW, ML, RQ, RY) had 9–42% and 0–15%, with impossible rear cadences (86–338 spm).
//
//   suitable   -> values used as measured;
//   degraded   -> values kept but capped at low confidence (reconcile.js);
//   unsuitable -> no values or timing from this clip; "not assessed: video setup not suitable".
export const CAPTURE = {
  side: { suitable: 0.75, degraded: 0.5 }, // share of strides with valid events
  rear: { suitable: 0.7, degraded: 0.5 }, // share of expected midstances found
  cadence: [120, 220], // plausible running cadence, spm
  swapShare: { degraded: 0.05, unsuitable: 0.1 },
  upper: { minVisibility: 0.8, maxOutOfFrame: 0.05 },
  nominalSpm: 170, // to estimate expected steps when cadence itself is not trusted
};

const ADVICE = {
  setup: 'Re-film per the capture plan: phone at hip height, square to the treadmill (side) or centred behind it (rear), whole body in frame, no treadmill upright crossing the legs.',
  upper: 'Keep the head and shoulders in frame for trunk measures.',
};

function upperBody(rows) {
  const posed = rows.filter((r) => r.lm);
  if (!posed.length) return { vis: 0, out: 1 };
  const vis = posed.reduce((a, r) => a + (r.lm[3] + r.lm[11 * 4 + 3] + r.lm[12 * 4 + 3]) / 3, 0) / posed.length;
  const out = posed.filter((r) => r.lm[1] < 0 || r.lm[11 * 4 + 1] < 0 || r.lm[12 * 4 + 1] < 0).length / posed.length;
  return { vis, out };
}

export function assessCapture(view, { rows, meta, events, nearSide, cadenceSpm, midstanceValid, swapFrames }) {
  const reasons = [];
  let level = 'suitable';
  const worse = (l) => {
    if (l === 'unsuitable' || (l === 'degraded' && level === 'suitable')) level = l;
  };
  const n = rows.length;
  const signals = {};
  if (view === 'lateral') {
    const st = events?.[nearSide]?.strides || [];
    // Only signals that exist are judged (partial inputs, e.g. unit-test fixtures, are not penalised).
    const share = st.length ? st.filter((s) => s.valid).length / st.length : null;
    signals.validStrideShare = share;
    if (share == null) {
      // no event data: not judged
    } else if (share < CAPTURE.side.degraded) {
      worse('unsuitable');
      reasons.push(`foot contact found in only ${Math.round(share * 100)}% of strides`);
    } else if (share < CAPTURE.side.suitable) {
      worse('degraded');
      reasons.push(`foot contact found in ${Math.round(share * 100)}% of strides`);
    }
  } else if (n && rows.some((r) => r.lm)) {
    const durationSec = n / (meta?.fs || 30);
    const expected = (durationSec * CAPTURE.nominalSpm) / 60;
    const share = expected ? (midstanceValid ?? 0) / expected : 0;
    signals.midstanceShare = share;
    if (share < CAPTURE.rear.degraded) {
      worse('unsuitable');
      reasons.push(`midstance found for only ${Math.round(share * 100)}% of steps`);
    } else if (share < CAPTURE.rear.suitable) {
      worse('degraded');
      reasons.push(`midstance found for ${Math.round(share * 100)}% of steps`);
    }
    const swap = n ? (swapFrames ?? 0) / n : 0;
    signals.swapShare = swap;
    if (swap > CAPTURE.swapShare.unsuitable) {
      worse('unsuitable');
      reasons.push(`left/right legs mixed up in ${Math.round(swap * 100)}% of frames`);
    } else if (swap > CAPTURE.swapShare.degraded) {
      worse('degraded');
      reasons.push(`left/right legs mixed up in ${Math.round(swap * 100)}% of frames`);
    }
  }
  signals.cadenceSpm = cadenceSpm ?? null;
  const judged = signals.validStrideShare != null || signals.midstanceShare != null;
  if (judged && (cadenceSpm == null || cadenceSpm < CAPTURE.cadence[0] || cadenceSpm > CAPTURE.cadence[1])) {
    worse('unsuitable');
    reasons.push(cadenceSpm == null ? 'no stride rhythm found' : `implausible step rate (${Math.round(cadenceSpm)} steps/min)`);
  }
  const up = rows.some((r) => r.lm) ? upperBody(rows) : { vis: 1, out: 0 };
  signals.upperVisibility = up.vis;
  signals.upperOutOfFrame = up.out;
  const upperOk = up.vis >= CAPTURE.upper.minVisibility && up.out <= CAPTURE.upper.maxOutOfFrame;
  if (!upperOk) reasons.push('head or shoulders out of frame or hidden');
  return {
    level,
    upperBodyOk: upperOk,
    reasons,
    advice: [level !== 'suitable' ? ADVICE.setup : null, !upperOk ? ADVICE.upper : null].filter(Boolean),
    signals,
  };
}

// Trunk/upper-body metrics, suppressed when the head or shoulders are out of frame.
export const UPPER_BODY_METRICS = ['ic_spine_lean', 'ms_spine_lean', 'trunk_change_peak_hip_ext', 'to_hip_extension', 'arm_elbow_angle', 'arm_shoulder_rom', 'ms_trunk_lateral_lean', 'ms_lateral_shift', 'ms_spine_shift', 'arm_crossover'];

// Apply the gate to an adapter's measurements (in place) and return the assessment.
export function applyCaptureGate(measurements, q) {
  for (const [id, cells] of Object.entries(measurements)) {
    for (const [key, cell] of Object.entries(cells)) {
      if (q.level === 'unsuitable') cells[key] = { ...cell, value: null, reason: `video setup not suitable (${q.reasons.join('; ')})`, sweep: undefined };
      else if (!q.upperBodyOk && UPPER_BODY_METRICS.includes(id)) cells[key] = { ...cell, value: null, reason: 'head or shoulders out of frame', sweep: undefined };
      else if (q.level === 'degraded') cells[key] = { ...cell, qualityCap: 'low', qualityNote: `video setup degraded (${q.reasons.join('; ')})` };
    }
  }
  return q;
}

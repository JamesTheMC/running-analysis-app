// Maps pipeline output to the app's measurement shape (see js/placeholder.js for the contract).
// Only metrics the pipeline measures are filled; everything else is left out so the results screen
// lists it as "not measured in this build" instead of showing a guessed number.
//
// Values are per-stride medians. Near-leg values are the clinical numbers. Far-leg values (the leg
// further from the camera) are tracked unreliably from a single side camera, so they are flagged
// `farSide`: the engine caps them at low confidence, leaves them out of scoring and L/R asymmetry,
// and they are only reported when their stride quality clears the confidence floor.

import { SCORING } from '../config.js';
import { median } from './stats.js';
import { IC_SWEEP } from './events.js';

export const MIN_STRIDES = 3;
export const UNMEASURED_REASON = 'not measured by this build yet';
export const FAR_SIDE_REASON = 'far side not reliable from this camera angle';
export const FAR_MS_REASON = 'far-side midstance not reliable from this camera angle; known limitation';
export const FAR_HIP_REASON = 'far side: measured on the near leg only; film from the other side';

// Metrics that depend on initial-contact timing. Their per-stride medians are recomputed with events
// detected at each tolerance in IC_SWEEP; if the status changes anywhere across the sweep, the engine
// shows the range as "borderline, IC-sensitive" (not scored, not used for patterns).
const IC_DEPENDENT = ['kneeIC', 'tibialIC', 'footInclIC', 'footToComShoe', 'trunkIC', 'trunkChange'];

const ANAT = { L: 'left', R: 'right' };

// One per-stride summary -> one measurement cell.
function cell(sum, { far = false, reason, display } = {}) {
  const base = { quality: sum.quality, strides: sum.n, totalStrides: sum.total, iqr: sum.iqr, farSide: far || undefined };
  if (far && sum.quality < SCORING.quality.floor) return { ...base, value: null, reason: FAR_SIDE_REASON };
  if (sum.n < MIN_STRIDES || sum.median == null) {
    return { ...base, value: null, reason: reason || `only ${sum.n} of ${sum.total} strides measurable` };
  }
  if (sum.quality < SCORING.quality.floor) {
    return { ...base, value: null, reason: `only ${sum.n} of ${sum.total} strides measurable (below the confidence floor)` };
  }
  return { ...base, value: sum.median, ...(display ? { display: display(sum) } : {}) };
}

/**
 * @param {object} result  analyzeVideo() output
 * @param {object} intake  { heightCm } from the intake form (for the pixel-to-cm scale)
 */
export function toAnalysis(result, { heightCm } = {}) {
  const { seg, hipExt, rows, bad, meta, metrics, sweep = {}, cadence } = result;
  const near = seg.near.side;
  const far = near === 'L' ? 'R' : 'L';
  const m = { [near]: metrics[near].summary, [far]: metrics[far].summary };
  // Near-leg medians across the IC sweep (null where a tolerance left too few strides).
  const sweepOf = (key) =>
    IC_DEPENDENT.includes(key) && Object.keys(sweep).length
      ? IC_SWEEP.map((t) => {
          const sum = sweep[t]?.[near]?.summary?.[key];
          return sum && sum.n >= MIN_STRIDES ? sum.median : null;
        })
      : undefined;
  const withSweep = (c, key, sweepDisplay) => {
    const values = sweepOf(key);
    if (c.value == null || !values) return c;
    return { ...c, sweep: { values, tolerances: IC_SWEEP, ...(sweepDisplay ? { display: sweepDisplay(values) } : {}) } };
  };
  const measurements = {};
  const usable = seg.cycles.filter((c) => c.windows).length;

  // Bilateral (per-leg) metrics: near leg as measured, far leg flagged.
  const lr = (id, key, opts = {}) => {
    measurements[id] = {
      [ANAT[near]]: withSweep(cell(m[near][key], opts), key),
      [ANAT[far]]: opts.nearOnly ? { value: null, quality: 0, reason: opts.nearOnly, farSide: true } : cell(m[far][key], { ...opts, far: true }),
    };
  };
  lr('ic_knee_flexion', 'kneeIC');
  lr('ms_max_knee_flexion', 'maxStanceKnee');
  lr('ic_tibial_inclination', 'tibialIC');
  lr('ic_foot_inclination', 'footInclIC', { nearOnly: FAR_MS_REASON }); // referenced to the midstance flat foot
  lr('ms_ankle', 'ankleDFms', { nearOnly: FAR_MS_REASON });

  // Foot-to-COM: status is judged in (approximate) shoe lengths; cm, from the intake height, is shown first.
  if (heightCm > 0 && metrics.bodyHeightPx > 0) {
    const pxPerCm = metrics.bodyHeightPx / heightCm;
    const display = (side) => () => {
      const cm = m[side].footToComPx.median / pxPerCm;
      return `${cm.toFixed(1)} cm (≈${m[side].footToComShoe.median.toFixed(2)} shoe lengths)`;
    };
    const cmPerShoe = (ev) => ev.footLength / pxPerCm;
    const sweepDisplay = (values) => {
      const v = values.filter((x) => x != null);
      const lo = Math.min(...v);
      const hi = Math.max(...v);
      const cm = (x) => (x * cmPerShoe(result.events[near])).toFixed(1);
      return `${cm(lo)}–${cm(hi)} cm (≈${lo.toFixed(2)}–${hi.toFixed(2)} shoe lengths)`;
    };
    measurements.ic_foot_to_com = {
      [ANAT[near]]: withSweep(cell(m[near].footToComShoe, { display: display(near) }), 'footToComShoe', sweepDisplay),
      [ANAT[far]]: cell(m[far].footToComShoe, { far: true, display: display(far) }),
    };
  }

  // Midline (trunk) metrics come from near-leg events.
  measurements.ic_spine_lean = { mid: withSweep(cell(m[near].trunkIC), 'trunkIC') };
  measurements.ms_spine_lean = { mid: cell(m[near].trunkMS) };
  measurements.trunk_change_peak_hip_ext = { mid: withSweep(cell(m[near].trunkChange), 'trunkChange') };

  // Late-stance peak hip extension vs trunk axis (computation unchanged). Near leg only: the far
  // leg's value is not reported, so nothing implies it was measured like the near leg.
  const h = hipExt[near];
  measurements.to_hip_extension = {
    [ANAT[near]]: cell(
      { median: h.median, iqr: h.iqr, n: h.n, total: h.total, quality: h.total ? h.n / h.total : 0 },
      { reason: usable < MIN_STRIDES ? 'too few strides could be segmented' : `only ${h.n} of ${h.total} strides had a clear late-stance peak` },
    ),
    [ANAT[far]]: { value: null, quality: 0, reason: FAR_HIP_REASON, farSide: true },
  };

  // Near-side arm (the far arm is occluded from a side camera).
  const elbow = rows.map((r) => r[`elbow_${near}`]).filter((v) => v != null);
  measurements.arm_elbow_angle = {
    near: elbow.length ? { value: median(elbow), quality: rows.length ? elbow.length / rows.length : 0 } : { value: null, quality: 0, reason: 'near-side arm not tracked' },
  };
  measurements.arm_shoulder_rom = { near: cell(metrics.shoulderSwing) };

  return {
    source: 'pipeline',
    cyclesDetected: usable,
    cadenceVideo: cadence, // stride-period estimate; display only, unvalidated
    framesExcluded: rows.length ? bad.filter(Boolean).length / rows.length : 0,
    measurements,
    unmeasuredReason: UNMEASURED_REASON,
    nearSide: ANAT[near],
    nearSideSource: seg.near.source,
    meta,
  };
}

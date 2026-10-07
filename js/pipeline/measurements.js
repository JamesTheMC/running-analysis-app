// Maps lateral-clip pipeline output to the app's measurement shape (see js/placeholder.js for the
// contract). Every value goes through the view emitter (emit.js), which refuses anything the
// view-to-metric map (reference/VIEW_MAP.md) does not allow from a lateral clip.
//
// Values are per-stride medians for the NEAR leg and NEAR arm only. Far-leg values are never used:
// the other leg needs a lateral clip filmed from its own side.

import { SCORING } from '../config.js';
import { median } from './stats.js';
import { IC_SWEEP } from './events.js';
import { createEmitter } from './emit.js';

export const MIN_STRIDES = 3;
export const UNMEASURED_REASON = 'not measured by this build yet';

// Metrics that depend on initial-contact timing. Their per-stride medians are recomputed with events
// detected at each tolerance in IC_SWEEP; if the status (or category) changes anywhere across the
// sweep, the engine shows the range as "borderline, IC-sensitive" (not scored, not used for patterns).
const IC_DEPENDENT = ['kneeIC', 'kneeExcursion', 'tibialIC', 'footInclIC', 'footToComShoe', 'trunkIC', 'trunkChange'];

const ANAT = { L: 'left', R: 'right' };

// One per-stride summary -> one measurement cell.
function cell(sum, { reason, display } = {}) {
  const base = { quality: sum.quality, strides: sum.n, totalStrides: sum.total, iqr: sum.iqr };
  if (sum.n < MIN_STRIDES || sum.median == null) {
    return { ...base, value: null, reason: reason || `only ${sum.n} of ${sum.total} strides measurable` };
  }
  if (sum.quality < SCORING.quality.floor) {
    return { ...base, value: null, reason: `only ${sum.n} of ${sum.total} strides measurable, below the confidence floor` };
  }
  return { ...base, value: sum.median, ...(display ? { display: display(sum) } : {}) };
}

/**
 * @param {object} result  analyzeVideo() output for a lateral clip
 * @param {object} opts    { heightCm } from intake (pixel-to-cm scale)
 */
export function toAnalysis(result, { heightCm } = {}) {
  const { seg, hipExt, hipWindows, rows, bad, meta, metrics, sweep = {}, cadence } = result;
  const near = seg.near.side;
  const leg = ANAT[near];
  const m = metrics[near].summary;
  const out = createEmitter('lateral', { slot: 'lateral', filmedFrom: leg, leg });

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
    return { ...c, sweep: { kind: 'ic', values, tolerances: IC_SWEEP, ...(sweepDisplay ? { display: sweepDisplay(values) } : {}) } };
  };
  const usable = seg.cycles.filter((c) => c.windows).length;

  // Per-leg metrics: near leg only.
  out.put('ic_knee_flexion', leg, withSweep(cell(m.kneeIC), 'kneeIC'));
  out.put('ms_max_knee_flexion', leg, cell(m.maxStanceKnee));
  out.put('ms_knee_flexion_excursion', leg, withSweep(cell(m.kneeExcursion), 'kneeExcursion'));
  out.put('ic_tibial_inclination', leg, withSweep(cell(m.tibialIC), 'tibialIC'));
  out.put('ic_foot_inclination', leg, withSweep(cell(m.footInclIC), 'footInclIC')); // vs the midstance flat foot
  out.put('ic_foot_strike', leg, withSweep(cell(m.footInclIC), 'footInclIC')); // same angle, categorised
  out.put('ms_ankle', leg, cell(m.ankleDFms));

  // Foot-to-COM: status is judged in (approximate) shoe lengths; cm, from the intake height, is shown first.
  if (heightCm > 0 && metrics.bodyHeightPx > 0) {
    const pxPerCm = metrics.bodyHeightPx / heightCm;
    const cmPerShoe = result.events[near].footLength / pxPerCm;
    const display = () => `${(m.footToComPx.median / pxPerCm).toFixed(1)} cm (≈${m.footToComShoe.median.toFixed(2)} shoe lengths)`;
    const sweepDisplay = (values) => {
      const v = values.filter((x) => x != null);
      const lo = Math.min(...v);
      const hi = Math.max(...v);
      return `${(lo * cmPerShoe).toFixed(1)}–${(hi * cmPerShoe).toFixed(1)} cm (≈${lo.toFixed(2)}–${hi.toFixed(2)} shoe lengths)`;
    };
    out.put('ic_foot_to_com', leg, withSweep(cell(m.footToComShoe, { display }), 'footToComShoe', sweepDisplay));
  }

  // Midline (trunk) metrics from near-leg events.
  out.put('ic_spine_lean', 'mid', withSweep(cell(m.trunkIC), 'trunkIC'));
  out.put('ms_spine_lean', 'mid', cell(m.trunkMS));
  out.put('trunk_change_peak_hip_ext', 'mid', withSweep(cell(m.trunkChange), 'trunkChange'));

  // Late-stance peak hip extension vs trunk axis, near leg; window-sensitivity across window ends.
  const h = hipExt[near];
  const hipCell = cell(
    { median: h.median, iqr: h.iqr, n: h.n, total: h.total, quality: h.total ? h.n / h.total : 0 },
    { reason: usable < MIN_STRIDES ? 'too few strides could be segmented' : `only ${h.n} of ${h.total} strides had a clear late-stance peak` },
  );
  if (hipCell.value != null) {
    hipCell.excluded = { rising: h.rising };
    if (hipWindows?.length) {
      hipCell.sweep = {
        kind: 'window',
        values: hipWindows.map((w) => (w.n >= MIN_STRIDES ? w.median : null)),
        tolerances: hipWindows.map((w) => (w.end === 'late-stance' ? 'late stance' : `TO+${Math.round(w.end * 1000)} ms`)),
        windows: hipWindows.map((w) => ({ end: w.end, median: w.median, iqr: w.iqr, n: w.n, total: w.total, rising: w.rising })),
      };
    }
  }
  out.put('to_hip_extension', leg, hipCell);

  // Near arm.
  const elbow = rows.map((r) => r[`elbow_${near}`]).filter((v) => v != null);
  out.put(
    'arm_elbow_angle',
    'near',
    elbow.length ? { value: median(elbow), quality: rows.length ? elbow.length / rows.length : 0 } : { value: null, quality: 0, reason: 'near-side arm not tracked' },
  );
  out.put('arm_shoulder_rom', 'near', cell(metrics.shoulderSwing));

  return {
    source: 'pipeline',
    cyclesDetected: usable,
    cadenceVideo: cadence, // stride-period estimate; display only, unvalidated
    framesExcluded: rows.length ? bad.filter(Boolean).length / rows.length : 0,
    measurements: out.measurements,
    violations: out.violations,
    lateralLegs: [leg], // legs covered by a near-side lateral clip
    unmeasuredReason: UNMEASURED_REASON,
    nearSide: leg,
    nearSideSource: seg.near.source,
    meta,
  };
}

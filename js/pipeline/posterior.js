// Posterior-clip adapter: per-leg frontal-plane metrics at the lowest-pelvis midstance, through the
// view emitter (only posterior-allowed metrics pass). Per-stride medians; each timing-dependent value
// carries its medians at midstance −2 / 0 / +2 analysed frames for the timing-sensitivity rule.
// Left/right differences are allowed only when the clip passed the left/right swap check.

import { createEmitter } from './emit.js';
import { MIN_STRIDES, cell } from './measurements.js';
import { MS_SWEEP } from './posterior-metrics.js';
import { median } from './stats.js';

// "Beyond PSIS" (provisional): median |shoulder-midpoint shift| above a quarter of the hip-joint
// width, assuming the PSIS sit about half as far apart as the hip joint centres. See DECISIONS.md.
export const PSIS_HALF_WIDTH_HW = 0.25;

const ANAT = { L: 'left', R: 'right' };

export function toPosteriorAnalysis(result, { heightCm } = {}) {
  const { metrics: pm, capture, cadence, midstancePelvis } = result;
  const swapCheckPassed = capture.swapFrames === 0;
  const out = createEmitter('posterior', { slot: 'posterior', swapCheckPassed });
  const pxPerCm = heightCm > 0 && pm.bodyHeightPx > 0 ? pm.bodyHeightPx / heightCm : null;
  const withSweep = (c, side, key) => {
    if (c.value == null) return c;
    const values = MS_SWEEP.map((d) => {
      const s = pm[side].sweep[d][key];
      return s.n >= MIN_STRIDES ? s.median : null;
    });
    return { ...c, sweep: { kind: 'timing', values, tolerances: MS_SWEEP.map((d) => (d ? `MS${d > 0 ? '+' : '−'}${Math.abs(d)}` : 'MS')) } };
  };

  for (const side of ['L', 'R']) {
    const leg = ANAT[side];
    const m = pm[side].summary;
    out.put('ms_hip_adduction', leg, withSweep(cell(m.hipAdduction), side, 'hipAdduction'));
    out.put('ms_knee_varus_valgus', leg, withSweep(cell(m.kneeValgus), side, 'kneeValgus'));
    out.put('ms_pelvic_drop', leg, withSweep(cell(m.pelvicDrop), side, 'pelvicDrop'));
    out.put('ms_foot_midline', leg, withSweep(cell(m.heelFromMidline), side, 'heelFromMidline'));
    // Crossover: a leg's pattern is "yes" when >= 50% of its steps land on or past the midline.
    const steps = m.heelFromMidline;
    const c = cell(steps);
    if (c.value != null) {
      const share = steps.values.filter((v) => v <= 0).length / steps.values.length;
      Object.assign(c, { value: share >= 0.5, share, display: `${share >= 0.5 ? 'yes' : 'no'} (${Math.round(share * 100)}% of steps on or past the midline)` });
    }
    out.put('ms_crossover', leg, c);
  }

  // Midline (trunk) measures pooled over both legs' stance phases (signed toward the stance side).
  const pooled = (key) => {
    const v = [...pm.L.summary[key].values, ...pm.R.summary[key].values];
    const total = pm.L.total + pm.R.total;
    return { median: v.length ? median(v) : null, n: v.length, total, quality: total ? v.length / total : 0, iqr: null, values: v };
  };
  const lean = pooled('trunkLateralLean');
  out.put('ms_trunk_lateral_lean', 'mid', { ...cell(lean), countUnit: 'steps' });
  const shiftHW = pooled('trunkShift');
  const shiftPx = pooled('trunkShiftPx');
  const shiftCell = { ...cell(shiftHW), countUnit: 'steps' };
  if (shiftCell.value != null) {
    if (pxPerCm) Object.assign(shiftCell, { value: shiftPx.median / pxPerCm, unitOverride: 'cm', display: `${(shiftPx.median / pxPerCm).toFixed(1)} cm (${shiftHW.median.toFixed(2)} hip widths)` });
    else Object.assign(shiftCell, { display: `${shiftHW.median.toFixed(2)} hip widths (enter height for cm)` });
  }
  out.put('ms_lateral_shift', 'mid', shiftCell);
  // Spine shift (template "between / beyond PSIS"), provisional rule on the shift magnitude.
  const absShift = { ...shiftHW, median: shiftHW.values.length ? median(shiftHW.values.map(Math.abs)) : null };
  const psis = { ...cell(absShift), countUnit: 'steps' };
  if (psis.value != null) {
    const between = absShift.median <= PSIS_HALF_WIDTH_HW;
    Object.assign(psis, { value: between, display: `${between ? 'between' : 'beyond'} PSIS (median |shift| ${absShift.median.toFixed(2)} hip widths; provisional rule)` });
  }
  out.put('ms_spine_shift', 'mid', psis);

  const valid = (s) => midstancePelvis[s].filter((h) => h.valid).length;
  return {
    source: 'pipeline',
    measurements: out.measurements,
    violations: out.violations,
    captureChecks: { posterior: { ...capture, swapCheckPassed, stanceHalfCycles: { left: valid('L'), right: valid('R') } } },
    cadenceVideo: cadence ? { spm: cadence.spm, strides: cadence.strides } : null,
    cyclesDetected: cadence?.strides ?? 0,
  };
}

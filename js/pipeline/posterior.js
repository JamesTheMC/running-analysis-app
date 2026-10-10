// Posterior-clip adapter: per-leg frontal-plane metrics at the lowest-pelvis midstance, through the
// view emitter (only posterior-allowed metrics pass). Per-stride medians; each timing-dependent value
// carries its medians at midstance −33 / 0 / +33 ms for the timing-sensitivity rule.
// Left/right differences are allowed only when the clip passed the left/right swap check.

import { clipInfo, landmarkQuality, posteriorEventTable, safely, verticalOscillation } from './gait-events.js';
import { createEmitter } from './emit.js';
import { MIN_STRIDES, cell } from './measurements.js';
import { median } from './stats.js';

// "Beyond PSIS" (provisional): median |shoulder-midpoint shift| above a quarter of the hip-joint
// width, assuming the PSIS sit about half as far apart as the hip joint centres. See DECISIONS.md.
export const PSIS_HALF_WIDTH_HW = 0.25; // fallback without height
export const PSIS_BEYOND_CM = 5; // clinician decision 2026-10-09: beyond PSIS = shift > 5 cm

const ANAT = { L: 'left', R: 'right' };

export function toPosteriorAnalysis(result, { heightCm } = {}) {
  const { metrics: pm, capture, cadence, midstancePelvis } = result;
  const swapCheckPassed = capture.swapFrames === 0;
  const out = createEmitter('posterior', { slot: 'posterior', swapCheckPassed });
  const pxPerCm = heightCm > 0 && pm.bodyHeightPx > 0 ? pm.bodyHeightPx / heightCm : null;
  const withSweep = (c, side, key) => {
    if (c.value == null) return c;
    const shifts = pm[side].shifts;
    const values = shifts.map((d) => {
      const s = pm[side].sweep[d][key];
      return s.n >= MIN_STRIDES ? s.median : null;
    });
    return { ...c, sweep: { kind: 'timing', values, tolerances: shifts.map((d) => (d ? `MS${d > 0 ? '+' : '−'}${Math.round((Math.abs(d) / (pm.fs || 60)) * 1000)} ms` : 'MS')) } };
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
    // Arm crossing midline (record only).
    const arm = pm[side].armCross;
    if (arm) {
      const a = cell(arm);
      if (a.value != null) {
        const share = arm.values.filter((v) => v > 0).length / arm.values.length;
        Object.assign(a, { value: share >= 0.5, share, magnitude: arm.median, display: `${share >= 0.5 ? 'yes' : 'no'} (${Math.round(share * 100)}% of swings past the midline; median ${arm.median.toFixed(2)} shoulder widths)` });
      }
      out.put('arm_crossover', leg, a);
    }
  }
  // Step width: left heel (left midstance) to right heel (right midstance), across the midline.
  {
    const l = pm.L.summary.heelFromMidline;
    const r = pm.R.summary.heelFromMidline;
    const lp = pm.L.summary.heelFromMidlinePx;
    const rp = pm.R.summary.heelFromMidlinePx;
    const n = Math.min(l.n, r.n);
    const sw = { median: l.median != null && r.median != null ? l.median + r.median : null, n, total: Math.min(l.total, r.total), quality: Math.min(l.quality, r.quality), iqr: null, values: [] };
    const c = { ...cell(sw), countUnit: 'steps' };
    if (c.value != null) {
      if (pxPerCm && lp.median != null && rp.median != null) {
        const cm = (lp.median + rp.median) / pxPerCm;
        Object.assign(c, { value: cm, unitOverride: 'cm', hipWidths: sw.median, display: `${cm.toFixed(1)} cm (${sw.median.toFixed(2)} hip widths)` });
      } else Object.assign(c, { unitOverride: 'hipw', hipWidths: sw.median, display: `${sw.median.toFixed(2)} hip widths (enter height for cm)` });
    }
    out.put('ms_step_width', 'mid', c);
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
  // Clinician rule: beyond PSIS = median |shift| > 5 cm (needs height); without height, the
  // provisional 0.25 hip-width rule.
  const absShift = { ...shiftHW, median: shiftHW.values.length ? median(shiftHW.values.map(Math.abs)) : null };
  const absCm = pxPerCm && shiftPx.values.length ? median(shiftPx.values.map(Math.abs)) / pxPerCm : null;
  const psis = { ...cell(absShift), countUnit: 'steps' };
  if (psis.value != null) {
    const between = absCm != null ? absCm <= PSIS_BEYOND_CM : absShift.median <= PSIS_HALF_WIDTH_HW;
    const how = absCm != null ? `median |shift| ${absCm.toFixed(1)} cm; beyond = more than ${PSIS_BEYOND_CM} cm` : `median |shift| ${absShift.median.toFixed(2)} hip widths; provisional rule, enter height for the cm rule`;
    Object.assign(psis, { value: between, display: `${between ? 'between' : 'beyond'} PSIS (${how})` });
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
    // For the reconciliation layer (js/pipeline/reconcile.js).
    view: 'posterior',
    ...(() => {
      const errors = [];
      return {
        clip: safely(() => clipInfo(result.meta, { leftOnImage: 'left', swapFrames: capture.swapFrames }), errors, 'clip'),
        eventTable: safely(() => posteriorEventTable(result, result.rows, result.meta), errors, 'eventTable'),
        landmarkQuality: safely(() => landmarkQuality(result.rows, [23, 24, 25, 26, 27, 28, 29, 30, 11, 12]), errors, 'landmarkQuality'),
        oscillation: safely(() => verticalOscillation(result.rows, result.bad, result.seg.cycles.filter((c) => c.valid).map((c) => [c.start, c.end]), pm.bodyHeightPx, result.meta.fs), errors, 'oscillation'),
        reconErrors: errors,
      };
    })(),
    bodyHeightPx: pm.bodyHeightPx,
  };
}

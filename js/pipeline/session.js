// Combines the per-clip analyses of a session into one analysis for the engine.
//
// Clip slots (config CLIP_SLOTS): lateral_left, lateral_right, posterior, each optional.
//   - Each lateral clip supplies its own (near) leg and arm: left-leg lateral metrics come from the
//     left-side clip, right-leg from the right-side clip. Values keep their source clip.
//   - Midline (trunk) metrics measured on both lateral clips are combined as a stride-weighted mean of
//     the two clip medians; if they differ by more than MIDLINE_DISAGREE (same unit as the metric), a
//     note says the clips disagree.
//   - Posterior clips supply posterior metrics and capture checks.
// Speed or incline that differ between the two lateral clips produce a warning, because left/right
// differences would then mix leg and condition.

import { CLIP_SLOTS } from '../config.js';
import { UNMEASURED_REASON } from './measurements.js';

export const MIDLINE_DISAGREE = 3;

function combineMidline(a, b) {
  if (a.value == null) return b;
  if (b.value == null) return a;
  const na = a.strides || 1;
  const nb = b.strides || 1;
  const w = (x, y) => (x * na + y * nb) / (na + nb);
  const out = {
    ...a,
    value: w(a.value, b.value),
    strides: na + nb,
    totalStrides: (a.totalStrides || na) + (b.totalStrides || nb),
    quality: w(a.quality ?? 0, b.quality ?? 0),
    iqr: null, // IQR of a combined median is not defined; per-clip values are listed instead
    display: undefined,
    perClip: [a, b].map((c) => ({ value: c.value, strides: c.strides, filmedFrom: c.source?.filmedFrom })),
    source: { ...a.source, filmedFrom: 'both', slot: 'lateral_left+lateral_right' },
  };
  if (a.sweep && b.sweep && a.sweep.values.length === b.sweep.values.length) {
    out.sweep = { ...a.sweep, values: a.sweep.values.map((v, i) => (v == null || b.sweep.values[i] == null ? null : w(v, b.sweep.values[i]))), display: undefined };
  } else delete out.sweep;
  if (Math.abs(a.value - b.value) > MIDLINE_DISAGREE) {
    out.note = `left-side and right-side clips differ (${a.value.toFixed(1)} vs ${b.value.toFixed(1)})`;
  }
  return out;
}

/**
 * @param {object} clips  { lateral_left?, lateral_right?, posterior? }, each { analysis, speed?, incline?, name }
 */
export function mergeSession(clips) {
  const slots = Object.keys(CLIP_SLOTS).filter((s) => clips[s]);
  const measurements = {};
  const lateralLegs = [];
  const captureChecks = {};
  const cadenceByClip = [];
  const violations = [];
  let cyclesDetected = 0;
  for (const slot of slots) {
    const a = clips[slot].analysis;
    if (!a) continue;
    violations.push(...(a.violations || []));
    Object.assign(captureChecks, a.captureChecks || {});
    if (a.cadenceVideo) cadenceByClip.push({ slot, ...a.cadenceVideo, strides: a.cyclesDetected });
    if (CLIP_SLOTS[slot].view === 'lateral') {
      lateralLegs.push(...(a.lateralLegs || []));
      cyclesDetected += a.cyclesDetected || 0;
    }
    for (const [id, cells] of Object.entries(a.measurements || {})) {
      measurements[id] ??= {};
      for (const [key, cell] of Object.entries(cells)) {
        const prev = measurements[id][key];
        measurements[id][key] = prev && key === 'mid' ? combineMidline(prev, cell) : cell;
      }
    }
  }

  const warnings = [];
  const L = clips.lateral_left;
  const R = clips.lateral_right;
  if (L && R) {
    const diff = (k, unit) => L[k] != null && R[k] != null && String(L[k]) !== '' && String(R[k]) !== '' && Number(L[k]) !== Number(R[k]) ? `${k} differs between the left-side and right-side clips (${L[k]} vs ${R[k]} ${unit})` : null;
    for (const w of [diff('speed', L.speedUnit || ''), diff('incline', '%')]) if (w) warnings.push(`${w}; left/right differences may reflect the change in conditions.`);
  }

  return {
    source: 'pipeline',
    measurements,
    lateralLegs: [...new Set(lateralLegs)],
    captureChecks,
    cadenceByClip,
    cadenceVideo: cadenceByClip[0], // header line (first clip); all clips listed in cadenceByClip
    cyclesDetected,
    violations,
    sessionWarnings: warnings,
    clipsUsed: slots.map((s) => CLIP_SLOTS[s].label + (CLIP_SLOTS[s].view === 'posterior' && !clips[s].analysis?.measurements ? ' (capture checks only)' : '')),
    unmeasuredReason: UNMEASURED_REASON,
  };
}

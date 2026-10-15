// One entry point from pose rows to a clip analysis for any slot (lateral_left, lateral_right,
// posterior, anterior). Used by the app (after view detection or a clinician override), the fixture
// tests and the benchmark, so every path processes a view the same way.
import { CLIP_SLOTS } from '../config.js';
import { postProcessView } from './run.js';
import { toAnalysis } from './measurements.js';
import { toPosteriorAnalysis } from './posterior.js';

/**
 * @param {Array} rows   pose rows (never modified for the front view; mirrored copies are used)
 * @param {object} meta  clip meta (fps, fs, analysedSize, …)
 * @param {string} slot  clip slot
 * @param {object} opts  { heightCm, nearSide?: 'L'|'R' (lateral: force the near leg; default = the slot's leg) }
 * @returns { result, analysis }
 */
export function processClip(rows, meta, slot, { heightCm, nearSide } = {}) {
  const { view, leg } = CLIP_SLOTS[slot];
  const opts = { view };
  if (view === 'lateral') opts.nearSide = nearSide ?? (leg === 'left' ? 'L' : 'R');
  const result = { meta: { ...meta, view }, rows, ...postProcessView(rows, { ...meta, view }, opts) };
  let analysis;
  if (view === 'lateral') analysis = toAnalysis(result, { heightCm });
  else if (view === 'anterior') analysis = toPosteriorAnalysis({ ...result, rows: result.frontRows }, { heightCm, view: 'anterior' });
  else analysis = toPosteriorAnalysis(result, { heightCm });
  return { result, analysis };
}

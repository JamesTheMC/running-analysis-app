// The only way pipeline adapters may add a measurement. Every value is checked against the metric's
// `allowedViews` and build status (js/config.js, reference/VIEW_MAP.md) and tagged with its source.
// A disallowed value is refused: in strict mode (tests) it throws; in the app it is dropped and
// recorded as a violation, so a number from the wrong view can never reach the report.

import { METRICS } from '../config.js';

const BY_ID = new Map(METRICS.map((m) => [m.id, m]));

export const EMIT = { strict: false };

export class ViewViolation extends Error {}

export function allowed(metricId, view) {
  const def = BY_ID.get(metricId);
  return !!def && (def.status ?? 'built') === 'built' && (def.allowedViews || []).includes(view);
}

/**
 * @param {string} view      'lateral' | 'posterior'
 * @param {object} source    provenance added to every value, e.g. { slot: 'lateral', filmedFrom: 'left' }
 */
export function createEmitter(view, source = {}) {
  const measurements = {};
  const violations = [];
  return {
    measurements,
    violations,
    put(metricId, key, cell) {
      if (!allowed(metricId, view)) {
        const def = BY_ID.get(metricId);
        const why = !def ? 'unknown metric' : (def.status ?? 'built') !== 'built' ? `status ${def.status}` : `not allowed from the ${view} view`;
        const msg = `Refused ${metricId} from ${view}: ${why}`;
        violations.push({ metricId, view, key, reason: why });
        if (EMIT.strict) throw new ViewViolation(msg);
        console.error(msg);
        return false;
      }
      measurements[metricId] ??= {};
      measurements[metricId][key] = { ...cell, source: { view, ...source } };
      return true;
    },
  };
}

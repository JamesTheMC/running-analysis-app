// Range scale: where a value sits relative to its normal and flag ranges, drawn as a small inline
// SVG (zones from config ranges: normal, caution, flag). The marker takes the status colour only
// when the value is trusted (a status is shown); otherwise it is neutral and the hedge is the caption.
// Display only: it reads the same config ranges and statuses as the rest of the results.
import { esc } from '../util.js';

// Zones over [lo, hi] from { green: { min, max }, red: { below, above } }.
export function scaleZones(bounds, value) {
  const { green = {}, red = {} } = bounds || {};
  const marks = [green.min, green.max, red.below, red.above, value].filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (marks.length < 2 && !(green.min != null || green.max != null)) return null;
  let lo = Math.min(...marks);
  let hi = Math.max(...marks);
  const span = Math.max(hi - lo, Math.abs(hi) * 0.5, 4);
  lo -= span * 0.25;
  hi += span * 0.25;
  const zones = [];
  const add = (a, b, kind) => {
    const x0 = Math.max(lo, a ?? lo);
    const x1 = Math.min(hi, b ?? hi);
    if (x1 > x0) zones.push({ from: x0, to: x1, kind });
  };
  const gMin = green.min ?? lo;
  const gMax = green.max ?? hi;
  add(lo, red.below ?? gMin, red.below != null ? 'red' : 'yellow');
  if (red.below != null) add(red.below, gMin, 'yellow');
  add(gMin, gMax, 'green');
  if (red.above != null) add(gMax, red.above, 'yellow');
  // Above the template range while the reference is under review: no colour (config aboveGreen).
  add(red.above ?? gMax, hi, red.above != null ? 'red' : bounds.review ? 'review' : 'yellow');
  return { lo, hi, zones };
}

const fmt = (v) => (Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10);

/**
 * @param {object} bounds  { green, red } from the metric definition
 * @param {number} value
 * @param {object} opts    { status: 'green'|'yellow'|'red'|null (null = not trusted), unit: '°'|' cm', hedge, provisional }
 */
export function rangeScaleHtml(bounds, value, { status = null, unit = '', hedge = null, provisional = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  const s = scaleZones(bounds, value);
  if (!s) return '';
  const W = 300;
  const x = (v) => ((v - s.lo) / (s.hi - s.lo)) * W;
  const ticks = [...new Set(s.zones.flatMap((z) => [z.from, z.to]).filter((v) => v > s.lo && v < s.hi))];
  const zoneWord = { green: 'normal', yellow: 'caution', red: 'flag', review: 'reference under review' };
  const at = s.zones.find((z) => value >= z.from && value <= z.to)?.kind;
  const label = `Value ${fmt(value)}${unit}${at ? `, in the ${zoneWord[at]} zone` : ''}${status ? '' : '; not rated (see the note)'}${provisional ? '; provisional range' : ''}`;
  return `<figure class="rs" aria-label="${esc(label)}">
    <svg viewBox="0 -14 ${W} 44" class="rs-svg" role="img" aria-hidden="true" preserveAspectRatio="none">
      ${s.zones.map((z) => `<rect x="${x(z.from).toFixed(1)}" y="2" width="${(x(z.to) - x(z.from)).toFixed(1)}" height="8" class="rs-z rs-${z.kind}"></rect>`).join('')}
      ${ticks.map((v) => `<text x="${x(v).toFixed(1)}" y="24" class="rs-t">${fmt(v)}</text>`).join('')}
      <path d="M ${x(value).toFixed(1)} 1 l -6 -10 h 12 z" class="rs-m ${status ? `rs-m-${status}` : 'rs-m-neutral'}"></path>
    </svg>
    <figcaption class="small muted">${esc(`${fmt(value)}${unit}`)}${status ? '' : ` · ${esc(hedge || 'not rated')}`}${provisional ? ' · provisional range' : ''}</figcaption>
  </figure>`;
}

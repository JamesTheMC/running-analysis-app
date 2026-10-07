// Small NaN-aware numeric helpers (numpy semantics where the reference relies on them).

export const finite = (a) => a.filter((v) => Number.isFinite(v));

export function median(a) {
  const v = finite(a).sort((x, y) => x - y);
  if (!v.length) return NaN;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// numpy.percentile default ('linear').
export function percentile(a, q) {
  const v = finite(a).sort((x, y) => x - y);
  if (!v.length) return NaN;
  const pos = ((v.length - 1) * q) / 100;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

export function min(a) {
  const v = finite(a);
  return v.length ? Math.min(...v) : NaN;
}

export function max(a) {
  const v = finite(a);
  return v.length ? Math.max(...v) : NaN;
}

// Linear interpolation across NaN gaps up to `maxGap` samples; ends and longer gaps stay NaN.
export function fillGaps(a, maxGap = Infinity) {
  const out = Float64Array.from(a);
  let last = -1;
  for (let i = 0; i < out.length; i++) {
    if (!Number.isFinite(out[i])) continue;
    if (last >= 0 && i - last > 1 && i - last - 1 <= maxGap) {
      for (let k = last + 1; k < i; k++) out[k] = out[last] + ((out[i] - out[last]) * (k - last)) / (i - last);
    }
    last = i;
  }
  return out;
}

// Savitzky-Golay smoothing (polyorder 2), edges fitted like scipy's mode='interp'.
// NaNs pass through: any window touching a NaN yields NaN at its centre.
export function savgol(a, window = 7, order = 2) {
  const n = a.length;
  const h = window >> 1;
  const out = new Float64Array(n).fill(NaN);
  if (n < window) return Float64Array.from(a);
  const fitAt = (start, x0) => {
    // Least-squares polynomial fit on a[start .. start+window), evaluated at offset x0.
    const m = order + 1;
    const ata = Array.from({ length: m }, () => new Float64Array(m));
    const aty = new Float64Array(m);
    for (let k = 0; k < window; k++) {
      const y = a[start + k];
      if (!Number.isFinite(y)) return NaN;
      const x = k - h;
      const p = [1];
      for (let j = 1; j < m; j++) p[j] = p[j - 1] * x;
      for (let r = 0; r < m; r++) {
        aty[r] += p[r] * y;
        for (let c = 0; c < m; c++) ata[r][c] += p[r] * p[c];
      }
    }
    const coef = solve(ata, aty);
    let v = 0;
    for (let j = 0, xp = 1; j < m; j++, xp *= x0) v += coef[j] * xp;
    return v;
  };
  for (let i = h; i < n - h; i++) out[i] = fitAt(i - h, 0);
  for (let i = 0; i < h; i++) out[i] = fitAt(0, i - h);
  for (let i = n - h; i < n; i++) out[i] = fitAt(n - window, i - (n - window) - h);
  return out;
}

function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

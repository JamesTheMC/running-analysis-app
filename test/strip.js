// Frame strips for manual event marking (dev only). Each job: { clip, name, frames: [first, last],
// box: [x, y, w, h] in full-resolution upright pixels, cols, step (every n-th frame, default 1) }. Saves test-data/debug/strip_<name>.png
// with each tile labelled by its source frame number. No landmarks are drawn.
import { demux } from '../js/pipeline/mp4.js';
import { decodeSampledFrames } from '../js/pipeline/decode.js';

const log = (s) => (document.getElementById('log').textContent += `${s}\n`);

export async function makeStrips(jobs) {
  const byClip = new Map();
  for (const j of jobs) byClip.set(j.clip, [...(byClip.get(j.clip) || []), j]);
  const done = [];
  for (const [clip, list] of byClip) {
    const file = await (await fetch(`../test-data/${encodeURIComponent(clip)}`)).blob();
    const track = await demux(file);
    const tiles = new Map(); // job -> [{frame, bitmap}]
    const want = (i) => list.filter((j) => i >= j.frames[0] && i <= j.frames[1] && (i - j.frames[0]) % (j.step ?? 1) === 0);
    const last = Math.max(...list.map((j) => j.frames[1]));
    try {
      await decodeSampledFrames(file, track, {
        sampleEvery: 1,
        scale: 1,
        signal: undefined,
        onFrame: async (canvas, { index }) => {
          if (index > last) throw new DOMException('done', 'AbortError');
          for (const j of want(index)) {
            const [x, y, w, h] = j.box;
            const bm = await createImageBitmap(canvas, x, y, w, h);
            tiles.set(j, [...(tiles.get(j) || []), { frame: index, bm }]);
          }
        },
      });
    } catch (e) {
      if (e.name !== 'AbortError') throw e;
    }
    for (const j of list) {
      const t = tiles.get(j) || [];
      const [, , w, h] = j.box;
      const scale = j.scale ?? 1;
      const tw = Math.round(w * scale);
      const th = Math.round(h * scale);
      const cols = j.cols ?? 6;
      const rowsN = Math.ceil(t.length / cols);
      const c = new OffscreenCanvas(cols * tw, rowsN * (th + 22));
      const g = c.getContext('2d');
      g.fillStyle = '#000';
      g.fillRect(0, 0, c.width, c.height);
      t.forEach(({ frame, bm }, k) => {
        const cx = (k % cols) * tw;
        const cy = Math.floor(k / cols) * (th + 22);
        g.drawImage(bm, cx, cy + 22, tw, th);
        g.fillStyle = '#ff0';
        g.font = 'bold 18px sans-serif';
        g.fillText(`f${frame}`, cx + 4, cy + 17);
      });
      await fetch(`/__save?name=strip_${j.name}.png`, { method: 'POST', body: await c.convertToBlob({ type: 'image/png' }) });
      done.push(`strip_${j.name}.png (${t.length} frames)`);
      log(`saved strip_${j.name}.png`);
    }
  }
  return done;
}
window.makeStrips = makeStrips;

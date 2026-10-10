// Export clean frames (no landmarks drawn) for blind manual annotation. Local dev server only.
// Request: test-data/debug/annotation_request.json = { jobs: [{ clip, frames: [{ frame, cx, cy, w, h, label }] }] }
// with (cx, cy) the crop centre and (w, h) the crop size in full-resolution upright pixels.
// Output: test-data/debug/annotate_<label>.png and annotate_index.json (crop origins).
import { demux } from '../js/pipeline/mp4.js';
import { decodeSampledFrames } from '../js/pipeline/decode.js';

const log = (s) => (document.getElementById('log').textContent += `\n${s}`);
const save = (name, body) => fetch(`/__save?name=${name}`, { method: 'POST', body });

function grid(ctx, w, h) {
  ctx.font = '12px sans-serif';
  for (let g = 0; g <= Math.max(w, h); g += 50) {
    const major = g % 100 === 0;
    ctx.strokeStyle = major ? 'rgba(255,255,0,0.9)' : 'rgba(0,200,200,0.6)';
    ctx.lineWidth = 1;
    if (g < w) { ctx.beginPath(); ctx.moveTo(g + 0.5, 0); ctx.lineTo(g + 0.5, h); ctx.stroke(); }
    if (g < h) { ctx.beginPath(); ctx.moveTo(0, g + 0.5); ctx.lineTo(w, g + 0.5); ctx.stroke(); }
    if (major) {
      ctx.fillStyle = 'yellow';
      if (g < w) ctx.fillText(String(g), g + 2, 12);
      if (g < h && g) ctx.fillText(String(g), 2, g - 3);
    }
  }
}

const req = await (await fetch('../test-data/debug/annotation_request.json')).json();
const index = [];
for (const job of req.jobs) {
  const file = await (await fetch(`../test-data/${job.clip}`)).blob();
  const track = await demux(file);
  const wanted = new Map(job.frames.map((f) => [f.frame, f]));
  log(`${job.clip}: ${wanted.size} frames`);
  await decodeSampledFrames(file, track, {
    sampleEvery: 1, // every frame: 30 fps clips have odd frame numbers
    scale: 1,
    onFrame: async (canvas, { index: i }) => {
      const f = wanted.get(i);
      if (!f) return;
      const x0 = Math.round(Math.max(0, Math.min(canvas.width - f.w, f.cx - f.w / 2)));
      const y0 = Math.round(Math.max(0, Math.min(canvas.height - f.h, f.cy - f.h / 2)));
      const out = new OffscreenCanvas(f.w, f.h);
      const ctx = out.getContext('2d');
      ctx.drawImage(canvas, x0, y0, f.w, f.h, 0, 0, f.w, f.h);
      grid(ctx, f.w, f.h);
      await save(`annotate_${f.label}.png`, await out.convertToBlob({ type: 'image/png' }));
      index.push({ file: `annotate_${f.label}.png`, clip: job.clip, frame: i, x0, y0, w: f.w, h: f.h, label: f.label });
      log(`  frame ${i} -> annotate_${f.label}.png`);
    },
  });
}
await save('annotate_index.json', JSON.stringify(index, null, 1));
log(`Done: ${index.length} crops.`);
window.__exportDone = index.length;

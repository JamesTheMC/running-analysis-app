// Sequential frame decoding with WebCodecs. Every decoded frame is visited in presentation order;
// only every `sampleEvery`-th frame is drawn (upright, downscaled) and handed to `onFrame`.
// This matches the reference's OpenCV loop (read every frame, process i % SAMPLE_EVERY == 0).

const MAX_DECODE_QUEUE = 12;
const MAX_READY = 4;

export function decoderSupported() {
  return typeof VideoDecoder !== 'undefined' && typeof EncodedVideoChunk !== 'undefined';
}

export async function checkCodec(track) {
  if (!decoderSupported()) return false;
  try {
    const { supported } = await VideoDecoder.isConfigSupported(decoderConfig(track));
    return supported;
  } catch {
    return false;
  }
}

function decoderConfig(track) {
  return {
    codec: track.codec,
    description: track.description,
    codedWidth: track.codedWidth,
    codedHeight: track.codedHeight,
    optimizeForLatency: false,
  };
}

// Draw a decoded frame upright into ctx (canvas sized to the rotated, scaled frame).
function drawUpright(ctx, frame, track) {
  const { width: W, height: H } = ctx.canvas;
  const swap = track.rotation === 90 || track.rotation === 270;
  const w = swap ? H : W;
  const h = swap ? W : H;
  ctx.save();
  if (track.mirrored) {
    // Undo a mirrored recording so the pose model sees the real scene (left stays left).
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
  }
  if (track.rotation === 90) {
    ctx.translate(W, 0);
    ctx.rotate(Math.PI / 2);
  } else if (track.rotation === 180) {
    ctx.translate(W, H);
    ctx.rotate(Math.PI);
  } else if (track.rotation === 270) {
    ctx.translate(0, H);
    ctx.rotate(-Math.PI / 2);
  }
  ctx.drawImage(frame, 0, 0, w, h);
  ctx.restore();
}

/**
 * @param {File|Blob} file
 * @param {object} track  output of demux()
 * @param {object} opts   { sampleEvery, scale, onFrame(canvas, {index, ptsSec}) => void|Promise, signal }
 */
export async function decodeSampledFrames(file, track, { sampleEvery = 2, scale = 0.45, onFrame, signal } = {}) {
  const W = Math.round(track.displayWidth * scale);
  const H = Math.round(track.displayHeight * scale);
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'medium';

  // Presentation index for each timestamp (µs).
  const indexOf = new Map(track.frameTimes.map((t, i) => [Math.round(t * 1e6), i]));
  const ready = [];
  let wake = null;
  let error = null;
  const notify = () => {
    if (wake) {
      const w = wake;
      wake = null;
      w();
    }
  };
  const waitForOutput = () => new Promise((r) => (wake = r));

  const decoder = new VideoDecoder({
    output(frame) {
      const index = indexOf.get(frame.timestamp);
      if (index === undefined || index % sampleEvery !== 0) frame.close();
      else ready.push({ frame, index });
      notify();
    },
    error(e) {
      error = e;
      notify();
    },
  });
  decoder.configure(decoderConfig(track));

  let decoded = 0;
  const process = async () => {
    while (ready.length) {
      const { frame, index } = ready.shift();
      drawUpright(ctx, frame, track);
      frame.close();
      await onFrame(canvas, { index, ptsSec: track.frameTimes[index] });
      decoded++;
    }
  };

  try {
    for (const s of track.samples) {
      if (signal?.aborted) throw new DOMException('Analysis cancelled', 'AbortError');
      if (error) throw error;
      const data = new Uint8Array(await file.slice(s.offset, s.offset + s.size).arrayBuffer());
      decoder.decode(
        new EncodedVideoChunk({ type: s.key ? 'key' : 'delta', timestamp: Math.round(s.ptsSec * 1e6), data }),
      );
      while (!error && (decoder.decodeQueueSize > MAX_DECODE_QUEUE || ready.length > MAX_READY)) {
        if (ready.length) await process();
        else await waitForOutput();
      }
      // VideoDecoder emits in presentation order, which MediaPipe's VIDEO mode requires.
      if (ready.length) await process();
    }
    await decoder.flush();
    if (error) throw error;
    await process();
  } finally {
    for (const r of ready) r.frame.close();
    if (decoder.state !== 'closed') decoder.close();
  }
  return { width: W, height: H, processed: decoded };
}

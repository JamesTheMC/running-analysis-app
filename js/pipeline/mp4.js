// Minimal MP4/MOV demuxer for the first video track: just enough to feed WebCodecs frame by frame.
// Browsers do not expose frame counts or exact frame timestamps, and seeking a <video> to every
// sampled frame re-decodes from the previous keyframe (about 1 s apart on iPhone files), so we
// read the sample tables ourselves and decode sequentially. Reads only the `moov` box into memory;
// sample bytes are sliced from the File on demand.

const td = new TextDecoder('latin1');

async function readBytes(blob, start, end) {
  return new DataView(await blob.slice(start, end).arrayBuffer());
}

// Walk boxes in [start, end) of a DataView. Yields { type, start (payload), end }.
function* boxes(dv, start = 0, end = dv.byteLength) {
  let pos = start;
  while (pos + 8 <= end) {
    let size = dv.getUint32(pos);
    const type = td.decode(new Uint8Array(dv.buffer, dv.byteOffset + pos + 4, 4));
    let hdr = 8;
    if (size === 1) {
      size = Number(dv.getBigUint64(pos + 8));
      hdr = 16;
    } else if (size === 0) size = end - pos;
    if (size < hdr) return;
    yield { type, start: pos + hdr, end: Math.min(pos + size, end) };
    pos += size;
  }
}

function child(dv, box, type) {
  for (const b of boxes(dv, box.start, box.end)) if (b.type === type) return b;
  return null;
}

function path(dv, box, ...types) {
  let b = box;
  for (const t of types) {
    b = b && child(dv, b, t);
  }
  return b;
}

async function findMoov(file) {
  let pos = 0;
  while (pos + 8 <= file.size) {
    const h = await readBytes(file, pos, Math.min(pos + 16, file.size));
    let size = h.getUint32(0);
    const type = td.decode(new Uint8Array(h.buffer, 4, 4));
    if (size === 1) size = Number(h.getBigUint64(8));
    else if (size === 0) size = file.size - pos;
    if (size < 8) break;
    if (type === 'moov') return readBytes(file, pos, pos + size);
    pos += size;
  }
  throw new Error('Not a readable MP4/MOV file (no movie header found).');
}

function hex(n) {
  return n.toString(16).toUpperCase();
}

function codecString(entryType, desc) {
  const b = new Uint8Array(desc);
  if (entryType === 'avc1' || entryType === 'avc3') {
    return `${entryType}.${[b[1], b[2], b[3]].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
  }
  if (entryType === 'hvc1' || entryType === 'hev1') {
    const space = ['', 'A', 'B', 'C'][b[1] >> 6];
    const tier = (b[1] >> 5) & 1 ? 'H' : 'L';
    const profile = b[1] & 0x1f;
    let compat = ((b[2] << 24) | (b[3] << 16) | (b[4] << 8) | b[5]) >>> 0;
    let rev = 0;
    for (let i = 0; i < 32; i++) {
      rev = ((rev << 1) | (compat & 1)) >>> 0;
      compat >>>= 1;
    }
    const constraints = Array.from(b.slice(6, 12));
    while (constraints.length && constraints[constraints.length - 1] === 0) constraints.pop();
    const c = constraints.map((x) => `.${hex(x)}`).join('');
    return `${entryType}.${space}${profile}.${hex(rev)}.${tier}${b[12]}${c}`;
  }
  throw new Error(`Unsupported video codec "${entryType}". Use the native camera file (H.264 or HEVC).`);
}

// Display orientation from the tkhd matrix [a b u; c d v; x y w] (16.16 fixed point).
// A negative determinant means the picture is mirrored (e.g. a front-camera clip saved mirrored);
// the rotation is then read from the matrix with the horizontal flip removed.
export function orientationFromMatrix(a, b, c, d) {
  const mirrored = a * d - b * c < 0;
  const [ra, rb] = mirrored ? [-a, -b] : [a, b];
  const deg = Math.round((Math.atan2(rb, ra) * 180) / Math.PI);
  return { rotation: ((deg % 360) + 360) % 360, mirrored };
}

export async function demux(file) {
  const dv = await findMoov(file);
  const moov = { start: 8, end: dv.byteLength };
  const mvhd = child(dv, moov, 'mvhd');
  const movieTimescale = dv.getUint32(mvhd.start + (dv.getUint8(mvhd.start) === 1 ? 20 : 12));

  for (const trak of boxes(dv, moov.start, moov.end)) {
    if (trak.type !== 'trak') continue;
    const hdlr = path(dv, trak, 'mdia', 'hdlr');
    if (td.decode(new Uint8Array(dv.buffer, hdlr.start + 8, 4)) !== 'vide') continue;

    const tkhd = child(dv, trak, 'tkhd');
    const tv = dv.getUint8(tkhd.start);
    const m = tkhd.start + (tv === 1 ? 52 : 40);
    const { rotation, mirrored } = orientationFromMatrix(dv.getInt32(m), dv.getInt32(m + 4), dv.getInt32(m + 12), dv.getInt32(m + 16));

    const mdhd = path(dv, trak, 'mdia', 'mdhd');
    const timescale = dv.getUint32(mdhd.start + (dv.getUint8(mdhd.start) === 1 ? 20 : 12));
    const stbl = path(dv, trak, 'mdia', 'minf', 'stbl');

    // Sample description: codec + decoder config (avcC / hvcC payload).
    const stsd = child(dv, stbl, 'stsd');
    const entry = boxes(dv, stsd.start + 8, stsd.end).next().value;
    const codedWidth = dv.getUint16(entry.start + 24);
    const codedHeight = dv.getUint16(entry.start + 26);
    let description = null;
    let transfer = null; // colr 'nclx' transfer characteristics: 16 = PQ, 18 = HLG (HDR)
    let dolbyVision = false;
    for (const b of boxes(dv, entry.start + 78, entry.end)) {
      if (b.type === 'avcC' || b.type === 'hvcC') description = dv.buffer.slice(dv.byteOffset + b.start, dv.byteOffset + b.end);
      if (b.type === 'dvvC' || b.type === 'dvcC') dolbyVision = true;
      if (b.type === 'colr' && b.end - b.start >= 10) {
        const kind = td.decode(new Uint8Array(dv.buffer, dv.byteOffset + b.start, 4));
        if (kind === 'nclx' || kind === 'nclc') transfer = dv.getUint16(b.start + 6);
      }
    }
    if (!description) throw new Error('Missing decoder configuration in video track.');
    const codec = codecString(entry.type, description);

    // Sample sizes.
    const stsz = child(dv, stbl, 'stsz');
    const constSize = dv.getUint32(stsz.start + 4);
    const n = dv.getUint32(stsz.start + 8);
    const size = new Uint32Array(n);
    for (let i = 0; i < n; i++) size[i] = constSize || dv.getUint32(stsz.start + 12 + 4 * i);

    // Chunk offsets + sample-to-chunk -> per-sample byte offset.
    const stco = child(dv, stbl, 'stco') || child(dv, stbl, 'co64');
    const nChunks = dv.getUint32(stco.start + 4);
    const chunkOff = new Float64Array(nChunks);
    for (let i = 0; i < nChunks; i++) {
      chunkOff[i] = stco.type === 'co64' ? Number(dv.getBigUint64(stco.start + 8 + 8 * i)) : dv.getUint32(stco.start + 8 + 4 * i);
    }
    const stsc = child(dv, stbl, 'stsc');
    const nStsc = dv.getUint32(stsc.start + 4);
    const offset = new Float64Array(n);
    let s = 0;
    for (let e = 0; e < nStsc; e++) {
      const p = stsc.start + 8 + 12 * e;
      const first = dv.getUint32(p) - 1;
      const per = dv.getUint32(p + 4);
      const last = e + 1 < nStsc ? dv.getUint32(p + 12) - 1 : nChunks;
      for (let c = first; c < last && s < n; c++) {
        let o = chunkOff[c];
        for (let k = 0; k < per && s < n; k++, s++) {
          offset[s] = o;
          o += size[s];
        }
      }
    }

    // Decode timestamps, composition offsets.
    const stts = child(dv, stbl, 'stts');
    const dts = new Float64Array(n);
    let t = 0;
    s = 0;
    for (let e = 0, ne = dv.getUint32(stts.start + 4); e < ne; e++) {
      const count = dv.getUint32(stts.start + 8 + 8 * e);
      const delta = dv.getUint32(stts.start + 12 + 8 * e);
      for (let k = 0; k < count && s < n; k++, s++) {
        dts[s] = t;
        t += delta;
      }
    }
    const cts = Float64Array.from(dts);
    const ctts = child(dv, stbl, 'ctts');
    if (ctts) {
      // Read offsets as signed even in version 0 (as FFmpeg does): Apple writes negative offsets there.
      s = 0;
      for (let e = 0, ne = dv.getUint32(ctts.start + 4); e < ne; e++) {
        const count = dv.getUint32(ctts.start + 8 + 8 * e);
        const off = dv.getInt32(ctts.start + 12 + 8 * e);
        for (let k = 0; k < count && s < n; k++, s++) cts[s] += off;
      }
    }

    // Keyframes (absent stss = every sample is a sync sample).
    const key = new Uint8Array(n);
    const stss = child(dv, stbl, 'stss');
    if (stss) for (let e = 0, ne = dv.getUint32(stss.start + 4); e < ne; e++) key[dv.getUint32(stss.start + 8 + 4 * e) - 1] = 1;
    else key.fill(1);

    // Edit list: shift by media_time of the first non-empty edit, plus any leading empty edit.
    let mediaStart = 0;
    let emptyLead = 0;
    let editDuration = Infinity; // seconds of media the edit plays (trimmed clips)
    const elst = path(dv, trak, 'edts', 'elst');
    if (elst) {
      const v1 = dv.getUint8(elst.start) === 1;
      for (let e = 0, ne = dv.getUint32(elst.start + 4); e < ne; e++) {
        const p = elst.start + 8 + e * (v1 ? 20 : 12);
        const dur = v1 ? Number(dv.getBigUint64(p)) : dv.getUint32(p);
        const mt = v1 ? Number(dv.getBigInt64(p + 8)) : dv.getInt32(p + 4);
        if (mt === -1) emptyLead += dur / movieTimescale;
        else {
          mediaStart = mt;
          if (dur > 0) editDuration = dur / movieTimescale;
          break;
        }
      }
    }

    const samples = [];
    for (let i = 0; i < n; i++) {
      samples.push({
        offset: offset[i],
        size: size[i],
        key: key[i] === 1,
        dtsSec: dts[i] / timescale,
        ptsSec: (cts[i] - mediaStart) / timescale + emptyLead,
      });
    }
    // Presentation order is what a player (and OpenCV) yields; frames outside the edit are dropped.
    const end = emptyLead + editDuration - 1e-9;
    const frameTimes = samples
      .map((x) => x.ptsSec)
      .filter((x) => x >= emptyLead - 1e-9 && x < end)
      .sort((a, b) => a - b);
    const duration = frameTimes.length > 1 ? frameTimes[frameTimes.length - 1] - frameTimes[0] : 0;
    const swap = rotation === 90 || rotation === 270;
    return {
      codec,
      description,
      codedWidth,
      codedHeight,
      rotation,
      mirrored, // frames are un-mirrored at decode (decode.js), so left/right stay anatomical
      displayWidth: swap ? codedHeight : codedWidth,
      displayHeight: swap ? codedWidth : codedHeight,
      samples, // decode order
      frameTimes, // presentation order, seconds
      frameCount: frameTimes.length,
      fps: duration > 0 ? (frameTimes.length - 1) / duration : 0,
      duration,
      hdr: dolbyVision || transfer === 16 || transfer === 18,
      dolbyVision,
      transfer,
    };
  }
  throw new Error('No video track found in this file.');
}

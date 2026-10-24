// On-device session library (IndexedDB, this browser only). A saved session is the analysis result,
// enough to rebuild the results: client code, date, height / speed / incline / cadence, each clip's
// analysis (values, events, video check) and the manual measurements. NEVER stored: video, frames or
// landmarks, clip file names (they may contain a name), or the free-text history and goals fields.
// Nothing leaves the device. The browser or the OS may clear this storage; the screen says so.

const DB = 'gait-library';
const STORE = 'sessions';
const KEEP_INTAKE = ['clientCode', 'sessionDate', 'heightValue', 'heightUnit', 'speedValue', 'speedUnit', 'incline', 'cadence'];

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('This browser cannot store sessions (no IndexedDB).'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Storage is not available (private browsing?).'));
  });
}

async function tx(mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const out = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(out?.result ?? out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Storage transaction aborted.'));
    });
  } finally {
    db.close();
  }
}

// What gets stored for a session (pure; tested).
export function toRecord(session, { savedAt = new Date().toISOString() } = {}) {
  const intake = Object.fromEntries(KEEP_INTAKE.map((k) => [k, session.intake?.[k] ?? '']));
  intake.clientCode = String(intake.clientCode || '').toUpperCase();
  const clips = Object.fromEntries(
    Object.entries(session.clips || {}).map(([slot, c]) => [slot, { slot, speed: c.speed ?? '', speedUnit: c.speedUnit ?? '', incline: c.incline ?? '', slotNote: c.slotNote, analysis: c.analysis }]),
  );
  return {
    id: `${intake.clientCode}|${intake.sessionDate}|${savedAt}`,
    version: 1,
    savedAt,
    clientCode: intake.clientCode,
    sessionDate: intake.sessionDate,
    views: Object.keys(clips),
    intake,
    clips,
    manual: (session.manual || []).map(({ slot, kind, pts, idx, t, value, cm }) => ({ slot, kind, pts, idx, t, value, cm })),
  };
}

// A stored record back into an app session (no video: players and panels show wireframe or a note).
export function fromRecord(rec) {
  return { intake: { ...rec.intake }, clips: structuredClone(rec.clips), manual: structuredClone(rec.manual || []), placeholder: false, savedId: rec.id, savedAt: rec.savedAt };
}

export async function saveSession(session) {
  const rec = toRecord(session);
  // Replace an earlier save of the same in-memory session.
  if (session.savedId) await deleteSession(session.savedId).catch(() => {});
  await tx('readwrite', (s) => s.put(rec));
  return rec;
}

export async function listSessions() {
  const all = await tx('readonly', (s) => s.getAll());
  return (all || []).sort((a, b) => (a.clientCode === b.clientCode ? b.sessionDate.localeCompare(a.sessionDate) || b.savedAt.localeCompare(a.savedAt) : a.clientCode.localeCompare(b.clientCode)));
}

export async function getSession(id) {
  return tx('readonly', (s) => s.get(id));
}

export async function deleteSession(id) {
  return tx('readwrite', (s) => s.delete(id));
}

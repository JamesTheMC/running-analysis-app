// Local clip inventory (videos stay in test-data/, gitignored). id = client code + view, used for
// derived files (test-data/debug/<id>.rows.json) and committed fixtures (test/fixtures/<id>.*.json).
// heightCm: T1–T3 = 182.8 cm (6 ft, owner 2026-10-12); C0 not recorded (170 cm assumed).
export const CLIPS = [
  { id: 'C0-side', client: 'C0', heightCm: 170, view: 'lateral', file: 'IMG_0639_2.mov', speed: 6.5, speedUnit: 'mph' },
  { id: 'C0-rear', client: 'C0', heightCm: 170, view: 'posterior', file: 'IMG_0640.mov', speed: 6.5, speedUnit: 'mph' },
  { id: 'T1-side', client: 'T1', heightCm: 182.8, view: 'lateral', file: 'test 1 8mph side view.mov', speed: 8, speedUnit: 'mph' },
  { id: 'T1-rear', client: 'T1', heightCm: 182.8, view: 'posterior', file: 'test 1 8mph rear view.mov', speed: 8, speedUnit: 'mph' },
  { id: 'T2-side', client: 'T2', heightCm: 182.8, view: 'lateral', file: 'test 2 7mph side view.mov', speed: 7, speedUnit: 'mph' },
  { id: 'T2-rear', client: 'T2', heightCm: 182.8, view: 'posterior', file: 'test 2 7mph rear view.mov', speed: 7, speedUnit: 'mph' },
  { id: 'T3-side', client: 'T3', heightCm: 182.8, view: 'lateral', file: 'test 3 6 mph side view.mov', speed: 6, speedUnit: 'mph' },
  { id: 'T3-rear', client: 'T3', heightCm: 182.8, view: 'posterior', file: 'test 3 6 mph rear view.mov', speed: 6, speedUnit: 'mph' },
  // Runners added 2026-10-13 (heights not recorded: 170 cm assumed for cm values).
  { id: 'AR-side', client: 'AR', view: 'lateral', file: 'AR side 8.5 mph.mov', speed: 8.5, speedUnit: 'mph' },
  { id: 'AR-rear', client: 'AR', view: 'posterior', file: 'AR rear 8.5mph.mov', speed: 8.5, speedUnit: 'mph' },
  { id: 'AZ-side', client: 'AZ', view: 'lateral', file: 'AZ side 6.4 mph.mov', speed: 6.4, speedUnit: 'mph' },
  { id: 'AZ-rear', client: 'AZ', view: 'posterior', file: 'AZ rear 6.4 mph.mov', speed: 6.4, speedUnit: 'mph' },
  { id: 'CD-side', client: 'CD', view: 'lateral', file: 'CD side 9.0 mph.mov', speed: 9.0, speedUnit: 'mph' },
  { id: 'CD-rear', client: 'CD', view: 'posterior', file: 'CD rear 9.0 mph.mov', speed: 9.0, speedUnit: 'mph' },
  { id: 'CH-side', client: 'CH', view: 'lateral', file: 'CH side 7.0 mph.mov', speed: 7.0, speedUnit: 'mph' },
  { id: 'CH-rear', client: 'CH', view: 'posterior', file: 'CH rear 7.0 mph.mov', speed: 7.0, speedUnit: 'mph' },
  { id: 'JW-side', client: 'JW', view: 'lateral', file: 'JW side 7.5 mph.mov', speed: 7.5, speedUnit: 'mph' },
  { id: 'JW-rear', client: 'JW', view: 'posterior', file: 'JW rear 7.5 mph.mov', speed: 7.5, speedUnit: 'mph' },
  { id: 'ML-side', client: 'ML', view: 'lateral', file: 'ML side 6 mph.mov', speed: 6, speedUnit: 'mph' },
  { id: 'ML-rear', client: 'ML', view: 'posterior', file: 'ML rear 6mph.mov', speed: 6, speedUnit: 'mph' },
  { id: 'RQ-side', client: 'RQ', view: 'lateral', file: 'RQ side 6 mph.mov', speed: 6, speedUnit: 'mph' },
  { id: 'RQ-rear', client: 'RQ', view: 'posterior', file: 'RQ rear 6 mph.mov', speed: 6, speedUnit: 'mph' },
  { id: 'RY-side', client: 'RY', view: 'lateral', file: 'RY side 8 mph.mov', speed: 8, speedUnit: 'mph' },
  { id: 'RY-rear', client: 'RY', view: 'posterior', file: 'RY rear 8mph.mov', speed: 8, speedUnit: 'mph' },
];

// URL of a clip by file name, via the local index (tools/index_clips.py -> test-data/clip-index.json),
// so the repository never contains folder names.
let indexCache = null;
export async function clipUrl(file) {
  if (!indexCache) {
    const res = await fetch('/test-data/clip-index.json');
    indexCache = res.ok ? await res.json() : {};
  }
  const rel = indexCache[file] || file;
  return `/test-data/${rel.split('/').map(encodeURIComponent).join('/')}`;
}

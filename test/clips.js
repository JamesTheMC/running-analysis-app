// Local clip inventory (videos stay in test-data/, gitignored). id = client code + view, used for
// derived files (test-data/debug/<id>.rows.json) and committed fixtures (test/fixtures/<id>.*.json).
export const CLIPS = [
  { id: 'C0-side', client: 'C0', view: 'lateral', file: 'IMG_0639_2.mov', speed: 6.5, speedUnit: 'mph' },
  { id: 'C0-rear', client: 'C0', view: 'posterior', file: 'IMG_0640.mov', speed: 6.5, speedUnit: 'mph' },
  { id: 'T1-side', client: 'T1', view: 'lateral', file: 'test 1 8mph side view.mov', speed: 8, speedUnit: 'mph' },
  { id: 'T1-rear', client: 'T1', view: 'posterior', file: 'test 1 8mph rear view.mov', speed: 8, speedUnit: 'mph' },
  { id: 'T2-side', client: 'T2', view: 'lateral', file: 'test 2 7mph side view.mov', speed: 7, speedUnit: 'mph' },
  { id: 'T2-rear', client: 'T2', view: 'posterior', file: 'test 2 7mph rear view.mov', speed: 7, speedUnit: 'mph' },
  { id: 'T3-side', client: 'T3', view: 'lateral', file: 'test 3 6 mph side view.mov', speed: 6, speedUnit: 'mph' },
  { id: 'T3-rear', client: 'T3', view: 'posterior', file: 'test 3 6 mph rear view.mov', speed: 6, speedUnit: 'mph' },
];

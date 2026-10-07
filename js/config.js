// Single source of truth for metric ranges, scoring weights and pattern rules.
// See SPEC.md Sections 5, 6 and 9. Items marked [CONFIRM] are open questions for the owner.

export const APP_VERSION = '0.3.0-events';

// ---------------------------------------------------------------------------
// Phases and views
// ---------------------------------------------------------------------------

export const PHASES = [
  { id: 'initial_contact', label: 'Initial Contact' },
  { id: 'midstance', label: 'Midstance' },
  { id: 'toe_off', label: 'Toe Off' },
];

export const VIEWS = {
  side: { label: 'Side (sagittal)' },
  rear: { label: 'Rear (posterior)' },
};

// ---------------------------------------------------------------------------
// Scoring (Section 6.3). First draft: every weight here is configurable.
// ---------------------------------------------------------------------------

export const SCORING = {
  // Credit per status: green = full, yellow = partial, red = zero.
  credit: { green: 1, yellow: 0.5, red: 0 },
  // Priority (P) metrics count double. [CONFIRM] that yellow template rows mean priority.
  priorityMultiplier: 2,
  // Lower-confidence metrics carry less weight.
  confidenceWeight: { high: 1, medium: 0.75, low: 0.5 },
  // Measurement quality (0-1, from the pipeline) maps to a confidence tag.
  // Below `floor` the metric is excluded and listed as "not assessed".
  quality: { high: 0.85, medium: 0.7, floor: 0.5 },
  // Score color bands for display only (0-100).
  bands: { green: 80, yellow: 60 },
};

// Side-to-side difference is shown as a trend, never pass/fail (Section 5).
export const ASYMMETRY = {
  // Symmetry index: |L - R| / mean(|L|, |R|) * 100.
  // When the mean is below this (e.g. angles near 0 deg), show the absolute difference instead.
  minMeanForPercent: 5,
  // Differences at or above this are mentioned in the interpretation as a trend.
  mentionAbovePercent: 15,
};

// Intake-based thresholds used by pattern rules.
export const CADENCE = {
  low: 160, // spm, lower end of commonly cited 160-190 range (Section 8)
  high: 190, // spm, upper end. [CONFIRM] what counts as "high cadence" for limited hip extension
};

// ---------------------------------------------------------------------------
// Metrics (Section 6.1, confidence from 6.2)
//
// type:     'range'   numeric, scored against green/red bounds (yellow = in between)
//           'boolean' scored against `expected`; a mismatch gets `mismatchStatus`
//           'record'  value is shown but never scored
// sided:    'lr'   left and right values
//           'mid'  one midline value (trunk, spine)
//           'near' near-side limb only (side camera)
// green:    inclusive bounds; omitted bound = unbounded
// red:      { below, above } strict; omitted = no red on that side
// baselineConfidence caps the tag a measurement can get (6.2). Far-side limb values (further from a
//           side camera) are always capped at 'low', excluded from scoring, patterns and L/R asymmetry.
// aboveGreen: 'review' = values above green.max are shown as "above template range, reference
//           under review" and never scored (no credit, no penalty).
// Values from the pipeline are per-stride medians.
// requires: intake fields needed to compute it (e.g. height for pixel-to-cm scale)
// summary:  section of the copy-paste summary it appears in (Section 5), if any
// ---------------------------------------------------------------------------

export const METRICS = [
  // ----- Initial contact (side view) -----
  {
    id: 'ic_foot_inclination',
    label: 'Foot inclination',
    summaryLabel: 'Foot inclination at IC',
    phase: 'initial_contact',
    view: 'side',
    type: 'range',
    sided: 'lr',
    unit: 'deg',
    // Sign: foot (heel -> foot index) angle at IC relative to the same foot flat at midstance; + = toes up.
    note: "Measured relative to each foot's own flat-foot angle at midstance, because the heel landmark sits higher on the shoe than the toe landmark.",
    green: { max: 10 },
    red: { above: 10 },
    greenText: '<10° DF (rearfoot strike)',
    redText: '>10° DF',
    priority: false,
    baselineConfidence: 'low', // trend only
    summary: 'ANKLE',
  },
  {
    id: 'ic_tibial_inclination',
    label: 'Tibial inclination',
    summaryLabel: 'Tibial inclination at IC',
    phase: 'initial_contact',
    view: 'side',
    type: 'range',
    sided: 'lr',
    unit: 'deg',
    // Sign: shank (knee -> ankle) vs vertical at IC; + = ankle AHEAD of the knee (overstride direction),
    // - = ankle behind the knee.
    green: { min: -10, max: 10 },
    red: { below: -10, above: 10 },
    greenText: '-10° to +10°',
    redText: 'beyond ±10°',
    priority: false,
    baselineConfidence: 'high',
    summary: 'ANKLE',
  },
  {
    id: 'ic_foot_to_com',
    label: 'Foot-to-COM distance',
    summaryLabel: 'Foot-to-COM distance at IC',
    phase: 'initial_contact',
    view: 'side',
    type: 'range',
    sided: 'lr',
    unit: 'shoe',
    // Horizontal heel to hip midpoint (COM proxy) at IC; + = heel
    // ahead. Shown in cm (pixel-to-cm scale from intake height) with approximate shoe lengths (from the
    // heel-to-toe landmarks); status is judged in shoe lengths.
    green: { max: 0.5 },
    red: { above: 1 },
    greenText: '<½ shoe length',
    redText: '>1 shoe length',
    priority: true,
    baselineConfidence: 'medium', // depends on the height-based scale and foot landmarks
    requires: ['height'],
  },
  {
    id: 'ic_knee_flexion',
    label: 'Knee flexion',
    summaryLabel: 'Knee flexion at IC',
    phase: 'initial_contact',
    view: 'side',
    type: 'range',
    sided: 'lr',
    unit: 'deg',
    green: { min: 15, max: 25 },
    red: { below: 12, above: 30 },
    greenText: '15–25°',
    redText: '<12° or >30°',
    priority: true,
    baselineConfidence: 'high',
    note: 'Clinic template range (some literature cites ~30–40°).',
    summary: 'KNEE',
  },
  {
    id: 'ic_spine_lean',
    label: 'Spine lean',
    summaryLabel: 'Trunk lean at IC',
    phase: 'initial_contact',
    view: 'side',
    type: 'range',
    sided: 'mid',
    unit: 'deg',
    // Sign: shoulder-midpoint to hip-midpoint line vs vertical; + = forward lean. Trunk-angle proxy, not lumbar.
    green: { min: 5, max: 10 },
    red: { below: 0, above: 15 },
    greenText: '5–10°',
    redText: '<0° or >15°',
    priority: false,
    baselineConfidence: 'high',
    summary: 'LUMBAR',
  },

  // ----- Midstance (side view) -----
  {
    id: 'ms_max_knee_flexion',
    label: 'Max knee flexion',
    summaryLabel: 'Max stance knee flexion',
    phase: 'midstance',
    view: 'side',
    type: 'range',
    sided: 'lr',
    unit: 'deg',
    green: { min: 35, max: 45 },
    red: { above: 45 },
    greenText: '35–45°',
    redText: '>45°',
    priority: true,
    baselineConfidence: 'high',
    summary: 'KNEE',
  },
  {
    id: 'ms_ankle',
    label: 'Ankle at midstance',
    summaryLabel: 'Ankle DF at midstance',
    phase: 'midstance',
    view: 'side',
    type: 'record',
    sided: 'lr',
    unit: 'deg',
    // Sign: 90° minus the shank-foot angle; + = dorsiflexion. Near leg only (far-leg midstance is unreliable).
    greenText: 'record value',
    redText: 'none defined',
    priority: false,
    baselineConfidence: 'low', // trend only
    summary: 'ANKLE',
  },
  {
    id: 'ms_knee_ankle_sync',
    label: 'Knee/ankle sync',
    phase: 'midstance',
    view: 'side',
    type: 'boolean',
    sided: 'lr',
    expected: true,
    mismatchStatus: 'yellow', // [CONFIRM] template gives yes/no without a red rule
    display: { true: 'Yes', false: 'No' },
    greenText: 'yes',
    redText: '—',
    priority: false,
    baselineConfidence: 'medium',
  },
  {
    id: 'ms_spine_lean',
    label: 'Spine lean',
    summaryLabel: 'Trunk lean at midstance',
    phase: 'midstance',
    view: 'side',
    type: 'range',
    sided: 'mid',
    unit: 'deg',
    green: { min: 0, max: 10 },
    red: { above: 12 },
    greenText: '0–10°',
    redText: '>12°',
    priority: false,
    baselineConfidence: 'high',
    summary: 'LUMBAR',
  },

  // ----- Midstance (rear view) -----
  {
    id: 'ms_pelvic_drop',
    label: 'Pelvic drop',
    phase: 'midstance',
    view: 'rear',
    type: 'range',
    sided: 'lr', // side = stance leg
    unit: 'deg',
    green: { min: 0, max: 6 },
    red: { above: 6 },
    greenText: '0–6°',
    redText: '>6°',
    priority: true,
    baselineConfidence: 'low', // trend only
    note: 'Template row reads "Pelvic tilt"; treated as frontal-plane pelvic drop. [CONFIRM]',
  },
  {
    id: 'ms_hip_adduction',
    label: 'Hip adduction',
    phase: 'midstance',
    view: 'rear',
    type: 'range',
    sided: 'lr',
    unit: 'deg',
    green: { min: 0, max: 13 },
    red: { above: 13 },
    greenText: '0–13°',
    redText: '>13°',
    priority: true,
    baselineConfidence: 'medium',
  },
  {
    id: 'ms_knee_varus_valgus',
    label: 'Knee varus/valgus',
    phase: 'midstance',
    view: 'rear',
    type: 'range',
    sided: 'lr',
    unit: 'deg',
    green: { min: -5, max: 5 },
    red: { below: -5, above: 5 }, // [CONFIRM] template reads ">5 or >5"
    greenText: '-5° to +5°',
    redText: 'beyond ±5°',
    priority: true,
    baselineConfidence: 'low',
  },
  {
    id: 'ms_out_toe',
    label: 'Out-toe',
    phase: 'midstance',
    view: 'rear',
    type: 'range',
    sided: 'lr',
    unit: 'toes',
    green: { max: 1 },
    red: { above: 2 },
    greenText: '1 toe',
    redText: '>2 toes',
    priority: false,
    baselineConfidence: 'low', // not rated in 6.2; small landmarks
  },
  {
    id: 'ms_crossover',
    label: 'Crossover pattern',
    phase: 'midstance',
    view: 'rear',
    type: 'boolean',
    sided: 'mid',
    expected: false,
    mismatchStatus: 'yellow', // [CONFIRM] template gives yes/no without a red rule
    display: { true: 'Yes', false: 'No' },
    greenText: 'no',
    redText: '—',
    priority: false,
    baselineConfidence: 'medium',
  },
  {
    id: 'ms_spine_shift',
    label: 'Spine shift',
    phase: 'midstance',
    view: 'rear',
    type: 'boolean',
    sided: 'mid',
    expected: true, // true = stays between PSIS
    mismatchStatus: 'red',
    display: { true: 'Between PSIS', false: 'Beyond PSIS' },
    greenText: 'between PSIS',
    redText: 'beyond PSIS',
    priority: true,
    baselineConfidence: 'medium',
  },
  {
    id: 'ms_achilles_angle',
    label: 'Achilles angle',
    phase: 'midstance',
    view: 'rear',
    type: 'range',
    sided: 'lr',
    unit: 'deg',
    green: { min: 0, max: 10 },
    red: { above: 10 },
    greenText: '0–10°',
    redText: '>10°',
    priority: false,
    baselineConfidence: 'medium',
  },
  {
    id: 'ms_rearfoot_eversion',
    label: 'Rearfoot eversion',
    phase: 'midstance',
    view: 'rear',
    type: 'range',
    sided: 'lr',
    unit: 'deg',
    green: { min: -4, max: 4 },
    red: {}, // [CONFIRM] template red "> -4" overlaps green; until confirmed, outside green = caution
    greenText: '-4° to +4°',
    redText: 'to confirm',
    priority: true,
    baselineConfidence: 'low',
  },

  // ----- Toe off (side view) -----
  {
    id: 'to_hip_extension',
    label: 'Hip extension',
    summaryLabel: 'Hip extension (late stance)',
    phase: 'toe_off',
    view: 'side',
    type: 'range',
    sided: 'lr',
    unit: 'deg',
    green: { min: 5, max: 15 },
    red: { below: 5 },
    aboveGreen: 'review', // >15° measured vs the trunk axis: template reference under review
    greenText: '5–15°',
    redText: '<5° (with lordosis)',
    priority: false,
    baselineConfidence: 'high',
    // Lordosis is not measurable in 2D; prompt the clinician instead.
    clinicalPrompt: { when: ['red'], text: 'check lordosis clinically' },
    summary: 'HIP',
  },

  // ----- Summary-only, never scored -----
  {
    id: 'trunk_change_peak_hip_ext',
    label: 'Trunk angle change at peak hip extension',
    summaryLabel: 'Trunk angle change, IC to peak hip extension',
    phase: null, // summary only, never scored
    view: 'side',
    type: 'range',
    sided: 'mid',
    unit: 'deg',
    // Signed: trunk lean at peak hip extension minus trunk lean at IC (same stride). - = trunk moves
    // back (extends). Template's 5° used as a provisional trigger for "trunk extension". Trunk-angle
    // proxy (shoulder-hip line), not pelvic tilt or lumbar motion.
    green: { min: -5 },
    red: {},
    greenText: 'less than 5° of trunk extension (provisional)',
    redText: '—',
    clinicalPrompt: { when: ['yellow'], text: 'trunk extension ≥5° (provisional trigger; trunk-angle proxy, not pelvic tilt)' },
    baselineConfidence: 'medium',
    summary: 'LUMBAR',
  },
  {
    id: 'arm_elbow_angle',
    label: 'Elbow angle',
    phase: null,
    view: 'side',
    type: 'record',
    sided: 'near',
    unit: 'deg',
    baselineConfidence: 'medium',
    summary: 'ARMS',
  },
  {
    id: 'arm_shoulder_rom',
    label: 'Shoulder swing ROM',
    phase: null,
    view: 'side',
    type: 'record',
    sided: 'near',
    unit: 'deg',
    baselineConfidence: 'medium',
    summary: 'ARMS',
  },
];

// Copy-paste summary sections, in order (Section 5). Interpretation is always last.
export const SUMMARY_SECTIONS = [
  { id: 'ANKLE', emptyNote: 'No ankle metrics assessed.' },
  { id: 'KNEE', emptyNote: 'No knee metrics assessed.' },
  { id: 'HIP', emptyNote: 'No hip metrics assessed.' },
  {
    id: 'LUMBAR',
    emptyNote: 'No trunk metrics assessed.',
    footer: 'Trunk-angle proxy (shoulder-hip line vs vertical); not measured lumbar kinematics.',
  },
  {
    id: 'ARMS',
    emptyNote: 'No arm metrics assessed.',
    footer: 'Far side: not visible from this camera angle.',
  },
];

// ---------------------------------------------------------------------------
// Pattern flags (Section 6.4). Rules fire on combinations of triggers.
//
// Trigger forms:
//   { metric, status: ['red', 'yellow'] }   metric status is one of these
//   { metric, below: n } / { metric, above: n }   strict numeric comparison
//   { intake: 'cadence', below: n }          intake field (skipped if not entered)
//   { pattern: 'overstride' }                another pattern already fired (same side)
// A pattern fires when every `all` trigger matches and at least `minAny` of `any` match.
// Sided patterns are evaluated per leg; midline metrics and intake apply to both legs.
// ---------------------------------------------------------------------------

export const PATTERNS = [
  {
    id: 'overstride',
    label: 'Overstride',
    all: [],
    any: [
      { metric: 'ic_foot_to_com', status: ['yellow', 'red'], text: 'foot-to-COM distance high' },
      { metric: 'ic_knee_flexion', below: 15, text: 'knee flexion at IC low' },
      { metric: 'ic_tibial_inclination', above: 0, text: 'tibial inclination positive' },
      { intake: 'cadence', below: CADENCE.low, text: `cadence below ${CADENCE.low} spm` },
    ],
    minAny: 2, // [CONFIRM] how many triggers make a combination
    considerations: [
      'Consider a modest cadence increase (commonly 5–10%; verify before shipping).',
      'Consider cueing landing closer under the body.',
      'Consider reviewing hip flexor/extensor control.',
    ],
  },
  {
    id: 'poor_shock_absorption',
    label: 'Poor shock absorption',
    all: [
      { metric: 'ic_knee_flexion', below: 15, text: 'knee flexion at IC low' },
      { metric: 'ms_max_knee_flexion', below: 35, text: 'max stance knee flexion well below ~45°' },
    ],
    any: [],
    minAny: 0,
    considerations: [
      'Consider eccentric quad and glute loading.',
      'Consider a "softer" landing cue.',
      'Consider checking footwear and running surface.',
    ],
  },
  {
    id: 'limited_hip_extension',
    label: 'Limited hip extension',
    all: [{ metric: 'to_hip_extension', below: 5, text: 'hip extension below 5°' }],
    any: [
      { pattern: 'overstride', text: 'overstride pattern present' },
      { intake: 'cadence', above: CADENCE.high, text: `cadence above ${CADENCE.high} spm` },
    ],
    minAny: 1,
    considerations: [
      'Consider hip flexor mobility and glute strength.',
      'Consider reassessing trunk position for compensation.',
    ],
  },
  {
    id: 'frontal_plane_control',
    label: 'Frontal-plane control',
    all: [],
    any: [
      { metric: 'ms_hip_adduction', status: ['yellow', 'red'], text: 'hip adduction high' },
      { metric: 'ms_pelvic_drop', status: ['yellow', 'red'], text: 'pelvic drop high' },
      { metric: 'ms_spine_shift', status: ['red'], text: 'spine shift beyond PSIS' },
    ],
    minAny: 2,
    considerations: [
      'Consider hip abductor strength and single-leg control work.',
      'Consider reviewing step width and crossover.',
    ],
  },
  {
    id: 'trunk_posture',
    label: 'Trunk posture',
    all: [],
    any: [
      { metric: 'ic_spine_lean', status: ['yellow', 'red'], text: 'trunk lean at IC outside range' },
      { metric: 'ms_spine_lean', status: ['yellow', 'red'], text: 'trunk lean at midstance outside range' },
    ],
    minAny: 1,
    considerations: ['Consider reviewing cadence and speed context before cueing trunk position.'],
  },
];

// Status display text.
export const STATUS_LABELS = {
  green: { report: 'Normal', summary: 'normal' },
  yellow: { report: 'Caution', summary: 'caution' },
  red: { report: 'Flag', summary: 'flag' },
  record: { report: 'Recorded', summary: 'recorded' },
  review: { report: 'Above template range', summary: 'above template range, reference under review' },
  // IC-dependent metric whose status changes across the IC-tolerance sweep: range shown, not scored.
  'ic-sensitive': { report: 'Borderline, IC-sensitive', summary: 'borderline, IC-sensitive' },
  // Status changes across analysis-window choices (hip extension window end): range shown, not scored.
  'window-sensitive': { report: 'Borderline, window-sensitive', summary: 'borderline, window-sensitive' },
};

export const UNITS = {
  deg: { suffix: '°', decimals: 1 },
  shoe: { suffix: ' shoe lengths', short: ' SL', decimals: 2 },
  toes: { suffix: ' toes', singular: ' toe', decimals: 0 },
};

// Single source of truth for metric ranges, scoring weights and pattern rules.
// See SPEC.md Sections 5, 6 and 9. Items marked [CONFIRM] are open questions for the owner.

export const APP_VERSION = '0.4.0-viewmap';

// ---------------------------------------------------------------------------
// Phases and views
// ---------------------------------------------------------------------------

export const PHASES = [
  { id: 'initial_contact', label: 'Initial Contact' },
  { id: 'midstance', label: 'Midstance' },
  { id: 'toe_off', label: 'Toe Off' },
];

// Camera views (reference/VIEW_MAP.md). Every metric declares the views it may be computed from
// (`allowedViews`); the pipeline's emitter and the engine both refuse anything else.
export const VIEWS = {
  lateral: { label: 'Lateral (side)' },
  posterior: { label: 'Posterior (rear)' },
};

// Clip slots of a session (js/pipeline/session.js), each optional. Each lateral clip supplies its near
// leg and near arm only; the posterior clip supplies frontal-plane metrics for both legs.
export const CLIP_SLOTS = {
  lateral_left: { view: 'lateral', leg: 'left', label: 'Lateral, filmed from the left' },
  lateral_right: { view: 'lateral', leg: 'right', label: 'Lateral, filmed from the right' },
  posterior: { view: 'posterior', label: 'Posterior (from behind)' },
};

// Metric build status: 'built' = computed; 'planned' = allowed but not computed yet (reason below);
// 'not-built' = deliberately not built (poor 2D reliability); 'not-measurable' = impossible in 2D.
export const STATUS_REASONS = {
  planned: 'not measured by this build yet',
  'planned-posterior': 'posterior metrics awaiting validation, not built yet',
  'not-built': 'not built: poor 2D reliability',
  'not-measurable': 'not measurable in 2D',
};

// Clinician validation switches. While false, the metric is shown but its below-range values raise no
// flag, score or pattern trigger; a single informational line says "pending validation" instead.
export const VALIDATION = {
  hipExtensionValidated: false, // set true once hip extension (trunk axis, late-stance window) is validated
};

// Hip anchor for lateral clips (js/pipeline/hip-anchor.js). 'landmark' = MediaPipe hip landmark;
// 'corrected' = near hip moved by `offset` (thigh lengths: along the thigh toward the knee, and
// perpendicular, + = forward), the median of clinician clicks on the hip joint centre
// (test/hip-anchor.html). Events are always detected on the uncorrected landmarks.
export const HIP_ANCHOR = {
  mode: 'landmark',
  offset: { along: 0, perp: 0, frames: 0, source: 'placeholder: no frames clicked yet (offset 0, corrected = landmark)' },
};

// Not measurable from 2D video at all; listed so they are never implied (check clinically).
export const NOT_MEASURABLE = ['Pelvic tilt (anterior/posterior)', 'Lordosis', 'Transverse-plane motion (rotation)'];

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
// Metrics (Section 6.1, confidence from 6.2, views from reference/VIEW_MAP.md)
//
// allowedViews: views the metric may be computed from. Lateral clips supply the near leg/arm only.
// status:   'built' (default) | 'planned' | 'not-built' | 'not-measurable' (see STATUS_REASONS)
// scored:   false = shown but never scored (default true for 'range' and 'boolean')
//
// type:     'range'   numeric, scored against green/red bounds (yellow = in between)
//           'category' numeric value shown as a category (`categories`); never scored
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
  // ----- Initial contact (lateral) -----
  {
    id: 'ic_foot_strike',
    label: 'Foot strike pattern',
    summaryLabel: 'Foot strike pattern',
    phase: 'initial_contact',
    allowedViews: ['lateral'],
    type: 'category',
    sided: 'lr',
    unit: 'deg',
    // Foot angle at IC relative to the same foot flat at midstance (as foot inclination). Two
    // categories only. Altman & Davis 2012 define the foot strike angle relative to the standing foot
    // angle; their cutoffs (> 8° rearfoot, < -1.6° forefoot) are to be verified. Only 8° is used.
    // Descriptive only: not shown to predict impact loading rate.
    categories: [
      { above: 8, label: 'rearfoot' },
      { label: 'non-rearfoot' },
    ],
    greenText: 'rearfoot vs non-rearfoot (8° cutoff, source to be verified)',
    redText: '—',
    scored: false,
    baselineConfidence: 'low',
    note: 'Descriptive only. Foot angle at IC relative to the flat-foot midstance angle (Altman & Davis 2012 reference the standing foot angle). Rearfoot above 8°; the 8° and -1.6° cutoffs are to be verified.',
    summary: 'ANKLE',
  },
  {
    id: 'ic_foot_inclination',
    label: 'Foot inclination',
    summaryLabel: 'Foot inclination at IC',
    phase: 'initial_contact',
    allowedViews: ['lateral'],
    type: 'range',
    sided: 'lr',
    unit: 'deg',
    // Sign: foot (heel -> foot index) angle at IC relative to the same foot flat at midstance; + = toes up.
    note: "Descriptive only. Measured relative to each foot's own flat-foot angle at midstance, because the heel landmark sits higher on the shoe than the toe landmark.",
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
    allowedViews: ['lateral'],
    type: 'range',
    sided: 'lr',
    unit: 'deg',
    // Sign: shank (knee -> ankle) vs vertical at IC; + = ankle AHEAD of the knee (overstride direction),
    // - = ankle behind the knee.
    green: { min: -10, max: 10 },
    red: { below: -10, above: 10 },
    greenText: '-10° to +10°',
    redText: 'beyond ±10°',
    provisional: true,
    note: 'Descriptive only. ±10° has no published threshold (provisional).',
    priority: false,
    baselineConfidence: 'high',
    summary: 'ANKLE',
  },
  {
    id: 'ic_foot_to_com',
    label: 'Foot-to-COM distance',
    summaryLabel: 'Foot-to-COM distance at IC',
    phase: 'initial_contact',
    allowedViews: ['lateral'],
    type: 'range',
    sided: 'lr',
    unit: 'cm',
    // Horizontal heel to hip midpoint (COM proxy) at IC; + = heel
    // ahead. Shown in cm (pixel-to-cm scale from intake height) with approximate shoe lengths (from the
    // heel-to-toe landmarks); status is judged in shoe lengths.
    // Provisional cm bands from healthy runners: 9.2 ± 4.0 cm heel to COM at IC (Heiderscheit 2011, 3D):
    // green <= mean + 1 SD, red > mean + 2 SD. The clinic's shoe-length bands have no published basis.
    green: { max: 13 },
    red: { above: 17 },
    greenText: '≤13 cm',
    redText: '>17 cm',
    provisional: true,
    note: 'Provisional cm bands (healthy 9.2 ± 4.0 cm, Heiderscheit 2011). Clinic template: < ½ shoe length, red > 1 shoe length.',
    priority: true,
    baselineConfidence: 'medium', // depends on the height-based scale and foot landmarks
    requires: ['height'],
    summary: 'ANKLE',
  },
  {
    id: 'ic_knee_flexion',
    label: 'Knee flexion',
    summaryLabel: 'Knee flexion at IC',
    phase: 'initial_contact',
    allowedViews: ['lateral'],
    type: 'range',
    sided: 'lr',
    unit: 'deg',
    green: { min: 15, max: 25 },
    red: { below: 12, above: 30 },
    greenText: '15–25°',
    redText: '<12° or >30°',
    priority: true,
    baselineConfidence: 'high',
    provisional: true,
    note: 'Clinic template range; healthy adults 17.8 ± 4.0° (Heiderscheit 2011, 3D). Thresholds provisional.',
    summary: 'KNEE',
  },
  {
    id: 'ic_spine_lean',
    label: 'Forward trunk lean',
    summaryLabel: 'Forward trunk lean at IC',
    phase: 'initial_contact',
    allowedViews: ['lateral'],
    type: 'range',
    sided: 'mid',
    unit: 'deg',
    // Sign: shoulder-midpoint to hip-midpoint line vs vertical; + = forward lean. Trunk-angle proxy, not lumbar.
    green: { min: 5, max: 10 },
    red: { below: 0, above: 15 },
    greenText: '5–10°',
    redText: '<0° or >15°',
    priority: false,
    provisional: true,
    note: 'Green 5–10° matches healthy self-selected lean (≈7°); red thresholds are provisional.',
    baselineConfidence: 'high',
    summary: 'LUMBAR',
  },

  // ----- Midstance (side view) -----
  {
    id: 'ms_max_knee_flexion',
    label: 'Max knee flexion',
    summaryLabel: 'Max stance knee flexion',
    phase: 'midstance',
    allowedViews: ['lateral'],
    type: 'range',
    sided: 'lr',
    unit: 'deg',
    // Provisional, literature-based (DECISIONS.md): healthy runners 46.3 ± 4.5° (Heiderscheit 2011, 3D),
    // 44.5 ± 3.6° (Matsuzaki 2024, 2D); low flexion (< 40°) is the concern (Souza 2016). The clinic
    // template (35–45°, red > 45°) would flag about half of healthy runners; kept for owner review.
    green: { min: 40, max: 55 },
    red: { below: 35 },
    greenText: '40–55°',
    redText: '<35°',
    provisional: true,
    note: 'Provisional, literature-based (healthy ≈ 45°; low flexion is the concern). Clinic template 35–45° / red >45° under review.',
    priority: true,
    baselineConfidence: 'high',
    summary: 'KNEE',
  },
  {
    id: 'ms_knee_flexion_excursion',
    label: 'Knee flexion excursion',
    summaryLabel: 'Knee flexion excursion (IC to midstance)',
    phase: 'midstance',
    allowedViews: ['lateral'],
    type: 'record',
    sided: 'lr',
    unit: 'deg',
    // Knee flexion at midstance minus knee flexion at IC, per stride. IC-dependent.
    greenText: 'record value',
    redText: 'none defined',
    scored: false,
    baselineConfidence: 'high',
    summary: 'KNEE',
  },
  {
    id: 'ms_ankle',
    label: 'Ankle at midstance',
    summaryLabel: 'Ankle DF at midstance',
    phase: 'midstance',
    allowedViews: ['lateral'],
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
    allowedViews: ['lateral'],
    type: 'boolean',
    sided: 'lr',
    expected: true,
    mismatchStatus: 'yellow', // [CONFIRM] template gives yes/no without a red rule
    display: { true: 'Yes', false: 'No' },
    greenText: 'yes',
    redText: '—',
    priority: false,
    baselineConfidence: 'low', // depends on the ankle angle (heel/toe landmarks)
    note: 'Provisional rule: peak stance knee flexion and peak ankle dorsiflexion within 15% of stance time of each other; "yes" when at least half the strides are in sync.',
    summary: 'KNEE',
  },
  {
    id: 'ms_spine_lean',
    label: 'Forward trunk lean',
    summaryLabel: 'Forward trunk lean at midstance',
    phase: 'midstance',
    allowedViews: ['lateral'],
    type: 'range',
    sided: 'mid',
    unit: 'deg',
    green: { min: 0, max: 10 },
    red: { above: 12 },
    greenText: '0–10°',
    redText: '>12°',
    priority: false,
    provisional: true,
    baselineConfidence: 'high',
    summary: 'LUMBAR',
  },

  // ----- Midstance (rear view) -----
  {
    id: 'ms_pelvic_drop',
    label: 'Contralateral pelvic drop',
    phase: 'midstance',
    allowedViews: ['posterior'],
    summary: 'HIP',
    // Change in the pelvis line from loading response (segmentation-derived stance start) to midstance.
    type: 'range',
    sided: 'lr', // side = stance leg
    unit: 'deg',
    green: { max: 6 }, // a negative value (swing-side hip rising) is not a concern
    red: { above: 6 },
    greenText: '0–6°',
    redText: '>6°',
    priority: true,
    baselineConfidence: 'low', // trend only
    provisional: true,
    scored: false, // trend only: 2D pelvic drop did not track 3D in one study (SPEC 8)
    note: 'Trend only. Template row "Pelvic tilt" is not measurable in 2D; this is frontal-plane pelvic drop.',
  },
  {
    id: 'ms_hip_adduction',
    label: 'Hip adduction',
    phase: 'midstance',
    allowedViews: ['posterior'],
    summary: 'HIP',
    // At midstance: thigh vs the perpendicular to the pelvis line; + = knee toward midline.
    type: 'range',
    sided: 'lr',
    unit: 'deg',
    green: { min: 0, max: 13 },
    red: { above: 13 },
    greenText: '0–13°',
    redText: '>13°',
    priority: true,
    baselineConfidence: 'medium',
    provisional: true,
    note: 'Midstance (lowest pelvis), thigh vs the perpendicular to the pelvis line. Red >13° ≈ healthy 3D mean + 1 SD (provisional).',
  },
  {
    id: 'ms_knee_varus_valgus',
    label: 'Knee frontal-plane projection angle',
    phase: 'midstance',
    allowedViews: ['posterior'],
    summary: 'KNEE',
    // At midstance: 180 - frontal hip-knee-ankle angle; + = knee medial (valgus).
    type: 'range',
    sided: 'lr',
    unit: 'deg',
    green: { min: -5, max: 5 },
    red: { below: -5, above: 5 }, // [CONFIRM] template reads ">5 or >5"
    greenText: '-5° to +5°',
    redText: 'beyond ±5°',
    priority: true,
    baselineConfidence: 'low',
    scored: false, // 2D knee valgus did not relate to 3D knee abduction in running (Dingenen 2018)
    provisional: true,
    note: 'Low confidence and unscored: 2D knee valgus did not relate to 3D in running (Dingenen 2018). ±5° range has no published basis.',
  },
  {
    id: 'ms_out_toe',
    label: 'Out-toe / foot progression angle',
    phase: 'midstance',
    allowedViews: ['posterior'],
    status: 'not-built',
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
    allowedViews: ['posterior'],
    summary: 'ANKLE',
    // Heel vs the pelvis midline at midstance; a leg's pattern is "yes" when >= 50% of its steps cross.
    type: 'boolean',
    sided: 'lr',
    expected: false,
    mismatchStatus: 'yellow', // [CONFIRM] template gives yes/no without a red rule
    display: { true: 'Yes', false: 'No' },
    greenText: 'no',
    redText: '—',
    priority: false,
    baselineConfidence: 'medium',
    note: 'Heel vs the pelvis midline at midstance; "yes" when at least half the steps land on or past the midline.',
  },
  {
    id: 'ms_spine_shift',
    label: 'Spine shift (PSIS rule)',
    phase: 'midstance',
    allowedViews: ['posterior'],
    summary: 'LUMBAR',
    // Provisional rule: between PSIS when the median |shoulder-midpoint shift| <= 0.25 hip-joint widths
    // (PSIS assumed about half as far apart as the hip joint centres).
    type: 'boolean',
    sided: 'mid',
    expected: true, // true = stays between PSIS
    mismatchStatus: 'red',
    display: { true: 'Between PSIS', false: 'Beyond PSIS' },
    greenText: 'between PSIS',
    redText: 'beyond PSIS',
    priority: true,
    baselineConfidence: 'medium',
    note: 'Provisional: between PSIS = median shoulder-midpoint shift within a quarter of the hip-joint width (no PSIS landmark).',
  },
  {
    id: 'ms_achilles_angle',
    label: 'Achilles angle',
    phase: 'midstance',
    allowedViews: ['posterior'],
    status: 'not-built',
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
    allowedViews: ['posterior'],
    status: 'not-built',
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
  {
    id: 'ms_foot_midline',
    label: 'Foot position vs midline',
    phase: 'midstance',
    allowedViews: ['posterior'],
    summary: 'ANKLE',
    type: 'record',
    sided: 'lr',
    unit: 'hipw',
    // Heel vs the pelvis midline at midstance, in hip widths; + = on its own side, <= 0 = crossing.
    greenText: 'record value',
    redText: 'none defined',
    baselineConfidence: 'medium',
  },
  {
    id: 'ms_trunk_lateral_lean',
    label: 'Trunk lateral lean',
    phase: 'midstance',
    allowedViews: ['posterior'],
    summary: 'LUMBAR',
    type: 'record',
    sided: 'mid',
    unit: 'deg',
    greenText: 'record value',
    redText: 'none defined',
    baselineConfidence: 'medium',
    note: 'Proxy: shoulder-midpoint to pelvis-midpoint line; no spine landmarks.',
  },
  {
    id: 'ms_lateral_shift',
    label: 'Trunk lateral shift',
    phase: 'midstance',
    allowedViews: ['posterior'],
    summary: 'LUMBAR',
    type: 'record',
    sided: 'mid',
    unit: 'cm',
    greenText: 'record value',
    redText: 'none defined',
    baselineConfidence: 'medium',
    note: 'Proxy (no PSIS landmark): shoulder midpoint vs pelvis midpoint, cm from intake height, hip-width fraction without height.',
  },

  // ----- Toe off (side view) -----
  {
    id: 'to_hip_extension',
    label: 'Hip extension',
    summaryLabel: 'Hip extension (late stance)',
    phase: 'toe_off',
    allowedViews: ['lateral'],
    type: 'range',
    sided: 'lr',
    unit: 'deg',
    green: { min: 5, max: 15 },
    red: { below: 5 },
    aboveGreen: 'review', // >15° measured vs the trunk axis: template reference under review
    greenText: '5–15°',
    redText: '<5° (with lordosis)',
    priority: false,
    scored: false, // unscored until the clinician validates the trunk-axis reference and window
    // Until VALIDATION.hipExtensionValidated, a value below the range gets this line instead of a flag.
    pendingValidation: { flag: 'hipExtensionValidated', text: 'hip extension below 5°: pending validation' },
    baselineConfidence: 'medium',
    note: 'Measured relative to the trunk axis; unscored until validated.',
    // Lordosis is not measurable in 2D; prompt the clinician instead.
    clinicalPrompt: { when: ['red'], text: 'check lordosis clinically' },
    summary: 'HIP',
  },

  // ----- Summary-only, never scored -----
  {
    id: 'trunk_change_peak_hip_ext',
    label: 'Trunk angle change at peak hip extension (trunk-angle proxy)',
    summaryLabel: 'Trunk angle change, IC to peak hip extension',
    phase: null, // summary only, never scored
    allowedViews: ['lateral'],
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
    allowedViews: ['lateral'],
    type: 'record',
    sided: 'lr', // each lateral clip supplies its near arm
    unit: 'deg',
    baselineConfidence: 'medium',
    summary: 'ARMS',
  },
  {
    id: 'arm_shoulder_rom',
    label: 'Shoulder swing ROM',
    phase: null,
    allowedViews: ['lateral'],
    type: 'record',
    sided: 'lr', // each lateral clip supplies its near arm
    unit: 'deg',
    baselineConfidence: 'medium',
    summary: 'ARMS',
  },
];

// Copy-paste summary sections, in order (Section 5). Interpretation is always last.
export const SUMMARY_SECTIONS = [
  {
    id: 'ANKLE',
    emptyNote: 'No ankle metrics assessed.',
    footer: 'Out-toe angle, Achilles angle and rearfoot eversion: not built (foot landmarks are too small and unreliable from behind at this distance).',
  },
  { id: 'KNEE', emptyNote: 'No knee metrics assessed.' },
  { id: 'HIP', emptyNote: 'No hip metrics assessed.' },
  {
    id: 'LUMBAR',
    emptyNote: 'No trunk metrics assessed.',
    footer: 'Trunk-angle proxy (shoulder-hip line vs vertical); not measured lumbar kinematics. Pelvic tilt and lordosis: not measurable in 2D.',
  },
  {
    id: 'ARMS',
    emptyNote: 'No arm metrics assessed.',
    footer: 'Each lateral clip measures its near arm only; the other arm needs a clip filmed from that side.',
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
    requiresValidation: 'hipExtensionValidated', // off until hip extension is validated
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
      { metric: 'ms_crossover', status: ['yellow'], text: 'crossover foot placement' },
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
  // Below range while the metric awaits clinician validation: informational only.
  'pending-validation': { report: 'Below range: pending validation', summary: 'pending validation' },
  // IC-dependent metric whose status changes across the IC-tolerance sweep: range shown, not scored.
  'ic-sensitive': { report: 'Borderline, IC-sensitive', summary: 'borderline, IC-sensitive' },
  // Status changes across analysis-window choices (hip extension window end): range shown, not scored.
  'window-sensitive': { report: 'Borderline, window-sensitive', summary: 'borderline, window-sensitive' },
  // Status changes when posterior midstance shifts by ±2 analysed frames: range shown, not scored.
  'timing-sensitive': { report: 'Borderline, timing-sensitive', summary: 'borderline, timing-sensitive' },
};

export const UNITS = {
  deg: { suffix: '°', decimals: 1 },
  cm: { suffix: ' cm', decimals: 1 },
  hipw: { suffix: ' hip widths', short: ' HW', decimals: 2 },
  shoe: { suffix: ' shoe lengths', short: ' SL', decimals: 2 },
  toes: { suffix: ' toes', singular: ' toe', decimals: 0 },
};

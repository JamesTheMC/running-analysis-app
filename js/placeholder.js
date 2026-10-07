// PLACEHOLDER measurements in the exact shape the analysis pipeline will produce (Milestone 2).
// These numbers are invented to exercise every display state. They are NOT from any video.
//
// Shape:
//   measurements[metricId] = {
//     left?:  Measurement, right?: Measurement,   // sided: 'lr'
//     mid?:   Measurement,                        // sided: 'mid'
//     near?:  Measurement,                        // sided: 'near'
//   }
//   Measurement = { value: number | boolean | null, quality: 0..1, reason?: string }
//     quality: share of usable gait cycles / tracking quality. Below SCORING.quality.floor
//              the metric is "not reliable from this clip" and `reason` says why.

export const PLACEHOLDER_ANALYSIS = {
  source: 'placeholder',
  cyclesDetected: 12,
  framesExcluded: 0.016, // share of frames removed by the rigid-segment check
  measurements: {
    // Initial contact (side)
    ic_foot_inclination: {
      left: { value: 8.2, quality: 0.66 },
      right: { value: null, quality: 0.38, reason: 'far foot occluded at contact in most cycles' },
    },
    ic_tibial_inclination: {
      left: { value: -2.5, quality: 0.93 },
      right: { value: 7.1, quality: 0.9 },
    },
    ic_foot_to_com: {
      left: { value: 0.42, quality: 0.88 },
      right: { value: 1.12, quality: 0.86 },
    },
    ic_knee_flexion: {
      left: { value: 18.4, quality: 0.95 },
      right: { value: 11.2, quality: 0.91 },
    },
    ic_spine_lean: { mid: { value: 7.3, quality: 0.94 } },

    // Midstance (side)
    ms_max_knee_flexion: {
      left: { value: 41.6, quality: 0.95 },
      right: { value: 33.1, quality: 0.92 },
    },
    ms_ankle: {
      left: { value: 14.2, quality: 0.72 },
      right: { value: 11.8, quality: 0.68 },
    },
    ms_knee_ankle_sync: {
      left: { value: true, quality: 0.8 },
      right: { value: false, quality: 0.77 },
    },
    ms_spine_lean: { mid: { value: 11.0, quality: 0.93 } },

    // Midstance (rear)
    ms_pelvic_drop: {
      left: { value: 4.1, quality: 0.74 },
      right: { value: 7.2, quality: 0.71 },
    },
    ms_hip_adduction: {
      left: { value: 9.3, quality: 0.84 },
      right: { value: 14.6, quality: 0.82 },
    },
    ms_knee_varus_valgus: {
      left: { value: 2.1, quality: 0.62 },
      right: { value: -3.4, quality: 0.6 },
    },
    ms_out_toe: {
      left: { value: 1, quality: 0.7 },
      right: { value: 1, quality: 0.7 },
    },
    ms_crossover: {
      left: { value: false, quality: 0.8 },
      right: { value: true, quality: 0.78 },
    },
    ms_spine_shift: { mid: { value: true, quality: 0.83 } },
    ms_achilles_angle: {
      left: { value: 6.0, quality: 0.78 },
      right: { value: 8.4, quality: 0.76 },
    },
    ms_rearfoot_eversion: {
      left: { value: 3.2, quality: 0.55 },
      right: { value: null, quality: 0.34, reason: 'heel landmarks unstable; re-shoot closer with the feet filling more of the frame' },
    },

    // Toe off (side)
    to_hip_extension: {
      left: { value: 9.1, quality: 0.9 },
      right: { value: 3.6, quality: 0.89 },
    },

    // Summary-only
    trunk_change_peak_hip_ext: { mid: { value: 3.2, quality: 0.88 } },
    arm_elbow_angle: { near: { value: 82.0, quality: 0.9 } },
    arm_shoulder_rom: { near: { value: 58.5, quality: 0.87 } },
  },
};

// Demo intake so the full flow can be checked without a video.
export const DEMO_INTAKE = {
  clientCode: 'DEMO-001',
  sessionDate: new Date().toISOString().slice(0, 10),
  filmedFrom: 'left',
  heightValue: '178',
  heightUnit: 'cm',
  speedValue: '6.5',
  speedUnit: 'mph',
  incline: '1',
  cadence: '158',
  runningHistory: 'Recreational, 25 mi/week, half marathon in 10 weeks.',
  shoeHistory: 'Neutral trainer, ~300 mi.',
  orthotics: 'None.',
  goals: 'Sub-1:50 half marathon, run without right knee soreness.',
};

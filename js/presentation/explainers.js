// "What is this?": plain-language meaning of each metric and timing value, shown in its detail on the
// Results tab. The view it comes from (view-matrix.js) and its validated error (reconcile.js) are
// added automatically so they cannot drift from the code.
import { METRICS } from '../config.js';
import { VALIDATION_ERROR } from '../pipeline/reconcile.js';
import { needsText } from '../pipeline/view-matrix.js';

export const MEANING = {
  ic_foot_strike: 'Whether the heel lands first (rearfoot) or the midfoot or forefoot does, from the foot angle at the moment of contact.',
  ic_foot_inclination: 'How much the foot points up (toes up) at the moment it lands, compared with the same foot flat at midstance.',
  ic_tibial_inclination: 'The angle of the shin from vertical at the moment of landing. Positive means the ankle lands ahead of the knee, a sign of reaching forward.',
  ic_foot_to_com: 'How far ahead of the pelvis (an estimate of the body\'s centre of mass) the heel lands. Larger means more overstriding.',
  ic_knee_flexion: 'How bent the knee is at the moment of landing (0° = straight). A very straight knee at landing goes with overstriding.',
  ic_spine_lean: 'Forward lean of the trunk at landing: the shoulder-to-hip line compared with vertical.',
  ms_max_knee_flexion: 'The most the knee bends while the foot is on the ground (shock absorption).',
  ms_knee_flexion_excursion: 'How much the knee bends from landing to its deepest point in stance.',
  ms_ankle: 'Ankle bend (dorsiflexion) at midstance: how far the shin moves forward over the foot.',
  ms_knee_ankle_sync: 'Whether the knee and the ankle reach their deepest bend at about the same time in stance.',
  ms_spine_lean: 'Forward lean of the trunk at midstance, when the body passes over the foot.',
  ms_pelvic_drop: 'How much the pelvis drops on the side of the swinging leg while the other foot is on the ground.',
  ms_hip_adduction: 'How far the thigh angles inward toward the midline at midstance, seen from behind. Research links a larger inward angle with hip muscle control.',
  ms_knee_varus_valgus: 'The knee\'s inward (valgus) or outward position seen from behind, as a 2D projection angle. Not the same as a 3D knee angle.',
  ms_crossover: 'Whether the feet land on or across the body\'s midline (as if running on a tightrope).',
  ms_spine_shift: 'Whether the trunk shifts sideways within or beyond the width of the pelvis (PSIS rule) during stance.',
  ms_foot_midline: 'Where each heel lands relative to the midline of the pelvis, in hip widths.',
  ms_step_width: 'The side-to-side distance between the left and right heels at midstance.',
  arm_crossover: 'Whether the hands swing across the body\'s midline.',
  ms_trunk_lateral_lean: 'Sideways lean of the trunk toward the stance leg at midstance, seen from behind.',
  ms_lateral_shift: 'Sideways shift of the shoulders relative to the pelvis at midstance.',
  to_hip_extension: 'How far the thigh moves behind the trunk at the end of stance (push-off), measured against the trunk line.',
  trunk_change_peak_hip_ext: 'How much the trunk angle changes between landing and peak hip extension; a large change can mean the trunk moves to make up for limited hip extension.',
  arm_elbow_angle: 'The typical elbow bend during the arm swing.',
  arm_shoulder_rom: 'How far the arm swings forward and back at the shoulder.',
};

export const TIMING_MEANING = {
  Cadence: 'Steps per minute (both feet). Taken from the video\'s stride rhythm and cross-checked between views.',
  'Step time, left': 'Time from right-foot contact to left-foot contact.',
  'Step time, right': 'Time from left-foot contact to right-foot contact.',
  'Step-time difference (left vs right)': 'How much longer one side\'s steps take than the other\'s. Some difference is normal.',
  'Ground contact time': 'How long each foot stays on the ground per step, from the side view (± one video frame).',
  'Vertical oscillation (pelvis)': 'How far the pelvis rises and falls each step, from the side view.',
  'Step length': 'Distance covered per step: treadmill speed divided by step rate.',
  'Contact share of the stride': 'The share of each stride a foot is on the ground (duty factor). Without a flight phase, one foot lands as the other leaves.',
};

const BY_ID = new Map(METRICS.map((m) => [m.id, m]));

export function explainerFor(id) {
  const def = BY_ID.get(id);
  const what = MEANING[id];
  if (!def || !what) return null;
  const keys = def.sided === 'mid' ? ['mid'] : ['left', 'right'];
  const views = [...new Set(keys.map((k) => needsText(def, k)).filter(Boolean))].map((v) => v.replace(/^(the|a) /, ''));
  const err = VALIDATION_ERROR[id];
  const unit = def.unit === 'deg' ? '°' : def.unit === 'cm' ? ' cm' : '';
  const how = err != null ? `Checked against hand-marked video frames: typical error about ±${err}${unit}.` : 'Not yet checked against hand-marked frames.';
  return `${what} From: ${views.join(' / ')}. ${how}`;
}

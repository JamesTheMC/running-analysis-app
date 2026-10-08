// Posterior-clip adapter. Posterior metrics are not built yet (awaiting validation), so this carries
// only capture checks and segmentation counts; no measurement is emitted.

export function toPosteriorAnalysis(result) {
  const valid = (side) => result.midstance[side].filter((h) => h.valid).length;
  return {
    captureChecks: { posterior: { ...result.capture, stanceHalfCycles: { left: valid('L'), right: valid('R') } } },
  };
}

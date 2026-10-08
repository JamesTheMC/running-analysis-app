# Gait & Running Analysis App

## Goal
iPhone/iPad-friendly gait and running analysis tool for a sports PT. Web app first to
validate, then native iOS/iPadOS (Swift) once the analysis is proven. Owner builds with
Claude Code, has a Mac, and is new to Claude Code: explain things in plain language and
keep every run to one command.

## Current state
- Scaffold built: upload, intake, results screens.
- In-browser pose analysis works with real hip extension and near-side elbow values.
- Hip extension is measured relative to the trunk axis (shoulder-hip line), not vertical.

## v1 scope
- Video upload only (no live capture).
- Support both a side-view and a posterior-view video.
- Extend analysis to the whole body: ankle, knee, hip, lumbar, arms.
- Optional intake on upload: client height, treadmill speed, treadmill incline.
  No weight for now.
- Files are labeled by client code + upload date. Never client name.

## Output (the product)
A copy-paste plain-text summary for a note or message to a client or colleague:
- Sections in order: ankle, knee, hip, lumbar, arms.
- Then a plain-language interpretation paragraph at the bottom.
- Follows the owner's clinical running-analysis template: phase-based (initial contact,
  midstance, toe off), left/right columns, green normal and red flag ranges, scores,
  correlated weaknesses/instabilities, and mechanics suggestions (cadence, stride).
- The on-screen results view mirrors the same structure.

## Decision rights
Decide on your own: libraries, architecture, file structure, algorithms, thresholds,
event detection, refactors, tests, UI details. Log every non-trivial decision in
DECISIONS.md.
Stop and ask first: anything that costs money or needs a paid API; deleting data;
sending video or data to any external service or server; publishing/deploying publicly;
anything that would handle real identifiable client data off-device.

## Privacy
All video is processed in the browser, on-device. No uploads to servers. Videos are never
committed to git (keep them gitignored). Use only client-coded or de-identified clips.

## Quality bar
- Every metric is checked against a reference: manual frame-by-frame measurement on a
  sample clip, with the error reported in degrees.
- Normal/red-flag ranges must come from published running-biomechanics literature or be
  clearly marked as provisional, with the source noted in DECISIONS.md.
- The output states its limits: this is movement analysis to support clinical judgment,
  not a diagnosis.
- Tests run with one command. Nothing is "done" until they pass and the app runs.

## Working rules
- Keep TASKS.md current (todo / doing / done / blocked).
- Prefer simple and verifiable over clever.
- Commit small, with clear messages, to the existing GitHub repo.
- End each session with: done, decided, next, needs-me.

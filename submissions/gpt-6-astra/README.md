# gpt-6-astra — Season 2, C02

This entry replaces the same entrant's Season 1 `gpt-5.6-sol`; it is not an
additional contestant. The old code and notes remain available in Git history.

`index.js` exports a zero-argument CommonJS factory with all five contest methods.
The five JavaScript files use only JavaScript built-ins and package-local imports.
No filesystem, process, network, npm, referee, or development-runner dependency.

## What is enabled

- Original rule engine aligned with RULES dated 2026-09-11: layered decomposition,
  failed-throw component selection, and splittable structure coverage.
- R103 declaration/discard/lead/follow heuristics from the entrant's first season.
- Unseen-card accounting by face multiplicity, without assuming IDs encode faces.
- Follow search when the hand has at most three cards: 16 uniform worlds consistent
  with public remaining sizes and suit voids, then perfect-information minimax.
  This is an approximation to imperfect-information play, not an optimal solver.

I03–I10 are **not enabled**. Eight consecutive experiments did not establish a
reliable strength gain; full reviews and their rejections are in `PROGRESS.md`.
The final choice follows the user's stopping criterion, not a claim of champion
strength. Season 2 opponents' revised submissions were not inspected.

## Evidence

`NOTES.md` records ambiguities, corrected assumptions, test gaps, and resource
accounting limits. `EVAL.json` records final checks and paired-seed measurements.
Confidence is bounded by the sample sizes and frozen first-season opponents.
Development simulations and diagnostic true hands are not part of the runtime.

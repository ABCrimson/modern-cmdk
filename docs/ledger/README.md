# Findings ledger

`findings.json` is the machine-readable record of every code-review finding that a hostile verifier has CONFIRMED against this repository, with the commit it was last checked on and the release that owns the fix. It exists so that the release roadmap (`docs/plans/2026-10-31-roadmap-1.3-to-2.0.md`) and its gates run against data, not memory: no feature PR merges on a surface with an open `BUG` row (`DECISIONS.md` LD-06), every version re-verifies its rows on the release-candidate commit before writing a line of code, and the kill criteria in roadmap section 7 are computed from it.

## Provenance

- **Pass 1** (2026-10-30, verified on `057662c`): a word-for-word read of every tracked file by 25 reader clusters and lenses, each report refuted or confirmed by an independent verifier.
- **Pass 2** (2026-10-31, verified on `b6fbe97`): the items pass 1 could not verify, re-examined by hostile verifiers; 410 confirmed, 155 refuted, 44 already fixed.
- **Re-verification** (2026-11-04, verified on `e55cce7`): every row above re-checked on main after PRs #51 and #52; rows in files those PRs changed were checked a second time on the merged tree.

`verified_at` is the short SHA of the last check; `verified_on` its date. The verifier transcripts live outside the repository, in the maintainer's run directory for the 2026-10-30 deep dive.

## Row shape

| Field | Meaning |
|---|---|
| `id` | Stable finding id from its source report (`RA-01`, `W43`, `DT-08`, …). Never reused. |
| `pass` | `1` or `2`, which verification pass confirmed it. |
| `src` | Source cluster or lens (`react-adapter`, `lens-security`, `wiki-A`, …). |
| `file`, `line`, `at` | Location when reported; `at` is the location at the last check when it moved. |
| `category` | `BUG`, `DOC_INACCURACY`, `STALE`, `TEST_GAP`, `A11Y`, `SECURITY`, `PERF`, `DEAD`, `BLOAT`, `STRUCTURE`, `MODERNIZE`, `DEPRECATED`. |
| `severity` | `high`, `medium`, `low`, `trivial`, as graded by the verifier. |
| `claim`, `fix` | The confirmed defect and the fix the verifier proposed; the owning release decides the real fix. |
| `status` | `OPEN`, `MOVED` (still true, new location), `FIXED` (`fixedBy` names the commit), `REFUTED` (the claim was wrong), `UNVERIFIABLE` (needs a device or account). |
| `release` | The roadmap step that owns the fix: `Phase 0`, `1.3.0` … `1.12.0`, `R`, `D`, `2.0.0`, or `deferred`. Placement follows roadmap section 3. |
| `group`, `groupTitle` | Root-cause group: rows one change closes together. |

## Maintenance

- A release re-verifies its rows on its candidate commit (roadmap section 3, step 1) and records the outcome here in the same PR as the code; a row becomes `FIXED` only with the fixing commit named.
- New findings are appended with the next free id of their source prefix, never by editing an existing row's claim.
- `DECISIONS.md` records every policy change about this file.

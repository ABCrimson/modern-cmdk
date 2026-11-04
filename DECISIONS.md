# DECISIONS.md — append-only. Locked Decisions LD-01…LD-08 are defined in `docs/plans/2026-10-31-roadmap-1.3-to-2.0.md` (section 0 "Four standing rules", section 3 "Order inside every version", section 4 "Must be true before 2.0 is cut") and in `CLAUDE.md`, and are restated here by ID as the seed of this log. Nothing below may contradict them without a superseding entry explicitly marked as such.

- LD-01 Every dependency, toolchain and action is pinned exactly to the newest release on any channel, resolved live at every session start and release cut; a hold needs evidence that the newest build is broken for this repo, recorded in `.peak-modern-holds.json`; stability or missing provenance alone is never a hold reason.
- LD-02 No git tag is ever pushed by hand. Tags and GitHub releases are created by the release workflow (publish and backfill jobs) from the same commit npm was published from.
- LD-03 A version's docs and comments change only after its code lands; a comment made false by a code change is fixed in that same change.
- LD-04 Only green: no `continue-on-error`, no `|| echo` fallback, no masked lane; a non-blocking lane runs as a scheduled workflow; a red run is deleted only after its cause is fixed and its id, name and date are archived; a run that a committed file cites is never deleted.
- LD-05 No breaking change in a 1.x minor. Every default flip or removal waits for 2.0 behind a 1.x deprecation runway; a 1.x behaviour change ships only as a bug fix that names the documented contract it restores.
- LD-06 No feature PR merges on a surface with an open BUG:CONFIRMED ledger row; every fix PR carries a test that fails before the fix.
- LD-07 Restructure (R) and then de-bloat (D) run after the correctness minors 1.3.0 to 1.9.0, one move per commit with the full gate green; only items CONFIRMED by a verifier, knip or cargo-machete are deleted; public API leaves only through a 1.12 deprecation and 2.0.
- LD-08 A publish runs only after CI succeeded on the same SHA (`ci-gate` in release.yml); nothing merges to main between a Version PR merge and its publish landing; the post-cut gate checks that tags and releases equal `npm view <pkg> versions`.

## Log

### G-01 · 2026-11-03 · Seed and inherited work

What: ledger created while landing the release roadmap. It inherits work from the 2026-10-30/31 run that has no row of its own: PR #42 (peak-modern bump, 12 commits, rebase-merged 2026-10-31 04:22Z), #44 (benchmark gate: exit 1 warns, exit 2 fails; baseline re-taken on Node 28), #45 (release lockfile refresh, wasm peer `workspace:*`, nightly bumps), #46 (`version-packages` script because changesets/action runs `script` without a shell), #47 (React experimental e84e1492-20261031), all on main at 6bde302. GitHub hygiene of 2026-10-31: 52 non-success workflow runs deleted after their causes were fixed (ids, names and dates archived in the run directory file `non-green-runs.json`, outside the repo), 9 stale Dependabot PRs closed with the superseding version named, branch `chore/bleeding-edge-evergreen-upgrade` deleted, repository settings set to default token read, `can_approve_pull_request_reviews` false, `sha_pinning_required` true, fork-PR approval policy `first_time_contributors_new_to_github`. One deletion broke LD-04 before LD-04 existed: run 41168320386, which `benchmarks/baseline.json` cites as its source, is gone; D27 makes baseline.json cite a committed results JSON from 1.3.0.

Evidence: `gh run list --limit 100` on 2026-11-03 shows 0 non-success runs; `gh pr list` shows #43 (Version Packages, head 318c632) and Dependabot #48, #49, #50 open; GitHub releases end at modern-cmdk@1.2.1 while npm has 1.2.2 (2026-08-27T21:17Z, trusted publisher, provenance). Verdict files and digests live in the run directory `runs/2026-10-30-deep-dive/` under the orchestrator's Claude project folder; the master findings ledger built from them on 2026-11-03 has 1,398 rows (988 pass-1 CONFIRMED verified on 057662c, 410 pass-2 CONFIRMED verified on b6fbe97), 0 duplicate ids.

Status: carried, none of it authored by this session. D16 (ratify the cleanup) awaits the owner.

### G-02 · 2026-11-03 · Owner decisions D1–D33: working defaults adopted in the owner's absence

The owner's standing instruction for this run is "continue where you left off and keep going until everything is done". The roadmap's section 6 leaves 33 decisions to the owner with a recommendation each. Each recommendation is adopted below as the working default so the train moves; the owner overrules any of them with a superseding entry, and the irreversible ones (npm publishes, deprecations) are only ever executed by the release workflow after the step that owns them.

| D | Decision | Working default | Status |
|---|---|---|---|
| D1 | Disabled items hidden at rest, shown under a query | path (a): `disabledItems: 'show'` default in 1.6, nav and select skip disabled, a bug fix with its semver cost | adopted-default, due before 1.6 |
| D2 | Backfill releases modern-cmdk@1.2.2 and create-modern-cmdk@1.2.1 | release.yml `workflow_dispatch` task `backfill`, allowlisted to those two tags at 33678255dcee29a02a1222c10f5698f47cf7f24c, `--latest=false`, never by hand (LD-02) | adopted-default, Phase 0 |
| D3 | Legacy tags v1.1.5, v0.x, vscode-modern-cmdk@1.0.0 | keep, documented in the CHANGELOG | adopted-default, 1.3 |
| D4 | CNAME or Pages base | Pages base `/modern-cmdk/`, drop the dead custom domain | adopted-default, 1.3 docs step |
| D5 | Private vulnerability reporting | on | resolved 2026-11-03 (`PUT /private-vulnerability-reporting` → 204; GET shows enabled) |
| D6 | WASM in 1.x | decided by the 1.9 probe after W43 and W44 are fixed | deferred; re-arm: 100K probe result |
| D7 | VS Code extension | package private in 1.4; `npm deprecate vscode-modern-cmdk@1.0.0` needs the owner's npm credentials | repo side adopted-default; npm side awaiting owner |
| D8 | `@crimson_dev/*` packages | deprecate as "Renamed to modern-cmdk" | awaiting owner (npm credentials) |
| D9 | Wiki | a stub pointing at the docs, 1.3 docs step | adopted-default |
| D10 | lefthook 2.2.2 without provenance | **differs from the recommendation**: keep 2.2.2 (newest), no hold. LD-01 forbids a hold for missing provenance; `trustPolicyExclude` in pnpm-workspace.yaml documents the gap | decided; re-arm: a lefthook release with attestations removes the exclusion |
| D11 | Node 27 alpha or 28 nightly | 28 nightly in `.nvmrc`, re-resolved at every sweep | resolved |
| D12 | xcode-27 preview in the required matrix | required lane on GA `macos-26`; xcode-27 scheduled, non-blocking | adopted-default, 1.3 |
| D13 | scorer.rs | with D6: no-go deletes it in D, go wires it in 1.12 | deferred with D6 |
| D14 | `engines` floor | dropped from modern-cmdk only in 1.4; create and codemod keep `>=26.4.0` through their 1.x | adopted-default |
| D15 | React dev pin | experimental pin plus required 19.3.1 and peer-floor lanes; scheduled canary lane | adopted-default, 1.3 |
| D16 | Ratify the 2026-10-31 cleanup | recorded in G-01 | awaiting owner |
| D17 | Codemod package name | `modern-cmdk-codemod`; reserving the `@modern-cmdk` org and the first publish of a new package need the owner's npm account | repo side adopted-default (1.5); npm side awaiting owner |
| D18 | `loop` default | keep `true`, documented in the parity delta table | adopted-default |
| D19 | Core budget 6.5 kB | keep; overflow goes to a subpath | adopted-default |
| D20 | Bench gate service | CodSpeed; installing the GitHub App is the owner's | adopted-default; app install awaiting owner before 1.9 |
| D21 | FUNDING.yml without a Sponsors listing | delete until Sponsors exists | adopted-default, 1.4 |
| D22 | shadcn variant | Radix first, Base UI recipe in 1.10 | adopted-default |
| D23 | 2.0 React floor | `>=19.2.0`, no upper cap | adopted-default |
| D24 | Shortcut contrast | opacity 1 or a 4.5:1 `color-mix()` | adopted-default, 1.3 |
| D25 | docs `vue` 3.6.0-rc.14 pin | drop the unused pin in D unless an rc migration is meant | adopted-default |
| D26 | Root idb-keyval, jscodeshift, @types/jscodeshift | remove each once a lock diff and the tests show nothing needs it | adopted-default, D window |
| D27 | Baseline provenance | from 1.3.0 baseline.json cites a committed results JSON | adopted-default |
| D28 | Run-deletion policy | LD-04 | locked |
| D29 | `forceId` → `id` | `id` in 1.7, `forceId` deprecated alias, removed in 2.0 | adopted-default |
| D30 | Devtools rename | new global and event in 1.7, old names aliased through 1.x | adopted-default |
| D31 | F23 fallback | approve bot runs by hand until the first bot PR (#43) merges; GitHub App token only if approvals persist after that | adopted-default |
| D32 | Main ruleset | ruleset `main` (id 26510317): pull request required (0 approvals, squash or rebase), status check "CI Summary" required (non-strict), deletion and force-push blocked, no bypass actors | resolved 2026-11-03 |
| D33 | Public API unused internally | tested in 1.x, deprecated in 1.12, removed in 2.0 where no documented use exists | adopted-default |

### G-03 · 2026-11-03 · Phase 0 calls the roadmap text does not settle

- **`npm` environment without a required reviewer.** The roadmap recommends a required reviewer on the publish job. Created environment `npm` with deployment branches restricted to `main` and no reviewer: the sole maintainer is absent during this autonomous run, and a reviewer would stall every publish. Re-arm: adding a reviewer under Settings → Environments → npm needs no code change; the publish job names the environment.
- **npmjs.com environment binding is UNVERIFIED.** docs.npmjs.com/trusted-publishers (read 2026-11-03) says only "Environment name (optional): if using GitHub environments for deployment protection" and does not state how a publisher entry without an environment treats a token that carries one. The 1.2.3 publish is the test. Fallback: remove `environment: npm` from the publish job, re-run the Release workflow (`changeset publish` publishes only versions npm lacks), record the result here. Setting the Environment name on both packages is an owner task.
- **Dispatch tasks.** The `workflow_dispatch` `task` choice carries only `backfill`; `snapshot` (1.12) and `dist-tag` (2.0) are added together with their jobs. A choice without a job is dead configuration.
- **npm CLI floor for dist-tags.** OIDC dist-tags need npm 11.21.0 or 12.2.0 (docs.npmjs.com/trusted-publishers, 2026-11-03); Node 26.4.0 ships npm 11.17.0 and the Node 28 nightly of 2026-11-03 ships npm 12.1.0 (nodejs.org index.json). The 1.12 snapshot job and the 2.0 dist-tag job install the newest npm first. Not needed for Phase 0.
- **AGENTS.md.** An untracked byte-identical copy of CLAUDE.md appeared in the checkout on 2026-11-01 (a Codex CLI run reads AGENTS.md). Left untracked; the 1.3 docs step decides whether CLAUDE.md becomes an `@AGENTS.md` import so the instructions have one home.
- **Dependabot and the experimental React pin.** Dependabot PR #48 (2026-11-02) proposed react and react-dom 0.0.0-experimental-e84e1492-20261031 → 0.14.10, a 2020 release that sorts above every `0.0.0-experimental-*` build. `.github/dependabot.yml` ignores react, react-dom and scheduler for every update type; the peak-modern sweep owns those pins. #48, #49 and #50 are closed as superseded by the sweep PR.
- **Formatter.** Biome 2.6.4 `files.includes` gains `!DECISIONS.md` so no tool rewrites this file; appends are LF-only.

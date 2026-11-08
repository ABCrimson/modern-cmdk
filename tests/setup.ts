// tests/setup.ts
// Vitest 5 setup file — the git-environment scrub, fake-indexeddb, the act() environment, and the one ES2026
// polyfill the supported runtimes still lack (Math.sumPrecise: absent on the Node 26 floor, native on Node 27+).

import 'fake-indexeddb/auto';

// A git hook exports its repository to the processes it runs: git 2.56 sets GIT_DIR for a hook that runs in a linked
// worktree (measured 2026-11-08: a pre-push hook sees GIT_DIR=<repo>/.git/worktrees/<name>; the main checkout exports
// none), and the lefthook pre-push runs this suite. A fixture's `git init`, `add` and `commit` would then operate on
// the real repository instead of the fixture directory (on 2026-11-08 one such run put 23 fixture commits on the branch
// being pushed), so every variable that points git away from the current directory is removed before any test spawns it.
// tests/unit/setup-git-env.test.ts pins this.
for (const name of [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_PREFIX',
  'GIT_NAMESPACE',
  'GIT_IMPLICIT_WORK_TREE',
]) {
  delete process.env[name];
}

declare global {
  // React reads this flag off globalThis to decide whether act() warnings apply.
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

// React act() environment — suppresses "not configured to support act()" warnings.
// The tests drive react-dom/client + act() directly (no @testing-library/react), so
// nothing else sets this flag.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Polyfill Math.sumPrecise where the runtime lacks it (Node 26 floor)
if (typeof Math.sumPrecise !== 'function') {
  Math.sumPrecise = function sumPrecise(values: Iterable<number>): number {
    // Kahan compensated summation for high precision
    let sum = 0;
    let compensation = 0;
    for (const value of values) {
      const y = value - compensation;
      const t = sum + y;
      compensation = t - sum - y;
      sum = t;
    }
    return sum;
  };
}

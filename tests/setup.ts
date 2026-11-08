// tests/setup.ts
// Vitest 5 setup file — the git-environment scrub, fake-indexeddb, the act() environment and its warning guard, and the one ES2026
// polyfill the supported runtimes still lack (Math.sumPrecise: absent on the Node 26 floor, native on Node 27+).

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, vi } from 'vitest';
import { drainActWarnings, noteActWarning } from './act-guard.ts';

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

// The act guard: a test fails on any React act warning. React reports a state update outside act() ("An update to
// %s inside a test was not wrapped in act(...)") and a suspension in a synchronous act scope ("A component suspended
// inside an `act` scope, but the `act` call was not awaited") through console.error, and a test that never reads the
// console passes with the warning. tests/act-guard.ts holds the store. The wrapper below records the act warning of
// each console.error call at the moment it is made and forwards every call; a test that silences console.error uses silenceConsoleError(), whose
// implementation records too, so a spy restored in the test body or by vi.restoreAllMocks() cannot hide a warning.
// The afterEach fails the test with the recorded texts. It fails afterwards, rather than throwing from console.error,
// because React logs from inside its own render and scheduler paths (a throw there is caught by React or surfaces as
// an unhandled error attributed to no test), and it runs after the test file's own hooks (cleanup() included), so a
// warning raised while unmounting counts too. The scan of a still-installed spy's recorded calls below is a fallback
// for a spy made outside silenceConsoleError(). Caveat: React's development build prints "suspended inside an `act`
// scope" once per module instance (react.development.js, didWarnNoAwaitAct), so only the first offending test of a
// file fails on it; the "not wrapped in act" warning is printed for every update outside act().

// The console, held in one binding: biome (noConsole) flags each member access on the global itself
const stderr: Console = console;
const forwardConsoleError: Console['error'] = stderr.error;
stderr.error = function guardedConsoleError(...args: unknown[]): void {
  noteActWarning(args);
  forwardConsoleError.apply(stderr, args);
};

// How many of a spy's recorded calls earlier tests have already been judged on
const judgedCalls = new WeakMap<object, number>();

beforeEach(() => {
  drainActWarnings();
});

afterEach(() => {
  const current: unknown = stderr.error;
  if (vi.isMockFunction(current)) {
    const { calls } = current.mock;
    const judged = judgedCalls.get(current) ?? 0;
    // a mockClear() between tests empties the list: start again from its beginning
    for (const args of calls.slice(judged <= calls.length ? judged : 0)) noteActWarning(args);
    judgedCalls.set(current, calls.length);
  }
  const distinct = drainActWarnings();
  if (distinct.length === 0) return;
  throw new Error(`React act warning during the test:\n\n${distinct.join('\n\n')}`);
});

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

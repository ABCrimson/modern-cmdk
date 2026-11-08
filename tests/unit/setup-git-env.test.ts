// tests/unit/setup-git-env.test.ts
// Pins the git-environment scrub of tests/setup.ts. Under a git hook in a linked worktree the suite inherits GIT_DIR
// (git 2.56, measured 2026-11-08) and every fixture `git` would write to the real repository. This test is red without
// the scrub when run as `GIT_DIR=/nowhere pnpm exec vitest run tests/unit/setup-git-env.test.ts`, and green in a plain
// shell either way, by design: the scrub is what makes the hook case equal to the plain case.
import { describe, expect, it } from 'vitest';

const REDIRECTING =
  /^GIT_(?:DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|PREFIX|NAMESPACE|IMPLICIT_WORK_TREE)$/;

describe('tests/setup.ts scrubs the git environment', () => {
  it('leaves no GIT_* variable that points git away from the current directory', () => {
    expect(Object.keys(process.env).filter((name) => REDIRECTING.test(name))).toEqual([]);
  });
});

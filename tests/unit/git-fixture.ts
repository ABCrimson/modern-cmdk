// Hermetic git for tests that need a real work tree: no system or user config, a fixed identity,
// no signing, no autocrlf. W3-01 and W4-01 import this; in-process tests apply gitEnv with
// vi.stubEnv so the CLI's own git calls see the same environment.

import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The environment that cuts git off from the machine's config: no system config, and a global
 * config that is an empty file inside `dir`. The file is created here (idempotently). Pass a
 * directory outside the work tree under test when the tree must stay free of untracked files.
 */
export function gitEnv(dir: string): Record<string, string> {
  const empty = join(dir, '.gitconfig-empty');
  writeFileSync(empty, '');
  return { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: empty };
}

/**
 * Run git in `cwd` with a fixed identity and no signing or autocrlf; resolves to stdout. Uses the
 * environment a test already applied with vi.stubEnv(gitEnv(...)); otherwise builds gitEnv(cwd).
 */
export function git(cwd: string, args: readonly string[]): Promise<string> {
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  const stubbed =
    process.env.GIT_CONFIG_NOSYSTEM === '1' &&
    process.env.GIT_CONFIG_GLOBAL?.endsWith('.gitconfig-empty') === true;
  const env = stubbed ? process.env : { ...process.env, ...gitEnv(cwd) };
  execFile(
    'git',
    [
      '-c',
      'user.name=fixture',
      '-c',
      'user.email=fixture@example.invalid',
      '-c',
      'commit.gpgsign=false',
      '-c',
      'core.autocrlf=false',
      '-c',
      'init.defaultBranch=main',
      ...args,
    ],
    { cwd, env, encoding: 'utf8', windowsHide: true },
    (error, stdout) => (error === null ? resolve(stdout) : reject(error)),
  );
  return promise;
}

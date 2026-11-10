// tests/unit/consumer-smoke.test.ts
// W1-02: the pure helpers of scripts/consumer-smoke.ts (the consumer matrix harness). The
// harness itself (install, build, serve, browser) is exercised by running it, not here.
// W4-04b: run() must end a timed-out step even when a grandchild holds the stdout pipe, and must
// leave that grandchild dead (a process group kill on POSIX, taskkill /T /F on Windows).
// W4-04c: killTree must also end the served app (spawnServer) and a child that is not a group leader.

import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as setTimeout_ } from 'node:timers/promises';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { CliOptions } from '../../scripts/consumer-smoke.ts';
import {
  buildWorkspaceYaml,
  CORE_COPY_LITERAL,
  compareToBaseline,
  countCoreCopies,
  countHydrationMessages,
  isInstalledPackageJsonPath,
  killTree,
  parseCli,
  parseWorkspaceYaml,
  pnpmUsage,
  resolvePnpmEntry,
  run,
  spawnServer,
  spawnTarget,
  VARIANTS,
} from '../../scripts/consumer-smoke.ts';

/** Whether a process still exists: signal 0 throws ESRCH on POSIX, tasklist filters by pid on Windows. */
function isAlive(pid: number): boolean {
  if (process.platform === 'win32') {
    const listing = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8' });
    return listing.stdout.includes(String(pid));
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
    throw error;
  }
}

/** The options of a run that must parse. */
function runOptions(argv: readonly string[]): CliOptions {
  const parsed = parseCli(argv);
  if (parsed.kind !== 'run') throw new Error(`expected a run, got usage: ${parsed.message}`);
  return parsed.options;
}

/** The exit code of an argv that must be a usage error. */
function usageExit(argv: readonly string[]): number {
  const parsed = parseCli(argv);
  if (parsed.kind !== 'usage') throw new Error('expected a usage error');
  return parsed.exitCode;
}

describe('countHydrationMessages()', () => {
  it('counts the development hydration reports of react-dom (errors and warnings)', () => {
    const messages = [
      {
        type: 'error',
        text: "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client.",
      },
      {
        type: 'error',
        text: "A tree hydrated but some attributes of the server rendered HTML didn't match the client properties.",
      },
      {
        type: 'warning',
        text: 'In HTML, <div> cannot be a child of <p>.\nThis will cause a hydration error.',
      },
      {
        type: 'error',
        text: 'There was an error while hydrating but React was able to recover by instead client rendering the entire root.',
      },
    ];
    expect(countHydrationMessages(messages)).toBe(4);
  });

  it('counts the production reports, which carry only a minified error code', () => {
    const messages = [
      {
        type: 'error',
        text: 'Uncaught Error: Minified React error #418; visit https://react.dev/errors/418',
      },
      { type: 'error', text: 'Minified React error #423; visit https://react.dev/errors/423' },
      { type: 'error', text: 'Minified React error #422; visit https://react.dev/errors/422' },
    ];
    expect(countHydrationMessages(messages)).toBe(3);
  });

  it('counts production hydration errors that arrive as pageerror (window.reportError)', () => {
    expect(
      countHydrationMessages([
        {
          type: 'pageerror',
          text: 'Minified React error #418; visit https://react.dev/errors/418?args[]=HTML&args[]= for the full message or use the non-minified dev environment for full errors and additional helpful warnings.',
        },
        { type: 'pageerror', text: 'TypeError: x is not a function' },
      ]),
    ).toBe(1);
  });

  it('ignores other messages, other levels and other minified codes', () => {
    const messages = [
      { type: 'error', text: 'Failed to load resource: the server responded with a status of 404' },
      { type: 'log', text: 'Hydration failed (a log line is not a report)' },
      { type: 'info', text: 'hydrated' },
      { type: 'error', text: 'Minified React error #299; visit https://react.dev/errors/299' },
      { type: 'error', text: 'Minified React error #4180; not the 418 code' },
    ];
    expect(countHydrationMessages(messages)).toBe(0);
  });
});

describe('compareToBaseline()', () => {
  it('passes only on equality', () => {
    expect(compareToBaseline(3, 3)).toBe('pass');
    expect(compareToBaseline(0, 0)).toBe('pass');
  });

  it("reports 'regression' when the count is higher", () => {
    expect(compareToBaseline(4, 3)).toBe('regression');
    expect(compareToBaseline(1, 0)).toBe('regression');
  });

  it("reports 'lower the baseline' when the count is lower: a ratchet, no silent drift", () => {
    expect(compareToBaseline(2, 3)).toBe('lower the baseline');
    expect(compareToBaseline(0, 1)).toBe('lower the baseline');
  });
});

describe('countCoreCopies()', () => {
  it('sums the occurrences of the literal across files', () => {
    expect(countCoreCopies(['xx LIT yy LIT', 'none', 'LIT'], 'LIT')).toBe(3);
    expect(countCoreCopies([], 'LIT')).toBe(0);
  });
});

describe('CORE_COPY_LITERAL', () => {
  // The consumer jobs count core copies in a client bundle by this string. A rename in the core
  // must fail here, at `pnpm test`, not in CI (TUB-80: the frecency rework renamed the previous
  // marker and every consumer job reported 0 copies).
  const occurrences = (dir: string): number =>
    readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter(
        (entry) => entry.isFile() && /\.tsx?$/.test(entry.name) && !entry.name.includes('.test.'),
      )
      .reduce(
        (total, entry) =>
          total +
          countCoreCopies(
            [readFileSync(join(entry.parentPath, entry.name), 'utf8')],
            CORE_COPY_LITERAL,
          ),
        0,
      );

  it('TUB-80: CORE_COPY_LITERAL occurs exactly once under src/core and never under src/react', () => {
    const src = resolve(import.meta.dirname, '../../packages/modern-cmdk/src');
    expect(occurrences(join(src, 'core'))).toBe(1);
    expect(occurrences(join(src, 'react'))).toBe(0);
  });
});

describe('parseCli()', () => {
  it('defaults to every variant, one expected core copy and no tarball', () => {
    const options = runOptions([]);
    expect(options.variants).toEqual(VARIANTS);
    expect(options.expectCoreCopies).toBe(1);
    expect(options.tarball).toBeUndefined();
    expect(options.keep).toBe(false);
  });

  it('parses every documented flag', () => {
    const options = runOptions([
      '--app',
      'vite',
      '--tarball',
      'x.tgz',
      '--expect-core-copies',
      '2',
      '--report',
      'r.json',
      '--keep',
    ]);
    expect(options.variants).toEqual(['vite']);
    expect(options.tarball).toBe('x.tgz');
    expect(options.expectCoreCopies).toBe(2);
    expect(options.report).toBe('r.json');
    expect(options.keep).toBe(true);
  });

  it('maps every usage error to exit code 2', () => {
    for (const argv of [
      ['--bogus'],
      ['--app', 'nope'],
      ['--app'],
      ['--expect-core-copies', 'two'],
      ['--expect-core-copies', '-1'],
      ['--expect-core-copies', '1.5'],
      ['positional'],
    ]) {
      expect(usageExit(argv), argv.join(' ')).toBe(2);
    }
  });
});

describe('isInstalledPackageJsonPath()', () => {
  it('accepts a posix and a windows path to the installed manifest', () => {
    expect(isInstalledPackageJsonPath('/tmp/app/node_modules/modern-cmdk/package.json\n')).toBe(
      true,
    );
    expect(
      isInstalledPackageJsonPath(
        'C:\\t\\app\\node_modules\\.pnpm\\modern-cmdk@file+x\\node_modules\\modern-cmdk\\package.json\r\n',
      ),
    ).toBe(true);
  });

  it('reads the last non-empty line, so a warning above the path does not matter', () => {
    expect(isInstalledPackageJsonPath('warn\n/a/node_modules/modern-cmdk/package.json\n\n')).toBe(
      true,
    );
  });

  it('rejects empty output, other packages and the root manifest of the app', () => {
    expect(isInstalledPackageJsonPath('')).toBe(false);
    expect(isInstalledPackageJsonPath('/a/node_modules/other/package.json')).toBe(false);
    expect(isInstalledPackageJsonPath('/a/node_modules/xmodern-cmdk/package.json')).toBe(false);
    expect(isInstalledPackageJsonPath('/a/package.json')).toBe(false);
    expect(isInstalledPackageJsonPath('Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: nope')).toBe(false);
  });
});

describe('buildWorkspaceYaml()', () => {
  it('RDG-119: buildWorkspaceYaml lists each minimumReleaseAgeExclude entry once', () => {
    const yaml = buildWorkspaceYaml(
      { minimumReleaseAgeExclude: ['a@1.0.0', 'next@1.0.0-canary.1'] },
      [
        { spec: 'next@1.0.0-canary.1', reason: 'repeated from the root' },
        { spec: 'b@2.0.0', reason: 'app only' },
        { spec: 'b@2.0.0', reason: 'repeated in the app file' },
      ],
    );
    expect(parseWorkspaceYaml(yaml).minimumReleaseAgeExclude).toEqual([
      'a@1.0.0',
      'next@1.0.0-canary.1',
      'b@2.0.0',
    ]);
  });
});

describe('run()', () => {
  it('a timeout ends the step even when a grandchild holds the pipes, and the grandchild dies', async () => {
    // The child prints its grandchild's pid, then both sleep; the grandchild inherits the pipes, so
    // only a kill of the whole process group (POSIX) or tree (Windows) lets the step end.
    const script = [
      "const { spawn } = require('node:child_process');",
      "const grandchild = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'inherit' });",
      'console.log("GRANDCHILD=" + grandchild.pid);',
      'setTimeout(() => {}, 30000);',
    ].join(' ');
    const started = performance.now();
    const result = await run(process.execPath, ['-e', script], {
      cwd: tmpdir(),
      timeoutMs: 1500,
    });
    const elapsed = performance.now() - started;
    expect(result.timedOut).toBe(true);
    expect(elapsed).toBeLessThan(1500 + 5000);
    const pid = Number(/GRANDCHILD=(\d+)/.exec(result.output)?.[1]);
    expect(Number.isInteger(pid) && pid > 0).toBe(true);
    // The kill is delivered before 'close' resolves; allow the OS a moment to reap the process.
    const deadline = performance.now() + 5000;
    while (isAlive(pid) && performance.now() < deadline) await setTimeout_(50);
    expect(isAlive(pid)).toBe(false);
  }, 20_000);
});

describe('killTree()', () => {
  /** Waits for the child to disappear; a survivor is killed so it cannot outlive the test. */
  async function ended(child: ChildProcess, pid: number): Promise<boolean> {
    const deadline = performance.now() + 5000;
    while (isAlive(pid) && performance.now() < deadline) await setTimeout_(50);
    const gone = !isAlive(pid);
    if (!gone) child.kill('SIGKILL');
    return gone;
  }

  it('ends the served app spawned by spawnServer', async () => {
    const child = spawnServer(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], {
      cwd: tmpdir(),
    });
    const pid = child.pid as number;
    expect(Number.isInteger(pid) && pid > 0).toBe(true);
    killTree(child);
    expect(await ended(child, pid)).toBe(true);
  }, 20_000);

  it('ends a child that is not a process group leader (the POSIX ESRCH fallback)', async () => {
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], {
      cwd: tmpdir(),
      stdio: 'ignore',
      windowsHide: true,
    });
    const pid = child.pid as number;
    expect(Number.isInteger(pid) && pid > 0).toBe(true);
    killTree(child);
    expect(await ended(child, pid)).toBe(true);
  }, 20_000);

  it('does nothing for a child that already exited', async () => {
    const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore', windowsHide: true });
    await new Promise<void>((resolveClose) => child.once('close', () => resolveClose()));
    expect(() => killTree(child)).not.toThrow();
  }, 20_000);
});

// SEC-70: pnpm is spawned without a shell (CodeQL js/shell-command-injection-from-environment).
describe('resolvePnpmEntry()', () => {
  const node = '/opt/node/bin/node';

  it('spawns an executable npm_execpath directly, with no leading argument', () => {
    expect(
      resolvePnpmEntry({ npm_execpath: 'C:/Users/me/.local/share/pnpm-12.19.0/pnpm.exe' }, node),
    ).toEqual({ file: 'C:/Users/me/.local/share/pnpm-12.19.0/pnpm.exe', leading: [] });
    expect(resolvePnpmEntry({ npm_execpath: '/usr/local/bin/pnpm' }, node)).toEqual({
      file: '/usr/local/bin/pnpm',
      leading: [],
    });
  });

  it('runs a .cjs, .mjs or .js entry through the given Node with the entry first', () => {
    for (const entry of ['/p/node_modules/pnpm/bin/pnpm.cjs', 'C:/p/bin/pnpm.mjs', '/p/pnpm.js']) {
      expect(resolvePnpmEntry({ npm_execpath: entry }, node)).toEqual({
        file: node,
        leading: [entry],
      });
    }
  });

  it('is undefined outside pnpm: absent, empty, or another tool', () => {
    expect(resolvePnpmEntry({}, node)).toBeUndefined();
    expect(resolvePnpmEntry({ npm_execpath: '' }, node)).toBeUndefined();
    expect(
      resolvePnpmEntry({ npm_execpath: '/usr/lib/node_modules/npm/bin/npm-cli.js' }, node),
    ).toBeUndefined();
  });
});

describe('spawnTarget()', () => {
  it('leaves every command but pnpm unchanged', () => {
    expect(spawnTarget('node', ['-v'], {})).toEqual({ file: 'node', args: ['-v'] });
  });

  it('maps pnpm to the executable with the arguments unchanged, never to a shell', () => {
    const args = ['install', '--dir', 'C:/a b/&calc'];
    const target = spawnTarget('pnpm', args, { npm_execpath: '/x/pnpm.exe' });
    expect(target).toEqual({ file: '/x/pnpm.exe', args });
  });

  it('maps pnpm to process.execPath with the .cjs entry first', () => {
    const target = spawnTarget('pnpm', ['install'], { npm_execpath: '/x/bin/pnpm.cjs' });
    expect(target).toEqual({ file: process.execPath, args: ['/x/bin/pnpm.cjs', 'install'] });
  });

  it('throws outside pnpm', () => {
    expect(() => spawnTarget('pnpm', ['install'], {})).toThrow(/npm_execpath/);
  });
});

describe('run() spawning pnpm', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'consumer-smoke-pnpm-'));
  const dump = 'console.log(JSON.stringify(process.argv.slice(1)))';

  afterAll((): void => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it('passes the arguments unchanged to an executable npm_execpath', async () => {
    // A copy of this Node named like pnpm's standalone executable: an executable, not a script.
    const exe = join(scratch, process.platform === 'win32' ? 'pnpm.exe' : 'pnpm');
    copyFileSync(process.execPath, exe);
    vi.stubEnv('npm_execpath', exe);
    try {
      const args = ['x y', '&calc', '"q"', 'C:/a b/c'];
      const result = await run('pnpm', ['-e', dump, ...args], { cwd: scratch, timeoutMs: 20_000 });
      expect(result.code).toBe(0);
      expect(JSON.parse(result.output.trim())).toEqual(args);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('runs a .cjs npm_execpath through process.execPath with the entry first', async () => {
    const entry = join(scratch, 'pnpm.cjs');
    writeFileSync(entry, `console.log(JSON.stringify(process.argv.slice(2)))\n`);
    vi.stubEnv('npm_execpath', entry);
    try {
      const result = await run('pnpm', ['install', '--x'], { cwd: scratch, timeoutMs: 20_000 });
      expect(result.code).toBe(0);
      expect(JSON.parse(result.output.trim())).toEqual(['install', '--x']);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('consumer-smoke outside pnpm', () => {
  const script = resolve(import.meta.dirname, '../../scripts/consumer-smoke.ts');

  it('exits 2 and names the pnpm script when npm_execpath is absent', () => {
    // Windows keeps the variable's original casing in a copy of process.env, so filter by lowercase name.
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([name]) => name.toLowerCase() !== 'npm_execpath'),
    );
    const result = spawnSync(process.execPath, [script], { env, encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stderr).toBe(pnpmUsage('consumer-smoke', 'test:consumers'));
    expect(result.stderr).toContain('pnpm test:consumers');
  });

  it('has no shell spawn left in the source', () => {
    const source = readFileSync(script, 'utf8');
    expect(source).not.toMatch(/cmd\.exe/i);
    expect(source).not.toMatch(/['"]\/d['"]\s*,\s*['"]\/c['"]/);
  });
});

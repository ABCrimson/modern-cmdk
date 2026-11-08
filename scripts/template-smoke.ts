// scripts/template-smoke.ts
// The template gate (roadmap 1.5.0 exit: "every template installs, passes tsc, builds in CI"): each
// create-modern-cmdk template is scaffolded by the PACKED create bin, installed against the PACKED
// modern-cmdk tarball, type-checked and built. Runs with Node's native type stripping:
//
//   node scripts/template-smoke.ts --pack-dir <dir> [--template react-basic|react-dialog|react-full|all] [--keep]
//
// <dir> holds exactly one create-modern-cmdk-[0-9]*.tgz and one modern-cmdk-[0-9]*.tgz (for example
// `pnpm --filter modern-cmdk --filter create-modern-cmdk pack --pack-destination <dir>`).
// Exit codes: 0 = every template passed, 1 = a template failed, 2 = usage error.
//
// Per template:
//   1. the create tarball is unpacked once into a temp dir with listTarEntries (scripts/check-package.ts;
//      never a host tar);
//   2. `node <unpacked>/package/dist/index.mjs <T>/app --template=<t>` must exit 0; react-full must print
//      its deprecation line and scaffold the same files as react-basic;
//   3. dependencies['modern-cmdk'] of the scaffolded package.json becomes file:<tarball> and a
//      pnpm-workspace.yaml is written: packages ['.'] plus the supply-chain keys of the repository root, read
//      now, including its minimumReleaseAgeExclude list; never overrides, and never an exclude of its own. A
//      template pin younger than minimumReleaseAge fails the install unless the root excludes it;
//   4. pnpm install, pnpm run typecheck, pnpm run build (each with a hard timeout, no retry);
//   5. dist/index.html exists and a built .css asset contains [data-command-root] (CV-73 end to end).
//
// The temp app lives outside the repository. If the scaffold ever writes a packageManager field, the
// run says so: pnpm would then switch to that version (host fact pnpm-self-switch).

import type { ChildProcess } from 'node:child_process';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { listTarEntries } from './check-package.ts';
import {
  buildWorkspaceYaml,
  parseWorkspaceYaml,
  pnpmUsage,
  resolvePnpmEntry,
  spawnTarget,
} from './consumer-smoke.ts';

export const TEMPLATES: readonly ['react-basic', 'react-dialog', 'react-full'] = [
  'react-basic',
  'react-dialog',
  'react-full',
];
export type Template = (typeof TEMPLATES)[number];

export interface CliOptions {
  readonly packDir: string;
  readonly templates: readonly Template[];
  readonly keep: boolean;
}

export type ParsedCli =
  | { readonly kind: 'run'; readonly options: CliOptions }
  | { readonly kind: 'usage'; readonly message: string; readonly exitCode: 2 };

export interface Tarballs {
  readonly create: string;
  readonly cmdk: string;
}

const CREATE_TARBALL = /^create-modern-cmdk-[0-9].*\.tgz$/;
const CMDK_TARBALL = /^modern-cmdk-[0-9].*\.tgz$/;

const SCAFFOLD_TIMEOUT_MS = 60_000;
const INSTALL_TIMEOUT_MS = 600_000;
const TSC_TIMEOUT_MS = 300_000;
const BUILD_TIMEOUT_MS = 300_000;
const TAIL_LINES = 40;
const DEPRECATION_LINE = 'react-full template is a deprecated alias of react-basic';

/** Parses argv strictly; every usage error carries exit code 2. */
export function parseCli(argv: readonly string[]): ParsedCli {
  let values: {
    'pack-dir'?: string | undefined;
    template?: string | undefined;
    keep?: boolean | undefined;
  };
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: {
        'pack-dir': { type: 'string' },
        template: { type: 'string' },
        keep: { type: 'boolean' },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    return usage(error instanceof Error ? error.message : String(error));
  }
  const packDir = values['pack-dir'];
  if (packDir === undefined || packDir === '') return usage('--pack-dir <dir> is required');
  const requested = values.template ?? 'all';
  let templates: readonly Template[];
  if (requested === 'all') {
    templates = TEMPLATES;
  } else if ((TEMPLATES as readonly string[]).includes(requested)) {
    templates = [requested as Template];
  } else {
    return usage(`--template must be one of ${TEMPLATES.join(', ')}, all; got '${requested}'`);
  }
  return {
    kind: 'run',
    options: { packDir: resolve(packDir), templates, keep: values.keep === true },
  };
}

function usage(message: string): ParsedCli {
  return { kind: 'usage', message, exitCode: 2 };
}

/** The create and modern-cmdk tarballs of a directory; anything but exactly one of each throws. */
export function discoverTarballs(dir: string): Tarballs {
  const names = readdirSync(dir);
  const create = names.filter((name: string): boolean => CREATE_TARBALL.test(name));
  const cmdk = names.filter((name: string): boolean => CMDK_TARBALL.test(name));
  if (create.length !== 1 || cmdk.length !== 1) {
    throw new Error(
      `${dir} must hold exactly one create-modern-cmdk-[0-9]*.tgz and exactly one modern-cmdk-[0-9]*.tgz; found create: [${create.join(', ')}], modern-cmdk: [${cmdk.join(', ')}]`,
    );
  }
  return { create: join(dir, create[0] as string), cmdk: join(dir, cmdk[0] as string) };
}

/** A copy of the manifest with dependencies['modern-cmdk'] = file:<abs tarball>; nothing else changes. */
export function rewriteDependency<
  T extends { readonly dependencies?: Readonly<Record<string, string>> },
>(pkgJson: T, tarball: string): T & { readonly dependencies: Readonly<Record<string, string>> } {
  return {
    ...structuredClone(pkgJson),
    dependencies: { ...pkgJson.dependencies, 'modern-cmdk': `file:${resolve(tarball)}` },
  };
}

/**
 * The temp app's pnpm-workspace.yaml: packages ['.'] and the root's supply-chain keys (its whole
 * minimumReleaseAgeExclude list included), no overrides and no exclude of its own.
 */
export function buildTempWorkspaceYaml(rootYamlText: string): string {
  return buildWorkspaceYaml(parseWorkspaceYaml(rootYamlText), []).replace(
    /^# Written by scripts\/consumer-smoke\.ts:/,
    '# Written by scripts/template-smoke.ts (buildWorkspaceYaml of scripts/consumer-smoke.ts):',
  );
}

// --- process helpers --------------------------------------------------------------------------

const ROOT: string = resolve(import.meta.dirname, '..');
const IS_WINDOWS: boolean = process.platform === 'win32';

export interface RunResult {
  readonly code: number | null;
  readonly timedOut: boolean;
  readonly output: string;
}

class StepError extends Error {}

function tail(output: string): string {
  return output.split(/\r?\n/).slice(-TAIL_LINES).join('\n');
}

export function killTree(child: ChildProcess): void {
  if (child.pid === undefined) return;
  if (IS_WINDOWS) {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      timeout: 30_000,
    });
    return;
  }
  // A detached child leads its own process group, so -pid reaches grandchildren holding the pipes.
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    // ESRCH means no such group: either the child is gone (nothing to kill) or it is alive but not
    // a group leader, and then only the direct child can be killed.
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
}

/** Runs a command to completion with a hard timeout; output is captured, never streamed. */
export function run(
  command: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly timeoutMs: number },
): Promise<RunResult> {
  return new Promise<RunResult>((resolvePromise: (value: RunResult) => void): void => {
    // No shell: 'pnpm' becomes the entry npm_execpath names (resolvePnpmEntry in consumer-smoke.ts),
    // spawned directly or through this Node, so no argument is re-parsed by a shell.
    const target = spawnTarget(command, args);
    const child = spawn(target.file, [...target.args], {
      cwd: options.cwd,
      env: { ...process.env, CI: '1' },
      windowsHide: true,
      detached: !IS_WINDOWS,
    });
    let output = '';
    let timedOut = false;
    const collect = (chunk: Buffer): void => {
      output += chunk.toString('utf8');
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const timer = setTimeout((): void => {
      timedOut = true;
      killTree(child);
    }, options.timeoutMs);
    child.on('error', (error: Error): void => {
      clearTimeout(timer);
      resolvePromise({ code: null, timedOut, output: `${output}\n${error.message}` });
    });
    child.on('close', (code: number | null): void => {
      clearTimeout(timer);
      resolvePromise({ code, timedOut, output });
    });
  });
}

/** One step: seconds on success, a StepError carrying the output tail on a timeout or a non-zero exit. */
async function runStep(
  label: string,
  command: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly timeoutMs: number },
): Promise<{ readonly seconds: number; readonly output: string }> {
  const started = performance.now();
  process.stdout.write(`  ${label} ...\n`);
  const result = await run(command, args, options);
  const seconds = (performance.now() - started) / 1000;
  if (result.timedOut) {
    throw new StepError(
      `${label} timed out after ${options.timeoutMs / 1000} s\n${tail(result.output)}`,
    );
  }
  if (result.code !== 0) {
    throw new StepError(`${label} exited with ${result.code}\n${tail(result.output)}`);
  }
  return { seconds, output: result.output };
}

// --- the harness ------------------------------------------------------------------------------

/** Every file under a directory as relative-path -> content, for comparing two scaffolds. */
async function snapshot(dir: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files.set(relative(dir, path).replaceAll('\\', '/'), await readFile(path, 'utf8'));
  }
  return files;
}

async function unpackCreate(tarball: string, into: string): Promise<string> {
  for (const entry of listTarEntries(await readFile(tarball))) {
    const target = join(into, entry.name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, entry.data);
  }
  const bin = join(into, 'package', 'dist', 'index.mjs');
  if (!existsSync(bin)) throw new StepError(`${tarball} has no package/dist/index.mjs`);
  return bin;
}

interface TemplateResult {
  readonly template: Template;
  readonly installSeconds: number;
  readonly tscSeconds: number;
  readonly buildSeconds: number;
}

async function scaffold(bin: string, template: Template, dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  const { output } = await runStep(
    `scaffold ${template}`,
    process.execPath,
    [bin, 'app', `--template=${template}`],
    {
      cwd: dir,
      timeoutMs: SCAFFOLD_TIMEOUT_MS,
    },
  );
  return output;
}

async function smokeTemplate(
  template: Template,
  bin: string,
  cmdkTarball: string,
  workspaceYaml: string,
  workDir: string,
): Promise<TemplateResult> {
  const base = join(workDir, template);
  const app = join(base, 'app');
  const output = await scaffold(bin, template, base);
  if (template === 'react-full') {
    if (!output.includes(DEPRECATION_LINE)) {
      throw new StepError(
        `react-full did not print its deprecation line ('${DEPRECATION_LINE}')\n${tail(output)}`,
      );
    }
    const basicBase = join(workDir, 'react-basic-reference');
    await scaffold(bin, 'react-basic', basicBase);
    const [full, basic] = await Promise.all([snapshot(app), snapshot(join(basicBase, 'app'))]);
    const differing = [...new Set([...full.keys(), ...basic.keys()])].filter(
      (name: string): boolean => full.get(name) !== basic.get(name),
    );
    if (differing.length > 0) {
      throw new StepError(`react-full differs from react-basic in: ${differing.join(', ')}`);
    }
  }

  const manifestPath = join(app, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    readonly dependencies?: Record<string, string>;
    readonly packageManager?: string;
  };
  if (manifest.packageManager !== undefined) {
    process.stdout.write(
      `  NOTE: the scaffold wrote packageManager '${manifest.packageManager}'; pnpm will switch to that version (host fact pnpm-self-switch)\n`,
    );
  }
  await writeFile(
    manifestPath,
    `${JSON.stringify(rewriteDependency(manifest, cmdkTarball), null, 2)}\n`,
  );
  await writeFile(join(app, 'pnpm-workspace.yaml'), workspaceYaml);

  let installSeconds: number;
  try {
    ({ seconds: installSeconds } = await runStep(
      `pnpm install (${template})`,
      'pnpm',
      ['install'],
      {
        cwd: app,
        timeoutMs: INSTALL_TIMEOUT_MS,
      },
    ));
  } catch (error) {
    if (
      error instanceof StepError &&
      /minimumReleaseAge|NO_MATURE_MATCHING_VERSION|too recent/i.test(error.message)
    ) {
      throw new StepError(
        `${error.message}\n  hint: a template pin may be younger than minimumReleaseAge and absent from the root minimumReleaseAgeExclude; this script adds no exclude of its own, so fix the pin or wait`,
      );
    }
    throw error;
  }
  const { seconds: tscSeconds } = await runStep(
    `pnpm run typecheck (${template})`,
    'pnpm',
    ['run', 'typecheck'],
    {
      cwd: app,
      timeoutMs: TSC_TIMEOUT_MS,
    },
  );
  const { seconds: buildSeconds } = await runStep(
    `pnpm run build (${template})`,
    'pnpm',
    ['run', 'build'],
    {
      cwd: app,
      timeoutMs: BUILD_TIMEOUT_MS,
    },
  );

  if (!existsSync(join(app, 'dist', 'index.html')))
    throw new StepError('build produced no dist/index.html');
  const assets = join(app, 'dist', 'assets');
  const cssFiles = existsSync(assets)
    ? (await readdir(assets)).filter((name: string): boolean => name.endsWith('.css'))
    : [];
  const cssTexts = await Promise.all(
    cssFiles.map((name: string): Promise<string> => readFile(join(assets, name), 'utf8')),
  );
  if (!cssTexts.some((text: string): boolean => text.includes('[data-command-root]'))) {
    throw new StepError(
      `no built .css asset in dist/assets contains [data-command-root] (found: ${cssFiles.join(', ') || 'no .css files'})`,
    );
  }
  return { template, installSeconds, tscSeconds, buildSeconds };
}

async function main(argv: readonly string[]): Promise<number> {
  if (resolvePnpmEntry(process.env) === undefined) {
    process.stderr.write(pnpmUsage('template-smoke', 'test:templates'));
    return 2;
  }
  const parsed = parseCli(argv);
  if (parsed.kind === 'usage') {
    process.stderr.write(
      `template-smoke: ${parsed.message}\nusage: node scripts/template-smoke.ts --pack-dir <dir> [--template react-basic|react-dialog|react-full|all] [--keep]\n`,
    );
    return parsed.exitCode;
  }
  const { options } = parsed;
  let tarballs: Tarballs;
  try {
    tarballs = discoverTarballs(options.packDir);
  } catch (error) {
    process.stderr.write(
      `template-smoke: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 2;
  }

  const workDir = await mkdtemp(join(tmpdir(), 'modern-cmdk-template-smoke-'));
  const results: TemplateResult[] = [];
  const failures: string[] = [];
  try {
    const workspaceYaml = buildTempWorkspaceYaml(
      await readFile(join(ROOT, 'pnpm-workspace.yaml'), 'utf8'),
    );
    const bin = await unpackCreate(tarballs.create, join(workDir, 'create'));
    for (const template of options.templates) {
      process.stdout.write(`template ${template}\n`);
      try {
        results.push(await smokeTemplate(template, bin, tarballs.cmdk, workspaceYaml, workDir));
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        failures.push(`${template}: ${text}`);
        process.stdout.write(`  FAIL ${template}\n`);
      }
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    if (options.keep) process.stdout.write(`kept ${workDir}\n`);
    else await rm(workDir, { recursive: true, force: true });
  }

  process.stdout.write('\nTemplate smoke report (seconds)\n');
  for (const result of results) {
    process.stdout.write(
      `  ${result.template.padEnd(13)} install ${result.installSeconds.toFixed(1)}  tsc ${result.tscSeconds.toFixed(1)}  build ${result.buildSeconds.toFixed(1)}\n`,
    );
  }
  for (const failure of failures)
    process.stdout.write(`\nFAILED ${failure.split('\n').join('\n    ')}\n`);
  process.stdout.write(failures.length > 0 ? '\nFAIL\n' : '\nPASS\n');
  return failures.length > 0 ? 1 : 0;
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2));
}

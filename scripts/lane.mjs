#!/usr/bin/env node
// Dependency lane for the non-blocking scheduled workflow (.github/workflows/lanes.yml) and the
// required React peer lanes. Rewrites the `overrides:` block of pnpm-workspace.yaml for one lane,
// then runs `pnpm install --no-frozen-lockfile --ignore-scripts` and prints the resolved versions.
//
//   node scripts/lane.mjs <lane> [--local]
//
// Lanes: react-stable | react-floor | react-canary | ts-latest | ts-rc
//
// The script mutates the working tree (pnpm-workspace.yaml, pnpm-lock.yaml, node_modules) and never
// commits. It refuses to run unless CI is set; --local lifts that guard for a throwaway worktree.
// The minimum-release-age policy committed in pnpm-workspace.yaml is not edited: the install
// overrides it for that one command with `--config.minimumReleaseAge=0` (pnpm CLI form of the
// `minimumReleaseAge` setting, pnpm.io/settings/dependency-resolution), because a registry
// dist-tag can point at a release younger than the committed one-day window.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LANES = ['react-stable', 'react-floor', 'react-canary', 'ts-latest', 'ts-rc'];
// Peer floors declared in packages/modern-cmdk/package.json (react, react-dom, radix-ui).
const FLOOR = { react: '19.0.0', 'react-dom': '19.0.0', 'radix-ui': '1.4.0' };

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceFile = join(root, 'pnpm-workspace.yaml');

/** @param {string} line */
function out(line) {
  process.stdout.write(`${line}\n`);
}

/** @param {string} message */
function fail(message) {
  process.stderr.write(`lane: ${message}\n`);
  process.exit(1);
}

/**
 * @param {string[]} args
 * @param {boolean} capture
 * @returns {import('node:child_process').SpawnSyncReturns<string>}
 */
function pnpm(args, capture) {
  // pnpm is pnpm.cmd on Windows, which Node only starts through a shell. Every argument here is a
  // fixed flag or a registry package name without spaces, so one joined command string is safe and
  // avoids the DEP0190 args-with-shell deprecation.
  const options = {
    cwd: root,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  };
  const result =
    process.platform === 'win32'
      ? spawnSync(['pnpm', ...args].join(' '), { ...options, shell: true })
      : spawnSync('pnpm', args, options);
  if (result.error) fail(`could not start pnpm: ${result.error.message}`);
  return result;
}

/**
 * Returns the dist-tags of one package straight from the registry.
 * @param {string} name
 * @returns {Record<string, string>}
 */
function distTags(name) {
  const result = pnpm(['view', name, 'dist-tags', '--json'], true);
  if (result.status !== 0) fail(`pnpm view ${name} dist-tags failed (exit ${result.status})`);
  return JSON.parse(result.stdout);
}

/** @param {Record<string, string>} tags @param {string} tag @param {string} name */
function tagVersion(tags, tag, name) {
  const version = tags[tag];
  if (!version) fail(`${name} has no "${tag}" dist-tag`);
  return version;
}

/** Numeric major.minor.patch of a version, prerelease suffix dropped. */
function core(version) {
  return version.split(/[-+]/)[0].split('.').map(Number);
}

/** True when `a` sorts before or equal to `b` on major.minor.patch alone. */
function coreAtMost(a, b) {
  const x = core(a);
  const y = core(b);
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] < y[i];
  }
  return true;
}

/**
 * Overrides for a lane, or `skip` with the reason when the lane has nothing to test today.
 * @param {string} lane
 * @returns {{ overrides: Record<string, string> } | { skip: string }}
 */
function resolveLane(lane) {
  switch (lane) {
    case 'react-stable': {
      const version = tagVersion(distTags('react'), 'latest', 'react');
      return { overrides: { react: version, 'react-dom': version } };
    }
    case 'react-canary': {
      const version = tagVersion(distTags('react'), 'canary', 'react');
      return { overrides: { react: version, 'react-dom': version } };
    }
    case 'react-floor':
      return { overrides: { ...FLOOR } };
    case 'ts-latest':
      return {
        overrides: { typescript: tagVersion(distTags('typescript'), 'latest', 'typescript') },
      };
    case 'ts-rc': {
      const tags = distTags('typescript');
      const latest = tagVersion(tags, 'latest', 'typescript');
      const rc = tagVersion(tags, 'rc', 'typescript');
      if (coreAtMost(rc, latest)) {
        return { skip: `typescript rc tag ${rc} is not newer than latest ${latest}` };
      }
      return { overrides: { typescript: rc } };
    }
    default:
      return fail(`unknown lane "${lane}" (lanes: ${LANES.join(', ')})`);
  }
}

/**
 * Replaces or appends `key: value` entries inside the top-level `overrides:` block, leaving every
 * other line and every other override untouched.
 * @param {string} source
 * @param {Record<string, string>} overrides
 */
function rewriteOverrides(source, overrides) {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => /^overrides:\s*$/.test(line));
  if (start === -1) fail('pnpm-workspace.yaml has no top-level "overrides:" block');
  let end = start + 1;
  while (end < lines.length && /^[ \t]+\S/.test(lines[end])) end++;
  const block = lines.slice(start + 1, end);
  const pending = new Map(Object.entries(overrides));
  const next = block.map((line) => {
    const match = /^([ \t]+)(['"]?)([^'":\s]+)\2:\s/.exec(line);
    if (!match || !pending.has(match[3])) return line;
    const value = pending.get(match[3]);
    pending.delete(match[3]);
    return `${match[1]}${match[2]}${match[3]}${match[2]}: ${value}`;
  });
  for (const [name, value] of pending) next.push(`  ${name}: ${value}`);
  lines.splice(start + 1, end - start - 1, ...next);
  return lines.join('\n');
}

/** Installed version of a package as the workspace resolves it, or "not installed". */
function installed(name) {
  for (const base of [root, join(root, 'packages', 'modern-cmdk')]) {
    const manifest = join(base, 'node_modules', name, 'package.json');
    if (existsSync(manifest)) return JSON.parse(readFileSync(manifest, 'utf8')).version;
  }
  return 'not installed';
}

const args = process.argv.slice(2);
const local = args.includes('--local');
const lane = args.find((arg) => !arg.startsWith('--'));
const unknownFlag = args.find((arg) => arg.startsWith('--') && arg !== '--local');
if (!lane || unknownFlag) {
  fail(`usage: node scripts/lane.mjs <${LANES.join('|')}> [--local]`);
}

out(`lane: ${lane}`);
out(`lane: directory ${root}`);
if (!process.env.CI && !local) {
  fail(
    'refusing to run: this script rewrites pnpm-workspace.yaml and reinstalls node_modules. Set CI or pass --local (use a throwaway worktree).',
  );
}

const resolved = resolveLane(lane);
if ('skip' in resolved) {
  out(`lane: skipped, ${resolved.skip}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'skipped=true\n');
  process.exit(0);
}

writeFileSync(
  workspaceFile,
  rewriteOverrides(readFileSync(workspaceFile, 'utf8'), resolved.overrides),
);
for (const [name, version] of Object.entries(resolved.overrides))
  out(`lane: override ${name} = ${version}`);

const install = pnpm(
  ['install', '--no-frozen-lockfile', '--ignore-scripts', '--config.minimumReleaseAge=0'],
  false,
);
if (install.status !== 0) fail(`pnpm install failed (exit ${install.status})`);

for (const name of ['react', 'react-dom', 'radix-ui', 'typescript']) {
  out(`lane: resolved ${name} ${installed(name)}`);
}
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'skipped=false\n');

// tests/unit/release-workflow.test.ts
// D62 (W4-05): .github/workflows/release.yml learns the third published package, modern-cmdk-codemod.
// Regex over the YAML as pnpm-catalog.test.ts does: no YAML parser is a dependency of the workspace.
// Jobs sit at two-space indentation under `jobs:`; a job block runs to the next job key or job-level comment.

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const workflow = readFileSync(resolve(root, '.github/workflows/release.yml'), 'utf8');

/** The lines of one job (its key line included) up to the next two-space-indented key or comment. */
function job(name: string): string {
  const lines = workflow.split(/\r?\n/);
  const start = lines.indexOf(`  ${name}:`);
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}(#|[a-z][\w-]*:)/.test(lines[i] ?? '')) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

/** The lines of one step of a job: from `- name: <name>` to the next step or the end of the job. */
function step(block: string, name: string): string {
  const lines = block.split('\n');
  const start = lines.indexOf(`      - name: ${name}`);
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {6}(- |# )/.test(lines[i] ?? '')) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

/** Names of the non-private packages/<dir>/package.json manifests. */
function publishedPackages(): string[] {
  return readdirSync(resolve(root, 'packages'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map(
      (d) =>
        JSON.parse(readFileSync(resolve(root, 'packages', d.name, 'package.json'), 'utf8')) as {
          name: string;
          private?: boolean;
        },
    )
    .filter((m) => m.private !== true)
    .map((m) => m.name)
    .sort();
}

describe('release.yml attest job (PKG-1, D62)', () => {
  const attest = job('attest');
  // An npm package name has no underscore; the step output key is the name with hyphens turned into underscores.
  const keyOf = (name: string): string => name.replaceAll('-', '_');

  it('PKG-1: the pack-layout case maps every non-private packages/*/package.json', () => {
    const names = publishedPackages();
    expect(names).toContain('modern-cmdk-codemod');
    for (const name of names) {
      expect(attest, name).toContain(`              ${name}) key=${keyOf(name)} ;;`);
    }
    const cases = [...attest.matchAll(/^ {14}([\w-]+)\) key=\w+ ;;$/gm)].map((m) => m[1]);
    expect(cases.sort()).toEqual(names);
  });

  it('PKG-1: every mapped package has an SBOM step and an SBOM-attestation step, each guarded by its key', () => {
    for (const name of publishedPackages()) {
      const key = keyOf(name);
      const guard = `        if: steps.tarballs.outputs.${key} != ''`;
      const sbom = step(attest, `SBOM for ${name}`);
      expect(sbom, `SBOM for ${name}`).toContain(guard);
      expect(sbom).toContain(`path: sbom-src/${key}`);
      expect(sbom).toContain(`output-file: sbom/${name}.spdx.json`);
      const attestation = step(attest, `SBOM attestation for ${name}`);
      expect(attestation, `SBOM attestation for ${name}`).toContain(guard);
      expect(attestation).toContain(`subject-path: \${{ steps.tarballs.outputs.${key} }}`);
      expect(attestation).toContain(`sbom-path: sbom/${name}.spdx.json`);
    }
  });

  it('D62: attest refuses a never-published package', () => {
    const layout = step(attest, 'Check the pack layout and unpack for the SBOM scan');
    expect(layout).toContain('npm view "$name" version');
    expect(layout).toMatch(/grep -q 'E404'/);
    expect(layout).toContain(
      '::error::first publish of $name is owner-gated (D62); publish it by hand first',
    );
    // The refusal sits before the digest check and before any output is written for the package.
    expect(layout.indexOf('npm view "$name" version')).toBeLessThan(
      layout.indexOf('actual="sha256-'),
    );
    // Any other npm error fails the job as well.
    expect(layout).toMatch(/::error::npm view \$name failed/);
  });

  it('D62: no continue-on-error and no `|| true` anywhere in the workflow', () => {
    expect(workflow).not.toMatch(/continue-on-error/);
    expect(workflow).not.toMatch(/\|\| true/);
  });
});

describe('release.yml first-publish-tarball job (D62)', () => {
  const block = job('first-publish-tarball');

  it('D62: first-publish-tarball runs only in version mode, holds contents read alone (no id-token, no attestations) and no npm credential', () => {
    expect(block).not.toBe('');
    expect(block).toContain("    if: needs.select-mode.outputs.mode == 'version'");
    expect(block).toContain('    needs: [select-mode, version]');
    const perms = block.match(/^ {4}permissions:\n((?: {6}.*\n)+)/m)?.[1] ?? '';
    const granted = [...perms.matchAll(/^ {6}([\w-]+): (\w+)/gm)].map((m) => `${m[1]}:${m[2]}`);
    expect(granted).toEqual(['contents:read']);
    expect(block).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN|registry-url|secrets\./);
    expect(block).not.toMatch(/cache:/);
    expect(block).not.toMatch(/npm publish|changeset publish/);
    expect(block).toContain('persist-credentials: false');
    expect(block).toContain('fetch-depth: 0');
    expect(block).toContain('ref: changeset-release/main');
    expect(block).toContain('git merge-base origin/main HEAD');
    expect(block).toContain(
      '^(packages/[^/]+/(package\\.json|CHANGELOG\\.md)|\\.changeset/[^/]+\\.md|pnpm-lock\\.yaml)$',
    );
    expect(block).toContain('git diff --quiet "$base" HEAD -- pnpm-lock.yaml');
    expect(block).toContain('/^[-+]  "version": "[^"]+",$/');
    expect(block).toContain('pnpm --filter modern-cmdk-codemod run build');
    expect(block).toContain('pnpm --filter modern-cmdk-codemod pack --pack-destination');
    expect(block).toContain(
      'node scripts/check-package.ts --package modern-cmdk-codemod --tarball',
    );
  });

  it('D62: first-publish-tarball records source.txt and compares an already-published version by content', () => {
    expect(block).toContain('npm view "modern-cmdk-codemod@$version" version');
    expect(block).toMatch(/E404/);
    expect(block).toContain('npm view modern-cmdk-codemod version');
    expect(block).toContain('state=later');
    expect(block).toContain("if: steps.registry.outputs.state == 'first'");
    expect(block).toContain("if: steps.registry.outputs.state == 'published'");
    expect(block).not.toMatch(/outputs\.published/);
    expect(block).toContain('npm pack "modern-cmdk-codemod@$version"');
    expect(block).toContain("import { listTarEntries } from './scripts/check-package.ts'");
    expect(block).toMatch(/dist\.integrity/);
    expect(block).toMatch(/sha512/);
    const source = step(block, 'Record the source');
    expect(source).toContain('$GITHUB_SHA');
    expect(source).toContain('git rev-parse HEAD');
    expect(source).toContain('git rev-parse HEAD:packages/modern-cmdk-codemod');
    expect(source).toContain('source.txt');
    const upload = step(block, 'Upload the first-publish artifact');
    expect(upload).toContain('name: first-publish-modern-cmdk-codemod');
    expect(upload).toContain('retention-days: 30');
    expect(upload).toContain('if-no-files-found: error');
    for (const file of ['.tgz', '.sha256', 'source.txt']) {
      expect(upload, file).toContain(file);
    }
    // It signs nothing: both attestations and the SBOM belong to first-publish-attest.
    expect(block).not.toMatch(/actions\/attest|anchore\/sbom-action/);
  });

  it('D62: the header job graph names first-publish-tarball, first-publish-smoke and the attest refusal', () => {
    const header = workflow.slice(0, workflow.indexOf('\njobs:'));
    expect(header).toContain(
      'version -> first-publish-tarball -> first-publish-smoke -> first-publish-attest',
    );
    expect(header).toContain('first-publish-tarball');
    expect(header).toContain('first-publish-smoke');
    expect(header).toContain('first-publish-attest');
    expect(header).toMatch(/refus/);
  });
});

/** The header comment (everything before `jobs:`) as prose: comment markers removed, lines joined by a space. */
function headerProse(): string {
  return workflow
    .slice(0, workflow.indexOf('\njobs:'))
    .split(/\r?\n/)
    .filter((l) => l.startsWith('#'))
    .map((l) => l.replace(/^#\s?/, ''))
    .join(' ');
}

/** Every job key under jobs:. */
function jobNames(): string[] {
  return workflow
    .slice(workflow.indexOf('\njobs:'))
    .split(/\r?\n/)
    .flatMap((l) => /^ {2}([a-z][\w-]*):$/.exec(l)?.[1] ?? []);
}

/** The steps of a job: everything from its steps: key on. */
function stepsOf(block: string): string {
  return block.slice(block.indexOf('    steps:'));
}

describe('release.yml first-publish split (D62: the smoke job executes a fresh npm tree, so it holds no signing credential)', () => {
  const tarball = job('first-publish-tarball');
  const smoke = job('first-publish-smoke');
  const attestJob = job('first-publish-attest');

  it('D62: the job that runs the smoke script has no id-token and no attestations permission', () => {
    expect(smoke).toContain('scripts/codemod-tarball-smoke.ts');
    expect(smoke).not.toMatch(/^ {6}(id-token|attestations|artifact-metadata): /m);
    // It is the only job that runs it, so no signing job does.
    const runners = jobNames().filter((name) =>
      job(name).includes('scripts/codemod-tarball-smoke.ts'),
    );
    expect(runners).toEqual(['first-publish-smoke']);
    // The tarball job's outputs are the contract with the smoke and signing jobs.
    expect(tarball).toMatch(/^ {6}state: \$\{\{ steps\.registry\.outputs\.state \}\}$/m);
    expect(tarball).toMatch(/^ {6}tarball: \$\{\{ steps\.hash\.outputs\.tarball \}\}$/m);
    expect(tarball).toMatch(/^ {6}sha256: \$\{\{ steps\.hash\.outputs\.sha256 \}\}$/m);
  });

  it('D62: first-publish-attest signs only: it needs the tarball and smoke jobs, runs on state first, downloads before attesting and runs no repository code', () => {
    expect(attestJob).not.toBe('');
    expect(attestJob).toContain('    needs: [first-publish-tarball, first-publish-smoke]');
    expect(attestJob).toContain("    if: needs.first-publish-tarball.outputs.state == 'first'");
    const perms = attestJob.match(/^ {4}permissions:\n((?: {6}.*\n)+)/m)?.[1] ?? '';
    const granted = [...perms.matchAll(/^ {6}([\w-]+): (\w+)/gm)].map((m) => `${m[1]}:${m[2]}`);
    expect(granted.sort()).toEqual([
      'artifact-metadata:write',
      'attestations:write',
      'contents:read',
      'id-token:write',
    ]);
    const steps = stepsOf(attestJob);
    expect(steps).toContain('actions/attest@');
    expect(steps).not.toMatch(
      /\b(pnpm|npm|npx|corepack|node)\b|actions\/setup-node|pnpm\/action-setup|actions\/checkout|scripts\//,
    );
    const download = steps.indexOf('actions/download-artifact@');
    expect(download).toBeGreaterThan(-1);
    expect(steps).toContain('name: first-publish-modern-cmdk-codemod');
    expect(download).toBeLessThan(steps.indexOf('actions/attest@'));
    expect(download).toBeLessThan(steps.indexOf('anchore/sbom-action@'));
    expect(attestJob).not.toMatch(/continue-on-error|\|\| true|secrets\./);
  });

  it("D62: first-publish-attest verifies the downloaded tarball against the tarball job's sha256 output before it attests", () => {
    const verify = step(attestJob, 'Verify the tarball is the one the tarball job hashed');
    expect(verify).not.toBe('');
    expect(verify).toMatch(
      /EXPECTED_SHA256: \$\{\{ needs\.first-publish-tarball\.outputs\.sha256 \}\}/,
    );
    expect(verify).toMatch(/TARBALL: \$\{\{ needs\.first-publish-tarball\.outputs\.tarball \}\}/);
    expect(verify).toMatch(/sha256sum/);
    expect(verify).toMatch(/!= "\$EXPECTED_SHA256"/);
    expect(verify).toMatch(/exit 1/);
    const steps = stepsOf(attestJob);
    const at = steps.indexOf('Verify the tarball is the one the tarball job hashed');
    expect(at).toBeGreaterThan(steps.indexOf('actions/download-artifact@'));
    expect(at).toBeLessThan(steps.indexOf('anchore/sbom-action@'));
    expect(at).toBeLessThan(steps.indexOf('actions/attest@'));
    // The tarball job computes the digest of the very file it then uploads.
    const hash = step(tarball, 'Hash the tarball');
    expect(hash).toContain('sha256sum');
    expect(hash).toContain('id: hash');
    expect(tarball.indexOf('- name: Hash the tarball')).toBeLessThan(
      tarball.indexOf('- name: Upload the first-publish artifact'),
    );
  });

  it('D62: first-publish-attest keeps both attestations and the SBOM, moved with the same inputs', () => {
    expect(attestJob).toMatch(/subject-path: first-publish\/\*\.tgz/);
    expect(attestJob).toMatch(/sbom-path: first-publish\/modern-cmdk-codemod\.spdx\.json/);
    expect(attestJob).toContain('output-file: first-publish/modern-cmdk-codemod.spdx.json');
    expect(attestJob).toContain('syft-version: v1.57.0');
  });

  it('D62: the header lists exactly the jobs whose permissions hold id-token: write, and says why the smoke job holds none', () => {
    const prose = headerProse();
    const listed =
      /\b((?:[\w-]+(?:, | and ))+[\w-]+) are the only jobs holding id-token: write/.exec(
        prose,
      )?.[1];
    expect(listed).toBeDefined();
    const named = (listed ?? '').split(/, | and /).sort();
    const holders = jobNames()
      .filter((name) => /^ {6}id-token: write\b/m.test(job(name)))
      .sort();
    expect(holders).toEqual(['attest', 'first-publish-attest', 'publish']);
    expect(named).toEqual(holders);
    // Past the header, the key appears once per holder (permissions: {} at the top grants nothing).
    const afterHeader = workflow.slice(workflow.indexOf('\njobs:'));
    expect(afterHeader.match(/id-token: write/g)).toHaveLength(holders.length);
    expect(prose).toMatch(
      /first-publish-smoke holds no id-token because it executes a freshly resolved npm tree/,
    );
  });

  it('D62: the version job comment does not claim changeset version rewrites workspace specifiers', () => {
    const version = job('version');
    expect(version).not.toMatch(/rewrites workspace specifiers/);
    expect(version).toContain('workspace:*');
    expect(version).toContain('apply-release-plan 8.1.1');
    // It agrees with the scope gate's error text.
    expect(tarball).toContain(
      'every internal specifier is workspace:*, which changeset version does not rewrite',
    );
  });
});

describe('release.yml has no backfill job and no dispatch trigger (D73)', () => {
  const header = workflow.slice(0, workflow.indexOf('\njobs:'));

  it('D73: the backfill job is absent and the job graph is the push graph alone', () => {
    expect(jobNames()).toEqual([
      'ci-gate',
      'select-mode',
      'version',
      'first-publish-tarball',
      'first-publish-smoke',
      'first-publish-attest',
      'pack',
      'attest',
      'publish',
    ]);
    expect(job('backfill')).toBe('');
    expect(workflow).not.toMatch(/backfill/i);
  });

  it('D73: no workflow_dispatch trigger, no task input and no job or expression reads them', () => {
    expect(header).toMatch(/^on:\n {2}push:\n {4}branches: \[main\]\n\n/m);
    expect(workflow).not.toContain('workflow_dispatch');
    expect(workflow).not.toMatch(/inputs\./);
    expect(workflow).not.toMatch(/^ {6}task:/m);
    expect(workflow).not.toContain('github.event_name');
  });

  it('D73: every needs and every job-level if of the surviving graph is intact', () => {
    const needs = Object.fromEntries(
      jobNames().map((n) => {
        const m = /^ {4}needs: (.+)$/m.exec(job(n));
        return [n, m?.[1]?.replace(/[[\]\s]/g, '').split(',') ?? []];
      }),
    );
    expect(needs).toEqual({
      'ci-gate': [],
      'select-mode': ['ci-gate'],
      version: ['select-mode'],
      'first-publish-tarball': ['select-mode', 'version'],
      'first-publish-smoke': ['first-publish-tarball'],
      'first-publish-attest': ['first-publish-tarball', 'first-publish-smoke'],
      pack: ['select-mode'],
      attest: ['select-mode', 'pack'],
      publish: ['pack', 'attest'],
    });
    expect(job('select-mode')).not.toMatch(/^ {4}if:/m);
    expect(job('version')).toContain("if: needs.select-mode.outputs.mode == 'version'");
    expect(job('pack')).toContain("if: needs.select-mode.outputs.mode == 'publish'");
    expect(job('attest')).toContain("if: needs.select-mode.outputs.mode == 'publish'");
  });

  it('D73: the header graph names the push graph and no dispatch run', () => {
    const prose = headerProse();
    expect(prose).toContain('On a push to main: ci-gate -> select-mode ->');
    expect(prose).not.toMatch(/manual dispatch|dispatched run/);
  });
});

describe('release.yml first-publish-smoke job (SEC-63)', () => {
  const tarball = job('first-publish-tarball');
  const smoke = job('first-publish-smoke');
  const attestJob = job('first-publish-attest');

  it('SEC-63: first-publish-tarball hashes, records and uploads the tarball and runs no freshly resolved npm code', () => {
    expect(tarball).not.toBe('');
    const steps = stepsOf(tarball);
    expect(steps).not.toContain('codemod-tarball-smoke.ts');
    expect(steps).not.toMatch(/\bnpm (exec|install)\b/);
    const hash = steps.indexOf('- name: Hash the tarball');
    const record = steps.indexOf('- name: Record the source');
    const upload = steps.indexOf('- name: Upload the first-publish artifact');
    expect(hash).toBeGreaterThan(-1);
    expect(hash).toBeLessThan(record);
    expect(record).toBeLessThan(upload);
  });

  it("SEC-63: first-publish-smoke downloads the uploaded artifact, verifies its sha256 against the tarball job's output, runs the smoke script, and holds no id-token, no attestations permission and no upload step", () => {
    expect(smoke).not.toBe('');
    expect(smoke).toContain("    if: needs.first-publish-tarball.outputs.state == 'first'");
    expect(smoke).toContain('    needs: first-publish-tarball');
    const perms = smoke.match(/^ {4}permissions:\n((?: {6}.*\n)+)/m)?.[1] ?? '';
    const granted = [...perms.matchAll(/^ {6}([\w-]+): (\w+)/gm)].map((m) => `${m[1]}:${m[2]}`);
    expect(granted).toEqual(['contents:read']);
    expect(smoke).not.toMatch(/id-token|attestations|artifact-metadata|upload-artifact|secrets\./);
    expect(smoke).not.toMatch(/continue-on-error|\|\| true/);
    const steps = stepsOf(smoke);
    const download = steps.indexOf('actions/download-artifact@');
    const verify = steps.indexOf('sha256sum');
    const run = steps.indexOf(
      'node scripts/codemod-tarball-smoke.ts --codemod "first-publish/$TARBALL"',
    );
    expect(download).toBeGreaterThan(-1);
    expect(steps).toContain('name: first-publish-modern-cmdk-codemod');
    expect(download).toBeLessThan(verify);
    expect(verify).toBeLessThan(run);
    expect(steps).toMatch(/!= "\$EXPECTED_SHA256"/);
    expect(steps).toMatch(
      /EXPECTED_SHA256: \$\{\{ needs\.first-publish-tarball\.outputs\.sha256 \}\}/,
    );
    expect(steps).toMatch(/TARBALL: \$\{\{ needs\.first-publish-tarball\.outputs\.tarball \}\}/);
    expect(steps).toContain('pnpm install --frozen-lockfile --ignore-scripts');
  });

  it('SEC-63, SEC-68: first-publish-smoke checks out GITHUB_SHA, the CI-checked commit the scope gate proved the Version PR head equals outside the version edits', () => {
    const checkout =
      stepsOf(smoke)
        .split(/^ {6}- /m)
        .find((s) => s.includes('actions/checkout@')) ?? '';
    expect(checkout).toMatch(/ref: \$\{\{ github\.sha \}\}/);
    expect(checkout).not.toContain('changeset-release/main');
    // A ref computed by another job is untrusted code to CodeQL's actions/untrusted-checkout and cache-poisoning queries
    expect(checkout).not.toContain('needs.first-publish-tarball');
    // The tarball job exposes no checked-out ref, so no job can check one out
    expect(tarball).not.toMatch(/^ {6}head: /m);
    const scope =
      stepsOf(tarball)
        .split(/^ {6}- /m)
        .find((s) => s.startsWith('name: Scope gate')) ?? '';
    expect(scope).toContain('id: scope');
    expect(scope).not.toContain('head=');
  });

  it('SEC-63: first-publish-attest needs first-publish-tarball and first-publish-smoke, so a failed smoke blocks the attestation', () => {
    expect(attestJob).toContain('    needs: [first-publish-tarball, first-publish-smoke]');
    expect(attestJob).toContain("    if: needs.first-publish-tarball.outputs.state == 'first'");
  });
});

describe('release.yml and ci.yml seed the same syft (SEC-73)', () => {
  it('SEC-73: the seeded syft version and digest agree across ci.yml and release.yml', () => {
    const ci = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');
    // sbom-action reads syft from the tool cache folder named by its syft-version, so the version it names, the tag the seed step
    // downloads and the digest the seed checks must be one release; five sbom-action sites name it (one in ci.yml, four here).
    const versions = [...`${ci}\n${workflow}`.matchAll(/syft-version: (v\d+\.\d+\.\d+)/g)].map(
      (m) => m[1],
    );
    expect(versions).toHaveLength(5);
    const v = versions[0] ?? '';
    expect(new Set(versions)).toEqual(new Set([v]));
    const bare = v.slice(1);
    const asset = `syft_${bare}_linux_amd64.tar.gz`;
    const seed = new RegExp(
      `repo: anchore/syft\\n\\s+tag: ${v}\\n\\s+asset: ${asset.replaceAll('.', '\\.')}\\n\\s+sha256: ([0-9a-f]{64})`,
    ).exec(ci);
    expect(seed, 'the ci.yml syft seed step').not.toBeNull();
    const digest = seed?.[1] ?? '';
    const checks = [
      ...workflow.matchAll(/echo "([0-9a-f]{64}) {2}\$tarball" \| sha256sum --check/g),
    ].map((m) => m[1]);
    expect(checks).toEqual([digest, digest]);
    const count = (needle: string): number => workflow.split(needle).length - 1;
    expect(count(`gh release download ${v} -R anchore/syft -p ${asset}`)).toBe(2);
    expect(count(`releases/download/${v}/${asset}`)).toBe(2);
    expect(count(`RUNNER_TOOL_CACHE/syft/${bare}/x64"`)).toBe(2);
  });
});

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

describe('release.yml header and signing permissions (D62)', () => {
  it('D62: the header lists exactly the jobs whose permissions hold id-token: write', () => {
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
    expect(holders).toEqual(['attest', 'publish']);
    expect(named).toEqual(holders);
    // Past the header, the key appears once per holder (permissions: {} at the top grants nothing).
    const afterHeader = workflow.slice(workflow.indexOf('\njobs:'));
    expect(afterHeader.match(/id-token: write/g)).toHaveLength(holders.length);
  });

  it('D62: the header says the attest job refuses a package npm has never seen', () => {
    const prose = headerProse();
    expect(prose).toMatch(/refuses a publish plan that holds a package npm has never seen/);
    expect(prose).toMatch(/published by the owner by hand, never by this workflow/);
  });

  it('D62: the version job comment does not claim changeset version rewrites workspace specifiers', () => {
    const version = job('version');
    expect(version).not.toMatch(/rewrites workspace specifiers/);
    expect(version).toContain('workspace:*');
    expect(version).toContain('apply-release-plan 8.1.1');
  });
});

describe('release.yml has no backfill job and no dispatch trigger (D73)', () => {
  const header = workflow.slice(0, workflow.indexOf('\njobs:'));

  it('D73: the backfill job is absent and the job graph is the push graph alone', () => {
    expect(jobNames()).toEqual(['ci-gate', 'select-mode', 'version', 'pack', 'attest', 'publish']);
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

describe('release.yml has no first-publish scaffolding', () => {
  it('FP-REMOVAL: no job starts with first-publish, no step uploads a first-publish-* artifact, and the header job graph names exactly the jobs that exist', () => {
    const names = jobNames();
    expect(names.filter((name) => name.startsWith('first-publish'))).toEqual([]);
    const uploads = [...workflow.matchAll(/upload-artifact@[^\n]*\n\s+with:\n\s+name: (\S+)/g)].map(
      (m) => m[1],
    );
    expect(uploads).toEqual(['sbom-spdx']);
    expect(workflow).not.toContain('first-publish');
    // The graph line lists every job once: ci-gate -> select-mode -> version | (pack -> attest -> publish).
    const graph = /^# Job graph\. On a push to main: (.+)$/m.exec(workflow)?.[1] ?? '';
    expect([...new Set(graph.match(/[a-z][a-z-]*/g))].sort()).toEqual([...names].sort());
  });
});

describe('release.yml and ci.yml seed the same syft (SEC-73)', () => {
  it('SEC-73: the seeded syft version and digest agree across ci.yml and release.yml', () => {
    const ci = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');
    // sbom-action reads syft from the tool cache folder named by its syft-version, so the version it names, the tag the seed step
    // downloads and the digest the seed checks must be one release; four sbom-action sites name it (one in ci.yml, three here).
    const versions = [...`${ci}\n${workflow}`.matchAll(/syft-version: (v\d+\.\d+\.\d+)/g)].map(
      (m) => m[1],
    );
    expect(versions).toHaveLength(4);
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
    expect(checks).toEqual([digest]);
    const count = (needle: string): number => workflow.split(needle).length - 1;
    expect(count(`gh release download ${v} -R anchore/syft -p ${asset}`)).toBe(1);
    expect(count(`releases/download/${v}/${asset}`)).toBe(1);
    expect(count(`RUNNER_TOOL_CACHE/syft/${bare}/x64"`)).toBe(1);
  });
});

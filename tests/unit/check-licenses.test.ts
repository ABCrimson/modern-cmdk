// tests/unit/check-licenses.test.ts
// G4: the lockfile licence audit. evaluate(report, policy) is pure; the report is the shape of
// `pnpm licenses list --json` (licence string -> packages), the policy is tests/package/license-policy.json.

import { spawnSync } from 'node:child_process';
import { hash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  census,
  evaluate,
  LICENSES_ARGS,
  type LicenseFileDeclaration,
  type LicensePolicy,
  type LicensePolicyInput,
  type LicenseReport,
  resolveLicenseFiles,
} from '../../scripts/check-licenses.ts';

function pkg(name: string, version: string, license: string): LicenseReport[string][number] {
  return { name, versions: [version], paths: [`/nm/${name}@${version}`], license };
}

const policy: LicensePolicy = {
  allowed: ['MIT', 'ISC', 'Apache-2.0'],
  exceptions: [],
};

describe('check-licenses evaluate', () => {
  it('passes a package under an allowed SPDX id', () => {
    const report: LicenseReport = { MIT: [pkg('left-pad', '1.0.0', 'MIT')] };
    expect(evaluate(report, policy)).toEqual([]);
  });

  it('reports an unknown licence as package@version', () => {
    const report: LicenseReport = { Unknown: [pkg('mystery', '2.3.4', 'Unknown')] };
    const violations = evaluate(report, policy);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('mystery@2.3.4');
  });

  it('reports a missing licence as package@version', () => {
    const report: LicenseReport = {
      '': [{ name: 'blank', versions: ['0.1.0'], paths: ['/nm/blank'], license: '' }],
    };
    const violations = evaluate(report, policy);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('blank@0.1.0');
  });

  it('reports a licence outside the allowlist with no exception', () => {
    const report: LicenseReport = { 'MPL-2.0': [pkg('axe-ish', '4.0.0', 'MPL-2.0')] };
    const violations = evaluate(report, policy);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('axe-ish@4.0.0');
    expect(violations[0]).toContain('MPL-2.0');
  });

  it('names every version of a multi-version package', () => {
    const report: LicenseReport = {
      GPL: [
        {
          name: 'twice',
          versions: ['1.0.0', '2.0.0'],
          paths: ['/nm/t1', '/nm/t2'],
          license: 'GPL',
        },
      ],
    };
    const violations = evaluate(report, policy);
    expect(violations.join('\n')).toContain('twice@1.0.0');
    expect(violations.join('\n')).toContain('twice@2.0.0');
  });

  it('accepts a licence outside the allowlist that has an exception', () => {
    const report: LicenseReport = { 'MPL-2.0': [pkg('axe-ish', '4.0.0', 'MPL-2.0')] };
    const withException: LicensePolicy = {
      ...policy,
      exceptions: [
        { package: 'axe-ish', license: 'MPL-2.0', ships: false, reason: 'test-only, not shipped' },
      ],
    };
    expect(evaluate(report, withException)).toEqual([]);
  });

  it('accepts a trailing-star exception for platform packages', () => {
    const report: LicenseReport = { 'MPL-2.0': [pkg('native-linux-x64', '1.0.0', 'MPL-2.0')] };
    const withException: LicensePolicy = {
      ...policy,
      exceptions: [
        {
          package: 'native-*',
          license: 'MPL-2.0',
          ships: false,
          reason: 'platform binary, dev only',
        },
      ],
    };
    expect(evaluate(report, withException)).toEqual([]);
  });

  it('reports an exception for a package no longer in the report as stale', () => {
    const report: LicenseReport = { MIT: [pkg('left-pad', '1.0.0', 'MIT')] };
    const stale: LicensePolicy = {
      ...policy,
      exceptions: [{ package: 'gone', license: 'MPL-2.0', ships: false, reason: 'was dev only' }],
    };
    const violations = evaluate(report, stale);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('stale exception');
    expect(violations[0]).toContain('gone');
  });

  it('reports an exception whose licence no longer matches as stale', () => {
    const report: LicenseReport = { MIT: [pkg('axe-ish', '5.0.0', 'MIT')] };
    const stale: LicensePolicy = {
      ...policy,
      exceptions: [{ package: 'axe-ish', license: 'MPL-2.0', ships: false, reason: 'dev only' }],
    };
    expect(evaluate(report, stale).join('\n')).toContain('stale exception');
  });

  describe('platform-scoped exceptions', () => {
    const report: LicenseReport = {
      'LGPL-3.0-or-later': [pkg('@img/sharp-libvips-linux-x64', '1.3.4', 'LGPL-3.0-or-later')],
    };
    const entry = (platforms: unknown): unknown => ({
      package: '@img/sharp-win32-*',
      license: 'Apache-2.0 AND LGPL-3.0-or-later',
      ships: false,
      platforms,
      reason: 'Windows binary of sharp, not shipped',
    });
    const none: LicenseReport = { MIT: [pkg('left-pad', '1.0.0', 'MIT')] };

    it('is not stale on a platform outside its platforms list', () => {
      expect(evaluate(none, { ...policy, exceptions: [entry(['win32'])] }, 'linux')).toEqual([]);
    });

    it('is stale on a listed platform when no package matches', () => {
      const violations = evaluate(none, { ...policy, exceptions: [entry(['win32'])] }, 'win32');
      expect(violations).toHaveLength(1);
      expect(violations[0]).toContain('stale exception');
    });

    it('grants nothing on a platform outside its platforms list', () => {
      const libvips = {
        package: '@img/sharp-libvips-*',
        license: 'LGPL-3.0-or-later',
        ships: false,
        platforms: ['linux'],
        reason: 'optional binary, not shipped',
      };
      expect(evaluate(report, { ...policy, exceptions: [libvips] }, 'linux')).toEqual([]);
      expect(evaluate(report, { ...policy, exceptions: [libvips] }, 'win32').join(',')).toContain(
        'has no exception',
      );
    });

    it('treats an empty platforms list as malformed', () => {
      expect(evaluate(none, { ...policy, exceptions: [entry([])] }, 'linux').join(',')).toContain(
        'malformed',
      );
    });
  });

  it('rejects an exception without a reason', () => {
    const report: LicenseReport = { 'MPL-2.0': [pkg('axe-ish', '4.0.0', 'MPL-2.0')] };
    const noReason: LicensePolicy = {
      ...policy,
      exceptions: [{ package: 'axe-ish', license: 'MPL-2.0', ships: false, reason: '  ' }],
    };
    expect(evaluate(report, noReason).join('\n')).toContain('reason');
  });

  it('gives no exception to a copyleft licence that ships', () => {
    const report: LicenseReport = { 'LGPL-3.0': [pkg('shipped', '1.0.0', 'LGPL-3.0')] };
    const shipped: LicensePolicy = {
      ...policy,
      exceptions: [{ package: 'shipped', license: 'LGPL-3.0', ships: true, reason: 'dependency' }],
    };
    const violations = evaluate(report, shipped);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('shipped@1.0.0');
    expect(violations[0]).toContain('copyleft');
  });

  it('gives no exception to a weak-copyleft licence that ships', () => {
    const report: LicenseReport = { 'MPL-2.0': [pkg('bundled', '1.0.0', 'MPL-2.0')] };
    const v = evaluate(report, {
      ...policy,
      exceptions: [{ package: 'bundled', license: 'MPL-2.0', ships: true, reason: 'inlined' }],
    });
    expect(v).toHaveLength(1);
    expect(v[0]).toContain('copyleft');
  });

  it('reports an exception with no ships flag instead of passing a shipped copyleft package', () => {
    const report: LicenseReport = { 'GPL-3.0': [pkg('gpl-lib', '1.0.0', 'GPL-3.0')] };
    const violations = evaluate(report, {
      ...policy,
      exceptions: [{ package: 'gpl-lib', license: 'GPL-3.0', reason: 'inlined' }],
    });
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations.join('\n')).toContain('ships');
    expect(violations.join('\n')).toContain('gpl-lib@1.0.0');
  });

  it('reports an exception with no reason key without throwing', () => {
    const report: LicenseReport = { 'MPL-2.0': [pkg('axe-ish', '4.0.0', 'MPL-2.0')] };
    const run = (): string[] =>
      evaluate(report, {
        ...policy,
        exceptions: [{ package: 'axe-ish', license: 'MPL-2.0', ships: false }],
      });
    expect(run).not.toThrow();
    expect(run().join('\n')).toContain('reason');
  });

  it('reports an exception with an empty package name as malformed, with its index', () => {
    const report: LicenseReport = { MIT: [pkg('left-pad', '1.0.0', 'MIT')] };
    const violations = evaluate(report, {
      ...policy,
      exceptions: [{ package: '', license: 'MPL-2.0', ships: false, reason: 'dev only' }],
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('exception #0');
    expect(violations[0]).toContain('malformed');
  });

  it('audits the whole workspace, dev dependencies included', () => {
    expect(LICENSES_ARGS).toContain('--recursive');
    expect(LICENSES_ARGS).not.toContain('--prod');
  });

  it('passes an OR expression when any alternative is allowed', () => {
    const report: LicenseReport = {
      'MIT OR GPL-3.0': [pkg('dual', '1.0.0', 'MIT OR GPL-3.0')],
      '(GPL-3.0 OR ISC)': [pkg('paren', '1.0.0', '(GPL-3.0 OR ISC)')],
    };
    expect(evaluate(report, policy)).toEqual([]);
  });

  it('fails an OR expression when no alternative is allowed', () => {
    const report: LicenseReport = {
      'GPL-3.0 OR AGPL-3.0': [pkg('copyleft', '1.0.0', 'GPL-3.0 OR AGPL-3.0')],
    };
    expect(evaluate(report, policy)).toHaveLength(1);
  });

  it('passes an AND expression only when all are allowed', () => {
    const ok: LicenseReport = { 'MIT AND ISC': [pkg('both', '1.0.0', 'MIT AND ISC')] };
    const bad: LicenseReport = { 'MIT AND GPL-3.0': [pkg('half', '1.0.0', 'MIT AND GPL-3.0')] };
    expect(evaluate(ok, policy)).toEqual([]);
    expect(evaluate(bad, policy)).toHaveLength(1);
  });

  it('binds AND tighter than OR', () => {
    const report: LicenseReport = {
      'GPL-3.0 AND MIT OR ISC': [pkg('mixed', '1.0.0', 'GPL-3.0 AND MIT OR ISC')],
      'GPL-3.0 AND (MIT OR ISC)': [pkg('grouped', '1.0.0', 'GPL-3.0 AND (MIT OR ISC)')],
    };
    const violations = evaluate(report, policy);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('grouped@1.0.0');
  });

  it('treats a malformed expression as a violation', () => {
    const report: LicenseReport = { 'MIT OR': [pkg('broken', '1.0.0', 'MIT OR')] };
    expect(evaluate(report, policy)).toHaveLength(1);
  });
});

describe('check-licenses census', () => {
  it('counts packages per licence, most common first', () => {
    const report: LicenseReport = {
      MIT: [pkg('a', '1.0.0', 'MIT'), pkg('b', '1.0.0', 'MIT')],
      ISC: [pkg('c', '1.0.0', 'ISC')],
    };
    expect(census(report)).toEqual([
      ['MIT', 2],
      ['ISC', 1],
    ]);
  });
});

// W4-03: a package with no licence field is resolved from its licence file by a declared, hash-pinned entry.
const KHROMA_TEXT = Buffer.from('The MIT License (MIT)\n\nCopyright (c) test\n');
const KHROMA_SHA = hash('sha256', KHROMA_TEXT, 'hex');
const KHROMA_DIR = '/nm/khroma';
const KHROMA_FILE = join(KHROMA_DIR, 'license');

const declaration: LicenseFileDeclaration = {
  package: 'khroma',
  version: '2.1.0',
  license: 'MIT',
  file: 'license',
  sha256: KHROMA_SHA,
  reason: 'manifest has no license field; MIT text in a lowercase file',
};

function withDeclarations(...licenseFiles: unknown[]): LicensePolicyInput {
  return { allowed: policy.allowed, exceptions: [], licenseFiles };
}

/** A fake reader: a Map from path to bytes; any other path throws ENOENT. */
function readerOf(files: ReadonlyMap<string, Buffer>): (path: string) => Buffer {
  return (path: string): Buffer => {
    const bytes = files.get(path);
    if (bytes === undefined) {
      throw Object.assign(new Error(`ENOENT: no such file, open '${path}'`), { code: 'ENOENT' });
    }
    return bytes;
  };
}

const khromaPackage: LicenseReport[string][number] = {
  name: 'khroma',
  versions: ['2.1.0'],
  paths: [KHROMA_DIR],
  license: 'Unknown',
};
const unknownReport = (): LicenseReport => ({
  Unknown: [khromaPackage, pkg('other', '1.0.0', 'Unknown')],
});

describe('check-licenses resolveLicenseFiles', () => {
  const good = readerOf(new Map([[KHROMA_FILE, KHROMA_TEXT]]));

  it('moves an Unknown package to the declared licence when the file hashes to the pin', () => {
    const report: LicenseReport = { Unknown: [khromaPackage] };
    const before = structuredClone(report);
    const resolved = resolveLicenseFiles(report, withDeclarations(declaration), good);
    expect(resolved.violations).toEqual([]);
    expect(resolved.report.MIT?.map((p) => `${p.name}@${p.versions.join()}`)).toEqual([
      'khroma@2.1.0',
    ]);
    expect(resolved.report.MIT?.[0]?.paths).toEqual([KHROMA_DIR]);
    expect(resolved.report.Unknown).toBeUndefined();
    expect(census(resolved.report)).toEqual([['MIT', 1]]);
    expect(evaluate(resolved.report, withDeclarations(declaration))).toEqual([]);
    expect(report).toEqual(before);
  });

  it('keeps the other Unknown packages in the Unknown bucket', () => {
    const resolved = resolveLicenseFiles(unknownReport(), withDeclarations(declaration), good);
    expect(resolved.report.Unknown?.map((p) => p.name)).toEqual(['other']);
    expect(resolved.report.MIT?.map((p) => p.name)).toEqual(['khroma']);
  });

  it('adds the version to an existing entry of the declared licence', () => {
    const report: LicenseReport = {
      Unknown: [khromaPackage],
      MIT: [pkg('left-pad', '1.0.0', 'MIT')],
    };
    const resolved = resolveLicenseFiles(report, withDeclarations(declaration), good);
    expect(resolved.report.MIT?.map((p) => p.name)).toEqual(['left-pad', 'khroma']);
  });

  it('splits only the declared version out of a multi-version Unknown entry', () => {
    const report: LicenseReport = {
      Unknown: [
        {
          name: 'khroma',
          versions: ['1.0.0', '2.1.0'],
          paths: ['/nm/khroma1', KHROMA_DIR],
          license: 'Unknown',
        },
      ],
    };
    const resolved = resolveLicenseFiles(report, withDeclarations(declaration), good);
    expect(resolved.violations).toEqual([]);
    expect(resolved.report.Unknown?.[0]?.versions).toEqual(['1.0.0']);
    expect(resolved.report.Unknown?.[0]?.paths).toEqual(['/nm/khroma1']);
    expect(resolved.report.MIT?.[0]?.versions).toEqual(['2.1.0']);
    expect(resolved.report.MIT?.[0]?.paths).toEqual([KHROMA_DIR]);
  });

  it('hashes every path of a single-version entry installed under two peer sets', () => {
    const p1 = '/nm/khroma_peerA';
    const p2 = '/nm/khroma_peerB';
    const report: LicenseReport = {
      Unknown: [{ name: 'khroma', versions: ['2.1.0'], paths: [p1, p2], license: 'Unknown' }],
    };
    const reader = readerOf(
      new Map([
        [join(p1, 'license'), KHROMA_TEXT],
        [join(p2, 'license'), KHROMA_TEXT],
      ]),
    );
    const resolved = resolveLicenseFiles(report, withDeclarations(declaration), reader);
    expect(resolved.violations).toEqual([]);
    expect(resolved.report.MIT?.[0]?.paths).toEqual([p1, p2]);
    expect(resolved.report.Unknown).toBeUndefined();
  });

  it('reports the second path when its bytes are wrong and keeps the version Unknown', () => {
    const p1 = '/nm/khroma_peerA';
    const p2 = '/nm/khroma_peerB';
    const wrong = Buffer.from('tampered');
    const report: LicenseReport = {
      Unknown: [{ name: 'khroma', versions: ['2.1.0'], paths: [p1, p2], license: 'Unknown' }],
    };
    const reader = readerOf(
      new Map([
        [join(p1, 'license'), KHROMA_TEXT],
        [join(p2, 'license'), wrong],
      ]),
    );
    const resolved = resolveLicenseFiles(report, withDeclarations(declaration), reader);
    expect(resolved.violations).toHaveLength(1);
    expect(resolved.violations[0]).toContain(hash('sha256', wrong, 'hex'));
    expect(resolved.report.Unknown?.[0]?.name).toBe('khroma');
    expect(resolved.report.MIT).toBeUndefined();
  });

  it('refuses to guess when a multi-version entry has a different number of paths', () => {
    const calls: string[] = [];
    const report: LicenseReport = {
      Unknown: [
        {
          name: 'khroma',
          versions: ['1.0.0', '2.1.0'],
          paths: ['/nm/a1', '/nm/a2', '/nm/b'],
          license: 'Unknown',
        },
      ],
    };
    const resolved = resolveLicenseFiles(report, withDeclarations(declaration), (path: string) => {
      calls.push(path);
      return KHROMA_TEXT;
    });
    expect(resolved.violations).toEqual([
      'khroma@2.1.0: the report lists 3 paths for 2 versions; cannot tell which path holds 2.1.0',
    ]);
    expect(resolved.report).toEqual(report);
    expect(calls).toEqual([]);
  });

  it('reports wrong bytes with both digests and leaves the version Unknown', () => {
    const wrong = Buffer.from('tampered');
    const wrongSha = hash('sha256', wrong, 'hex');
    const resolved = resolveLicenseFiles(
      unknownReport(),
      withDeclarations(declaration),
      readerOf(new Map([[KHROMA_FILE, wrong]])),
    );
    expect(resolved.violations).toHaveLength(1);
    expect(resolved.violations[0]).toContain('khroma@2.1.0');
    expect(resolved.violations[0]).toContain('license');
    expect(resolved.violations[0]).toContain(wrongSha);
    expect(resolved.violations[0]).toContain(KHROMA_SHA);
    expect(evaluate(resolved.report, withDeclarations(declaration)).join('\n')).toContain(
      'khroma@2.1.0: unknown or missing licence',
    );
  });

  it('reports a reader error with its message and leaves the version Unknown', () => {
    const resolved = resolveLicenseFiles(
      unknownReport(),
      withDeclarations(declaration),
      readerOf(new Map()),
    );
    expect(resolved.violations).toHaveLength(1);
    expect(resolved.violations[0]).toContain('khroma@2.1.0');
    expect(resolved.violations[0]).toContain('ENOENT');
    expect(resolved.report.Unknown?.map((p) => p.name)).toContain('khroma');
    expect(evaluate(resolved.report, withDeclarations(declaration)).join('\n')).toContain(
      'khroma@2.1.0',
    );
  });

  it.each([
    ['a string', 'boom'],
    ['a plain object', { code: 'ENOENT' }],
    ['null', null],
  ])(
    'reports a reader that throws %s as a violation, never a silent pass or a crash',
    (_name, thrown) => {
      const resolved = resolveLicenseFiles(unknownReport(), withDeclarations(declaration), () => {
        throw thrown;
      });
      expect(resolved.violations).toHaveLength(1);
      expect(resolved.violations[0]).toContain('khroma@2.1.0');
      expect(resolved.report.MIT).toBeUndefined();
      expect(resolved.report.Unknown?.map((p) => p.name)).toContain('khroma');
      expect(evaluate(resolved.report, withDeclarations(declaration)).join('\n')).toContain(
        'khroma@2.1.0: unknown or missing licence',
      );
    },
  );

  it('reports a declaration for a package@version absent from the report as stale', () => {
    const report: LicenseReport = { MIT: [pkg('khroma', '3.0.0', 'MIT')] };
    const resolved = resolveLicenseFiles(report, withDeclarations(declaration), good);
    expect(resolved.violations).toEqual([
      'stale licence-file declaration: khroma@2.1.0 is not in the report; remove it',
    ]);
  });

  it('accepts a report that already lists the version under the declared licence', () => {
    const report: LicenseReport = { MIT: [{ ...khromaPackage, license: 'MIT' }] };
    const resolved = resolveLicenseFiles(
      report,
      withDeclarations(declaration),
      readerOf(new Map()),
    );
    expect(resolved.violations).toEqual([]);
    expect(resolved.report).toEqual(report);
  });

  it('reports a report licence that disagrees with the declaration', () => {
    const report: LicenseReport = { ISC: [{ ...khromaPackage, license: 'ISC' }] };
    const resolved = resolveLicenseFiles(report, withDeclarations(declaration), good);
    expect(resolved.violations).toHaveLength(1);
    expect(resolved.violations[0]).toContain('khroma@2.1.0');
    expect(resolved.violations[0]).toContain('ISC');
    expect(resolved.violations[0]).toContain('MIT');
  });

  it.each([
    ['missing sha256', { ...declaration, sha256: undefined }],
    ['uppercase sha256', { ...declaration, sha256: KHROMA_SHA.toUpperCase() }],
    ['63-char sha256', { ...declaration, sha256: KHROMA_SHA.slice(1) }],
    ['wildcard version', { ...declaration, version: '*' }],
    ['range version', { ...declaration, version: '^2.1.0' }],
    ['file with a slash', { ...declaration, file: '../license' }],
    ['file with a backslash', { ...declaration, file: '..\\license' }],
    ['empty reason', { ...declaration, reason: '  ' }],
    ['not an object', 'khroma'],
  ])('flags a malformed declaration (%s) and resolves nothing', (_name, bad) => {
    const report: LicenseReport = { Unknown: [khromaPackage] };
    const resolved = resolveLicenseFiles(report, withDeclarations(bad), good);
    expect(resolved.violations).toHaveLength(1);
    expect(resolved.violations[0]).toContain('licence-file declaration #0');
    expect(resolved.violations[0]).toContain('malformed');
    expect(resolved.report).toEqual(report);
  });

  it('treats an absent licenseFiles section as no declarations', () => {
    const report: LicenseReport = { Unknown: [khromaPackage] };
    const resolved = resolveLicenseFiles(report, { allowed: [], exceptions: [] }, good);
    expect(resolved).toEqual({ report, violations: [] });
  });
});

describe('check-licenses real policy', () => {
  const policyPath = join(import.meta.dirname, '..', 'package', 'license-policy.json');
  const real = JSON.parse(readFileSync(policyPath, 'utf8')) as LicensePolicyInput;

  it('keeps its 16 exceptions and declares khroma 2.1.0 by file hash', () => {
    expect(real.exceptions).toHaveLength(16);
    expect(real.licenseFiles).toHaveLength(1);
    const [entry] = real.licenseFiles ?? [];
    expect(entry).toMatchObject({
      package: 'khroma',
      version: '2.1.0',
      license: 'MIT',
      file: 'license',
    });
    // the declaration is well-formed: a report that already says MIT yields no violation
    const probe: LicenseReport = { MIT: [pkg('khroma', '2.1.0', 'MIT')] };
    expect(resolveLicenseFiles(probe, real, readerOf(new Map())).violations).toEqual([]);
  });

  it('passes the real audit: node scripts/check-licenses.ts exits 0 with khroma under MIT or Unknown', () => {
    const script = join(import.meta.dirname, '..', '..', 'scripts', 'check-licenses.ts');
    const run = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('licence audit: ok');
  }, 120_000);
});

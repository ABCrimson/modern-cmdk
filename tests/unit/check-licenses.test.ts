// tests/unit/check-licenses.test.ts
// G4: the lockfile licence audit. evaluate(report, policy) is pure; the report is the shape of
// `pnpm licenses list --json` (licence string -> packages), the policy is tests/package/license-policy.json.

import { describe, expect, it } from 'vitest';
import {
  census,
  evaluate,
  LICENSES_ARGS,
  type LicensePolicy,
  type LicenseReport,
} from '../../scripts/check-licenses.ts';

function pkg(name: string, version: string, license: string): LicenseReport[string][number] {
  return { name, versions: [version], license };
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
    const report: LicenseReport = { '': [{ name: 'blank', versions: ['0.1.0'], license: '' }] };
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
      GPL: [{ name: 'twice', versions: ['1.0.0', '2.0.0'], license: 'GPL' }],
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

// tests/unit/consumer-smoke.test.ts
// W1-02: the pure helpers of scripts/consumer-smoke.ts (the consumer matrix harness). The
// harness itself (install, build, serve, browser) is exercised by running it, not here.

import { describe, expect, it } from 'vitest';
import type { CliOptions } from '../../scripts/consumer-smoke.ts';
import {
  compareToBaseline,
  countCoreCopies,
  countHydrationMessages,
  parseCli,
  VARIANTS,
} from '../../scripts/consumer-smoke.ts';

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

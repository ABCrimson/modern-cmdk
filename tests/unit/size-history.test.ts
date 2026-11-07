// tests/unit/size-history.test.ts
// RDG-128: the 1.5.0 size record (benchmarks/size-history/1.5.0.json) and every sentence and table that cites it.
// Every number below is read from the record (or from the 1.4.0 record for the "1.4" comparison figures); none is a
// literal. The blob id the docs cite is computed from the record's bytes and asserted; the commit in the blob links is
// not (the orchestrator fills it after the record commit), only the record's path inside those links is.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..', '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');

interface Entry {
  readonly name: string;
  readonly path: string | readonly string[];
  readonly size: number;
  readonly limit: number;
}
interface Tarball {
  readonly sha?: string;
  readonly unpackedSize: number;
  readonly tarballSize: number;
  readonly entryCount: number;
  readonly codemodUnpackedSize?: number;
  readonly runtimeUnpackedSize?: number;
  readonly runtimeUnpackedSizeWithoutNotices?: number;
  readonly thirdPartyNotices?: number | null;
  readonly codemodShim?: number | null;
}
interface SizeRecord {
  readonly sha: string;
  readonly date: string;
  readonly sizeLimit: string;
  readonly node: string;
  readonly entries: readonly Entry[];
  readonly tarballs: Readonly<Record<string, Tarball>>;
}

const RECORD = 'benchmarks/size-history/1.5.0.json';
const record = JSON.parse(read(RECORD)) as SizeRecord;
const previous = JSON.parse(read('benchmarks/size-history/1.4.0.json')) as SizeRecord;
const day = record.date.slice(0, 10);
const recordBytes = readFileSync(join(root, RECORD));
const blob = createHash('sha1')
  .update(`blob ${recordBytes.length}\0`)
  .update(recordBytes)
  .digest('hex')
  .slice(0, 7);

function entry(source: SizeRecord, name: string): Entry {
  const found = source.entries.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`no entry named ${name}`);
  return found;
}
function tarball(key: string): Tarball {
  const found = record.tarballs[key];
  if (found === undefined) throw new Error(`no tarball block ${key}`);
  return found;
}
function line(text: string, start: string): string {
  const found = text.split('\n').find((candidate) => candidate.startsWith(start));
  if (found === undefined) throw new Error(`no line starting ${start}`);
  return found;
}
function section(text: string, heading: string): string {
  const from = text.indexOf(`\n${heading}\n`);
  if (from < 0) throw new Error(`no heading ${heading}`);
  const next = text.indexOf('\n## ', from + 1);
  return text.slice(from, next < 0 ? undefined : next);
}

const core = entry(record, 'modern-cmdk (core)');
const adapter = entry(record, 'modern-cmdk/react (adapter only)');
const dialog = entry(record, 'modern-cmdk/react/dialog (adapter only)');
const separator = entry(record, 'modern-cmdk/react: CommandSeparator only');
const both = entry(record, 'modern-cmdk + modern-cmdk/react');
const styles = entry(record, 'modern-cmdk/styles.css');
const bin = entry(record, 'modern-cmdk codemod bin (installed size)');
const shim = entry(record, 'modern-cmdk codemod shim (bin.mjs)');
const own = entry(record, 'modern-cmdk-codemod (own files, dependencies excluded)');
const old = {
  core: entry(previous, 'modern-cmdk (core)'),
  adapter: entry(previous, 'modern-cmdk/react (adapter only)'),
  dialog: entry(previous, 'modern-cmdk/react/dialog (adapter only)'),
  both: entry(previous, 'modern-cmdk + modern-cmdk/react'),
  styles: entry(previous, 'modern-cmdk/styles.css'),
};
const rc = tarball('modern-cmdk@1.5-rc');
const one4 = tarball('modern-cmdk@1.4');
const codemodPack = tarball('modern-cmdk-codemod@1.5-rc');

describe('benchmarks/size-history/1.5.0.json: the record', () => {
  it('names a commit sha of 7 or more hex characters', () => {
    expect(record.sha).toMatch(/^[0-9a-f]{7,40}$/);
    for (const key of [
      'modern-cmdk@1.5-rc',
      'modern-cmdk-codemod@1.5-rc',
      'create-modern-cmdk@1.5-rc',
    ]) {
      expect(tarball(key).sha).toBe(record.sha);
    }
  });

  it('carries an ISO-8601 date', () => {
    expect(record.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
    expect(Number.isNaN(Date.parse(record.date))).toBe(false);
  });

  it('names the installed size-limit version', () => {
    const installed = JSON.parse(read('node_modules/size-limit/package.json')) as {
      version: string;
    };
    expect(record.sizeLimit).toBe(installed.version);
  });

  it('keeps every entry within its limit', () => {
    expect(record.entries).toHaveLength(9);
    for (const each of record.entries) {
      expect(each.size, each.name).toBeLessThanOrEqual(each.limit);
    }
  });

  it('has a tarball block for each of the three packages', () => {
    expect(Object.keys(record.tarballs).sort()).toEqual([
      'create-modern-cmdk@1.5-rc',
      'modern-cmdk-codemod@1.5-rc',
      'modern-cmdk@1.4',
      'modern-cmdk@1.5-rc',
    ]);
  });

  it('splits the modern-cmdk tarball into a codemod and a runtime part that sum to the unpacked size', () => {
    expect(rc.codemodUnpackedSize).toBe(bin.size);
    expect(rc.codemodShim).toBe(shim.size);
    expect((rc.codemodUnpackedSize ?? 0) + (rc.runtimeUnpackedSize ?? 0)).toBe(rc.unpackedSize);
    expect((rc.runtimeUnpackedSize ?? 0) - (rc.thirdPartyNotices ?? 0)).toBe(
      rc.runtimeUnpackedSizeWithoutNotices,
    );
  });
});

describe('packages/modern-cmdk/README.md: the Sizes section', () => {
  const sizes = section(read('packages/modern-cmdk/README.md'), '## Sizes');
  const rows: readonly [string, Entry][] = [
    ['| `modern-cmdk` (core) |', core],
    ['| `modern-cmdk/react`, adapter only |', adapter],
    ['| `modern-cmdk` + `modern-cmdk/react` |', both],
    ['| `modern-cmdk/react/dialog`, adapter only |', dialog],
    ['| `modern-cmdk/react`, `CommandSeparator` only |', separator],
    ['| `modern-cmdk/styles.css` |', styles],
    ['| codemod bin (', bin],
    ['| codemod shim (', shim],
  ];

  it('cites the record file, the measured sha, the date and the size-limit version', () => {
    expect(sizes).toContain(`benchmarks/size-history/1.5.0.json`);
    expect(sizes).toContain(
      `measured at \`${record.sha}\` on ${day} with size-limit ${record.sizeLimit}`,
    );
  });

  for (const [label, each] of rows) {
    it(`quotes ${each.name} at ${label.trim()}`, () => {
      expect(line(sizes, label)).toContain(`| ${each.size} | ${each.limit} |`);
    });
  }

  it('quotes the packed tarballs of 1.4, modern-cmdk 1.5 and modern-cmdk-codemod', () => {
    expect(sizes).toContain(
      `is ${one4.tarballSize} B packed and ${one4.unpackedSize} B unpacked in ${one4.entryCount} entries`,
    );
    expect(sizes).toContain(
      `${one4.runtimeUnpackedSize} B is runtime and ${one4.codemodUnpackedSize} B is the codemod`,
    );
    expect(sizes).toContain(
      `${rc.tarballSize} B packed and ${rc.unpackedSize} B unpacked in ${rc.entryCount} entries`,
    );
    expect(sizes).toContain(
      `${rc.runtimeUnpackedSize} B is runtime (${rc.runtimeUnpackedSizeWithoutNotices} B without`,
    );
    expect(sizes).toContain(`which is ${rc.thirdPartyNotices} B)`);
    expect(sizes).toContain(
      `${rc.codemodUnpackedSize} B is the codemod, including the ${rc.codemodShim} B shim`,
    );
    expect(sizes).toContain(
      `${codemodPack.tarballSize} B packed and ${codemodPack.unpackedSize} B unpacked in ${codemodPack.entryCount} entries`,
    );
  });
});

describe('apps/docs/benchmarks.md: the bundle-size table', () => {
  const text = read('apps/docs/benchmarks.md');
  const bundle = text.slice(text.indexOf('### Bundle size'), text.indexOf('## Why It'));
  const rows: readonly [string, Entry, string][] = [
    ['| `modern-cmdk` (core) |', core, 'B'],
    ['| `modern-cmdk/react` (adapter only) |', adapter, 'B'],
    ['| `modern-cmdk` + `modern-cmdk/react` |', both, 'B'],
    ['| `modern-cmdk/react/dialog` (adapter only) |', dialog, 'B'],
    ['| `modern-cmdk/react`: `CommandSeparator` only |', separator, 'B'],
    ['| `modern-cmdk/styles.css` |', styles, 'B'],
    ['| `modern-cmdk` codemod bin (bundled) |', bin, 'B (raw)'],
    ['| `modern-cmdk` codemod shim (`bin.mjs`) |', shim, 'B (raw)'],
    ['| `modern-cmdk-codemod` (own files) |', own, 'B (raw)'],
  ];

  it('cites the record, the measured sha, the date, size-limit and Node', () => {
    expect(bundle).toContain('benchmarks/size-history/1.5.0.json');
    expect(bundle).toContain(
      `measured at commit \`${record.sha}\` on ${day} with size-limit ${record.sizeLimit} on Node ${record.node}`,
    );
  });

  it('cites the git blob of the record as committed', () => {
    expect(bundle).toContain(`(git blob \`${blob}\``);
  });

  for (const [label, each, unit] of rows) {
    it(`quotes ${each.name}`, () => {
      expect(line(bundle, label)).toContain(`| ${each.size} ${unit} |`);
    });
  }

  it('names the 1.4.0 whole-bin codemod figure and the 1.4.0 and 1.5.0 adapter figures', () => {
    expect(bundle).toContain(`${one4.codemodUnpackedSize} B for the whole bin`);
    expect(bundle).toContain(
      `the adapter alone was ${old.adapter.size} B and the core plus the adapter together ${old.both.size} B (1.4.0 record), and 1.5.0 measures ${adapter.size} B and ${both.size} B`,
    );
  });
});

describe('ARCHITECTURE.md: the targets table and the lines that cite the record', () => {
  const text = read('ARCHITECTURE.md');

  it('quotes the measured gzip figures of the five JS and CSS rows', () => {
    expect(line(text, '| Core bundle |')).toContain(`Measured ${core.size} B`);
    expect(line(text, '| React adapter only |')).toContain(`Measured ${adapter.size} B`);
    expect(line(text, '| Core + React adapter |')).toContain(
      `Measured ${both.size} B (1.4 measured ${old.both.size} B; 1.3 inlined`,
    );
    expect(line(text, '| `modern-cmdk/react/dialog` only |')).toContain(
      `Measured ${dialog.size} B`,
    );
    expect(line(text, '| `CommandSeparator` only |')).toContain(`Measured ${separator.size} B;`);
    expect(line(text, '| `modern-cmdk/styles.css` |')).toContain(`Measured ${styles.size} B`);
  });

  it('quotes the three codemod rows', () => {
    const binRow = line(text, '| Codemod bin (`modern-cmdk`, deprecated)');
    expect(binRow).toContain(
      `benchmarks/size-history/1.5.0.json\` (${record.sha}, measured ${day} with size-limit ${record.sizeLimit}) holds ${bin.size} B`,
    );
    expect(binRow).toContain(`the 1.4 value was ${one4.codemodUnpackedSize} B`);
    expect(line(text, '| Codemod shim (`bin.mjs`)')).toContain(
      `Measured ${shim.size} B (\`benchmarks/size-history/1.5.0.json\`)`,
    );
    const ownRow = line(text, '| `modern-cmdk-codemod` own files');
    expect(ownRow).toContain(`Measured ${own.size} B (\`benchmarks/size-history/1.5.0.json\`)`);
    expect(ownRow).toContain(
      `the tarball is ${codemodPack.unpackedSize} B unpacked, ${codemodPack.tarballSize} B packed`,
    );
  });

  it('cites the record with its sha, date and size-limit version', () => {
    const cite = line(text, 'Bundle sizes are checked on every CI run');
    expect(cite).toContain(
      '[`benchmarks/size-history/1.5.0.json`](benchmarks/size-history/1.5.0.json)',
    );
    expect(cite).toContain(`size-limit ${record.sizeLimit}, measured ${day} at \`${record.sha}\``);
  });

  it('gives the CommandSeparator sentence the 1.5.0 figures and record', () => {
    const sentence = line(text, 'The `modern-cmdk/react` side gets nothing from `sideEffects`');
    expect(sentence).toContain(
      `(${separator.size} B gzip against ${adapter.size} B for the whole adapter, \`benchmarks/size-history/1.5.0.json\`)`,
    );
    expect(sentence).not.toContain('1.4.0.json');
  });
});

describe('CONTRIBUTING.md: the size-limit paragraph', () => {
  const text = read('CONTRIBUTING.md');
  const paragraph = line(
    text,
    'These limits are defined in the root `package.json` under `size-limit`',
  );

  it('cites the record, the measured sha, the date and size-limit', () => {
    expect(paragraph).toContain(
      `benchmarks/size-history/1.5.0.json\` (${record.sha}, measured ${day} with size-limit ${record.sizeLimit})`,
    );
  });

  it('quotes the codemod bin, the shim and the own files', () => {
    expect(paragraph).toContain(
      `the bundled codemod bin is ${bin.size} B (${one4.codemodUnpackedSize} B in 1.4)`,
    );
    expect(paragraph).toContain(`the shim ${shim.size} B`);
    expect(paragraph).toContain(`own files ${own.size} B`);
  });
});

describe('.changeset/modern-cmdk-1-5-0.md: the Sizes paragraphs', () => {
  const text = read('.changeset/modern-cmdk-1-5-0.md');
  const recorded = line(text, 'Recorded in `benchmarks/size-history/1.5.0.json`');
  const packed = line(text, 'The packed `modern-cmdk@1.5` release candidate');

  it('cites the record, the measured sha and size-limit', () => {
    expect(recorded).toContain(`measured at \`${record.sha}\` with size-limit ${record.sizeLimit}`);
  });

  it('quotes every gzip figure with its 1.4.0 counterpart', () => {
    expect(recorded).toContain(`core ${core.size} B (1.4.0: ${old.core.size} B)`);
    expect(recorded).toContain(`adapter only ${adapter.size} B (${old.adapter.size} B)`);
    expect(recorded).toContain(
      `\`modern-cmdk/react/dialog\` ${dialog.size} B (${old.dialog.size} B)`,
    );
    expect(recorded).toContain(`\`CommandSeparator\` only ${separator.size} B`);
    expect(recorded).toContain(`core + React ${both.size} B (${old.both.size} B)`);
    expect(recorded).toContain(`\`styles.css\` ${styles.size} B (${old.styles.size} B)`);
    expect(recorded).toContain(`The adapter grew by ${adapter.size - old.adapter.size} B`);
  });

  it('quotes the packed tarball against 1.4', () => {
    expect(packed).toContain(`unpacked ${rc.unpackedSize} B against ${one4.unpackedSize} B`);
    expect(packed).toContain(
      `tarball ${rc.tarballSize} B (${rc.entryCount} entries) against ${one4.tarballSize} B (${one4.entryCount} entries)`,
    );
    expect(packed).toContain(
      `The codemod part is ${rc.codemodUnpackedSize} B (${one4.codemodUnpackedSize} B in 1.4), including the ${rc.codemodShim} B shim`,
    );
    expect(packed).toContain(
      `The runtime part is ${rc.runtimeUnpackedSize} B against ${one4.runtimeUnpackedSize} B in 1.4: ${rc.runtimeUnpackedSizeWithoutNotices} B without the ${rc.thirdPartyNotices} B`,
    );
  });
});

describe('apps/docs/guide/ssr.md: the Tree-Shaking figures', () => {
  const text = read('apps/docs/guide/ssr.md');
  const paragraph = line(
    text,
    "`import { Command } from 'modern-cmdk/react'` pulls every subcomponent",
  );

  it('cites the 1.5.0 record at its measured sha', () => {
    expect(paragraph).toContain('benchmarks/size-history/1.5.0.json');
    expect(paragraph).not.toContain('1.4.0.json');
    expect(paragraph).toContain(
      `measured at \`${record.sha}\` with size-limit ${record.sizeLimit}`,
    );
  });

  it('cites the git blob of the record', () => {
    expect(paragraph).toContain(`(git blob \`${blob}\``);
  });

  it('quotes the CommandSeparator-only figure against the whole adapter', () => {
    expect(paragraph).toContain(`**${separator.size} B gzip**`);
    expect(paragraph).toContain(`against ${adapter.size} B for the whole adapter`);
  });
});

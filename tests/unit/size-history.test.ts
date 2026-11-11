// tests/unit/size-history.test.ts
// RDG-128: the 1.7.0 size record (benchmarks/size-history/1.7.0.json) and every sentence and table that cites it.
// The Sizes paragraphs of the 1.5.0 release are history: they are read from .changeset/modern-cmdk-1-5-0.md while that
// changeset is pending and from the CHANGELOG 1.5.0 entry once the Version PR has consumed it (TUB-75; DT-74's rule for
// the bug-report template), and they quote the 1.5.0 record against the 1.4.0 record.
// Every number below is read from the record (or from the 1.6.0 record for the "1.6" comparison figures); none is a
// literal. The blob id the docs cite is computed from the record's bytes and asserted; the commit in the blob links is
// not (D98: release/1.7.0 lands on main by a linear rebase, which rewrites it, and the orchestrator then updates the sha
// in the docs), only the record's path inside those links and the shape of the sha are.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
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

const RECORD = 'benchmarks/size-history/1.7.0.json';
const PREVIOUS = 'benchmarks/size-history/1.6.0.json';
const RECORD_1_5 = 'benchmarks/size-history/1.5.0.json';
const RECORD_1_4 = 'benchmarks/size-history/1.4.0.json';
const record = JSON.parse(read(RECORD)) as SizeRecord;
const previous = JSON.parse(read(PREVIOUS)) as SizeRecord;
const day = record.date.slice(0, 10);
const recordBytes = readFileSync(join(root, RECORD));
const blob = createHash('sha1')
  .update(`blob ${recordBytes.length}\0`)
  .update(recordBytes)
  .digest('hex')
  .slice(0, 7);
const BLOB_LINK = /blob\/[0-9a-f]{7,40}\/benchmarks\/size-history\/1\.7\.0\.json/;
const COMMITTED_IN = /committed in `[0-9a-f]{7,40}`/;

function entry(source: SizeRecord, name: string): Entry {
  const found = source.entries.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`no entry named ${name}`);
  return found;
}
function tarball(key: string, source: SizeRecord = record): Tarball {
  const found = source.tarballs[key];
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
  bin: entry(previous, 'modern-cmdk codemod bin (installed size)'),
};
const rc = tarball('modern-cmdk@1.7-rc');
const codemodPack = tarball('modern-cmdk-codemod@1.7-rc');

describe('benchmarks/size-history/1.7.0.json: the record', () => {
  it('names a commit sha of 7 or more hex characters', () => {
    expect(record.sha).toMatch(/^[0-9a-f]{7,40}$/);
    for (const key of [
      'modern-cmdk@1.7-rc',
      'modern-cmdk-codemod@1.7-rc',
      'create-modern-cmdk@1.7-rc',
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
      'create-modern-cmdk@1.7-rc',
      'modern-cmdk-codemod@1.7-rc',
      'modern-cmdk@1.7-rc',
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

describe('packages/modern-cmdk/README.md: the figures between the markers', () => {
  const readme = read('packages/modern-cmdk/README.md');
  const between = (start: string, end: string): string => {
    const from = readme.indexOf(start);
    const to = readme.indexOf(end);
    if (from < 0 || to < from) throw new Error(`no ${start} ... ${end} block`);
    return readme.slice(from + start.length, to);
  };
  const figures = between('<!-- figures:start -->', '<!-- figures:end -->');
  const figuresLine = between('<!-- figures-line:start -->', '<!-- figures-line:end -->');
  const baseline = JSON.parse(read('benchmarks/baseline.json')) as {
    readonly records: Readonly<
      Record<
        string,
        {
          readonly date: string;
          readonly environment: { readonly cpuCount: number };
          readonly benchmarks: {
            readonly search: Readonly<Record<string, { readonly median_ms: number }>>;
          };
        }
      >
    >;
  };
  const runner = baseline.records['AMD EPYC 7763 64-Core Processor'];
  const kilobytes = (each: Entry): string => `${(each.size / 1000).toFixed(1)} kB`;

  it('quotes the gzip size of the core, the core with the React adapter and the stylesheet from the record', () => {
    expect(line(figures, '| Core, `modern-cmdk` |')).toBe(
      `| Core, \`modern-cmdk\` | ${kilobytes(core)} gzip[^size] |`,
    );
    expect(line(figures, '| Core + `modern-cmdk/react` |')).toBe(
      `| Core + \`modern-cmdk/react\` | ${kilobytes(both)} gzip[^size] |`,
    );
    expect(line(figures, '| `modern-cmdk/styles.css` |')).toBe(
      `| \`modern-cmdk/styles.css\` | ${kilobytes(styles)} gzip[^size] |`,
    );
  });

  it('repeats the core and core-plus-adapter figures in the one-line summary', () => {
    expect(figuresLine).toContain(`**${kilobytes(core).replace(' kB', '')} kB** gzip core`);
    expect(figuresLine).toContain(
      `**${kilobytes(both).replace(' kB', '')} kB** with the React adapter`,
    );
  });

  it('quotes the search benchmark median of the recorded runner, and its date and core count', () => {
    expect(runner, 'baseline.json has a record for the AMD EPYC 7763 runner').toBeDefined();
    const median = runner?.benchmarks.search['ts-scorer-10k']?.median_ms ?? Number.NaN;
    expect(line(figures, '| Search 10,000 items for one query |')).toBe(
      `| Search 10,000 items for one query | median ${median.toFixed(1)} ms[^bench] |`,
    );
    expect(figures).toContain(`recorded on ${runner?.date}`);
    expect(figures).toContain(`(AMD EPYC 7763, ${runner?.environment.cpuCount} cores)`);
  });

  it('says the unpacked size is mostly the deprecated bin, with the bin size from the record', () => {
    expect(figures).toContain(
      `Most of the unpacked size npm lists is the deprecated \`modern-cmdk\` bin and the packages it bundles (${(bin.size / 1_000_000).toFixed(2)} MB)`,
    );
  });

  it('links both records at a 40-character commit, and quotes no release-candidate tarball figure', () => {
    const linked = [...figures.matchAll(/\/blob\/[0-9a-f]{40}\/([^)\s]+)\)/g)].map((m) => m[1]);
    expect(linked).toEqual(['benchmarks/size-history/1.7.0.json', 'benchmarks/baseline.json']);
    for (const stale of [rc.tarballSize, rc.unpackedSize, rc.runtimeUnpackedSize]) {
      expect(readme, `the README quotes the release candidate figure ${stale}`).not.toContain(
        String(stale),
      );
    }
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
    expect(bundle).toContain('benchmarks/size-history/1.7.0.json');
    expect(bundle).toMatch(BLOB_LINK);
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

  it('names the 1.6.0 and 1.7.0 adapter figures', () => {
    expect(bundle).toContain(
      `the adapter alone was ${old.adapter.size} B and the core plus the adapter together ${old.both.size} B (1.6.0 record), and 1.7.0 measures ${adapter.size} B and ${both.size} B`,
    );
  });
});

describe('ARCHITECTURE.md: the targets table and the lines that cite the record', () => {
  const text = read('ARCHITECTURE.md');

  it('quotes the measured gzip figures of the five JS and CSS rows', () => {
    expect(line(text, '| Core bundle |')).toContain(`Measured ${core.size} B`);
    expect(line(text, '| React adapter only |')).toContain(`Measured ${adapter.size} B`);
    expect(line(text, '| Core + React adapter |')).toContain(
      `Measured ${both.size} B (1.6 measured ${old.both.size} B; 1.3 inlined`,
    );
    expect(line(text, '| `modern-cmdk/react/dialog` only |')).toContain(
      `Measured ${dialog.size} B`,
    );
    const separatorRow = line(text, '| `CommandSeparator` only |');
    expect(separatorRow).toContain(`Measured ${separator.size} B;`);
    expect(separatorRow).toContain('D116');
    expect(separatorRow).not.toContain('still contains');
    expect(separatorRow).not.toContain('not a tree-shaking claim');
    expect(line(text, '| `modern-cmdk/styles.css` |')).toContain(`Measured ${styles.size} B`);
  });

  it('quotes the three codemod rows', () => {
    const binRow = line(text, '| Codemod bin (`modern-cmdk`, deprecated)');
    expect(binRow).toContain(
      `benchmarks/size-history/1.7.0.json\` (${record.sha}, measured ${day} with size-limit ${record.sizeLimit}) holds ${bin.size} B`,
    );
    expect(binRow).toContain(`the 1.6 value was ${old.bin.size} B`);
    expect(line(text, '| Codemod shim (`bin.mjs`)')).toContain(
      `Measured ${shim.size} B (\`benchmarks/size-history/1.7.0.json\`)`,
    );
    const ownRow = line(text, '| `modern-cmdk-codemod` own files');
    expect(ownRow).toContain(`Measured ${own.size} B (\`benchmarks/size-history/1.7.0.json\`)`);
    expect(ownRow).toContain(
      `the tarball is ${codemodPack.unpackedSize} B unpacked, ${codemodPack.tarballSize} B packed`,
    );
  });

  it('cites the record with its sha, date and size-limit version', () => {
    const cite = line(text, 'Bundle sizes are checked on every CI run');
    expect(cite).toContain(
      '[`benchmarks/size-history/1.7.0.json`](benchmarks/size-history/1.7.0.json)',
    );
    expect(cite).toMatch(COMMITTED_IN);
    expect(cite).toContain(`size-limit ${record.sizeLimit}, measured ${day} at \`${record.sha}\``);
  });

  it('gives the CommandSeparator sentence the 1.7.0 figures and record', () => {
    const sentence = line(text, 'The `modern-cmdk/react` side gets nothing from `sideEffects`');
    expect(sentence).toContain(
      `(${separator.size} B gzip against ${adapter.size} B for the whole adapter, \`benchmarks/size-history/1.7.0.json\`)`,
    );
    expect(sentence).not.toContain('1.5.0.json');
    expect(sentence).not.toContain('1.4.0.json');
  });
});

describe('CONTRIBUTING.md: the size-limit paragraph', () => {
  const text = read('CONTRIBUTING.md');
  const paragraph = line(
    text,
    'These limits are defined in the root `.size-limit.mjs`, which measures with `process.env.NODE_ENV` defined as `"production"`',
  );

  it('cites the record, the measured sha, the date and size-limit', () => {
    expect(paragraph).toContain(
      `benchmarks/size-history/1.7.0.json\` (${record.sha}, measured ${day} with size-limit ${record.sizeLimit})`,
    );
  });

  it('quotes the codemod bin, the shim and the own files', () => {
    expect(paragraph).toContain(
      `the bundled codemod bin is ${bin.size} B, as in the 1.6 record (${old.bin.size} B)`,
    );
    expect(paragraph).toContain(`the shim ${shim.size} B`);
    expect(paragraph).toContain(`own files ${own.size} B`);
  });
});

/**
 * The Sizes paragraphs live in .changeset/modern-cmdk-1-5-0.md until the Version PR consumes the changeset into
 * packages/modern-cmdk/CHANGELOG.md, where @changesets/changelog-github writes the body under the entry's first line with
 * every continuation line indented by two spaces. The Version PR's CI runs on that tree, so the suite reads whichever the
 * tree holds, de-indented, and the line lookups below see the paragraphs as the changeset wrote them (TUB-75).
 */
function sizesText(): string {
  const changeset = join(root, '.changeset/modern-cmdk-1-5-0.md');
  if (existsSync(changeset)) return readFileSync(changeset, 'utf8');
  return section(read('packages/modern-cmdk/CHANGELOG.md'), '## 1.5.0').replaceAll(/^ {2}/gm, '');
}

describe('the Sizes paragraphs: .changeset/modern-cmdk-1-5-0.md while it is pending, the CHANGELOG 1.5.0 entry once consumed', () => {
  // History: these paragraphs quote the 1.5.0 record against the 1.4.0 record, not the current record.
  const record = JSON.parse(read(RECORD_1_5)) as SizeRecord;
  const previous = JSON.parse(read(RECORD_1_4)) as SizeRecord;
  const core = entry(record, 'modern-cmdk (core)');
  const adapter = entry(record, 'modern-cmdk/react (adapter only)');
  const dialog = entry(record, 'modern-cmdk/react/dialog (adapter only)');
  const separator = entry(record, 'modern-cmdk/react: CommandSeparator only');
  const both = entry(record, 'modern-cmdk + modern-cmdk/react');
  const styles = entry(record, 'modern-cmdk/styles.css');
  const old = {
    core: entry(previous, 'modern-cmdk (core)'),
    adapter: entry(previous, 'modern-cmdk/react (adapter only)'),
    dialog: entry(previous, 'modern-cmdk/react/dialog (adapter only)'),
    both: entry(previous, 'modern-cmdk + modern-cmdk/react'),
    styles: entry(previous, 'modern-cmdk/styles.css'),
  };
  const rc = tarball('modern-cmdk@1.5-rc', record);
  const one4 = tarball('modern-cmdk@1.4', record);
  const text = sizesText();
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
  const paragraph = line(text, 'A bundle that imports only individual components from');

  it('states the D116 property and drops the claim that the compound cannot be shaken', () => {
    expect(paragraph).toContain('/* @__PURE__ */ Object.assign');
    expect(paragraph).toContain('D116');
    expect(paragraph).toContain('Importing `Command` keeps every static');
    expect(paragraph).not.toContain('pulls every subcomponent');
    expect(paragraph).not.toContain('out of 1.x');
    expect(paragraph).not.toContain('still contains');
  });

  it('cites the 1.7.0 record at its measured sha', () => {
    expect(paragraph).toContain('benchmarks/size-history/1.7.0.json');
    expect(paragraph).toMatch(BLOB_LINK);
    expect(paragraph).not.toContain('1.5.0.json');
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

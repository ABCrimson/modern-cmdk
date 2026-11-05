#!/usr/bin/env node
// Phantom-claim guard: fails when the user-facing docs state something the code does not do.
// Usage: node scripts/check-claims.mjs [--wiki <dir>]
//
// Scans README.md, packages/*/README.md, ARCHITECTURE.md, CONTRIBUTING.md, SECURITY.md and
// apps/docs/** (tracked and untracked-but-not-ignored files), plus every file of the wiki clone
// when --wiki is given. Never CHANGELOG*.md (history may name removed things), packages/*/src/**
// or docs/** (worker-engine.ts really uses Promise.withResolvers).
// Exit 0: no hit. Exit 1: at least one hit, each printed as file:line: text. Exit 2: usage or git error.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

// Each rule is an extended regular expression (git grep -E, case-insensitive) and an optional
// predicate that excuses a hit: allow(text, file, root) returns true when the line is legitimate
// (file is relative to root.cwd, with forward slashes).
const RULES = [
  {
    // The library does not use RegExp.escape; a line may say so ("not used")
    pattern: String.raw`RegExp\.escape`,
    allow: (text) => /not used/i.test(text),
  },
  { pattern: 'WeakRef' },
  { pattern: 'withResolvers.*(scheduler|flush)|(scheduler|flush).*withResolvers' },
  {
    // The 1.x scorer does not decay by exponential time; only a page under apps/docs whose front
    // matter says `scoringModel: v2` (the 1.11 model) may describe it. No such page exists yet.
    pattern: 'exponential( time)? decay',
    allow: (_text, file, root) =>
      !root.noIndex && file.startsWith('apps/docs/') && isV2ModelPage(resolve(root.cwd, file)),
  },
  { pattern: 'sub-1ms|sub-millisecond' },
  { pattern: String.raw`command\.crimson\.dev` },
  { pattern: 'ES2026 Iterator' },
  {
    // The stylesheet animates opacity, scale, translate, background-color and the list's height
    // (CONTRIBUTING.md's animation convention, DG-107); the last two repaint or relayout, so no blanket GPU claim holds.
    // The claims DG-87, DG-94, DG-99, DG-107, DG-119 and DG-121 removed must not return, nor their spaced or
    // other variants ('GPU composited', 'GPU-optimized', 'GPU acceleration'; RDG-123).
    pattern: 'GPU[- ](composit|only|accelerat|optimi)',
  },
  {
    // The adapter offsets virtual items with the individual `translate` property (item.tsx:79).
    pattern: 'translateY',
  },
];

let values;
try {
  ({ values } = parseArgs({ options: { wiki: { type: 'string' } }, strict: true }));
} catch (error) {
  process.stderr.write(`${error.message}\nUsage: node scripts/check-claims.mjs [--wiki <dir>]\n`);
  process.exit(2);
}

const REPO_PATHSPEC = [
  'README.md',
  ':(glob)packages/*/README.md',
  'ARCHITECTURE.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'apps/docs',
  ':(exclude,glob)**/CHANGELOG*.md',
  ':(exclude,glob)packages/*/src/**',
  ':(exclude)docs',
];

const roots = [{ cwd: process.cwd(), pathspec: REPO_PATHSPEC, noIndex: false }];
if (values.wiki !== undefined) {
  roots.push({
    cwd: resolve(values.wiki),
    pathspec: [':(exclude,glob)**/CHANGELOG*.md'],
    noIndex: true,
  });
}

/** True when the markdown file at `path` opens with front matter containing `scoringModel: v2`. */
function isV2ModelPage(path) {
  try {
    const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(path, 'utf8'));
    return front !== null && /^scoringModel:\s*v2\s*$/m.test(front[1]);
  } catch {
    return false;
  }
}

function grep({ cwd, pathspec, noIndex }, pattern) {
  const args = ['grep', '-n', '-I', '-i', '-E', '-e', pattern];
  // The wiki is a plain clone checked out for reading; the repository scan also sees new files
  args.splice(1, 0, ...(noIndex ? ['--no-index'] : ['--untracked']));
  args.push('--', ...pathspec);
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    // git grep exits 1 when nothing matched; any other status is a real failure
    if (error.status === 1) return '';
    process.stderr.write(
      `git grep failed in ${cwd}: ${String(error.stderr ?? error.message).trim()}\n`,
    );
    process.exit(2);
  }
}

const hits = [];
for (const root of roots) {
  for (const rule of RULES) {
    for (const line of grep(root, rule.pattern).split(/\r?\n/)) {
      if (line === '') continue;
      // path:lineno:text (Windows drive letters never appear: paths are relative to cwd).
      // A wiki file with CRLF endings leaves a \r before the newline, hence the split above.
      const match = /^(.*?):(\d+):(.*)$/.exec(line);
      if (match === null) {
        process.stderr.write(`unparsable git grep line: ${line}\n`);
        process.exit(2);
      }
      const [, file, lineNo, text] = match;
      if (rule.allow?.(text, file, root) === true) continue;
      const shown = root.noIndex ? `wiki:${file}` : file;
      hits.push(`${shown}:${lineNo}: [${rule.pattern}] ${text.trim()}`);
    }
  }
}

for (const hit of hits) process.stdout.write(`${hit}\n`);
const scanned = roots.length === 1 ? 'the repository' : 'the repository and the wiki';
process.stdout.write(`check-claims: ${hits.length} hit(s) in ${scanned}\n`);
process.exit(hits.length === 0 ? 0 : 1);

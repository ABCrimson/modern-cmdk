// Helper module (not a test file) for the codemod fixture suites.
//
// A case is a directory tests/fixtures/codemod/<transform>/<case>/ holding input.<ext> and
// output.<ext> (same extension) and an optional reports.json (a string[]). Fixtures are committed
// with LF endings and read as utf8, never trimmed: tests diff whole files byte for byte. A CRLF
// variant is built with toCrlf on both sides, never committed. jscodeshift's own testUtils trims
// the transform's output and the expected output (src/testUtils.js:38, :41, :60), so it is not
// used here.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { API, FileInfo } from 'jscodeshift';
import jscodeshift from 'jscodeshift';

const FIXTURE_ROOT = join(import.meta.dirname, '..', 'fixtures', 'codemod');

export interface FixtureCase {
  readonly inputPath: string;
  readonly input: string;
  readonly output: string;
  readonly reports: string[];
}

export interface TransformResult {
  readonly output: string;
  readonly reports: string[];
}

export type Parser = 'ts' | 'tsx' | 'babel';

type Transform = (file: FileInfo, api: API) => string | null | undefined;

/** The case directories of a transform, sorted. */
export function listCases(transform: string): string[] {
  return readdirSync(join(FIXTURE_ROOT, transform), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function findFile(dir: string, stem: 'input' | 'output'): string | undefined {
  return readdirSync(dir)
    .filter((name) => name.startsWith(`${stem}.`))
    .sort()[0];
}

/** Read one case. A missing input or output file is an error naming the case. */
export function readCase(transform: string, name: string): FixtureCase {
  const dir = join(FIXTURE_ROOT, transform, name);
  const inputName = findFile(dir, 'input');
  if (inputName === undefined) {
    throw new Error(`codemod fixture ${transform}/${name}: no input.<ext> file`);
  }
  const ext = inputName.slice('input'.length);
  const outputName = `output${ext}`;
  if (!existsSync(join(dir, outputName))) {
    throw new Error(`codemod fixture ${transform}/${name}: missing ${outputName}`);
  }
  const reportsPath = join(dir, 'reports.json');
  const reports: string[] = existsSync(reportsPath)
    ? (JSON.parse(readFileSync(reportsPath, 'utf8')) as string[])
    : [];
  return {
    inputPath: join(dir, inputName),
    input: readFileSync(join(dir, inputName), 'utf8'),
    output: readFileSync(join(dir, outputName), 'utf8'),
    reports,
  };
}

/**
 * Run a jscodeshift transform on one file. A transform that returns undefined or null leaves
 * the source unchanged, as jscodeshift's own runner treats it.
 */
export function applyTransform(
  mod: Transform,
  file: { path: string; source: string },
  parser: Parser,
): TransformResult {
  const reports: string[] = [];
  const j = jscodeshift.withParser(parser);
  const api: API = {
    jscodeshift: j,
    j,
    stats: () => {},
    report: (message: string) => {
      reports.push(message);
    },
  };
  const result = mod({ path: file.path, source: file.source }, api);
  return { output: result ?? file.source, reports };
}

/** Run a stylesheet rewrite (source, report) => output and collect its reports. */
export function applyStylesheet(
  fn: (source: string, report: (message: string) => void) => string,
  source: string,
): TransformResult {
  const reports: string[] = [];
  const output = fn(source, (message) => {
    reports.push(message);
  });
  return { output, reports };
}

/** Turn every LF or CRLF into CRLF. */
export function toCrlf(s: string): string {
  return s.replace(/\r?\n/g, '\r\n');
}

// Builds dist/react/styles.css (the package.json ./styles.css export) from src/react/styles.css:
// minified, comment-free and without a source map, through lightningcss (D122, D139). Run it after
// tsdown, whose `clean` empties dist first: `node scripts/build-styles.ts` (Node strips the types).
// Importing the module only loads the transform; the file is written when it is the entry point.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { type Declaration, Features, type Targets, transform } from 'lightningcss';

const packageDir = resolve(import.meta.dirname, '..');

/** The stylesheet source. */
export const sourcePath: string = resolve(packageDir, 'src/react/styles.css');

/** The built stylesheet, the target of the package.json `./styles.css` export. */
export const outputPath: string = resolve(packageDir, 'dist/react/styles.css');

/** lightningcss encodes a browser version as `major << 16 | minor << 8`. */
const version = (major: number, minor = 0): number => (major << 16) | (minor << 8);

/**
 * The browser floor: Chrome and Edge 123 (the first with light-dark()), Firefox 131, Safari and
 * iOS Safari 18.4. Without targets lightningcss folds animation-timeline into the animation
 * shorthand and text-decoration-thickness into text-decoration, which engines below the floor drop
 * whole; at the floor neither merge happens and light-dark() needs no lowering.
 */
export const targets: Targets = {
  chrome: version(123),
  edge: version(123),
  firefox: version(131),
  safari: version(18, 4),
  ios_saf: version(18, 4),
};

/** Builds the stylesheet bytes; throws on any lightningcss warning, so none is silently dropped. */
export function buildStyles(code: Uint8Array): Uint8Array {
  const { code: built, warnings } = transform({
    filename: sourcePath,
    code,
    minify: true,
    targets,
    // The browsers of the floor all support light-dark(); the minifier would lower it otherwise.
    exclude: Features.LightDark,
  });
  if (warnings.length > 0) {
    const lines = warnings.map(
      ({ message, loc }) => `${message} (${loc.filename}:${loc.line}:${loc.column})`,
    );
    throw new Error(`lightningcss reported ${warnings.length} warning(s):\n${lines.join('\n')}`);
  }
  return built;
}

/** Every declaration of a stylesheet at the floor's targets, in the AST lightningcss parses (tests). */
export function declarationsOf(code: Uint8Array): Declaration[] {
  const found: Declaration[] = [];
  const collect = (declaration: Declaration): void => {
    found.push(declaration);
  };
  transform({
    filename: outputPath,
    code,
    targets,
    visitor: { Declaration: collect },
  });
  return found;
}

if (import.meta.main) {
  try {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, buildStyles(readFileSync(sourcePath)));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

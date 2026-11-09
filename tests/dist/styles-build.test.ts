// tests/dist/styles-build.test.ts
// PKG-10, D122, D139: dist/react/styles.css (the package.json ./styles.css export) is the
// lightningcss build of src/react/styles.css that packages/modern-cmdk/scripts/build-styles.ts
// makes at the browser floor: minified, comment-free, with the floor's features intact. Without
// `targets` lightningcss folds animation-timeline into the animation shorthand and
// text-decoration-thickness into text-decoration, which engines at the floor drop whole.
// `exclude: Features.LightDark` is a guard that changes no byte at the floor (every target
// supports light-dark()); no case here pins it.
// Needs: pnpm build (the dist project runs after the build).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildStyles,
  declarationsOf,
  outputPath,
  sourcePath,
} from '../../packages/modern-cmdk/scripts/build-styles.ts';

const source = readFileSync(sourcePath, 'utf8');
const built = readFileSync(outputPath, 'utf8');

describe('dist/react/styles.css', () => {
  it('PKG-10: dist/react/styles.css is the lightningcss build of src/react/styles.css at the browser floor', () => {
    const expected = Buffer.from(buildStyles(readFileSync(sourcePath))).toString('utf8');
    expect(built).toBe(expected);
  });

  it('PKG-10: no animation shorthand in the built stylesheet carries a timeline and no text-decoration shorthand carries a thickness', () => {
    const declarations = declarationsOf(Buffer.from(built));
    const properties = new Set(declarations.map((d) => d.property));
    // The longhands exist, so the shorthand assertions below cannot pass vacuously
    expect(properties.has('animation-timeline')).toBe(true);
    expect(properties.has('text-decoration-thickness')).toBe(true);

    const animations = declarations.filter((d) => d.property === 'animation');
    const decorations = declarations.filter((d) => d.property === 'text-decoration');
    expect(animations.length).toBeGreaterThan(0);
    for (const declaration of animations) {
      if (declaration.property !== 'animation') continue;
      for (const animation of declaration.value)
        expect(animation.timeline).toEqual({ type: 'auto' });
    }
    for (const declaration of decorations) {
      if (declaration.property !== 'text-decoration') continue;
      expect(declaration.value.thickness).toEqual({ type: 'auto' });
    }
  });

  it('PKG-10: the built stylesheet has no comment', () => {
    expect(built).not.toContain('/*');
  });

  it('PKG-10: the built stylesheet keeps every @property, both @starting-style blocks, light-dark(, the -webkit-user-select twins and the four layers in order', () => {
    const names = [...source.matchAll(/@property\s+(--command-[\w-]+)/g)].map((m) => m[1]);
    expect(names).toHaveLength(5);
    for (const name of names) expect(built).toContain(`@property ${name}`);

    const startingStyles = (css: string): number => css.match(/@starting-style/g)?.length ?? 0;
    expect(startingStyles(source)).toBe(2);
    expect(startingStyles(built)).toBe(2);

    expect(built).toContain('light-dark(');

    // Whitespace-insensitive, so the check reads the source and the minified file alike
    const userSelects = [...built.matchAll(/(?<![\w-])user-select\s*:/g)];
    const twins = [
      ...built.matchAll(
        /-webkit-user-select\s*:\s*([^;}]+?)\s*;\s*user-select\s*:\s*([^;}]+?)\s*[;}]/g,
      ),
    ];
    expect(userSelects.length).toBeGreaterThanOrEqual(2);
    expect(twins.length).toBe(userSelects.length);
    for (const [, prefixed, plain] of twins) expect(prefixed).toBe(plain);

    // The `@layer a, b, c, d;` order statement is gone from the build; the four blocks keep the
    // order
    const layers = [...built.matchAll(/@layer\s+(command\.\w+)\s*\{/g)].map((m) => m[1]);
    expect([...new Set(layers)]).toEqual([
      'command.base',
      'command.layout',
      'command.animation',
      'command.a11y',
    ]);
  });
});

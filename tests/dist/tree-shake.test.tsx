// tests/dist/tree-shake.test.tsx
// D116: the Command namespace is tree-shakeable. `Command` is `Object.assign(CommandRoot, { ...statics })`; unless that
// module-scope call is marked pure, a bundle that imports one part (CommandSeparator) keeps CommandRoot and every
// component the statics reference. The BUILT react entry is bundled the way @size-limit/rolldown bundles it
// (rolldown, minify and treeshake on, react, react-dom, radix-ui and modern-cmdk external). The root's
// `data-command-root` attribute is the marker only CommandRoot carries. The second test renders the namespace from
// the built dist, so a build that lost the statics goes red. Needs `pnpm build` first.

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

const reactEntry: string = resolve(
  import.meta.dirname,
  '../../packages/modern-cmdk/dist/react/index.mjs',
);
const distBuilt: boolean = existsSync(reactEntry);

if (!distBuilt && process.env.CI) {
  throw new Error(
    `${reactEntry} is missing: run pnpm build first (tests/dist needs the built package)`,
  );
}

/** The slice of rolldown's `build()` this file calls. */
interface RolldownBuild {
  readonly build: (options: {
    readonly input: string;
    readonly external: RegExp;
    readonly platform: 'neutral';
    readonly treeshake: boolean;
    readonly write: false;
    readonly plugins: readonly {
      readonly name: string;
      readonly resolveId: (id: string) => string | undefined;
      readonly load: (id: string) => string | undefined;
    }[];
    readonly output: { readonly minify: boolean };
    readonly onLog: (level: string, log: { readonly code?: string }) => void;
  }) => Promise<{
    readonly output: readonly { readonly type: string; readonly code?: string }[];
  }>;
}

/** The copy of rolldown @size-limit/rolldown uses, so the test bundles with the measuring tool's own engine. */
async function loadRolldown(): Promise<RolldownBuild> {
  const root = createRequire(import.meta.url);
  const preset = createRequire(root.resolve('@size-limit/preset-small-lib'));
  const sizeLimitRolldown = createRequire(preset.resolve('@size-limit/rolldown'));
  return (await import(pathToFileURL(sizeLimitRolldown.resolve('rolldown')).href)) as RolldownBuild;
}

/** An attribute only CommandRoot renders (command.tsx); a string literal, so it survives minification. */
const ROOT_MARKER = 'data-command-root';

const VIRTUAL_ENTRY = 'virtual:d116-entry';

/** Bundles a virtual entry module made of `source`, which imports from the built react entry. */
async function bundleEntry(source: string): Promise<string> {
  const { build } = await loadRolldown();
  const result = await build({
    input: VIRTUAL_ENTRY,
    external: /^(react|react-dom|radix-ui|modern-cmdk)($|\/)/u,
    platform: 'neutral',
    treeshake: true,
    write: false,
    plugins: [
      {
        name: 'd116-entry',
        resolveId: (id: string) => (id === VIRTUAL_ENTRY ? id : undefined),
        load: (id: string) => (id === VIRTUAL_ENTRY ? source : undefined),
      },
    ],
    output: { minify: true },
    onLog(_level: string, log: { readonly code?: string }): void {
      if (log.code === 'UNRESOLVED_IMPORT') throw new Error('unresolved import in the D116 entry');
    },
  });
  return result.output
    .map((chunk) => (chunk.type === 'chunk' ? (chunk.code ?? '') : ''))
    .join('\n');
}

describe.skipIf(!distBuilt)('built package: Command namespace tree-shaking', () => {
  it('D116: a bundle importing only CommandSeparator from the built react entry carries no CommandRoot', async () => {
    const from = JSON.stringify(reactEntry);
    // The control proves the marker is findable: importing Command keeps the root.
    const control = await bundleEntry(`export { Command } from ${from};`);
    expect(control).toContain(ROOT_MARKER);
    const separator = await bundleEntry(`export { CommandSeparator } from ${from};`);
    expect(separator).not.toContain(ROOT_MARKER);
  });

  it('D116: Command.Item renders through the Command namespace of the built react entry', async () => {
    const { Command } = (await import(
      /* @vite-ignore */ pathToFileURL(reactEntry).href
    )) as typeof import('modern-cmdk/react');
    render(
      <Command>
        <Command.List>
          <Command.Item value="x">x</Command.Item>
        </Command.List>
      </Command>,
    );
    expect(await screen.findByText('x')).toBeTruthy();
  });
});

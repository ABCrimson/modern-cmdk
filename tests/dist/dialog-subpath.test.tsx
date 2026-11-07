// tests/dist/dialog-subpath.test.tsx
// The additive modern-cmdk/react/dialog subpath (RP-02) exports the same CommandDialog as the
// barrel. Imports the BUILT files, so it needs `pnpm build` first.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

const reactEntry: string = resolve(
  import.meta.dirname,
  '../../packages/modern-cmdk/dist/react/index.mjs',
);
const dialogEntry: string = resolve(
  import.meta.dirname,
  '../../packages/modern-cmdk/dist/react/dialog.mjs',
);
const distBuilt: boolean = existsSync(reactEntry) && existsSync(dialogEntry);

if (!distBuilt && process.env.CI) {
  throw new Error(`${dialogEntry} is missing — run pnpm build first`);
}

type DistReact = typeof import('modern-cmdk/react');
type DistDialog = typeof import('modern-cmdk/react/dialog');

const load = async (): Promise<{ react: DistReact; dialog: DistDialog }> => ({
  react: await import(/* @vite-ignore */ pathToFileURL(reactEntry).href),
  dialog: await import(/* @vite-ignore */ pathToFileURL(dialogEntry).href),
});

describe.skipIf(!distBuilt)('built package: modern-cmdk/react/dialog', () => {
  it('modern-cmdk/react/dialog exports the same CommandDialog as modern-cmdk/react', async () => {
    const { react, dialog } = await load();
    expect(Object.keys(dialog)).toEqual(['CommandDialog']);
    expect(dialog.CommandDialog).toBe(react.CommandDialog);
    expect(dialog.CommandDialog).toBe(react.Command.Dialog);
  });

  it('renders the subpath CommandDialog open and filters its items', async () => {
    const { react, dialog } = await load();
    const { Command } = react;
    render(
      <dialog.CommandDialog open label="Palette">
        <Command.Input placeholder="Search" />
        <Command.List>
          <Command.Item value="apple">Apple</Command.Item>
          <Command.Item value="banana">Banana</Command.Item>
          <Command.Item value="cherry">Cherry</Command.Item>
        </Command.List>
      </dialog.CommandDialog>,
    );
    expect(await screen.findAllByRole('option')).toHaveLength(3);
    await userEvent.type(screen.getByPlaceholderText('Search'), 'ban');
    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]?.textContent).toBe('Banana');
  });
});

// tests/unit/item-hover.test.tsx
// D104: a pointer move over a Command.Item sends ITEM_ACTIVATE straight to the machine. The committed renders
// go from the first item to the hovered one, with no intermediate previous id and no Command.Loading mount.

import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { Command, CommandStateContext } from 'modern-cmdk/react';
import { type ReactNode, use, useLayoutEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(cleanup);

interface Commit {
  readonly activeId: string | null;
  readonly loadingMounted: boolean;
}

/** Records the active id and whether Command.Loading is in the DOM after every commit of this component. */
function Recorder({ commits }: { readonly commits: Commit[] }): ReactNode {
  // The root's state context carries the activeId every consumer renders (useCommandState reads the machine directly).
  const activeId: string | null = use(CommandStateContext)?.state.activeId ?? null;
  useLayoutEffect(() => {
    commits.push({
      activeId,
      loadingMounted: document.querySelector('[data-command-loading]') !== null,
    });
  });
  return null;
}

/** Lets the machine's scheduler tick (rAF in browsers) and React commit its result. */
const frame = (): Promise<void> =>
  act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  });

describe('Command.Item hover', () => {
  it('D104: hovering an item mounts no Command.Loading and renders no intermediate previous id', async () => {
    const commits: Commit[] = [];
    const view = render(
      <Command label="Test">
        <Recorder commits={commits} />
        <Command.Loading>busy</Command.Loading>
        <Command.List>
          <Command.Item value="alpha">Alpha</Command.Item>
          <Command.Item value="beta">Beta</Command.Item>
          <Command.Item value="gamma">Gamma</Command.Item>
        </Command.List>
      </Command>,
    );
    await frame();
    const first: string | null = commits.at(-1)?.activeId ?? null;
    expect(first).not.toBeNull();
    const before: number = commits.length;

    await act(async () => {
      fireEvent.pointerMove(view.getByText('Gamma'));
    });
    await frame();

    const hovered: string | null = commits.at(-1)?.activeId ?? null;
    expect(hovered).not.toBe(first);
    const after: readonly Commit[] = commits.slice(before);
    const ids: readonly (string | null)[] = after.map((c) => c.activeId);
    // The commits after the hover show the hovered id only: the previous id never appears, before or after it.
    expect(ids).toContain(hovered);
    expect(ids.every((id) => id === hovered)).toBe(true);
    expect(after.some((c) => c.loadingMounted)).toBe(false);
    expect(view.container.querySelector('[data-command-loading]')).toBeNull();
  });
});

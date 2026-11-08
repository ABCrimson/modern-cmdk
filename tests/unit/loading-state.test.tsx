// tests/unit/loading-state.test.tsx
// ARCH-59: a suspending <Command.AsyncItems> drives state.loading, <Command.Loading> and aria-busy

import { act, cleanup, type RenderResult, render } from '@testing-library/react';
import type { CommandItem } from 'modern-cmdk';
import { itemId } from 'modern-cmdk';
import { Command, CommandErrorBoundary } from 'modern-cmdk/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { silenceConsoleError } from '../act-guard.ts';

afterEach(cleanup);

const ITEMS: readonly CommandItem[] = [{ id: itemId('a'), value: 'Alpha' }];

function deferred(): {
  promise: Promise<readonly CommandItem[]>;
  resolve: (items: readonly CommandItem[]) => void;
  reject: (error: Error) => void;
} {
  const { promise, resolve, reject } = Promise.withResolvers<readonly CommandItem[]>();
  return { promise, resolve, reject };
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise<void>((r) => setTimeout(r, 0));
  });
}

/**
 * Renders inside an awaited act scope. These trees suspend on their first render (a pending AsyncItems promise);
 * the synchronous act scope of a bare render() ends before React can attach the promise, and React warns that the
 * act call was not awaited (tests/setup.ts fails the test on that warning).
 */
async function renderInAct(ui: ReactNode): Promise<RenderResult> {
  let result: RenderResult | undefined;
  await act(async () => {
    result = render(ui);
  });
  if (result === undefined) throw new Error('render did not run');
  return result;
}

const busy = (container: HTMLElement): string | null =>
  container.querySelector('[data-command-list]')?.getAttribute('aria-busy') ?? null;
const loadingEl = (container: HTMLElement): Element | null =>
  container.querySelector('[data-command-loading]');

function Shell({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <Command label="test">
      <Command.Input />
      <Command.List>
        <Command.Loading>Loading</Command.Loading>
        {children}
      </Command.List>
    </Command>
  );
}

const renderItems = (items: readonly CommandItem[]): ReactNode =>
  items.map((i) => <Command.Item key={i.id} value={i.value} />);

describe('ARCH-59 loading state from pending AsyncItems', () => {
  it('ARCH-59: a pending AsyncItems shows Command.Loading and aria-busy, both clear after it resolves', async () => {
    const d = deferred();
    const { container } = await renderInAct(
      <Shell>
        <Command.AsyncItems items={d.promise}>{renderItems}</Command.AsyncItems>
      </Shell>,
    );
    await settle();
    expect(loadingEl(container)).not.toBeNull();
    expect(busy(container)).toBe('true');
    await act(async () => {
      d.resolve(ITEMS);
    });
    await settle();
    expect(loadingEl(container)).toBeNull();
    expect(busy(container)).not.toBe('true');
  });

  it('ARCH-59: with two AsyncItems loading stays until both resolve', async () => {
    const a = deferred();
    const b = deferred();
    const { container } = await renderInAct(
      <Shell>
        <Command.AsyncItems items={a.promise}>{renderItems}</Command.AsyncItems>
        <Command.AsyncItems items={b.promise}>{renderItems}</Command.AsyncItems>
      </Shell>,
    );
    await settle();
    expect(busy(container)).toBe('true');
    await act(async () => {
      a.resolve(ITEMS);
    });
    await settle();
    expect(busy(container)).toBe('true');
    await act(async () => {
      b.resolve([{ id: itemId('b'), value: 'Beta' }]);
    });
    await settle();
    expect(busy(container)).not.toBe('true');
  });

  it('ARCH-59: a rejected promise inside CommandErrorBoundary clears loading', async () => {
    const errorSpy = silenceConsoleError();
    const d = deferred();
    const { container } = await renderInAct(
      <Shell>
        <CommandErrorBoundary fallback={<span data-testid="err">failed</span>}>
          <Command.AsyncItems items={d.promise}>{renderItems}</Command.AsyncItems>
        </CommandErrorBoundary>
      </Shell>,
    );
    await settle();
    expect(busy(container)).toBe('true');
    await act(async () => {
      d.reject(new Error('boom'));
    });
    await settle();
    expect(container.querySelector('[data-testid="err"]')).not.toBeNull();
    expect(busy(container)).not.toBe('true');
    errorSpy.mockRestore();
  });

  it('ARCH-59: an unmounted pending AsyncItems clears its share', async () => {
    const d = deferred();
    const { container, rerender } = await renderInAct(
      <Shell>
        <Command.AsyncItems items={d.promise}>{renderItems}</Command.AsyncItems>
      </Shell>,
    );
    await settle();
    expect(busy(container)).toBe('true');
    rerender(<Shell>{null}</Shell>);
    await settle();
    expect(busy(container)).not.toBe('true');
  });

  it('ARCH-59: an already-resolved promise never leaves loading stuck', async () => {
    const { container } = await renderInAct(
      <Shell>
        <Command.AsyncItems items={Promise.resolve(ITEMS)}>{renderItems}</Command.AsyncItems>
      </Shell>,
    );
    await settle();
    await settle();
    expect(loadingEl(container)).toBeNull();
    expect(busy(container)).not.toBe('true');
  });
});

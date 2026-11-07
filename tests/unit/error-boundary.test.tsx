// tests/unit/error-boundary.test.tsx
// CommandErrorBoundary recovery: a fallback render prop receives reset, and resetKeys clear the error.

import { CommandErrorBoundary } from 'modern-cmdk/react';
import type { ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let container: HTMLDivElement;
let root: Root;
const control = { shouldThrow: true };

function Bomb(): ReactNode {
  if (control.shouldThrow) throw new Error('boom');
  return <p>recovered</p>;
}

async function mount(node: ReactNode): Promise<void> {
  await act(async () => {
    root.render(node);
  });
}

beforeEach(() => {
  control.shouldThrow = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  // React logs caught render errors to console.error; keep the output readable.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
});

describe('CommandErrorBoundary', () => {
  it('ARCH-58: fallback(error, reset) retries the children when Retry is clicked', async () => {
    await mount(
      <CommandErrorBoundary
        fallback={(error: Error, reset: () => void): ReactNode => (
          <button type="button" onClick={reset}>
            Retry {error.message}
          </button>
        )}
      >
        <Bomb />
      </CommandErrorBoundary>,
    );
    const retry = container.querySelector('button');
    expect(retry?.textContent).toBe('Retry boom');

    control.shouldThrow = false;
    await act(async () => {
      retry?.click();
    });
    expect(container.textContent).toBe('recovered');
  });

  it('ARCH-58: a changed resetKeys entry clears the error', async () => {
    const tree = (key: number): ReactNode => (
      <CommandErrorBoundary fallback={<span>failed</span>} resetKeys={[key]}>
        <Bomb />
      </CommandErrorBoundary>
    );
    await mount(tree(1));
    expect(container.textContent).toBe('failed');

    control.shouldThrow = false;
    await mount(tree(2));
    expect(container.textContent).toBe('recovered');
  });

  it('ARCH-58: a changed resetKeys length clears the error', async () => {
    await mount(
      <CommandErrorBoundary fallback={<span>failed</span>} resetKeys={[1]}>
        <Bomb />
      </CommandErrorBoundary>,
    );
    control.shouldThrow = false;
    await mount(
      <CommandErrorBoundary fallback={<span>failed</span>} resetKeys={[1, 2]}>
        <Bomb />
      </CommandErrorBoundary>,
    );
    expect(container.textContent).toBe('recovered');
  });

  it('ARCH-58: unchanged resetKeys keep the fallback', async () => {
    const tree = (): ReactNode => (
      <CommandErrorBoundary fallback={<span>failed</span>} resetKeys={[1, 'a']}>
        <Bomb />
      </CommandErrorBoundary>
    );
    await mount(tree());
    control.shouldThrow = false;
    await mount(tree());
    expect(container.textContent).toBe('failed');
  });

  it('ARCH-58: a resetKeys change in the render that throws reports the error once', async () => {
    const onError = vi.fn();
    control.shouldThrow = false;
    const tree = (key: number): ReactNode => (
      <CommandErrorBoundary onError={onError} fallback={<span>failed</span>} resetKeys={[key]}>
        <Bomb />
      </CommandErrorBoundary>
    );
    await mount(tree(1));
    expect(container.textContent).toBe('recovered');

    control.shouldThrow = true;
    await mount(tree(2));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe('failed');
  });

  it('ARCH-58: a one-argument fallback still renders', async () => {
    await mount(
      <CommandErrorBoundary fallback={(error: Error): ReactNode => <span>{error.message}</span>}>
        <Bomb />
      </CommandErrorBoundary>,
    );
    expect(container.textContent).toBe('boom');
  });
});

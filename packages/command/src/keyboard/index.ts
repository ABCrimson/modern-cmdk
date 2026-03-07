// packages/command/src/keyboard/index.ts
// Keyboard shortcut registry — `using` for listener cleanup

import type { ItemId } from '../types.js';
import { detectConflicts, matchesShortcut } from './matcher.js';
import type { ParsedShortcut } from './parser.js';
import { parseShortcut } from './parser.js';

export { parseShortcut, formatShortcut } from './parser.js';
export { matchesShortcut, findMatchingShortcut, detectConflicts } from './matcher.js';

interface ShortcutBinding {
  readonly shortcut: ParsedShortcut;
  readonly itemId: ItemId;
  readonly handler: () => void;
}

/**
 * Manages keyboard shortcut bindings with global keydown listening.
 * Supports `using` for automatic cleanup of both individual bindings and the
 * global document listener. Detects conflicts via Object.groupBy.
 */
export class KeyboardShortcutRegistry implements Disposable {
  #bindings = new Map<string, ShortcutBinding>();
  #globalListener: ((event: KeyboardEvent) => void) | null = null;
  #enabled = true;

  constructor(options?: { enabled?: boolean }) {
    this.#enabled = options?.enabled ?? true;
    this.#attachGlobalListener();
  }

  /** Register a shortcut binding — returns Disposable for `using` auto-deregister */
  register(shortcutStr: string, itemId: ItemId, handler: () => void): Disposable {
    const shortcut = parseShortcut(shortcutStr);

    this.#bindings.set(shortcut.normalized, {
      shortcut,
      itemId,
      handler,
    });

    return {
      [Symbol.dispose]: (): void => {
        this.#bindings.delete(shortcut.normalized);
      },
    };
  }

  /** Unregister a shortcut by its string representation */
  unregister(shortcutStr: string): void {
    const shortcut = parseShortcut(shortcutStr);
    this.#bindings.delete(shortcut.normalized);
  }

  /** Unregister all shortcuts for a given item — Iterator Helpers pipeline */
  unregisterByItem(itemId: ItemId): void {
    // Two-pass: collect keys to delete, then delete (avoids mutation during iteration)
    const keysToDelete = this.#bindings
      .entries()
      .filter(([, binding]) => binding.itemId === itemId)
      .map(([key]) => key)
      .toArray();

    keysToDelete.forEach((key) => this.#bindings.delete(key));
  }

  /** Check for conflicting shortcuts */
  getConflicts(): ReadonlyMap<string, readonly ParsedShortcut[]> {
    const shortcuts = this.#bindings.values().map((b) => b.shortcut).toArray();
    return detectConflicts(shortcuts);
  }

  /** Enable or disable global shortcut listening */
  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
  }

  /** Get all registered bindings */
  getBindings(): ReadonlyMap<string, ShortcutBinding> {
    return this.#bindings;
  }

  #attachGlobalListener(): void {
    if (typeof document === 'undefined') return;

    this.#globalListener = (event: KeyboardEvent): void => {
      if (!this.#enabled) return;

      // Iterator Helpers .find() — short-circuits on first match
      const matched = this.#bindings.values().find(
        (binding) => matchesShortcut(event, binding.shortcut),
      );

      if (matched) {
        event.preventDefault();
        event.stopPropagation();
        matched.handler();
      }
    };

    document.addEventListener('keydown', this.#globalListener);
  }

  #detachGlobalListener(): void {
    if (this.#globalListener && typeof document !== 'undefined') {
      document.removeEventListener('keydown', this.#globalListener);
      this.#globalListener = null;
    }
  }

  [Symbol.dispose](): void {
    this.#detachGlobalListener();
    this.#bindings.clear();
  }
}

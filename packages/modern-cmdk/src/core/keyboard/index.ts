// packages/modern-cmdk/src/core/keyboard/index.ts
// Keyboard shortcut registry — `using` for listener cleanup

import type { ItemId } from '../types.js';
import { detectConflicts, matchesShortcut } from './matcher.js';
import type { ParsedShortcut } from './parser.js';
import { parseShortcut } from './parser.js';

export { detectConflicts, findMatchingShortcut, matchesShortcut } from './matcher.js';
export { formatShortcut, parseShortcut } from './parser.js';

interface ShortcutBinding {
  readonly shortcut: ParsedShortcut;
  readonly itemId: ItemId;
  readonly handler: () => void;
}

/**
 * Manages keyboard shortcut bindings with global keydown listening.
 * Supports `using` for automatic cleanup of both individual bindings and the
 * global document listener. Every normalized shortcut keeps a stack of bindings, one per item: the later
 * binding wins the keydown, disposing it restores the earlier one, and `getConflicts()` reports the keys with
 * two or more bindings (through `detectConflicts`, which groups with the local mapGroupBy helper).
 */
export class KeyboardShortcutRegistry implements Disposable {
  #bindings = new Map<string, ShortcutBinding[]>();
  // The keys each item is bound under: unregisterByItem touches only those stacks, not every key
  #keysByItem = new Map<ItemId, Set<string>>();
  #globalListener: ((event: KeyboardEvent) => void) | null = null;
  #enabled = true;

  constructor(options?: { enabled?: boolean }) {
    this.#enabled = options?.enabled ?? true;
    this.#attachGlobalListener();
  }

  /** Register a shortcut binding — returns Disposable for `using` auto-deregister */
  register(shortcutStr: string, itemId: ItemId, handler: () => void): Disposable {
    const shortcut = parseShortcut(shortcutStr);

    const binding: ShortcutBinding = { shortcut, itemId, handler };
    const stack = this.#bindings.get(shortcut.normalized) ?? [];
    // The same item again under the same key replaces its own binding in place: not a conflict
    const own = stack.findIndex((b) => b.itemId === itemId);
    if (own < 0) stack.push(binding);
    else stack[own] = binding;
    this.#bindings.set(shortcut.normalized, stack);
    const keys = this.#keysByItem.get(itemId) ?? new Set<string>();
    this.#keysByItem.set(itemId, keys.add(shortcut.normalized));

    return {
      [Symbol.dispose]: (): void => this.#remove(shortcut.normalized, (b) => b === binding),
    };
  }

  /** Drops the bindings of one key that the predicate selects; an emptied key goes away */
  #remove(key: string, drop: (binding: ShortcutBinding) => boolean): void {
    const stack = this.#bindings.get(key);
    if (!stack) return;
    const rest = stack.filter((b) => !drop(b));
    if (rest.length) this.#bindings.set(key, rest);
    else this.#bindings.delete(key);
    // An item whose binding left this key no longer lists it
    for (const { itemId } of stack) {
      if (rest.some((b) => b.itemId === itemId)) continue;
      const keys = this.#keysByItem.get(itemId);
      keys?.delete(key);
      if (!keys?.size) this.#keysByItem.delete(itemId);
    }
  }

  /** Unregister a shortcut by its string representation — every binding of that key */
  unregister(shortcutStr: string): void {
    this.#remove(parseShortcut(shortcutStr).normalized, () => true);
  }

  /**
   * Unregister all shortcuts for a given item — only the stacks of the keys it is bound under are touched.
   * `keep` names one shortcut whose binding stays (a re-bind then replaces it in place, see register).
   */
  unregisterByItem(itemId: ItemId, keep?: string): void {
    const keys = this.#keysByItem.get(itemId);
    if (!keys) return;
    const kept = keep === undefined ? undefined : parseShortcut(keep).normalized;
    for (const key of [...keys]) if (key !== kept) this.#remove(key, (b) => b.itemId === itemId);
  }

  /** Keys bound by two or more items (normalized shortcut -> the parsed shortcuts, earliest first) */
  getConflicts(): ReadonlyMap<string, readonly ParsedShortcut[]> {
    const shortcuts = this.#bindings
      .values()
      .flatMap((stack) => stack.map((b) => b.shortcut))
      .toArray();
    return detectConflicts(shortcuts);
  }

  /** Enable or disable global shortcut listening */
  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
  }

  /** The winning binding of every key (a snapshot: the later of the bindings that share a key) */
  getBindings(): ReadonlyMap<string, ShortcutBinding> {
    return new Map(
      this.#bindings.entries().map(([key, stack]) => [key, stack.at(-1) as ShortcutBinding]),
    );
  }

  #attachGlobalListener(): void {
    if (typeof document === 'undefined') return;

    this.#globalListener = (event: KeyboardEvent): void => {
      if (!this.#enabled) return;

      // for...of — hot keydown path, short-circuits on first match (no closure overhead)
      for (const stack of this.#bindings.values()) {
        const binding = stack.at(-1) as ShortcutBinding;
        if (matchesShortcut(event, binding.shortcut)) {
          event.preventDefault();
          event.stopPropagation();
          binding.handler();
          return;
        }
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
    this.#keysByItem.clear();
  }
}

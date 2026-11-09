// packages/modern-cmdk/src/core/keyboard/index.ts
// Keyboard shortcut registry — `using` for listener cleanup

import type { ItemId } from '../types.js';
import { detectConflicts, pickMatch } from './matcher.js';
import type { ParsedShortcut } from './parser.js';
import { parseShortcut } from './parser.js';

export { detectConflicts, findMatchingShortcut, matchesShortcut } from './matcher.js';
export { formatShortcut, parseShortcut } from './parser.js';

interface ShortcutBinding {
  readonly shortcut: ParsedShortcut;
  readonly itemId: ItemId;
  readonly handler: () => void;
}

/** True while an input method composes text: `isComposing`, or the legacy `keyCode` 229 some engines report instead */
export function isImeComposition(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229;
}

/** The editable targets: form fields that take text or a choice, and contenteditable elements */
function isEditable(target: Partial<HTMLElement> | undefined): boolean {
  return !!(target?.isContentEditable || target?.matches?.('input,textarea,select'));
}

/**
 * Manages keyboard shortcut bindings with global keydown listening.
 * Supports `using` for automatic cleanup of both individual bindings and the
 * document listener, which is attached while at least one binding exists and the registry is not suspended.
 * A keydown that an input method is composing, that another handler default-prevented, or (with
 * `shortcutsInEditable: false`) that targets an editable element other than the palette's input
 * (`data-command-input`) fires nothing; with `shortcutScope: 'root'` only a keydown whose path includes the
 * element given to `setRoot` fires. Every normalized shortcut keeps a stack of bindings, one per item: the later
 * binding wins the keydown, disposing it restores the earlier one, and `getConflicts()` reports the keys with
 * two or more bindings (through `detectConflicts`, which groups with the local mapGroupBy helper).
 */
export class KeyboardShortcutRegistry implements Disposable {
  #bindings = new Map<string, ShortcutBinding[]>();
  // The keys each item is bound under: unregisterByItem touches only those stacks, not every key
  #keysByItem = new Map<ItemId, Set<string>>();
  #globalListener: ((event: KeyboardEvent) => void) | null = null;
  #enabled: boolean;
  #inRoot: boolean;
  #inEditable: boolean;
  #root: Element | null = null;
  #suspended = false;
  #disposed = false;

  constructor(options?: {
    enabled?: boolean | undefined;
    shortcutScope?: 'document' | 'root' | undefined;
    shortcutsInEditable?: boolean | undefined;
  }) {
    this.#enabled = options?.enabled ?? true;
    this.#inRoot = options?.shortcutScope === 'root';
    this.#inEditable = options?.shortcutsInEditable ?? true;
  }

  /** Sets the element a `'root'` scope bounds the bindings to (the React root sets it from its ref callback) */
  setRoot(root: Element | null): void {
    this.#root = root;
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
    this.#attachGlobalListener();

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
    if (!this.#bindings.size) this.#detachGlobalListener();
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

  /** Attaches the document listener when a binding exists, the registry is live and none is attached */
  #attachGlobalListener(): void {
    if (
      this.#globalListener ||
      this.#disposed ||
      this.#suspended ||
      !this.#bindings.size ||
      typeof document === 'undefined'
    )
      return;

    this.#globalListener = (event: KeyboardEvent): void => {
      if (!this.#enabled || isImeComposition(event) || event.defaultPrevented) return;
      const path = event.composedPath();
      // The path's first entry is the real target, also inside a shadow root (event.target is the host there)
      const target = path[0] as Partial<HTMLElement> | undefined;
      if (!this.#inEditable && isEditable(target) && !target?.matches?.('[data-command-input]'))
        return;
      if (this.#inRoot && !(this.#root && path.includes(this.#root))) return;

      // The later binding of every key competes; a key match beats a code match (see pickMatch)
      const stacks = this.#bindings
        .values()
        .map((stack) => stack.at(-1) as ShortcutBinding)
        .toArray();
      const binding = pickMatch(event, stacks, (b) => b.shortcut);
      if (binding) {
        event.preventDefault();
        event.stopPropagation();
        binding.handler();
      }
    };

    document.addEventListener('keydown', this.#globalListener);
  }

  /**
   * Detach the document keydown listener while keeping every binding, so a suspended registry holds nothing
   * global and can be collected once unreferenced. Idempotent; does nothing after dispose.
   */
  suspend(): void {
    this.#suspended = true;
    this.#detachGlobalListener();
  }

  /**
   * Clear the suspension: re-attach the document keydown listener when a binding exists. Idempotent; does
   * nothing after dispose.
   */
  resume(): void {
    this.#suspended = false;
    this.#attachGlobalListener();
  }

  #detachGlobalListener(): void {
    if (this.#globalListener && typeof document !== 'undefined') {
      document.removeEventListener('keydown', this.#globalListener);
      this.#globalListener = null;
    }
  }

  [Symbol.dispose](): void {
    this.#disposed = true;
    this.#detachGlobalListener();
    this.#bindings.clear();
    this.#keysByItem.clear();
  }
}

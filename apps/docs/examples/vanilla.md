# Vanilla JavaScript

The core engine (`modern-cmdk`) is framework-agnostic. Use it directly with vanilla DOM APIs.

## Basic Example

```ts
import { createCommandMachine, itemId } from 'modern-cmdk';

// The focused text field, if any: Paste and Cut act on it through the Clipboard API
// (document.execCommand is deprecated). Selecting an item from the palette itself acts on
// the palette's own input while it keeps focus, so move focus to your field first.
function activeField(): HTMLInputElement | HTMLTextAreaElement | null {
  const el = document.activeElement;
  // selectionStart is null on input types without a text selection (email, number, checkbox...)
  return (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.selectionStart !== null ? el : null;
}

// Replace the field's selection (or insert at the caret) with the given text
function insertIntoActiveField(text: string): void {
  const field = activeField();
  if (!field) return;
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? field.value.length;
  field.setRangeText(text, start, end, 'end');
}

// Copy the field's selection, then remove it
async function cutFromActiveField(): Promise<void> {
  const field = activeField();
  const start = field?.selectionStart ?? 0;
  const end = field?.selectionEnd ?? 0;
  if (!field || start === end) return;
  await navigator.clipboard.writeText(field.value.slice(start, end));
  field.setRangeText('', start, end, 'end');
}

// Create the machine and keep it for as long as the UI lives. A top-level `using machine`
// would dispose it when this module finishes evaluating, before the first keystroke.
const machine = createCommandMachine({
  items: [
    { id: itemId('copy'), value: 'Copy', onSelect: () => navigator.clipboard.writeText(getSelection()?.toString() ?? '') },
    { id: itemId('paste'), value: 'Paste', onSelect: () => navigator.clipboard.readText().then((text) => insertIntoActiveField(text)) },
    { id: itemId('cut'), value: 'Cut', onSelect: () => cutFromActiveField() },
  ],
  loop: true,
});

// Render with vanilla DOM
const list = document.querySelector<HTMLDivElement>('#command-list')!;
const input = document.querySelector<HTMLInputElement>('#command-input')!;

// The markup the React adapter renders: a combobox input that controls a listbox of options
// (role="option", aria-selected, data-command-item)
list.id ||= 'command-list';
list.setAttribute('role', 'listbox');
input.setAttribute('role', 'combobox');
input.setAttribute('aria-controls', list.id);
input.setAttribute('aria-expanded', 'true');

function render(): void {
  const { filteredIds, activeId } = machine.getState();
  const registry = machine.getRegistry();
  list.replaceChildren(
    ...filteredIds.map((id) => {
      const el = document.createElement('div');
      el.id = `cmd-${id}`;
      el.setAttribute('role', 'option');
      el.setAttribute('aria-selected', String(id === activeId));
      el.dataset.commandItem = '';
      el.textContent = registry.getItem(id)?.value ?? id; // text, never markup
      return el;
    }),
  );
  if (activeId) input.setAttribute('aria-activedescendant', `cmd-${activeId}`);
  else input.removeAttribute('aria-activedescendant');
}

// send() is batched: the machine applies events on the next animation frame, then emits one
// stateChange. Render from the subscription, not from getState() right after send()
const unsubscribe = machine.subscribe(render);
render(); // the initial list: subscribe reports later changes only

// Dispose on teardown (here, when the page goes away). Disposing drops events that have not run yet
addEventListener('pagehide', (event) => {
  if (event.persisted) return; // kept in the back/forward cache: the page may be restored
  unsubscribe();
  machine[Symbol.dispose]();
});

// Wire input
input.addEventListener('input', () => {
  machine.send({ type: 'SEARCH_CHANGE', query: input.value });
});

// Wire keyboard
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') machine.send({ type: 'NAVIGATE', direction: 'next' });
  if (e.key === 'ArrowUp') machine.send({ type: 'NAVIGATE', direction: 'prev' });
  if (e.key === 'Enter') {
    const { activeId } = machine.getState();
    if (activeId) machine.send({ type: 'ITEM_SELECT', id: activeId });
  }
});
```

## With Keyboard Shortcuts

```ts
import { createCommandMachine, itemId } from 'modern-cmdk';

// Not `using` at module level: that disposes the machine, and its shortcuts, once the module has run
const machine = createCommandMachine();
const keyboard = machine.getKeyboardRegistry();

// Register global shortcuts
keyboard.register('Ctrl+K', itemId('open'), () => {
  machine.send({ type: 'TOGGLE' });
});
```

## Building a Svelte 5 Adapter

The core machine's `subscribe`/`getState` pattern maps directly to Svelte 5 runes:

```svelte
<script>
  import { createCommandMachine, itemId } from 'modern-cmdk';

  const machine = createCommandMachine({
    items: [
      { id: itemId('open'), value: 'Open File' },
      { id: itemId('save'), value: 'Save File' },
    ],
  });
  let state = $state(machine.getState());

  $effect(() => {
    const unsubscribe = machine.subscribe(() => { state = machine.getState(); });
    // The cleanup runs when the component is destroyed
    return () => {
      unsubscribe();
      machine[Symbol.dispose]();
    };
  });
</script>

{#each state.filteredIds as id}
  <div role="option" aria-selected={id === state.activeId}>{id}</div>
{/each}
```

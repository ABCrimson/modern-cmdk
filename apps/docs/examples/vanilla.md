# Vanilla JavaScript

The core engine (`modern-cmdk`) is framework-agnostic. Use it directly with vanilla DOM APIs.

## Basic Example

```ts
import { createCommandMachine, itemId } from 'modern-cmdk';

// Create machine with Explicit Resource Management
using machine = createCommandMachine({
  items: [
    { id: itemId('copy'), value: 'Copy', onSelect: () => navigator.clipboard.writeText(selection) },
    { id: itemId('paste'), value: 'Paste', onSelect: () => document.execCommand('insertText') },
    { id: itemId('cut'), value: 'Cut', onSelect: () => document.execCommand('cut') },
  ],
  loop: true,
});

// Render with vanilla DOM
const list = document.querySelector<HTMLDivElement>('#command-list')!;
const input = document.querySelector<HTMLInputElement>('#command-input')!;

machine.subscribe(() => {
  const state = machine.getState();
  list.innerHTML = state.filteredIds
    .map((id) => {
      const isActive = id === state.activeId;
      return `<div role="option" aria-selected="${isActive}" data-command-item>${id}</div>`;
    })
    .join('');
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

  const machine = createCommandMachine({ items: [...] });
  let state = $state(machine.getState());

  $effect(() => {
    return machine.subscribe(() => { state = machine.getState(); });
  });
</script>

{#each state.filteredIds as id}
  <div role="option" aria-selected={id === state.activeId}>{id}</div>
{/each}
```

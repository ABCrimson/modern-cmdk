// Shared by the server entry (renderToString) and the client entry (hydrateRoot). The items come
// from a pure core export (itemId); the palette is the client part of the app.

import { createCommandMachine, itemId } from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';
import { CommandDialog } from 'modern-cmdk/react/dialog';
import 'modern-cmdk/styles.css';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

interface PaletteItem {
  readonly id: string;
  readonly label: string;
}

const items: readonly PaletteItem[] = Array.from(
  { length: 5 },
  (_, index: number): PaletteItem => ({
    id: itemId(`item-${index + 1}`),
    label: `Item ${index + 1}`,
  }),
);

export function App(): ReactNode {
  const [open, setOpen] = useState(false);
  // A core export the adapter also uses internally: with one core copy both resolve to the same
  // module; with two, the core code appears twice in the client output.
  useEffect((): (() => void) => {
    const machine = createCommandMachine({ items: [] });
    document.body.dataset.hydrated = 'true';
    return (): void => {
      machine[Symbol.dispose]();
    };
  }, []);

  return (
    <main>
      <section data-palette="client">
        <Command label="Consumer palette">
          <Command.Input placeholder="Search commands" />
          <Command.List>
            {items.map(
              (item: PaletteItem): ReactNode => (
                <Command.Item key={item.id} value={item.label}>
                  {item.label}
                </Command.Item>
              ),
            )}
            <Command.Empty>No results</Command.Empty>
          </Command.List>
        </Command>
      </section>
      <section data-palette="dialog">
        <button type="button" onClick={(): void => setOpen(true)}>
          Open palette
        </button>
        <CommandDialog open={open} onOpenChange={setOpen} label="Dialog palette">
          <Command.Input placeholder="Search commands" />
          <Command.List>
            <Command.Item value="Dialog item">Dialog item</Command.Item>
            <Command.Empty>No results</Command.Empty>
          </Command.List>
        </CommandDialog>
      </section>
    </main>
  );
}

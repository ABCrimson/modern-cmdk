'use client';

// Client palette: the compound `Command` from modern-cmdk/react plus the stylesheet, and a call into
// a core export the adapter also uses internally (createCommandMachine). With one core copy both
// resolve to the same module; with two, the core code appears twice in the client output.

import { createCommandMachine } from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';
import { CommandDialog } from 'modern-cmdk/react/dialog';
import 'modern-cmdk/styles.css';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

export interface PaletteItem {
  readonly id: string;
  readonly label: string;
}

export function Palette({ items }: { readonly items: readonly PaletteItem[] }): ReactNode {
  const [open, setOpen] = useState(false);
  useEffect((): (() => void) => {
    const machine = createCommandMachine({ items: [] });
    document.body.dataset.hydrated = 'true';
    return (): void => {
      machine[Symbol.dispose]();
    };
  }, []);

  return (
    <>
      <Command.Shortcut shortcut="Mod+K" data-shortcut="standalone" />
      <Command label="Consumer palette">
        <Command.Input placeholder="Search commands" />
        <Command.List>
          {items.map(
            (item: PaletteItem): ReactNode => (
              <Command.Item key={item.id} value={item.label}>
                {item.label}
                {item.id === items[0]?.id ? (
                  <Command.Shortcut shortcut="Mod+K" data-shortcut="item" />
                ) : null}
              </Command.Item>
            ),
          )}
          <Command.Empty>No results</Command.Empty>
        </Command.List>
      </Command>
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
    </>
  );
}

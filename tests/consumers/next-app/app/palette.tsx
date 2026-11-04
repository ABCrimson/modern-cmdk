'use client';

// Client palette: the compound `Command` from modern-cmdk/react plus the stylesheet, and a call into
// a core export the adapter also uses internally (createCommandMachine). With one core copy both
// resolve to the same module; with two, the core code appears twice in the client output.

import { createCommandMachine } from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';
import 'modern-cmdk/styles.css';
import type { ReactNode } from 'react';
import { useEffect } from 'react';

export interface PaletteItem {
  readonly id: string;
  readonly label: string;
}

export function Palette({ items }: { readonly items: readonly PaletteItem[] }): ReactNode {
  useEffect((): (() => void) => {
    const machine = createCommandMachine({ items: [] });
    document.body.dataset.hydrated = 'true';
    return (): void => {
      machine[Symbol.dispose]();
    };
  }, []);

  return (
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
  );
}

import { Command } from 'cmdk';

export function P({ filter }: { filter?: (value: string, search: string, keywords?: string[]) => number }) {
  return <Command filter={filter} label="p" />;
}

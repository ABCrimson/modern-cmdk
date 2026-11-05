import { Command } from 'cmdk';

export function P({ filter }: { filter?: (value: string, search: string, keywords?: string[]) => number }) {
  return <Command filter={filter === undefined ? undefined : (item, query) => { const score = (filter as (value: string, search: string, keywords?: string[]) => number)(item.value, query, item.keywords === undefined ? undefined : [...item.keywords]); return score > 0 ? score : false; }} label="p" />;
}

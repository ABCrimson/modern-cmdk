import { Command } from 'cmdk';

declare function useFilters(): { byName: (value: string, search: string) => number };
declare const filters: Record<string, (value: string, search: string) => number>;
declare function getKey(): string;

export function A() {
  return <Command filter={useFilters().byName} label="a" />;
}
export const B = () => <Command filter={filters[getKey()]} label="b" />;

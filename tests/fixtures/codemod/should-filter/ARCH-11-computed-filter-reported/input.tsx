import { useCallback } from 'react';
import { Command } from 'cmdk';

declare function makeFilter(o: { fuzzy: boolean }): (value: string, search: string) => number;

export function A() {
  return <Command filter={useCallback((value: string, search: string) => (value.includes(search) ? 1 : 0), [])} label="a" />;
}
export const B = () => <Command filter={makeFilter({ fuzzy: true })} label="b" />;

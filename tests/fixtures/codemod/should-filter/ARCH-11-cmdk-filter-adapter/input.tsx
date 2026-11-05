import { Command } from 'cmdk';

declare function score(value: string, search: string, keywords?: string[]): number;

export const A = () => <Command filter={score} label="a" />;
export const B = () => (
  <Command.Dialog open filter={(value, search) => (value.includes(search) ? 1 : 0)} label="b" />
);
export const C = () => (
  <Command
    filter={function (value, search, keywords) {
      return keywords?.includes(search) ? 1 : value.includes(search) ? 1 : 0;
    }}
    label="c"
  />
);
export const D = () => <Command filter={(value) => (value ? 1 : 0)} label="d" />;
export const E = () => <Command filter={(...args) => (args[0] ? 1 : 0)} label="e" />;
declare function byValue(value: string, search: string): number;
export const F = () => <Command filter={byValue} label="f" />;

import { Command } from 'cmdk';

declare function score(value: string, search: string, keywords?: string[]): number;

export const A = () => <Command filter={score === undefined ? undefined : (item, query) => { const score_ = (score as (value: string, search: string, keywords?: string[]) => number)(item.value, query, item.keywords === undefined ? undefined : [...item.keywords]); return score_ > 0 ? score_ : false; }} label="a" />;
export const B = () => (
  <Command.Dialog open filter={(item, query) => { const score = ((value, search) => (value.includes(search) ? 1 : 0))(item.value, query); return score > 0 ? score : false; }} label="b" />
);
export const C = () => (
  <Command
    filter={(item, query) => { const score = function (value, search, keywords) {
      return keywords?.includes(search) ? 1 : value.includes(search) ? 1 : 0;
    }(item.value, query, item.keywords === undefined ? undefined : [...item.keywords]); return score > 0 ? score : false; }}
    label="c"
  />
);
export const D = () => <Command filter={(item, query) => { const score = (value => (value ? 1 : 0))(item.value); return score > 0 ? score : false; }} label="d" />;
export const E = () => <Command filter={(item, query) => { const score = ((...args) => (args[0] ? 1 : 0))(item.value, query, item.keywords === undefined ? undefined : [...item.keywords]); return score > 0 ? score : false; }} label="e" />;
declare function byValue(value: string, search: string): number;
export const F = () => <Command filter={byValue === undefined ? undefined : (item, query) => { const score = (byValue as (value: string, search: string, keywords?: string[]) => number)(item.value, query, item.keywords === undefined ? undefined : [...item.keywords]); return score > 0 ? score : false; }} label="f" />;

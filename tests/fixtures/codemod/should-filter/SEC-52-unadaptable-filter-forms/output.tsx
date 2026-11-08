import { Command } from 'cmdk';

type Filter = (value: string, search: string) => number;
declare const maybe: Filter | undefined;
declare const opts: { f: Filter } | undefined;
declare class Base {
  f: Filter;
}

export const A = () => <Command filter={maybe!} label="a" />;
export const B = () => <Command filter={maybe as Filter} label="b" />;
export const C = () => <Command filter={opts?.f} label="c" />;
export class D extends Base {
  render() {
    return <Command filter={super.f} label="d" />;
  }
}

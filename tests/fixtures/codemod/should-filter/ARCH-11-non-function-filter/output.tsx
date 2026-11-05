import { Command } from 'cmdk';

declare const fn: (value: string, search: string) => number;
declare const c: boolean;

export const A = () => <Command filter={undefined} label="a" />;
export const B = () => <Command filter={c ? fn : undefined} label="b" />;

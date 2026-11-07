import { Command } from 'cmdk';

declare function score(value: string, search: string): number;

export const A = () => <Command shouldFilter={false} filter={score} label="a" />;
export const B = () => <Command label="b" />;

import { Command } from 'cmdk';

declare function pick(value: string): void;

export const A = () => (
  <Command shouldFilter={false} label="a">
    <Command.Item value="apple" onSelect={pick}>
      Apple
    </Command.Item>
    <Command.Item value="pear" onSelect={(value) => pick(value)}>
      Pear
    </Command.Item>
  </Command>
);

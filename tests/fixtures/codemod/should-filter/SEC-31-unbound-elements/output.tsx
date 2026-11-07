import { Command } from 'cmdk';
import { Command as Cmd } from 'other-lib';
import { MyList } from './my-list';

export const A = () => <MyList shouldFilter={false} />;
export const B = () => <Cmd shouldFilter={false} label="b" />;
export const C = () => (
  <Command label="c">
    <Command.List shouldFilter={false} />
  </Command>
);

export function Shadowed() {
  const Command = (props: { shouldFilter?: boolean }) => <div {...props} />;
  return <Command shouldFilter={false} />;
}

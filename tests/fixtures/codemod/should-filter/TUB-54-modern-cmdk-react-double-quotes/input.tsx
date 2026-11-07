import { Command, CommandDialog } from "modern-cmdk/react";

export const A = () => <Command shouldFilter={false} label="a" />;
export const B = () => <Command.Dialog open shouldFilter={false} label="b" />;
export const C = () => <CommandDialog open shouldFilter={false} label="c" />;

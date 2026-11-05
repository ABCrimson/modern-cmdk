import { Command, CommandDialog } from "modern-cmdk/react";

export const A = () => <Command filter={false} label="a" />;
export const B = () => <Command.Dialog open filter={false} label="b" />;
export const C = () => <CommandDialog open filter={false} label="c" />;

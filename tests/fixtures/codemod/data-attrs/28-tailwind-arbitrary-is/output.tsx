import { Command } from 'cmdk';

export const A = () => <Command.Item className="[&:is([data-selected=true]_*)]:a [&:not([data-selected=true]>*)]:b [&:where([data-disabled=false]_*)]:c [&:is(.a_[data-active])]:d" />;

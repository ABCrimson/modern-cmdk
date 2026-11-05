import { Command } from 'cmdk';

export const A = () => <Command.Item className="[&:has([data-selected=true])]:a [&:has(>[data-selected=true])]:b [&:has(svg)[data-active]]:c" />;

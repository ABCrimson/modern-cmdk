import { Command } from 'cmdk';

export const A = () => <Command.Item className="hover:[&[data-active]_svg]:text-white md:[&>[data-selected=true]]:font-bold group-hover:[&:not([data-disabled])]:opacity-100" />;

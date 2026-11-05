import { Command } from 'cmdk';

export const A = () => <Command.Item className="hover:[&[data-selected=true]_svg]:text-white md:[&>[data-selected=true]]:font-bold group-hover:[&[data-disabled=false]]:opacity-100" />;

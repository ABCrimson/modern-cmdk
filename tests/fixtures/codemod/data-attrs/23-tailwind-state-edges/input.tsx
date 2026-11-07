import { Command } from 'cmdk';

export const A = () => <Command.Item className="data-[selected]:bg-x data-[disabled]:opacity-50 [&[data-selected=true]_svg]:text-white [&[data-disabled=false]]:opacity-100" />;

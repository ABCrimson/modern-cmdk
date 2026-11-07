import { Command } from 'cmdk';

export const A = () => <Command.Item className="data-[selected]:bg-x data-[disabled]:opacity-50 [&[data-active]_svg]:text-white [&:not([data-disabled])]:opacity-100" />;

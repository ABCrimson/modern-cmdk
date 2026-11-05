import { Command } from 'modern-cmdk/react';

export const A = () => <Command.Item className="data-[selected=true]:bg-accent" />;
export const B = () => <Command.Item class="data-[disabled=true]:opacity-50" />;

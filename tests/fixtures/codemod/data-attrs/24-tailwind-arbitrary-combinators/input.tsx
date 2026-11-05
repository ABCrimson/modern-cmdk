import { Command } from 'cmdk';

export const A = () => <Command.Item className="[&>[data-selected=true]]:font-bold [&+[data-selected=true]]:x [&~[data-disabled=false]]:y [&[data-selected=true]>svg]:z" />;

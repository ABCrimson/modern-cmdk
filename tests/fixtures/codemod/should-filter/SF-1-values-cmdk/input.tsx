import { Command } from 'cmdk';

declare const enabled: boolean;

export const D = () => <Command shouldFilter={enabled} label="d" />;

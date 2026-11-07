import { Command } from 'cmdk';

declare const enabled: boolean;

export const D = () => <Command filter={enabled ? undefined : false} label="d" />;

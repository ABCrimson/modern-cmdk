import { Command } from 'modern-cmdk/react';

declare const enabled: boolean;
declare const loading: boolean;

export const A = () => <Command label="a" />;
export const B = () => <Command label="b" />;
export const C = () => <Command label="c" filter={false} />;
export const D = () => <Command filter={enabled ? undefined : false} label="d" />;
export const E = () => <Command filter={!loading ? undefined : false} label="e" />;
export const F = () => <Command filter={enabled || loading ? undefined : false} label="f" />;

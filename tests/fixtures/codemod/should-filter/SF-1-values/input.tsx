import { Command } from 'modern-cmdk/react';

declare const enabled: boolean;
declare const loading: boolean;

export const A = () => <Command shouldFilter label="a" />;
export const B = () => <Command shouldFilter={true} label="b" />;
export const C = () => <Command label="c" shouldFilter={false} />;
export const D = () => <Command shouldFilter={enabled} label="d" />;
export const E = () => <Command shouldFilter={!loading} label="e" />;
export const F = () => <Command shouldFilter={enabled || loading} label="f" />;

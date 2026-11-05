import { items } from './items';

export const a = '[cmdk-item="x"]';
export const b = '[cmdk-group] [cmdk-input]';
export const c = "it's [cmdk-root]";
export const d = items.map((item) => `[cmdk-item="${item}"]`);

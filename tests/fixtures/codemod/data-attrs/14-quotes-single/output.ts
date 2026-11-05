import { items } from './items';

export const a = '[data-command-item="x"]';
export const b = '[data-command-group] [data-command-input]';
export const c = "it's [data-command-root]";
export const d = items.map((item) => `[data-command-item="${item}"]`);

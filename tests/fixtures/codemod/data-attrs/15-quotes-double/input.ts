import { items } from "./items";

export const a = "[cmdk-item='x']";
export const b = "[cmdk-group] [cmdk-input]";
export const c = '[cmdk-root] "quoted"';
export const d = items.map((item) => `[cmdk-item='${item}']`);

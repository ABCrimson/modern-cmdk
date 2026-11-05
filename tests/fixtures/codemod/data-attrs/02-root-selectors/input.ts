export const rootSelector = '[cmdk-root]';
export const nested = '[cmdk-root] > [cmdk-list]';
export const template = `[cmdk-root] [cmdk-item][aria-selected="true"]`;

export function firstItem(): Element | null {
  return document.querySelector('[cmdk-root] [cmdk-item]');
}

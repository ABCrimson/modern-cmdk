export const rootSelector = '[data-command-root]';
export const nested = '[data-command-root] > [data-command-list]';
export const template = `[data-command-root] [data-command-item][aria-selected="true"]`;

export function firstItem(): Element | null {
  return document.querySelector('[data-command-root] [data-command-item]');
}

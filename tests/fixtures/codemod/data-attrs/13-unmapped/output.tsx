export const Label = () => <label cmdk-label="" htmlFor="input" />;

export const label = document.querySelector('[data-command-root] [cmdk-label]');

export function onSelectEvent(item: Element, handler: () => void): void {
  item.addEventListener('cmdk-item-select', handler);
}
export const has = (el: Element) => el.hasAttribute('cmdk-item');

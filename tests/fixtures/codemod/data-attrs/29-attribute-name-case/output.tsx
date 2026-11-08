export const Root = () => <div data-command-root="" />;
export const Label = () => <label CMDK-LABEL="" />;
export const items = document.querySelectorAll('[data-command-item], [data-command-group] [data-command-list]');
export const selected = '[data-command-item][data-active]';
export const bare = el => el.hasAttribute('CMDK-ITEM');

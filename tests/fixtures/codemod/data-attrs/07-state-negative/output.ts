export const plain = '[data-selected="true"]';
export const plainDisabled = '[data-disabled="true"]';
export const descendant = '[data-command-item] [data-selected="true"]';
export const root = '[data-command-root]';
export const tab = ':is([data-command-root] [role=tab][data-selected="true"])';
export const tabAfter = ':is([data-command-root] [role=tab])[data-selected="true"]';
export const tabHas = '[data-command-root]:has([role=tab][data-selected="true"])';

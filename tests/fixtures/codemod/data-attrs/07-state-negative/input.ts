export const plain = '[data-selected="true"]';
export const plainDisabled = '[data-disabled="true"]';
export const descendant = '[cmdk-item] [data-selected="true"]';
export const root = '[cmdk-root]';
export const tab = ':is([cmdk-root] [role=tab][data-selected="true"])';
export const tabAfter = ':is([cmdk-root] [role=tab])[data-selected="true"]';
export const tabHas = '[cmdk-root]:has([role=tab][data-selected="true"])';

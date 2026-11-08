export const Root = () => <div CMDK-ROOT="" />;
export const Label = () => <label CMDK-LABEL="" />;
export const items = document.querySelectorAll('[CMDK-ITEM], [Cmdk-Group] [cmdk-LIST]');
export const selected = '[CMDK-ITEM][DATA-SELECTED="true"]';
export const bare = el => el.hasAttribute('CMDK-ITEM');

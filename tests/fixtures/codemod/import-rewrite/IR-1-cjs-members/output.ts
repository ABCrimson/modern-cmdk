import k = require('modern-cmdk/react');
const { CommandRoot, CommandItem, defaultFilter } = require('modern-cmdk/react');
const actual = jest.requireActual('modern-cmdk/react');
export const f = k.defaultFilter;
export const g = actual.defaultFilter;
export { CommandRoot, CommandItem, defaultFilter };

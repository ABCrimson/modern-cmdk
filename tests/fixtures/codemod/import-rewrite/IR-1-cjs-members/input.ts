import k = require('cmdk');
const { CommandRoot, CommandItem, defaultFilter } = require('cmdk');
const actual = jest.requireActual('cmdk');
export const f = k.defaultFilter;
export const g = actual.defaultFilter;
export { CommandRoot, CommandItem, defaultFilter };

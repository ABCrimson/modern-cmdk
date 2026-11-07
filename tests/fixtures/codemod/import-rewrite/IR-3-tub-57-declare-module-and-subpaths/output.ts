declare module 'cmdk' {
  export const extra: string;
}
import { x } from 'cmdk/dist/x';
export * from 'cmdk/package.json';
export const y = require('cmdk/foo');
export { x };

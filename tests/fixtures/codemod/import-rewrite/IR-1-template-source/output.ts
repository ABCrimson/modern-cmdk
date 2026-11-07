const a = require(`modern-cmdk/react`);
export const load = () => import(`modern-cmdk/react`);
vi.mock(`modern-cmdk/react`, () => ({}));
export { a };

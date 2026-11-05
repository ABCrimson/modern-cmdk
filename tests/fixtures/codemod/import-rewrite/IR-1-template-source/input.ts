const a = require(`cmdk`);
export const load = () => import(`cmdk`);
vi.mock(`cmdk`, () => ({}));
export { a };

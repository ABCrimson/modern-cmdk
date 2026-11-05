import { vi } from 'vitest';

vi.mock('modern-cmdk/react', () => ({ Command: () => null }));
vi.doMock('modern-cmdk/react', () => ({ CommandRoot: () => null, defaultFilter: () => 1 }));
vi.mock(import('modern-cmdk/react'), () => ({ defaultFilter: () => 0 }));
export const actual = await vi.importActual('modern-cmdk/react');
jest.mock('modern-cmdk/react');
export const real = jest.requireActual('modern-cmdk/react');
export const other = jest.requireActual('cmdk-extra');

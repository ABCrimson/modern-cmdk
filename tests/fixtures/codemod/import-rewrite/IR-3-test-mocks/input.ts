import { vi } from 'vitest';

vi.mock('cmdk', () => ({ Command: () => null }));
vi.doMock('cmdk', () => ({ CommandRoot: () => null, defaultFilter: () => 1 }));
vi.mock(import('cmdk'), () => ({ defaultFilter: () => 0 }));
export const actual = await vi.importActual('cmdk');
jest.mock('cmdk');
export const real = jest.requireActual('cmdk');
export const other = jest.requireActual('cmdk-extra');

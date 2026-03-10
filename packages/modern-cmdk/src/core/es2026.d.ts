// ES2026+ ambient type declarations for features not yet in TypeScript's lib
// These supplement the ESNext lib and will be removable once TS ships them natively

interface Math {
  sumPrecise(values: Iterable<number>): number;
}

interface SchedulingIsInputPending {
  isInputPending?(): boolean;
}

interface Navigator {
  scheduling?: SchedulingIsInputPending;
}

interface RegExpConstructor {
  escape(str: string): string;
}

interface MapConstructor {
  groupBy<K, T>(items: Iterable<T>, keySelector: (item: T, index: number) => K): Map<K, T[]>;
}

interface ArrayConstructor {
  fromAsync<T>(asyncIterable: AsyncIterable<T> | Iterable<T | Promise<T>>): Promise<T[]>;
  fromAsync<T, U>(
    asyncIterable: AsyncIterable<T> | Iterable<T>,
    mapFn: (value: Awaited<T>, index: number) => U,
    thisArg?: unknown,
  ): Promise<Awaited<U>[]>;
}

interface PromiseConstructor {
  try<T>(fn: () => T | PromiseLike<T>): Promise<T>;
  try<T, A extends readonly unknown[]>(
    fn: (...args: A) => T | PromiseLike<T>,
    ...args: A
  ): Promise<T>;
  withResolvers<T>(): {
    promise: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: unknown) => void;
  };
}

/** Prioritized Task Scheduling API — globalThis.scheduler */
interface TaskScheduler {
  yield(): Promise<void>;
  postTask<T>(
    callback: () => T | PromiseLike<T>,
    options?: { priority?: 'user-blocking' | 'user-visible' | 'background'; delay?: number },
  ): Promise<T>;
}

declare var scheduler: TaskScheduler | undefined;

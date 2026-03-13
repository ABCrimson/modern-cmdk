// ES2026+ ambient type declarations for features not yet in TypeScript's lib
// These supplement the ESNext lib and will be removable once TS ships them natively

interface SchedulingIsInputPending {
  isInputPending?(): boolean;
}

interface Navigator {
  scheduling?: SchedulingIsInputPending;
}

interface ArrayConstructor {
  fromAsync<T>(asyncIterable: AsyncIterable<T> | Iterable<T | Promise<T>>): Promise<T[]>;
  fromAsync<T, U>(
    asyncIterable: AsyncIterable<T> | Iterable<T>,
    mapFn: (value: Awaited<T>, index: number) => U,
    thisArg?: unknown,
  ): Promise<Awaited<U>[]>;
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

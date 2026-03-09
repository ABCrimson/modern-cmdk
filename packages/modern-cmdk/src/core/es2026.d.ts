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
  groupBy<K, V>(items: Iterable<V>, keySelector: (item: V) => K): Map<K, V[]>;
}

interface ArrayConstructor {
  fromAsync<T>(asyncIterable: AsyncIterable<T> | Iterable<T | Promise<T>>): Promise<T[]>;
}

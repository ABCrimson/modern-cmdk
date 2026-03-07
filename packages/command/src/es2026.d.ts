interface Math {
  sumPrecise(values: Iterable<number>): number;
}

interface SchedulingIsInputPending {
  isInputPending?(): boolean;
}

interface Navigator {
  scheduling?: SchedulingIsInputPending;
}

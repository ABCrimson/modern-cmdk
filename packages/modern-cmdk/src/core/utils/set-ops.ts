// packages/command/src/core/utils/set-ops.ts
// Cross-browser polyfills for ES2025 Set methods
// Explicit return types required by isolatedDeclarations

/** Returns a new Set containing elements present in both `a` and `b`. */
export function setIntersection<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): Set<T> {
  const result = new Set<T>();
  // Iterate the smaller set for optimal performance
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const item of smaller) {
    if (larger.has(item)) {
      result.add(item);
    }
  }
  return result;
}

/** Returns a new Set containing elements in `a` but not in `b`. */
export function setDifference<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): Set<T> {
  const result = new Set<T>();
  for (const item of a) {
    if (!b.has(item)) {
      result.add(item);
    }
  }
  return result;
}

/** Returns a new Set containing all elements from both `a` and `b`. */
export function setUnion<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): Set<T> {
  const result = new Set<T>(a);
  for (const item of b) {
    result.add(item);
  }
  return result;
}

/** Returns `true` if every element in `a` is also in `b`. */
export function setIsSubsetOf<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  if (a.size > b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

/** Returns `true` if every element in `b` is also in `a`. */
export function setIsSupersetOf<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  return setIsSubsetOf(b, a);
}

/** Returns `true` if `a` and `b` share no elements. */
export function setIsDisjointFrom<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const item of smaller) {
    if (larger.has(item)) return false;
  }
  return true;
}

/** Returns a new Set containing elements in either `a` or `b` but not both. */
export function setSymmetricDifference<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): Set<T> {
  const result = new Set<T>(a);
  for (const item of b) {
    if (result.has(item)) {
      result.delete(item);
    } else {
      result.add(item);
    }
  }
  return result;
}

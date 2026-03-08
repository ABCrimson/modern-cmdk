// tests/snapshot-serializers.ts
// Vitest 4.1 snapshot serializers for project-specific types

import type { SnapshotSerializer } from 'vitest';

/**
 * Snapshot serializer for Temporal.Instant — renders as ISO string
 * instead of opaque object representation.
 */
export const temporalInstantSerializer: SnapshotSerializer = {
  test(val: unknown): boolean {
    return typeof val === 'object' && val !== null && val instanceof Temporal.Instant;
  },
  serialize(val: Temporal.Instant): string {
    return `Temporal.Instant <${val.toString()}>`;
  },
};

export default [temporalInstantSerializer];

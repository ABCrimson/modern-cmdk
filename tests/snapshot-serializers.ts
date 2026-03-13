// tests/snapshot-serializers.ts
// Vitest 4.1 snapshot serializers for project-specific types

import type { SnapshotSerializer } from 'vitest';

/**
 * Snapshot serializer for epoch-millisecond timestamps — renders as ISO date string
 * instead of raw number for readable snapshots.
 * Note: This serializer is kept for backward compatibility but timestamps
 * are now plain numbers (Date.now() epoch ms) rather than Temporal.Instant.
 */
export const timestampSerializer: SnapshotSerializer = {
  test(val: unknown): boolean {
    // Only serialize numbers that look like epoch-ms timestamps (after 2000-01-01)
    return typeof val === 'number' && val > 946_684_800_000 && Number.isFinite(val);
  },
  serialize(val: number): string {
    return `Timestamp <${new Date(val).toISOString()}>`;
  },
};

export default [timestampSerializer];

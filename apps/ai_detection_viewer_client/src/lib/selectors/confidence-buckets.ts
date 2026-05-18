import type { Frame } from '@/lib/types';

/**
 * Number of fixed-width buckets used by `selectConfidenceBuckets`.
 *
 * Locked by `confidence-buckets.test.ts`. Changing this number is a UI
 * contract change — `ConfidenceHistogram` paints exactly this many bars.
 */
export const BUCKET_COUNT = 10;

/**
 * Aggregates a frame's detections into a fixed-length histogram over `[0, 1]`.
 *
 * Bucket `i` covers the half-open interval `[i / BUCKET_COUNT, (i+1) / BUCKET_COUNT)`,
 * except the last bucket which is closed on the right so that `confidence === 1.0`
 * always lands in `buckets[BUCKET_COUNT - 1]` instead of being silently dropped.
 *
 * Pure function — no React / Zustand / Three.js imports.
 *
 * The selector intentionally does NOT accept `visibleIds`. The histogram's job
 * is to show the raw distribution underneath the current confidence threshold
 * (which is overlaid as a guide line). Filtering by `visibleIds` would erase
 * the very information the threshold overlay is meant to illustrate.
 */
export function selectConfidenceBuckets(frame: Frame): number[] {
  const buckets = new Array<number>(BUCKET_COUNT).fill(0);
  for (const d of frame.detections2D) {
    const idx =
      d.confidence >= 1
        ? BUCKET_COUNT - 1
        : Math.floor(d.confidence * BUCKET_COUNT);
    buckets[idx] += 1;
  }
  return buckets;
}

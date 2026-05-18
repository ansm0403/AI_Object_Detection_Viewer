import type { Frame } from '@/lib/types';

/**
 * Aggregates a frame's detections into a `Map<className, count>`.
 *
 * Pure function — no React / Zustand / Three.js imports.
 *
 * Iteration order of the returned `Map` is **insertion order = first-appearance
 * order** in `frame.detections2D`. `ClassCountBar` renders rows in this order
 * without an additional sort step.
 *
 * The selector intentionally does NOT accept `visibleIds`. `ClassCountBar`'s
 * row click toggles `visibleClasses` via the existing class filter, so the
 * bar must show the raw per-frame class composition (the filter's base set);
 * applying the filter to the chart's own data would collapse every row to
 * the same height and erase the information the user is filtering on.
 */
export function selectClassCounts(frame: Frame): Map<string, number> {
  const counts = new Map<string, number>();
  for (const d of frame.detections2D) {
    counts.set(d.class, (counts.get(d.class) ?? 0) + 1);
  }
  return counts;
}

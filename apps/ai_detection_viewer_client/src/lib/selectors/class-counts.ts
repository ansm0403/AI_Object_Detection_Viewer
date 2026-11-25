import type { Frame } from '@/lib/types';

/**
 * Aggregates a frame's 3D boxes into a `Map<className, count>`.
 *
 * Pure function — no React / Zustand / Three.js imports.
 *
 * (F3, decision 4) Counts `frame.detections3D`, not `detections2D`. The 3D view
 * is the main view (Immutable Rule #5) and on nuScenes the 3D set is the
 * superset: a measured box behind or beside the front camera has no 2D
 * projection but is still an object in the scene (Edge_F#2 Case 1). Counting
 * 3D keeps this chart on the same basis as the header count, the object list
 * and the timeline badges. COCO is 1:1 (every 2D box has an estimated 3D box
 * with the same id), so its counts are unchanged.
 *
 * Iteration order of the returned `Map` is **insertion order = first-appearance
 * order** in `frame.detections3D`. `ClassCountBar` renders rows in this order
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
  for (const d of frame.detections3D) {
    counts.set(d.class, (counts.get(d.class) ?? 0) + 1);
  }
  return counts;
}

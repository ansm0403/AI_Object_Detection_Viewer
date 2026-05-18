import type { Detection2D, Frame } from '@/lib/types';

/**
 * Returns the detections in `frame` that survive the current UI filters.
 *
 * Pure function — lives outside React and Zustand so the filter logic can be
 * unit-tested without spinning up a store. See `architecture.md` Separation
 * of Concerns table.
 *
 * `visibleClasses` semantics is **permissive empty**: an empty Set means
 * "show all classes". This matches the store's initial state
 * (`new Set<string>()`) so the user's first paint isn't a blank screen.
 * Locked by `visible-detections.test.ts`.
 */
export function selectVisibleDetections(
  frame: Frame,
  confidenceThreshold: number,
  visibleClasses: Set<string>,
): Detection2D[] {
  const showAllClasses = visibleClasses.size === 0;
  return frame.detections2D.filter((d) => {
    if (d.confidence < confidenceThreshold) return false;
    if (showAllClasses) return true;
    return visibleClasses.has(d.class);
  });
}

/**
 * Convenience: the id Set of visible detections, suitable for filtering
 * downstream artefacts (point cloud points, BBox3D meshes, ObjectList rows).
 */
export function selectVisibleDetectionIds(
  frame: Frame,
  confidenceThreshold: number,
  visibleClasses: Set<string>,
): Set<string> {
  const visible = selectVisibleDetections(frame, confidenceThreshold, visibleClasses);
  return new Set(visible.map((d) => d.id));
}

import type { Detection2D, Frame, Point3D } from '@/lib/types';

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

/**
 * The id Set of visible **3D** detections, applying the same confidence +
 * permissive-empty class semantics as the 2D path.
 *
 * Why a separate 3D pass exists: COCO frames are 1:1 (every 3D box has a 2D
 * box) so the 2D-derived set above is enough. But nuScenes is projected — a 3D
 * box can have NO 2D box when it sits behind the camera or off-screen
 * (Edge_F#2 Case 1). Building the 3D viewer's visible set from
 * `detections2D` would silently drop those measured 3D-only boxes. We instead
 * filter `detections3D` directly so every measured box can render. Because
 * `Detection2D.id` and `Detection3D.id` match for shared objects (Rule #1) and
 * COCO is 1:1, this returns an identical set to the 2D path on COCO data — no
 * behavior change there.
 */
export function selectVisibleDetectionIds3D(
  frame: Frame,
  confidenceThreshold: number,
  visibleClasses: Set<string>,
): Set<string> {
  const showAllClasses = visibleClasses.size === 0;
  const ids = new Set<string>();
  for (const d of frame.detections3D) {
    if (d.confidence < confidenceThreshold) continue;
    if (!showAllClasses && !visibleClasses.has(d.class)) continue;
    ids.add(d.id);
  }
  return ids;
}

/**
 * The points that should render given the current `visibleIds` set.
 *
 * Two kinds of point coexist (Point3D.detectionId is now optional):
 *  - COCO's ESTIMATED points carry a `detectionId` (they were scattered inside
 *    one estimated bbox), so they follow that box's visibility — hidden when its
 *    id is filtered out. Unchanged from the prior in-component filter.
 *  - F2-B's real LiDAR points carry NO `detectionId` (a measured environment
 *    point belongs to no single detection). They are ALWAYS shown — the box
 *    filters (distance slider, class toggles) act on boxes, not on the
 *    environment cloud (the user-chosen contract for F2-B).
 *
 * `visibleIds === undefined` keeps everything (no filtering wired). Pure, so the
 * "environment points always show" rule is locked by a test rather than living
 * only in the R3F component (Immutable Rule #3 spirit).
 */
export function selectVisiblePoints(
  points: Point3D[],
  visibleIds: Set<string> | undefined,
): Point3D[] {
  if (!visibleIds) return points;
  return points.filter(
    (p) => p.detectionId === undefined || visibleIds.has(p.detectionId),
  );
}

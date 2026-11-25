import type { CameraView, Detection2D, Frame } from '@/lib/types';

/**
 * (F6) Reading a frame through its cameras.
 *
 * A nuScenes frame is photographed by six cameras (`Frame.cameras`); a COCO
 * frame is one image and has no `cameras`. These helpers hide that difference,
 * so code that works on "one photo" never needs to know how many there are.
 *
 * Pure functions (Immutable Rule #3). None of them is a selection: which camera
 * is on screen is a VIEW setting of the page, and `selectedObjectId` stays the
 * only selection (Rule #2).
 */

/**
 * Name of the single view of a frame that has no `cameras` (COCO). Empty, so it
 * can never be mistaken for a real camera channel.
 */
export const SINGLE_VIEW = '';

/**
 * Every camera view of a frame, default first. A frame without `cameras` yields
 * its one image as a single unnamed view, so callers can always iterate.
 */
export function cameraViews(frame: Frame): readonly CameraView[] {
  if (frame.cameras && frame.cameras.length > 0) return frame.cameras;
  return [
    {
      name: SINGLE_VIEW,
      imageUrl: frame.imageUrl,
      imageWidth: frame.imageWidth,
      imageHeight: frame.imageHeight,
      detections2D: frame.detections2D,
    },
  ];
}

/** The camera the frame's top-level image fields describe. */
export function defaultCameraName(frame: Frame): string {
  return cameraViews(frame)[0].name;
}

/** Whether the frame has a camera of this name. */
export function hasCamera(frame: Frame, name: string | null | undefined): boolean {
  return name != null && cameraViews(frame).some((view) => view.name === name);
}

/**
 * The frame as ONE camera sees it: the same frame with that camera's photo and
 * that camera's 2D boxes in the top-level fields.
 *
 * This is what lets everything written for a single photo — the 2D viewer, the
 * 2D filter, the per-photo evaluation — work on any of the six cameras
 * unchanged: hand it `frameAsCamera(frame, name)` instead of `frame`.
 * `detections3D`, `pointCloud` and `id` are shared, not copied: it is the same
 * moment and the same objects, looked at through another lens.
 *
 * Returns the SAME object when the frame already shows that camera (the
 * default), when the name is unknown, or when the frame has no cameras — so a
 * `useMemo` keyed on the result stays stable and a bad name can never produce a
 * frame without a photo.
 */
export function frameAsCamera(frame: Frame, name: string | null | undefined): Frame {
  if (name == null || !frame.cameras) return frame;
  const view = frame.cameras.find((candidate) => candidate.name === name);
  if (!view || view === frame.cameras[0]) return frame;
  return {
    ...frame,
    imageUrl: view.imageUrl,
    imageWidth: view.imageWidth,
    imageHeight: view.imageHeight,
    detections2D: view.detections2D,
  };
}

/**
 * The cameras that see an object: the names of the views in which the 3D box
 * has a 2D projection, in the frame's camera order. Empty when no camera sees
 * it (it still exists in 3D) or when the object is not in this frame.
 */
export function camerasSeeing(frame: Frame, objectId: string): string[] {
  const names: string[] = [];
  for (const view of cameraViews(frame)) {
    if (view.detections2D.some((d) => d.id === objectId)) names.push(view.name);
  }
  return names;
}

/**
 * For every object that at least one camera sees: the cameras that see it.
 * One pass over the frame — use this instead of `camerasSeeing` per row when a
 * whole list needs the answer.
 */
export function camerasByObject(frame: Frame): Map<string, string[]> {
  const byObject = new Map<string, string[]>();
  for (const view of cameraViews(frame)) {
    for (const detection of view.detections2D) {
      const names = byObject.get(detection.id);
      if (names) {
        // A view lists an object once; guard anyway so a name is never doubled.
        if (names[names.length - 1] !== view.name) names.push(view.name);
      } else {
        byObject.set(detection.id, [view.name]);
      }
    }
  }
  return byObject;
}

/** This object's 2D box in one camera's photo, or `undefined`. */
export function detectionInCamera(
  frame: Frame,
  objectId: string,
  name: string,
): Detection2D | undefined {
  return cameraViews(frame)
    .find((view) => view.name === name)
    ?.detections2D.find((d) => d.id === objectId);
}

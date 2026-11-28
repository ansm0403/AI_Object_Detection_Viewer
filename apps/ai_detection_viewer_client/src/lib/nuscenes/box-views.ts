import type { Detection2D, Detection3D } from '@/lib/types';
import {
  egoQuatToThree,
  egoToThree,
  globalQuatToEgo,
  globalToEgo,
  nuSizeToLocal,
  type Pose,
  type QuatWXYZ,
  type Vec3,
} from '@/lib/geometry/transforms';
import {
  boxCornersEgo,
  projectBoxCorners,
  projectCornersToBbox,
  type Intrinsic,
} from '@/lib/geometry/projection';

/**
 * One box → what the app draws of it: the 3D box in the frame, and its
 * rectangle in a camera's photo.
 *
 * (F8) This used to be inline in `parseNuScenes`. It is its own module so that
 * the parser and box editing run THE SAME math: an edited box is rebuilt by
 * these two functions from its new values, exactly as the parser built the
 * original from the file's values. There is no second implementation that
 * could drift (the 3D box, its projection in every photo and the 2D rectangle
 * always come from one set of numbers).
 *
 * Pure (Immutable Rule #3): no React, no store; all coordinate math is
 * delegated to `lib/geometry`.
 */

/** A box the way the dataset writes it. */
export type GlobalBoxGeometry = {
  /** Centre in the GLOBAL frame, metres. */
  translation: Vec3;
  /** [width, length, height] in metres — nuScenes order. */
  size: Vec3;
  /** Orientation in the GLOBAL frame, nuScenes order [w, x, y, z]. */
  rotation: QuatWXYZ;
};

/** One camera's photo, as far as projecting a box into it is concerned. */
export type ProjectionCamera = {
  /** The car's pose when THIS photo was taken. */
  egoPose: Pose;
  /** The camera's pose on the car. */
  sensor: Pose;
  intrinsic: Intrinsic;
  /** Pixel size the intrinsics refer to (the original photo's). */
  imageWidth: number;
  imageHeight: number;
};

/**
 * The 3D box in the render frame of a frame whose ego pose is `frameEgoPose`:
 * global → ego → the y-up render frame.
 */
export function boxInFrame(box: GlobalBoxGeometry, frameEgoPose: Pose): Detection3D['bbox3D'] {
  return {
    center: egoToThree(globalToEgo(box.translation, frameEgoPose)),
    size: nuSizeToLocal(box.size),
    rotation: egoQuatToThree(globalQuatToEgo(box.rotation, frameEgoPose.rotation)),
  };
}

/**
 * The box in one camera's photo: the rectangle around its eight projected
 * corners, and the corners themselves (so the camera view can draw the 3D box,
 * F4). `null` when the box is behind that camera or entirely outside its image
 * — the 3D box still exists, it just has no 2D box in this photo.
 *
 * The box is taken into the ego frame OF THIS PHOTO first: the cameras fire at
 * slightly different moments and the car has moved in between (F6).
 */
export function boxInCamera(
  box: GlobalBoxGeometry,
  camera: ProjectionCamera,
): Pick<Detection2D, 'bbox' | 'corners'> | null {
  const cornersEgo = boxCornersEgo(
    globalToEgo(box.translation, camera.egoPose),
    nuSizeToLocal(box.size),
    globalQuatToEgo(box.rotation, camera.egoPose.rotation),
  );
  const bbox = projectCornersToBbox(
    cornersEgo,
    camera.sensor,
    camera.intrinsic,
    camera.imageWidth,
    camera.imageHeight,
  );
  if (!bbox) return null;
  // A non-null bbox means every corner is in front of the camera, so the corner
  // projection cannot fail here; the fallback is purely defensive.
  const corners = projectBoxCorners(cornersEgo, camera.sensor, camera.intrinsic);
  return { bbox, ...(corners ? { corners } : {}) };
}

/**
 * Schema of the OFFLINE-PREPPED nuScenes static JSON (F2).
 *
 * nuScenes ships as a relational token graph (`sample → sample_data →
 * {ego_pose, calibrated_sensor}`, `sample_annotation → instance → category`)
 * plus large LiDAR files — impractical to traverse in the browser, and we run no
 * backend. So a one-time offline script (`scripts/`, build-time only — like
 * Step 11's `generate_predictions.py`) flattens a few nuScenes-mini keyframes
 * into the shape below. The browser then parses it like COCO.
 *
 * CONTRACT: the prep script copies RAW nuScenes values and does NO coordinate
 * math (Immutable Rule #3 — all transforms live in `lib/geometry` and are
 * Vitest-tested). The fields therefore keep nuScenes-NATIVE conventions, which
 * `lib/nuscenes/parser.ts` normalizes:
 *   - quaternions are [w, x, y, z] (w first), NOT Three.js [x, y, z, w];
 *   - box `size` is [w, l, h] (width, length, height);
 *   - boxes are in the GLOBAL frame (no zero-transform path — F2 fact #1).
 *
 * Kept distinct from the internal `Frame` / `Detection*` types (like COCO's raw
 * schema) so the dataset's shape never leaks through the rest of the app.
 */

/** Quaternion in nuScenes order [w, x, y, z]. */
export type NuQuat = [number, number, number, number];
/** A 3-vector [x, y, z]. */
export type NuVec3 = [number, number, number];

/** Top-level prepped file: a list of prepared keyframes. */
export type NuScenesPrepped = {
  /** Version of THIS prepped format (ours), e.g. "1.0". */
  version: string;
  frames: NuScenesPreppedFrame[];
};

export type NuScenesPreppedFrame = {
  /** nuScenes `sample` token → becomes `Frame.id`. */
  token: string;
  /** Capture time in microseconds (nuScenes-native); used for ordering (F2-C). */
  timestamp: number;
  /** The chosen camera image (CAM_FRONT for F2-A). */
  image: NuScenesImage;
  /** Car (ego) position + orientation in the GLOBAL frame at this timestamp. */
  egoPose: NuScenesEgoPose;
  /** The camera's pose relative to the EGO frame + its lens intrinsics. */
  calibratedSensor: NuScenesCalibratedSensor;
  /** 3D box annotations, in the GLOBAL frame. */
  annotations: NuScenesAnnotation[];
};

export type NuScenesImage = {
  /** Public path served by the app, e.g. "/sample-data/nuscenes/cam_front/xxx.jpg". */
  path: string;
  /** Pixel width. */
  width: number;
  /** Pixel height. */
  height: number;
};

/** `ego_pose`: car pose in the GLOBAL frame. Differs every frame (the car moves). */
export type NuScenesEgoPose = {
  /** Global translation [x, y, z] in metres. */
  translation: NuVec3;
  /** Orientation quaternion, nuScenes order [w, x, y, z]. */
  rotation: NuQuat;
};

/** `calibrated_sensor`: camera pose relative to the EGO frame + intrinsics. */
export type NuScenesCalibratedSensor = {
  /** Translation relative to the car [x, y, z] in metres. */
  translation: NuVec3;
  /** Orientation quaternion, nuScenes order [w, x, y, z]. */
  rotation: NuQuat;
  /** Camera intrinsic matrix K, 3×3 row-major. */
  cameraIntrinsic: [
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ];
};

/** `sample_annotation` joined with `instance` + `category`. */
export type NuScenesAnnotation = {
  /** `instance` token — stable id for the SAME object across frames. Becomes the
   *  shared 2D/3D id (Immutable Rule #1) and the F2-C track id. */
  instanceToken: string;
  /** Category name joined from the `category` table, e.g. "vehicle.car". */
  category: string;
  /** Box center in the GLOBAL frame [x, y, z] in metres. */
  translation: NuVec3;
  /** Box extents [w, l, h] (width, length, height) in metres — nuScenes order. */
  size: NuVec3;
  /** Box orientation quaternion in the GLOBAL frame, nuScenes order [w, x, y, z]. */
  rotation: NuQuat;
};

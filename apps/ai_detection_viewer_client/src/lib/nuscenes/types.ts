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
  /** The image of the frame's base camera (CAM_FRONT). (F6) All six are in `cameras`. */
  image: NuScenesImage;
  /** Car (ego) position + orientation in the GLOBAL frame at this timestamp. */
  egoPose: NuScenesEgoPose;
  /** The camera's pose relative to the EGO frame + its lens intrinsics. */
  calibratedSensor: NuScenesCalibratedSensor;
  /**
   * (F6, format 1.2) All cameras of this keyframe, the frame's base camera
   * (CAM_FRONT) first — `cameras[0]` repeats the top-level `image` / `egoPose` /
   * `calibratedSensor`. Optional: files prepped before F6 (1.0, 1.1) do not have
   * it, and the parser then treats the top-level fields as the one camera.
   */
  cameras?: NuScenesCamera[];
  /** 3D box annotations, in the GLOBAL frame. */
  annotations: NuScenesAnnotation[];
  /** (F2-B) Decimated LiDAR_TOP point cloud + the calibration needed to align it
   *  to the boxes. Optional: prepped JSON produced before F2-B (or a frame whose
   *  LiDAR sweep was unavailable) simply omits it and the parser yields no points. */
  lidar?: NuScenesLidar;
};

export type NuScenesImage = {
  /** Public path served by the app, e.g. "/sample-data/nuscenes/cam_front/xxx.jpg". */
  path: string;
  /** Pixel width. */
  width: number;
  /** Pixel height. */
  height: number;
};

/**
 * (F6) One camera's photo of a keyframe, with what is needed to project the
 * frame's 3D boxes into it.
 *
 * `egoPose` is the car's pose AT THE MOMENT THIS PHOTO WAS TAKEN. The six
 * cameras do not fire together (in the sample: up to 35 ms after CAM_FRONT,
 * the car 3–17 cm further on), so each photo has its own. Projecting with the
 * photo's own pose puts a box where that camera saw it; reusing the frame's
 * (CAM_FRONT) pose shifted rectangles by a median of 2.8 px and up to 41 px
 * (measured 2026-11-26).
 */
export type NuScenesCamera = {
  /** nuScenes sensor channel, e.g. "CAM_BACK_LEFT". Becomes `CameraView.name`. */
  channel: string;
  image: NuScenesImage;
  egoPose: NuScenesEgoPose;
  calibratedSensor: NuScenesCalibratedSensor;
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

/**
 * (F2-B) Decimated LiDAR_TOP sweep for one keyframe.
 *
 * `points` are RAW LIDAR-sensor-frame coordinates (no transform applied — Rule
 * #3), flattened as [x, y, z, x, y, z, …] to keep the JSON small (no repeated
 * per-point keys). The prep script decimates them with a voxel grid. Alignment to
 * the boxes happens in `lib/geometry`: sensor → global (`sensorToGlobal`, using
 * the two poses below) → ego (`globalToEgo`, using the frame's CAM_FRONT
 * `egoPose`) → render (`egoToThree`). Routing through GLOBAL corrects the LiDAR-vs-
 * camera capture-time offset (the LiDAR `egoPose` here differs slightly from the
 * frame's camera `egoPose`).
 */
export type NuScenesLidar = {
  /** Decimated points in the LIDAR sensor frame, flat [x, y, z, x, y, z, …]. */
  points: number[];
  /** The LiDAR's `ego_pose` (car in GLOBAL at the LiDAR timestamp). */
  egoPose: NuScenesEgoPose;
  /** The LiDAR's `calibrated_sensor` (sensor pose relative to EGO). No intrinsic
   *  (LiDAR is not a projective camera). */
  calibratedSensor: NuScenesLidarCalibratedSensor;
};

/** `calibrated_sensor` for the LiDAR: pose relative to EGO, no camera intrinsic. */
export type NuScenesLidarCalibratedSensor = {
  /** Translation relative to the car [x, y, z] in metres. */
  translation: NuVec3;
  /** Orientation quaternion, nuScenes order [w, x, y, z]. */
  rotation: NuQuat;
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
  /**
   * (F4, format 1.1) `sample_annotation.token` — unique id of THIS box in THIS
   * frame. `instanceToken` is shared by every box of the same object across
   * frames; a review verdict is about one box, so exports carry this token.
   * Optional: files prepped before F4 (format 1.0) do not have it.
   */
  annotationToken?: string;
  /**
   * (F4) `num_lidar_pts` — LiDAR points nuScenes counted inside this box on the
   * ORIGINAL sweep (not on our decimated `lidar.points`). 0 = the box has no
   * sensor evidence in this frame (annotators carry boxes across frames).
   */
  numLidarPts?: number;
  /** (F4) nuScenes visibility level joined from the `visibility` table. */
  visibility?: NuScenesVisibility | null;
};

/**
 * nuScenes visibility bins: how much of the object is visible, in four levels.
 * The names are nuScenes' own (`visibility.level`).
 */
export type NuScenesVisibility = 'v0-40' | 'v40-60' | 'v60-80' | 'v80-100';

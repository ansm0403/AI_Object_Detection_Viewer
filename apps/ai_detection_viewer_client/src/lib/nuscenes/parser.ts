import type {
  BoxAnnotationInfo,
  CameraView,
  Detection3D,
  Frame,
  Point3D,
} from '@/lib/types';
import { DEFAULT_CAMERA } from '@/lib/cameras/names';
import {
  egoToThree,
  globalToEgo,
  sensorToGlobal,
  type Pose,
  type Vec3,
} from '@/lib/geometry/transforms';
import {
  boxInCamera,
  boxInFrame,
  type GlobalBoxGeometry,
  type ProjectionCamera,
} from './box-views';
import type {
  NuScenesAnnotation,
  NuScenesCalibratedSensor,
  NuScenesCamera,
  NuScenesImage,
  NuScenesLidar,
  NuScenesLidarRef,
  NuScenesPointsFile,
  NuScenesPrepped,
  NuScenesPreppedFrame,
} from './types';

/**
 * Parse the offline-prepped nuScenes static JSON (see `types.ts`) into the
 * internal `Frame[]`. Mirrors `parseCoco`'s defensive style: invalid input
 * warns and is skipped, never throws (Error Defaults).
 *
 * Per annotation it builds BOTH a measured 3D box and a projected 2D box that
 * share the `instance`-derived id (Immutable Rule #1). All coordinate math is
 * delegated to `lib/geometry` (Immutable Rule #3); confidence is a constant 1.0
 * because annotations are ground truth, never an injected fake score
 * (Immutable Rule #6). `pointCloud` carries the frame's real decimated LiDAR_TOP
 * points (F2-B), aligned to the boxes; absent (older prepped JSON) → empty.
 *
 * (F7) The same function reads a scene's frames file (format 1.3). There the
 * points are in a separate file per frame: `pointCloud` is empty and
 * `pointCloudSource` says where to fetch them (`parseNuScenesPoints` turns that
 * file into the same points this function would have produced inline).
 */
export function parseNuScenes(raw: unknown): Frame[] {
  if (!isPrepped(raw)) {
    console.warn(
      '[parseNuScenes] Invalid prepped root. Expected { version, frames: [] }.',
    );
    return [];
  }

  const frames: Frame[] = [];
  for (const preppedFrame of raw.frames) {
    const frame = buildFrame(preppedFrame);
    if (frame) frames.push(frame);
  }
  return frames;
}

function buildFrame(pf: unknown): Frame | null {
  if (!isPreppedFrame(pf)) {
    console.warn('[parseNuScenes] Skipping malformed frame.');
    return null;
  }

  // The frame's ego pose (its base camera's): the frame every 3D box and LiDAR
  // point is expressed in. Unchanged by F6 — the other cameras only add views.
  const egoPose: Pose = pf.egoPose;
  // (F6) One 2D box list per camera, default camera first.
  const sources = cameraSources(pf);
  const views: CameraView[] = sources.map((source) => ({
    name: source.name,
    imageUrl: source.image.path,
    imageWidth: source.image.width,
    imageHeight: source.image.height,
    detections2D: [],
    // (F8) Kept so an edited box can be projected into this photo again.
    calibration: {
      egoPose: poseOf(source.egoPose),
      sensor: poseOf(source.sensor),
      intrinsic: source.K,
    },
  }));

  const detections3D: Detection3D[] = [];
  const seenIds = new Set<string>();

  for (const ann of pf.annotations) {
    if (!isAnnotation(ann)) {
      console.warn(
        `[parseNuScenes] Skipping malformed annotation in frame ${pf.token}.`,
      );
      continue;
    }
    if (seenIds.has(ann.instanceToken)) {
      console.warn(
        `[parseNuScenes] Duplicate instance "${ann.instanceToken}" in frame ${pf.token}. Skipping.`,
      );
      continue;
    }
    seenIds.add(ann.instanceToken);

    const className = mapCategory(ann.category);

    // The box as the file writes it (global frame). Both the 3D box and every
    // photo's 2D box are built from these values by `box-views` — the same two
    // functions that rebuild a box when it is edited (F8).
    const geometry: GlobalBoxGeometry = {
      translation: ann.translation,
      size: ann.size,
      rotation: ann.rotation,
    };

    const annotation = readAnnotationInfo(ann);
    detections3D.push({
      id: ann.instanceToken,
      class: className,
      confidence: 1.0,
      bbox3D: boxInFrame(geometry, egoPose),
      ...(annotation ? { annotation } : {}),
    });

    // 2D box = AABB of the 3D box projected into a camera image. Skipped (but
    // the 3D box is kept) when the box is behind that camera or fully off its
    // image. (F6) Done once per camera: the same object gets a 2D box in every
    // photo it appears in, always under the same id (Rule #1). Each photo is
    // projected with ITS OWN ego pose (the cameras fire at slightly different
    // moments); for the base camera that is the frame's own pose, so its 2D
    // boxes are exactly what they were before F6. (F4) The eight projected
    // corners are kept too, so the camera view can draw the 3D box itself.
    sources.forEach((source, index) => {
      const projected = boxInCamera(geometry, projectionCamera(source));
      if (!projected) return;
      views[index].detections2D.push({
        id: ann.instanceToken,
        class: className,
        confidence: 1.0,
        ...projected,
      });
    });
  }

  // The top-level image fields are the default camera's view (`views[0]`) —
  // the same array, so the two can never disagree (see `Frame.cameras`).
  const main = views[0];
  // (F7) Points in their own file → nothing inline, only where to get them.
  const lidarRef = isLidarRef(pf.lidar) ? pf.lidar : null;
  const thumb: unknown = pf.thumb;
  return {
    id: pf.token,
    imageUrl: main.imageUrl,
    imageWidth: main.imageWidth,
    imageHeight: main.imageHeight,
    detections2D: main.detections2D,
    detections3D,
    pointCloud: lidarRef ? [] : buildLidarPoints(pf.lidar, egoPose, pf.token),
    source: 'nuscenes-measured',
    cameras: views,
    // (F8) The frame the boxes above are expressed in, in global terms.
    egoPose: poseOf(egoPose),
    ...(lidarRef ? { pointCloudSource: { url: lidarRef.path, count: lidarRef.pointCount } } : {}),
    ...(typeof thumb === 'string' && thumb !== '' ? { thumbnailUrl: thumb } : {}),
  };
}

/**
 * (F7) Parse one frame's points file (`NuScenesPointsFile`) into render-frame
 * points — the same points, through the same per-point math, that
 * `parseNuScenes` produces for a single-file frame with inline points.
 *
 * Returns `null` when the file is not a points file (the caller then shows that
 * the points are unavailable; the boxes still render). A valid file with zero
 * points returns `[]`. Never throws (Error Defaults).
 *
 * `expectedToken`: the frame the points are about to be drawn on. A file that
 * names ANOTHER frame is rejected (`null`) — measured points of one moment must
 * never be shown under the boxes of another (Rule #6: what is on screen is what
 * was measured for this frame).
 */
export function parseNuScenesPoints(raw: unknown, expectedToken?: string): Point3D[] | null {
  if (!isPointsFile(raw)) {
    console.warn('[parseNuScenesPoints] Not a points file. Expected { token, frameEgoPose, lidar }.');
    return null;
  }
  if (expectedToken !== undefined && raw.token !== expectedToken) {
    console.warn(
      `[parseNuScenesPoints] Points file is for frame ${raw.token}, not ${expectedToken}. Ignoring it.`,
    );
    return null;
  }
  return buildLidarPoints(raw.lidar, raw.frameEgoPose, raw.token);
}

/** What the parser needs to project boxes into one camera's photo. */
type CameraSource = {
  name: string;
  image: NuScenesImage;
  /** The car's pose when THIS photo was taken. */
  egoPose: Pose;
  /** The camera's pose on the car. */
  sensor: Pose;
  K: NuScenesCalibratedSensor['cameraIntrinsic'];
};

/** Only the pose of a raw object that may carry more (a calibrated sensor also has its intrinsics). */
function poseOf(pose: Pose): Pose {
  return { translation: pose.translation, rotation: pose.rotation };
}

function projectionCamera(source: CameraSource): ProjectionCamera {
  return {
    egoPose: source.egoPose,
    sensor: source.sensor,
    intrinsic: source.K,
    imageWidth: source.image.width,
    imageHeight: source.image.height,
  };
}

/**
 * (F6) The cameras of a prepped frame, default camera first.
 *
 * Format 1.2 lists them in `cameras`. A file prepped before F6 has only the
 * top-level image + calibration, which is then the one camera (those files
 * were always CAM_FRONT). A malformed entry or a repeated channel is skipped
 * with a warning; if nothing usable is left the top-level camera is used, so a
 * frame always has at least one view (Error Defaults: never throw, never lose
 * the frame over one bad camera).
 */
function cameraSources(pf: NuScenesPreppedFrame): CameraSource[] {
  const base: CameraSource = {
    name: DEFAULT_CAMERA,
    image: pf.image,
    egoPose: pf.egoPose,
    sensor: pf.calibratedSensor,
    K: pf.calibratedSensor.cameraIntrinsic,
  };
  const listed: unknown = pf.cameras;
  if (listed === undefined) return [base];
  if (!Array.isArray(listed)) {
    console.warn(`[parseNuScenes] Ignoring malformed cameras in frame ${pf.token}.`);
    return [base];
  }

  const sources: CameraSource[] = [];
  const seen = new Set<string>();
  for (const camera of listed) {
    if (!isCamera(camera) || seen.has(camera.channel)) {
      console.warn(`[parseNuScenes] Skipping malformed or repeated camera in frame ${pf.token}.`);
      continue;
    }
    seen.add(camera.channel);
    sources.push({
      name: camera.channel,
      image: camera.image,
      egoPose: camera.egoPose,
      sensor: camera.calibratedSensor,
      K: camera.calibratedSensor.cameraIntrinsic,
    });
  }
  return sources.length > 0 ? sources : [base];
}

/**
 * Decimated LiDAR sweep → render-frame `Point3D[]`, aligned to the boxes.
 *
 * Per point: LIDAR sensor frame → GLOBAL (`sensorToGlobal`, via the LiDAR's own
 * calibration + ego_pose) → the box ego frame (`globalToEgo`, via the CAM_FRONT
 * `egoPose`) → render (`egoToThree`). Routing through GLOBAL absorbs the slight
 * LiDAR-vs-camera capture-time offset so points sit on the boxes. The points
 * carry NO `detectionId`: a measured environment point belongs to no single
 * detection, and is therefore always shown regardless of the box filters
 * (`selectVisiblePoints`). Absent / malformed lidar → no points (defensive,
 * never throws — Error Defaults).
 */
function buildLidarPoints(
  lidar: unknown,
  camEgoPose: Pose,
  frameToken: string,
): Point3D[] {
  if (lidar === undefined) return [];
  if (!isLidar(lidar)) {
    console.warn(`[parseNuScenes] Skipping malformed lidar in frame ${frameToken}.`);
    return [];
  }
  const flat = lidar.points;
  const lidarCalib: Pose = lidar.calibratedSensor;
  const lidarEgo: Pose = lidar.egoPose;

  const points: Point3D[] = [];
  for (let i = 0; i + 2 < flat.length; i += 3) {
    const pSensor: Vec3 = [flat[i], flat[i + 1], flat[i + 2]];
    const pEgo = globalToEgo(sensorToGlobal(pSensor, lidarCalib, lidarEgo), camEgoPose);
    const [x, y, z] = egoToThree(pEgo);
    points.push({ x, y, z }); // no detectionId — environment point
  }
  return points;
}

/**
 * nuScenes category names (e.g. "vehicle.car") → the class names this project's
 * color palette already keys on (`person` / `bicycle` / `car`), so nuScenes
 * frames reuse the COCO styling. Unmapped categories are valid data (nuScenes
 * has many) — kept as-is rather than treated as an error.
 */
const CATEGORY_MAP: Record<string, string> = {
  'vehicle.car': 'car',
  'vehicle.bicycle': 'bicycle',
  'human.pedestrian.adult': 'person',
  'human.pedestrian.child': 'person',
  'human.pedestrian.construction_worker': 'person',
  'human.pedestrian.police_officer': 'person',
  // Common driving classes nuScenes adds beyond COCO's person/bicycle/car.
  // Mapped to clean short names so labels read "truck" (not "vehicle.truck")
  // and so the color palette can give each a distinct chip. Rarer categories
  // (e.g. static_object.bicycle_rack) intentionally fall through to the raw
  // name + DEFAULT_COLOR rather than expanding the palette indefinitely.
  'vehicle.truck': 'truck',
  'vehicle.bus.rigid': 'bus',
  'vehicle.bus.bendy': 'bus',
  'vehicle.motorcycle': 'motorcycle',
};

function mapCategory(category: string): string {
  return CATEGORY_MAP[category] ?? category;
}

const VISIBILITY_LEVELS: readonly string[] = ['v0-40', 'v40-60', 'v60-80', 'v80-100'];

/**
 * (F4) The review facts of one annotation: its own token, the LiDAR point
 * count and the visibility level. All three are OPTIONAL extras — sample files
 * prepped before F4 lack them, and a wrong-typed value drops only that field
 * (the box itself is valid and still renders; Error Defaults). Returns
 * `undefined` when none is usable, so such boxes carry no `annotation` key.
 */
function readAnnotationInfo(ann: NuScenesAnnotation): BoxAnnotationInfo | undefined {
  const raw = ann as Record<string, unknown>;
  const info: BoxAnnotationInfo = {};

  if (typeof raw.annotationToken === 'string' && raw.annotationToken !== '') {
    info.token = raw.annotationToken;
  }
  const pts = raw.numLidarPts;
  if (typeof pts === 'number' && Number.isInteger(pts) && pts >= 0) {
    info.lidarPoints = pts;
  }
  if (typeof raw.visibility === 'string' && VISIBILITY_LEVELS.includes(raw.visibility)) {
    info.visibility = raw.visibility as BoxAnnotationInfo['visibility'];
  }

  return Object.keys(info).length > 0 ? info : undefined;
}

// --- validation -------------------------------------------------------------

function isFiniteVec(value: unknown, length: number): boolean {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((n) => Number.isFinite(n))
  );
}

function isPrepped(raw: unknown): raw is NuScenesPrepped {
  return (
    raw !== null &&
    typeof raw === 'object' &&
    Array.isArray((raw as Record<string, unknown>).frames)
  );
}

function isPreppedFrame(pf: unknown): pf is NuScenesPreppedFrame {
  if (pf === null || typeof pf !== 'object') return false;
  const f = pf as Record<string, unknown>;
  return (
    typeof f.token === 'string' &&
    isImage(f.image) &&
    isPose(f.egoPose) &&
    isCalibratedSensor(f.calibratedSensor) &&
    Array.isArray(f.annotations)
  );
}

function isImage(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  const img = value as Record<string, unknown>;
  return (
    typeof img.path === 'string' &&
    Number.isFinite(img.width) &&
    Number.isFinite(img.height)
  );
}

function isPose(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return isFiniteVec(p.translation, 3) && isFiniteVec(p.rotation, 4);
}

function isCalibratedSensor(value: unknown): boolean {
  if (!isPose(value)) return false;
  const s = value as Record<string, unknown>;
  return (
    Array.isArray(s.cameraIntrinsic) &&
    s.cameraIntrinsic.length === 3 &&
    s.cameraIntrinsic.every((row) => isFiniteVec(row, 3))
  );
}

function isCamera(value: unknown): value is NuScenesCamera {
  if (value === null || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.channel === 'string' &&
    c.channel !== '' &&
    isImage(c.image) &&
    isPose(c.egoPose) &&
    isCalibratedSensor(c.calibratedSensor)
  );
}

function isLidar(value: unknown): value is NuScenesLidar {
  if (value === null || typeof value !== 'object') return false;
  const l = value as Record<string, unknown>;
  return (
    Array.isArray(l.points) &&
    l.points.length % 3 === 0 &&
    l.points.every((n) => Number.isFinite(n)) &&
    isPose(l.egoPose) &&
    isPose(l.calibratedSensor) // LiDAR calib has translation+rotation; no intrinsic
  );
}

/** (F7) A reference to a points file instead of inline points. */
function isLidarRef(value: unknown): value is NuScenesLidarRef {
  if (value === null || typeof value !== 'object') return false;
  const l = value as Record<string, unknown>;
  return (
    typeof l.path === 'string' &&
    l.path !== '' &&
    !('points' in l) &&
    typeof l.pointCount === 'number' &&
    Number.isInteger(l.pointCount) &&
    l.pointCount >= 0
  );
}

function isPointsFile(value: unknown): value is NuScenesPointsFile {
  if (value === null || typeof value !== 'object') return false;
  const f = value as Record<string, unknown>;
  return typeof f.token === 'string' && isPose(f.frameEgoPose) && isLidar(f.lidar);
}

function isAnnotation(value: unknown): value is NuScenesAnnotation {
  if (value === null || typeof value !== 'object') return false;
  const a = value as Record<string, unknown>;
  return (
    typeof a.instanceToken === 'string' &&
    typeof a.category === 'string' &&
    isFiniteVec(a.translation, 3) &&
    isFiniteVec(a.size, 3) &&
    isFiniteVec(a.rotation, 4)
  );
}

export const __testing = {
  CATEGORY_MAP,
  mapCategory,
};

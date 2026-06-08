import type { Detection2D, Detection3D, Frame } from '@/lib/types';
import {
  egoQuatToThree,
  egoToThree,
  globalQuatToEgo,
  globalToEgo,
  nuSizeToLocal,
  type Pose,
} from '@/lib/geometry/transforms';
import { boxCornersEgo, projectCornersToBbox } from '@/lib/geometry/projection';
import type {
  NuScenesAnnotation,
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
 * (Immutable Rule #6). `pointCloud` stays empty in F2-A (no fake LiDAR points).
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

  const egoPose: Pose = pf.egoPose;
  const sensor: Pose = pf.calibratedSensor;
  const K = pf.calibratedSensor.cameraIntrinsic;

  const detections2D: Detection2D[] = [];
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

    // Physical EGO frame (z-up): shared input for both the 3D render and the
    // 2D projection. Computed once.
    const centerEgo = globalToEgo(ann.translation, egoPose);
    const quatEgo = globalQuatToEgo(ann.rotation, egoPose.rotation);
    const localSize = nuSizeToLocal(ann.size);

    detections3D.push({
      id: ann.instanceToken,
      class: className,
      confidence: 1.0,
      bbox3D: {
        center: egoToThree(centerEgo),
        size: localSize,
        rotation: egoQuatToThree(quatEgo),
      },
    });

    // 2D box = AABB of the 3D box projected into the camera image. Skipped (but
    // the 3D box is kept) when the box is behind the camera or fully off-screen.
    const bbox = projectCornersToBbox(
      boxCornersEgo(centerEgo, localSize, quatEgo),
      sensor,
      K,
      pf.image.width,
      pf.image.height,
    );
    if (bbox) {
      detections2D.push({
        id: ann.instanceToken,
        class: className,
        confidence: 1.0,
        bbox,
      });
    }
  }

  return {
    id: pf.token,
    imageUrl: pf.image.path,
    imageWidth: pf.image.width,
    imageHeight: pf.image.height,
    detections2D,
    detections3D,
    pointCloud: [],
    source: 'nuscenes-measured',
  };
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
};

function mapCategory(category: string): string {
  return CATEGORY_MAP[category] ?? category;
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

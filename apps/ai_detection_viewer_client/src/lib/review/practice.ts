import { makeRng, type Rng } from '@/lib/geometry';
import type { NuScenesAnnotation, NuScenesPrepped, NuScenesPreppedFrame } from '@/lib/nuscenes';
import { getReview } from './records';
import type { RejectReason, ReviewMap } from './types';

/**
 * Practice set (F4-F): the real sample with a few boxes deliberately made
 * wrong, plus the answer key.
 *
 * Why it exists: nuScenes annotations are good, so reviewing them is mostly
 * "approve". A set with KNOWN planted errors lets the tool show — and measure —
 * whether a reviewer catches them.
 *
 * How it stays honest (the spirit of Immutable Rule #6):
 *  - nothing is written to disk: the original sample file is never modified;
 *  - the UI labels the data "practice · labels modified" for as long as it is
 *    shown, never "Measured";
 *  - verdicts on it live in their own review scope and exports are flagged.
 *
 * The change is made on the RAW prepped data (global frame, nuScenes
 * conventions) BEFORE parsing, so the 3D box, its projection in the camera
 * image and the 2D rectangle all derive from the same modified values, and the
 * object id is untouched (Immutable Rule #1). The math lives here, outside
 * React and the store, and is unit-tested (Immutable Rule #3).
 */

export const DEFAULT_PRACTICE_SEED = 42;

export type PracticeErrorKind = 'position' | 'size' | 'heading' | 'class';

/** One planted error — a line of the answer key. */
export type PlantedError = {
  frameId: string;
  objectId: string;
  kind: PracticeErrorKind;
  /** Human-readable summary of what was changed, e.g. "moved 1.3 m". */
  detail: string;
};

/** The reject reason a reviewer would be expected to pick for each kind. */
export const EXPECTED_REASON: Record<PracticeErrorKind, RejectReason> = {
  position: 'wrong_position',
  size: 'wrong_size',
  heading: 'wrong_heading',
  class: 'wrong_class',
};

// --- tuning (kept together; sized so an error is visible but not a joke) -----

/** Share of a frame's boxes that get an error. */
const ERROR_RATIO = 0.1;
/** A box needs at least this many LiDAR points to be a candidate: an error in a
 *  box nobody could verify anyway would be undiscoverable, not a fair test. */
const MIN_POINTS_FOR_CANDIDATE = 5;
/** Position: slide along the ground by this many metres. */
const SHIFT_METRES: readonly [number, number] = [1.0, 1.6];
/** Size: multiply every dimension by one of these ranges (too big / too small). */
const GROW: readonly [number, number] = [1.45, 1.7];
const SHRINK: readonly [number, number] = [0.55, 0.65];
/** Heading: turn about the vertical axis by this many degrees, either way. */
const TURN_DEGREES: readonly [number, number] = [30, 60];
/** Heading errors only make sense on clearly elongated boxes (length ≥ 1.5 × width)
 *  that are also big enough for the turn to show: a 0.7 m pedestrian box turned
 *  by 50° looks the same. */
const MIN_ELONGATION_FOR_HEADING = 1.5;
const MIN_LENGTH_FOR_HEADING = 2;

/**
 * Tells whether a box can be checked against a photo — (F6) whether at least one
 * of the frame's cameras shows it.
 * The practice set uses it to stay FAIR:
 *  - a box in the camera can be checked against the photo even when it holds
 *    few LiDAR points, so it is a valid place for an error;
 *  - a wrong CLASS can only be recognised in the photo (a car and a truck box
 *    look alike in the 3D view), so class errors go to in-camera boxes only.
 * Without it (`undefined`) the LiDAR count alone decides, and class errors are
 * allowed anywhere.
 */
export type InCameraFn = (frameToken: string, instanceToken: string) => boolean;

export type PracticeOptions = {
  seed?: number;
  inCamera?: InCameraFn;
};

const between = (rng: Rng, [min, max]: readonly [number, number]) => min + rng() * (max - min);

/** A different class of a plausible kind, so the swap is wrong but not absurd. */
function swappedCategory(category: string): string {
  if (category === 'vehicle.car') return 'vehicle.truck';
  if (category === 'vehicle.truck') return 'vehicle.car';
  if (category.startsWith('human.pedestrian')) return 'vehicle.bicycle';
  if (category === 'vehicle.bicycle' || category === 'vehicle.motorcycle') {
    return 'human.pedestrian.adult';
  }
  return 'vehicle.car';
}

/**
 * Rotate a nuScenes quaternion [w, x, y, z] about the GLOBAL vertical (z) axis
 * by `radians`: q' = q_z(θ) · q (Hamilton product), re-normalised.
 */
export function yawQuatWXYZ(
  q: readonly [number, number, number, number],
  radians: number,
): [number, number, number, number] {
  const c = Math.cos(radians / 2);
  const s = Math.sin(radians / 2);
  const [w, x, y, z] = q;
  // (c, 0, 0, s) · (w, x, y, z)
  const out: [number, number, number, number] = [
    c * w - s * z,
    c * x - s * y,
    c * y + s * x,
    c * z + s * w,
  ];
  const norm = Math.hypot(...out) || 1;
  return [out[0] / norm, out[1] / norm, out[2] / norm, out[3] / norm];
}

const isVec = (value: unknown, length: number): value is number[] =>
  Array.isArray(value) && value.length === length && value.every((n) => Number.isFinite(n));

/** Only well-formed annotations are modified; the parser deals with the rest. */
function isUsable(ann: unknown): ann is NuScenesAnnotation {
  if (ann === null || typeof ann !== 'object') return false;
  const a = ann as Record<string, unknown>;
  return (
    typeof a.instanceToken === 'string' &&
    typeof a.category === 'string' &&
    isVec(a.translation, 3) &&
    isVec(a.size, 3) &&
    isVec(a.rotation, 4)
  );
}

function applyError(
  ann: NuScenesAnnotation,
  kind: PracticeErrorKind,
  rng: Rng,
): { annotation: NuScenesAnnotation; detail: string } {
  const [tx, ty, tz] = ann.translation;
  const [w, l, h] = ann.size;

  switch (kind) {
    case 'position': {
      const distance = between(rng, SHIFT_METRES);
      const direction = rng() * 2 * Math.PI;
      return {
        annotation: {
          ...ann,
          translation: [
            tx + distance * Math.cos(direction),
            ty + distance * Math.sin(direction),
            tz,
          ],
        },
        detail: `moved ${distance.toFixed(1)} m`,
      };
    }
    case 'size': {
      const factor = rng() < 0.5 ? between(rng, GROW) : between(rng, SHRINK);
      const newH = h * factor;
      return {
        annotation: {
          ...ann,
          size: [w * factor, l * factor, newH],
          // Keep the bottom of the box on the ground: only the size is wrong,
          // not the height it sits at.
          translation: [tx, ty, tz + (newH - h) / 2],
        },
        detail: `size ×${factor.toFixed(2)}`,
      };
    }
    case 'heading': {
      const degrees = between(rng, TURN_DEGREES) * (rng() < 0.5 ? 1 : -1);
      return {
        annotation: { ...ann, rotation: yawQuatWXYZ(ann.rotation, (degrees * Math.PI) / 180) },
        detail: `turned ${Math.round(degrees)}°`,
      };
    }
    case 'class': {
      const category = swappedCategory(ann.category);
      return {
        annotation: { ...ann, category },
        detail: `class ${ann.category} → ${category}`,
      };
    }
  }
}

function kindsFor(ann: NuScenesAnnotation, classCheckable: boolean): PracticeErrorKind[] {
  const [w, l] = ann.size;
  const long = Math.max(w, l);
  const kinds: PracticeErrorKind[] = ['position', 'size'];
  if (long >= MIN_LENGTH_FOR_HEADING && long >= MIN_ELONGATION_FOR_HEADING * Math.min(w, l)) {
    kinds.push('heading');
  }
  if (classCheckable) kinds.push('class');
  return kinds;
}

function plantInFrame(
  frame: NuScenesPreppedFrame,
  rng: Rng,
  inCamera: InCameraFn | undefined,
): { frame: NuScenesPreppedFrame; planted: PlantedError[] } {
  const annotations = frame.annotations as unknown[];
  const usable = annotations
    .map((ann, index) => ({ ann, index }))
    .filter((entry): entry is { ann: NuScenesAnnotation; index: number } => isUsable(entry.ann));
  type Entry = { ann: NuScenesAnnotation; index: number };
  const seen = (e: Entry) => inCamera?.(frame.token, e.ann.instanceToken) ?? false;
  // A box is a fair place for an error when the reviewer can actually check
  // it: enough LiDAR points, or visible in the camera. Data without the count
  // (format 1.0) falls back to every usable box.
  const hasCounts = usable.some((e) => typeof e.ann.numLidarPts === 'number');
  const candidates = hasCounts
    ? usable.filter((e) => (e.ann.numLidarPts ?? 0) >= MIN_POINTS_FOR_CANDIDATE || seen(e))
    : usable;
  if (candidates.length === 0) return { frame, planted: [] };

  const wanted = Math.min(candidates.length, Math.max(1, Math.round(usable.length * ERROR_RATIO)));
  // Half of the errors (rounded up) go to boxes in the camera when there are
  // any — that is where the photo can settle the question — the rest anywhere.
  // Each pick is a seeded draw without replacement.
  const draw = (pool: Entry[]): Entry => pool.splice(Math.floor(rng() * pool.length), 1)[0];
  const cameraPool = candidates.filter(seen);
  const picked: Entry[] = [];
  const fromCamera = Math.min(cameraPool.length, Math.ceil(wanted / 2));
  for (let i = 0; i < fromCamera; i += 1) picked.push(draw(cameraPool));
  const rest = candidates.filter((e) => !picked.includes(e));
  while (picked.length < wanted) picked.push(draw(rest));

  const next = annotations.slice();
  const planted: PlantedError[] = [];
  for (const { ann, index } of picked) {
    // Class errors need the photo; with no camera information they are allowed.
    const kinds = kindsFor(ann, inCamera ? inCamera(frame.token, ann.instanceToken) : true);
    const kind = kinds[Math.floor(rng() * kinds.length)];
    const { annotation, detail } = applyError(ann, kind, rng);
    next[index] = annotation;
    planted.push({ frameId: frame.token, objectId: ann.instanceToken, kind, detail });
  }
  return { frame: { ...frame, annotations: next as NuScenesAnnotation[] }, planted };
}

/**
 * Build the practice set from the raw prepped sample.
 *
 * Deterministic: the same input and seed always modify the same boxes in the
 * same way (each frame draws from its own generator, seeded by `seed` and the
 * frame's position, so adding frames later does not reshuffle earlier ones).
 * The input is never mutated; untouched frames, annotations and the LiDAR data
 * are shared by reference. Malformed input is passed through unchanged — the
 * parser is the one place that reports it.
 */
export function makePracticeSet(
  raw: unknown,
  options: PracticeOptions = {},
): { prepped: unknown; planted: PlantedError[] } {
  const { seed = DEFAULT_PRACTICE_SEED, inCamera } = options;
  if (raw === null || typeof raw !== 'object' || !Array.isArray((raw as NuScenesPrepped).frames)) {
    return { prepped: raw, planted: [] };
  }
  const source = raw as NuScenesPrepped;
  const planted: PlantedError[] = [];
  const frames = source.frames.map((frame, index) => {
    const ok =
      frame !== null &&
      typeof frame === 'object' &&
      typeof frame.token === 'string' &&
      Array.isArray(frame.annotations);
    if (!ok) return frame;
    const result = plantInFrame(frame, makeRng(seed * 1000 + index), inCamera);
    planted.push(...result.planted);
    return result.frame;
  });
  return { prepped: { ...source, frames }, planted };
}

export type PracticeScore = {
  /** Planted errors in scope. */
  planted: number;
  /** Planted and rejected — caught. */
  found: number;
  /** Of `found`, how many carry the expected reject reason. */
  foundWithReason: number;
  /** Planted but approved — let through. */
  missed: number;
  /** Planted, not decided yet (unreviewed or "unsure"). */
  pending: number;
  /** Rejected although nothing was planted there. */
  falseAlarms: number;
};

/**
 * Score a review of the practice set against the answer key.
 *
 * `frameId` limits the score to one frame; omit it for every frame. The four
 * outcomes mirror how a detector is scored (F5): found = true positive, missed
 * = false negative, false alarm = false positive.
 *
 * Note on false alarms: the practice set starts from real annotations, and a
 * real annotation can itself be questionable. A "false alarm" here means only
 * "rejected, but not one of the planted errors".
 */
export function scorePractice(
  planted: PlantedError[],
  reviews: ReviewMap,
  frameId?: string,
): PracticeScore {
  const inScope = frameId === undefined ? planted : planted.filter((p) => p.frameId === frameId);
  const plantedKeys = new Set(inScope.map((p) => `${p.frameId}/${p.objectId}`));
  const score: PracticeScore = {
    planted: inScope.length,
    found: 0,
    foundWithReason: 0,
    missed: 0,
    pending: 0,
    falseAlarms: 0,
  };
  for (const error of inScope) {
    const record = getReview(reviews, error.frameId, error.objectId);
    if (record?.verdict === 'rejected') {
      score.found += 1;
      if (record.reasons.includes(EXPECTED_REASON[error.kind])) score.foundWithReason += 1;
    } else if (record?.verdict === 'approved') {
      score.missed += 1;
    } else {
      score.pending += 1;
    }
  }
  for (const record of Object.values(reviews)) {
    if (frameId !== undefined && record.frameId !== frameId) continue;
    if (record.verdict !== 'rejected') continue;
    if (!plantedKeys.has(`${record.frameId}/${record.objectId}`)) score.falseAlarms += 1;
  }
  return score;
}

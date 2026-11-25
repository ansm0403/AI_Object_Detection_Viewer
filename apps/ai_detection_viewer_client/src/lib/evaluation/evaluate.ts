import type { Frame } from '@/lib/types';
import { cameraViews, frameAsCamera } from '@/lib/cameras';
import { countResults, evaluateFrame } from './match';
import { summarize } from './metrics';
import type {
  EvalCounts,
  EvalSummary,
  EvaluationRules,
  FrameEvaluation,
  Prediction2D,
  PredictionSet,
} from './types';

/**
 * (F6) Evaluating frames that several cameras photographed.
 *
 * ONE PHOTO IS THE UNIT. A 2D detector looks at one photo at a time and knows
 * nothing about what the next camera sees, so each photo is scored on its own
 * (`evaluateFrame`) and the counts are added. An object in the overlap of two
 * cameras is therefore two questions: it can be found in one photo and missed
 * in the other — usually the one where it is cut off by the image edge.
 *
 * What a multi-camera rig adds is the per-OBJECT view (`ObjectOutcome`): was
 * the object found by at least one camera? That is what a 3D box is coloured
 * by — one box, one colour — and it is reported next to the per-photo numbers,
 * never mixed into precision / recall.
 */

/** What became of a labelled object, in one photo or across the cameras. */
export type ObjectOutcomeKind = 'found' | 'missed' | 'not-scored';

/** One labelled object across the cameras that see it. */
export type ObjectOutcome = {
  /**
   * Found if ANY camera's photo found it; otherwise missed if any photo scored
   * it; otherwise not scored.
   */
  kind: ObjectOutcomeKind;
  /** The outcome in every photo that has a result for it, in camera order. */
  views: { camera: string; kind: ObjectOutcomeKind }[];
};

/** One frame: each of its photos evaluated, and the two ways of adding them up. */
export type FrameCamerasEvaluation = {
  frameId: string;
  /** Per camera the model was run on, in the frame's camera order. */
  byCamera: Map<string, FrameEvaluation>;
  /** Cameras of the frame whose photo has no predictions in the file (not run). */
  camerasWithoutPredictions: string[];
  /** Per-photo counts, added over `byCamera`. */
  counts: EvalCounts;
  /** Model boxes left out as being in a bicycle rack, over all photos. */
  ignored: number;
  /** Per labelled object that has a result in at least one photo. */
  objects: Map<string, ObjectOutcome>;
  /**
   * 3D boxes of the frame with no result in any evaluated photo: no camera
   * sees them, or their class is one the model cannot name.
   */
  notEvaluated: number;
};

/** Totals of one camera over all frames. */
export type CameraSummary = {
  camera: string;
  /** Photos of this camera that were evaluated. */
  photos: number;
  summary: EvalSummary;
};

/** How many labelled objects ended up with each per-object outcome. */
export type ObjectCounts = { found: number; missed: number; notScored: number };

/** The evaluation of every photo the model was run on, plus the totals. */
export type DatasetEvaluation = {
  /** Per frame id. A frame with no evaluated photo is absent. */
  byFrame: Map<string, FrameCamerasEvaluation>;
  /** Per-photo totals over everything in `byFrame`. */
  summary: EvalSummary;
  /** The same totals per camera, in the order the cameras first appear. */
  byCamera: CameraSummary[];
  /** Per-object totals (an object counts once per frame, whatever the number of cameras). */
  objects: ObjectCounts;
  /** Model boxes left out as being in a bicycle rack. */
  ignored: number;
  /** How many frames `summary` covers (`byFrame.size`). */
  evaluatedFrames: number;
  /** How many photos `summary` covers. */
  evaluatedPhotos: number;
  /** Frames that could not be evaluated at all: the model was not run on them. */
  framesWithoutPredictions: number;
  /** Photos of EVALUATED frames that the model was not run on. */
  photosWithoutPredictions: number;
};

/**
 * Combine the per-photo results of one frame into one outcome per object.
 * False alarms have no object and take no part.
 */
export function mergeObjectOutcomes(
  byCamera: ReadonlyMap<string, FrameEvaluation>,
): Map<string, ObjectOutcome> {
  const objects = new Map<string, ObjectOutcome>();
  for (const [camera, evaluation] of byCamera) {
    for (const result of evaluation.results) {
      if (result.kind === 'false-alarm') continue;
      const outcome = objects.get(result.objectId) ?? { kind: 'not-scored', views: [] };
      outcome.views.push({ camera, kind: result.kind });
      if (result.kind === 'found' || (result.kind === 'missed' && outcome.kind !== 'found')) {
        outcome.kind = result.kind;
      }
      objects.set(result.objectId, outcome);
    }
  }
  return objects;
}

/**
 * Evaluate every photo of one frame.
 *
 * `predictions` holds the frame's predictions per camera name. A camera of the
 * frame that is not in it was not run and is left out — its labels are NOT
 * counted as missed. Returns `null` when no photo of the frame can be
 * evaluated.
 */
export function evaluateFrameCameras(
  frame: Frame,
  predictions: ReadonlyMap<string, readonly Prediction2D[]>,
  rules: EvaluationRules,
): FrameCamerasEvaluation | null {
  const byCamera = new Map<string, FrameEvaluation>();
  const camerasWithoutPredictions: string[] = [];
  for (const view of cameraViews(frame)) {
    const cameraPredictions = predictions.get(view.name);
    if (!cameraPredictions) {
      camerasWithoutPredictions.push(view.name);
      continue;
    }
    byCamera.set(view.name, evaluateFrame(frameAsCamera(frame, view.name), cameraPredictions, rules));
  }
  if (byCamera.size === 0) return null;

  const evaluations = [...byCamera.values()];
  const objects = mergeObjectOutcomes(byCamera);
  return {
    frameId: frame.id,
    byCamera,
    camerasWithoutPredictions,
    counts: countResults(evaluations.flatMap((e) => e.results)),
    ignored: evaluations.reduce((sum, e) => sum + e.ignored.length, 0),
    objects,
    notEvaluated: frame.detections3D.filter((box) => !objects.has(box.id)).length,
  };
}

/**
 * Evaluate a whole dataset against a predictions file.
 *
 * "No entry in the file" and "an entry with zero predictions" are different
 * facts and are kept apart, per PHOTO: the first means the model was never run
 * on that photo, so it is left out entirely (counting its labels as missed
 * would invent a result); the second means the model looked and reported
 * nothing, so every scored label of that photo IS missed. A frame none of whose
 * photos was run is left out as a whole.
 *
 * Entries for frames or cameras that are not in `frames` are ignored.
 *
 * Pure, and cheap enough to run on every move of the score slider.
 */
export function evaluateFrames(
  frames: readonly Frame[],
  predictions: PredictionSet,
  rules: EvaluationRules,
): DatasetEvaluation {
  const byFrame = new Map<string, FrameCamerasEvaluation>();
  const perCamera = new Map<string, FrameEvaluation[]>();
  const objects: ObjectCounts = { found: 0, missed: 0, notScored: 0 };
  let framesWithoutPredictions = 0;
  let photosWithoutPredictions = 0;
  let ignored = 0;

  for (const frame of frames) {
    const framePredictions = predictions.byFrame.get(frame.id);
    const evaluation = framePredictions
      ? evaluateFrameCameras(frame, framePredictions, rules)
      : null;
    if (!evaluation) {
      framesWithoutPredictions += 1;
      continue;
    }
    byFrame.set(frame.id, evaluation);
    photosWithoutPredictions += evaluation.camerasWithoutPredictions.length;
    ignored += evaluation.ignored;
    for (const [camera, photo] of evaluation.byCamera) {
      const list = perCamera.get(camera);
      if (list) list.push(photo);
      else perCamera.set(camera, [photo]);
    }
    for (const outcome of evaluation.objects.values()) {
      if (outcome.kind === 'found') objects.found += 1;
      else if (outcome.kind === 'missed') objects.missed += 1;
      else objects.notScored += 1;
    }
  }

  const photos = [...perCamera.values()].flat();
  return {
    byFrame,
    summary: summarize(photos),
    byCamera: [...perCamera].map(([camera, list]) => ({
      camera,
      photos: list.length,
      summary: summarize(list),
    })),
    objects,
    ignored,
    evaluatedFrames: byFrame.size,
    evaluatedPhotos: photos.length,
    framesWithoutPredictions,
    photosWithoutPredictions,
  };
}

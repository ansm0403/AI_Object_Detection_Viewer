import { DEFAULT_CAMERA } from '@/lib/cameras/names';
import type { Prediction2D, PredictionModelInfo, PredictionSet } from './types';

const PREDICTION_ID_PREFIX = 'pred:';

/**
 * The id of the `index`-th prediction of one photo (see `Prediction2D.id`).
 * (F6) The camera is part of it: every photo of a frame numbers its
 * predictions from 0, so without it six predictions would share an id.
 */
export function predictionId(frameId: string, camera: string, index: number): string {
  return `${PREDICTION_ID_PREFIX}${frameId}:${camera}:${index}`;
}

/**
 * Whether a selection id refers to a model prediction rather than to a label.
 * `selectedObjectId` stays the single selection field (Immutable Rule #2); this
 * only tells the two kinds of id apart.
 */
export function isPredictionId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith(PREDICTION_ID_PREFIX);
}

/**
 * (F7.5) A prediction id names the one photo its box is in: a frame and a
 * camera (`pred:<frameId>:<camera>:<index>`). A model box belongs to exactly
 * one photo, so selecting it says which camera to show (`useActiveCamera`'s
 * `preferred`), and the sample check uses the frame to tell "still looking at
 * this box's frame, through another camera" from "moved on to another frame".
 * The index is the last `:` field and the camera the one before it.
 *
 * The frame a prediction id names, or `null` when `id` is not one.
 */
export function frameOfPredictionId(id: string | null | undefined): string | null {
  if (typeof id !== 'string' || !id.startsWith(PREDICTION_ID_PREFIX)) return null;
  const parts = id.slice(PREDICTION_ID_PREFIX.length).split(':');
  if (parts.length < 3) return null;
  // Everything before the last two fields (camera, index): a frame id may contain colons.
  const frame = parts.slice(0, -2).join(':');
  return frame === '' ? null : frame;
}

/**
 * (F7.5) The camera a prediction id names — see `frameOfPredictionId` above for
 * the frame it names. `null` when `id` is not a prediction id of that shape.
 */
export function cameraOfPredictionId(id: string | null | undefined): string | null {
  if (typeof id !== 'string' || !id.startsWith(PREDICTION_ID_PREFIX)) return null;
  const parts = id.slice(PREDICTION_ID_PREFIX.length).split(':');
  if (parts.length < 3) return null;
  const camera = parts[parts.length - 2];
  return camera === '' ? null : camera;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Parse the predictions file written by `scripts/predict_nuscenes.py`.
 *
 * Two versions are read (the script writes the second):
 *  - `@1` (F5): one camera for the whole file — `camera` at the top (CAM_FRONT
 *    when absent) and a `predictions` list per frame;
 *  - `@2` (F6): a `cameras` object per frame, one list per camera.
 * A frame is read by its own shape, so a file is never rejected for its
 * version string alone.
 *
 * Same defensive style as `parseCoco` / `parseNuScenes` (Error Defaults): the
 * file is outside input, so nothing here throws.
 *  - A root that is not a predictions file → `null` (+ one warning). The caller
 *    shows "predictions unavailable"; it must not evaluate against an empty set,
 *    which would report every object as missed.
 *  - A malformed frame, camera entry or prediction → skipped, counted in one
 *    warning. A skipped camera entry leaves that PHOTO without predictions
 *    ("not run"), which is different from an empty list ("ran, found nothing").
 *
 * No filtering by class or score happens here: what is evaluated is decided by
 * the selectors at evaluation time, so the score slider can re-evaluate live.
 * Predictions are returned highest score first; the id keeps the prediction's
 * position in the FILE, so ids do not shift when a neighbour is skipped.
 */
export function parsePredictions(raw: unknown): PredictionSet | null {
  if (!isObject(raw) || !Array.isArray(raw.frames) || !isObject(raw.model)) {
    console.warn('[parsePredictions] Invalid root. Expected { model, frames: [] }.');
    return null;
  }

  const fileCamera =
    typeof raw.camera === 'string' && raw.camera !== '' ? raw.camera : DEFAULT_CAMERA;
  const byFrame = new Map<string, Map<string, Prediction2D[]>>();
  // Cameras in the order they first appear; the file's own list (if valid) wins.
  const seenCameras: string[] = [];
  let skippedFrames = 0;
  let skippedCameras = 0;
  let skippedPredictions = 0;

  const readList = (list: unknown[], frameId: string, camera: string): Prediction2D[] => {
    const predictions: Prediction2D[] = [];
    list.forEach((rawPrediction, index) => {
      const prediction = readPrediction(rawPrediction, predictionId(frameId, camera, index));
      if (prediction) predictions.push(prediction);
      else skippedPredictions += 1;
    });
    // Stable sort: equal scores keep their file order.
    predictions.sort((a, b) => b.score - a.score);
    if (!seenCameras.includes(camera)) seenCameras.push(camera);
    return predictions;
  };

  for (const rawFrame of raw.frames) {
    if (
      !isObject(rawFrame) ||
      typeof rawFrame.token !== 'string' ||
      rawFrame.token === '' ||
      byFrame.has(rawFrame.token)
    ) {
      skippedFrames += 1;
      continue;
    }
    const frameId = rawFrame.token;

    if (isObject(rawFrame.cameras)) {
      // @2: one list per camera.
      const byCamera = new Map<string, Prediction2D[]>();
      for (const [camera, list] of Object.entries(rawFrame.cameras)) {
        if (camera === '' || !Array.isArray(list)) {
          skippedCameras += 1;
          continue;
        }
        byCamera.set(camera, readList(list, frameId, camera));
      }
      byFrame.set(frameId, byCamera);
    } else if (Array.isArray(rawFrame.predictions)) {
      // @1: the frame's one list belongs to the file's one camera.
      byFrame.set(
        frameId,
        new Map([[fileCamera, readList(rawFrame.predictions, frameId, fileCamera)]]),
      );
    } else {
      skippedFrames += 1;
    }
  }

  if (skippedFrames > 0 || skippedCameras > 0 || skippedPredictions > 0) {
    console.warn(
      `[parsePredictions] Skipped ${skippedFrames} malformed frame(s), ${skippedCameras} malformed camera entr${skippedCameras === 1 ? 'y' : 'ies'} and ${skippedPredictions} malformed prediction(s).`,
    );
  }

  return {
    model: readModel(raw.model),
    cameras: readCameraList(raw.cameras, seenCameras),
    byFrame,
  };
}

/**
 * The file's camera list: the names it declares, followed by any camera that
 * has predictions but is not declared. A declared camera without a single
 * entry is dropped — the list says what the file HAS.
 */
function readCameraList(declared: unknown, seen: readonly string[]): string[] {
  if (!Array.isArray(declared)) return [...seen];
  const names: string[] = [];
  for (const name of declared) {
    if (typeof name === 'string' && seen.includes(name) && !names.includes(name)) names.push(name);
  }
  for (const name of seen) if (!names.includes(name)) names.push(name);
  return names;
}

function readPrediction(value: unknown, id: string): Prediction2D | null {
  if (!isObject(value)) return null;
  const { score, bbox } = value;
  if (typeof value.class !== 'string' || value.class === '') return null;
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) return null;
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every((n) => Number.isFinite(n))) {
    return null;
  }
  const [x, y, width, height] = bbox as number[];
  if (width <= 0 || height <= 0) return null;
  return { id, class: value.class, score, bbox: { x, y, width, height } };
}

function readModel(model: Record<string, unknown>): PredictionModelInfo {
  const info: PredictionModelInfo = {
    name: typeof model.name === 'string' && model.name !== '' ? model.name : 'unknown model',
  };
  if (typeof model.imageSize === 'number' && Number.isFinite(model.imageSize)) {
    info.imageSize = model.imageSize;
  }
  if (typeof model.minScore === 'number' && Number.isFinite(model.minScore)) {
    info.minScore = model.minScore;
  }
  if (typeof model.library === 'string' && model.library !== '') info.library = model.library;
  if (typeof model.weights === 'string' && model.weights !== '') info.weights = model.weights;
  return info;
}

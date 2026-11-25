import type { Prediction2D, PredictionModelInfo, PredictionSet } from './types';

const PREDICTION_ID_PREFIX = 'pred:';

/** The id of the `index`-th prediction of a frame (see `Prediction2D.id`). */
export function predictionId(frameId: string, index: number): string {
  return `${PREDICTION_ID_PREFIX}${frameId}:${index}`;
}

/**
 * Whether a selection id refers to a model prediction rather than to a label.
 * `selectedObjectId` stays the single selection field (Immutable Rule #2); this
 * only tells the two kinds of id apart.
 */
export function isPredictionId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith(PREDICTION_ID_PREFIX);
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Parse the predictions file written by `scripts/predict_nuscenes.py`.
 *
 * Same defensive style as `parseCoco` / `parseNuScenes` (Error Defaults): the
 * file is outside input, so nothing here throws.
 *  - A root that is not a predictions file → `null` (+ one warning). The caller
 *    shows "predictions unavailable"; it must not evaluate against an empty set,
 *    which would report every object as missed.
 *  - A malformed frame or prediction → skipped, counted in one warning.
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

  const byFrame = new Map<string, Prediction2D[]>();
  let skippedFrames = 0;
  let skippedPredictions = 0;

  for (const rawFrame of raw.frames) {
    if (
      !isObject(rawFrame) ||
      typeof rawFrame.token !== 'string' ||
      rawFrame.token === '' ||
      !Array.isArray(rawFrame.predictions) ||
      byFrame.has(rawFrame.token)
    ) {
      skippedFrames += 1;
      continue;
    }
    const frameId = rawFrame.token;
    const predictions: Prediction2D[] = [];
    rawFrame.predictions.forEach((rawPrediction, index) => {
      const prediction = readPrediction(rawPrediction, predictionId(frameId, index));
      if (prediction) predictions.push(prediction);
      else skippedPredictions += 1;
    });
    // Stable sort: equal scores keep their file order.
    predictions.sort((a, b) => b.score - a.score);
    byFrame.set(frameId, predictions);
  }

  if (skippedFrames > 0 || skippedPredictions > 0) {
    console.warn(
      `[parsePredictions] Skipped ${skippedFrames} malformed frame(s) and ${skippedPredictions} malformed prediction(s).`,
    );
  }

  return {
    model: readModel(raw.model),
    ...(typeof raw.camera === 'string' && raw.camera !== '' ? { camera: raw.camera } : {}),
    byFrame,
  };
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
  return info;
}

import type { PredictionModelInfo } from './types';

/**
 * (F7.5) What can be said about HOW the model was trained, from the name of
 * its weights file.
 *
 * The predictions file records the weights file the offline script loaded
 * (`model.weights`, e.g. "yolov8n.pt"). The Ultralytics release files carry
 * fixed names and are trained on COCO; `scripts/predict_nuscenes.py` loads the
 * file and predicts — it has no training step. So a release name means "used
 * as released: not trained on nuScenes".
 *
 * This is a reading of the FILE NAME. A fine-tuned checkpoint saved under a
 * release name would be described wrongly, so the statement is made only for
 * names that match a release exactly, and nothing is claimed for any other
 * name (Immutable Rule #6: do not state what is not known).
 */
export type WeightsOrigin = {
  /** The dataset the released weights were trained on. */
  trainedOn: 'COCO';
  /** Always false here: a release file used as it is. */
  fineTuned: false;
};

// Ultralytics YOLOv8 detection releases: yolov8{n,s,m,l,x}.pt.
const RELEASED_DETECTION_WEIGHTS = /^yolov8[nsmlx]\.pt$/;

/** The origin of a weights file by its name, or `null` when the name says nothing certain. */
export function describeWeights(weights: string | null | undefined): WeightsOrigin | null {
  if (typeof weights !== 'string') return null;
  return RELEASED_DETECTION_WEIGHTS.test(weights.trim().toLowerCase())
    ? { trainedOn: 'COCO', fineTuned: false }
    : null;
}

/**
 * The conditions a number was measured under, as short phrases in a fixed
 * order: model, training, input size. Only what the file states is included —
 * a missing field leaves its phrase out rather than guessing it.
 */
export function describeModelConditions(model: PredictionModelInfo | null | undefined): string[] {
  if (!model) return [];
  const parts: string[] = [];
  if (model.name) parts.push(model.name);
  const origin = describeWeights(model.weights);
  if (origin) parts.push('no fine-tuning');
  else if (model.weights) parts.push(`weights ${model.weights}`);
  if (typeof model.imageSize === 'number') parts.push(`input ${model.imageSize}`);
  return parts;
}

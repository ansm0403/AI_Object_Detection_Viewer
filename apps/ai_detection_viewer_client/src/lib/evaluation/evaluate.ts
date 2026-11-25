import type { Frame } from '@/lib/types';
import { evaluateFrame } from './match';
import { summarize } from './metrics';
import type { EvalSummary, EvaluationRules, FrameEvaluation, PredictionSet } from './types';

/** The evaluation of every frame the model was run on, plus the totals. */
export type DatasetEvaluation = {
  /** Per frame id. A frame the predictions file has NO entry for is absent. */
  byFrame: Map<string, FrameEvaluation>;
  /** Totals over the frames in `byFrame` only. */
  summary: EvalSummary;
  /** How many frames `summary` covers (`byFrame.size`). */
  evaluatedFrames: number;
  /** Frames that could not be evaluated: the model was not run on them. */
  framesWithoutPredictions: number;
};

/**
 * Evaluate a whole dataset against a predictions file.
 *
 * "No entry in the file" and "an entry with zero predictions" are different
 * facts and are kept apart: the first means the model was never run on that
 * frame, so it is left out entirely (counting its labels as missed would
 * invent a result); the second means the model looked and reported nothing, so
 * every scored label of that frame IS missed.
 *
 * Entries for frames that are not in `frames` are ignored.
 *
 * Pure, and cheap enough to run on every move of the score slider (10 frames ×
 * ~25 labels × ~45 predictions on the shipped sample).
 */
export function evaluateFrames(
  frames: readonly Frame[],
  predictions: PredictionSet,
  rules: EvaluationRules,
): DatasetEvaluation {
  const byFrame = new Map<string, FrameEvaluation>();
  let framesWithoutPredictions = 0;
  for (const frame of frames) {
    const framePredictions = predictions.byFrame.get(frame.id);
    if (!framePredictions) {
      framesWithoutPredictions += 1;
      continue;
    }
    byFrame.set(frame.id, evaluateFrame(frame, framePredictions, rules));
  }
  return {
    byFrame,
    summary: summarize([...byFrame.values()]),
    evaluatedFrames: byFrame.size,
    framesWithoutPredictions,
  };
}

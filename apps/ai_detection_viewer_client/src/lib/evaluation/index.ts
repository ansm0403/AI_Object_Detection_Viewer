export type {
  Box2D,
  ClassRecall,
  EvalCounts,
  EvalKind,
  EvalResult,
  EvalSummary,
  EvaluationRules,
  FalseAlarmRelation,
  FalseAlarmResult,
  FoundResult,
  FrameEvaluation,
  IgnoredPrediction,
  MissReason,
  MissedResult,
  NotScoredResult,
  Prediction2D,
  PredictionModelInfo,
  PredictionSet,
  RawPrediction,
  RawPredictionFile,
  RecallBin,
} from './types';
export { iou } from './iou';
export {
  BICYCLE_RACK_CLASS,
  EVALUATED_CLASSES,
  isEvaluatedClass,
  isRackMemberClass,
  toEvaluatedClass,
} from './classes';
export { isPredictionId, parsePredictions, predictionId } from './parse';
export {
  DEFAULT_MIN_SCORE,
  IOU_THRESHOLD,
  UNSCORED_VISIBILITY,
  countResults,
  evaluateFrame,
  findResult,
  selectionIdOf,
} from './match';
export { DISTANCE_BIN_METRES, precisionOf, ratio, recallOf, summarize } from './metrics';
export {
  evaluateFrameCameras,
  evaluateFrames,
  mergeObjectOutcomes,
  type CameraSummary,
  type DatasetEvaluation,
  type FrameCamerasEvaluation,
  type ObjectCounts,
  type ObjectOutcome,
  type ObjectOutcomeKind,
} from './evaluate';
export {
  isResultVisible,
  orderResults,
  passesClassFilter,
  passesKindFilter,
  resultQueue,
  type ResultFilter,
} from './list';
export { buildOverlay, unionBox, type OverlayOptions } from './overlay';
export { describeOtherViews, describeResult, visibilityText } from './describe';
export { boxOutcomeColors } from './box-colors';
export {
  CONTEXT_COLOR,
  NOT_EVALUATED_COLOR,
  EVAL_KINDS,
  OUTCOME_COLOR,
  OUTCOME_HINT,
  OUTCOME_LABEL,
  countOf,
  formatPercent,
  outcomeCountLabel,
} from './outcomes';

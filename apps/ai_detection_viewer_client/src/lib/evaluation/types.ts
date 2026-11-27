/**
 * Types of the camera-detection evaluation (F5).
 *
 * The evaluation compares two things drawn on the same camera image:
 *  - LABELS: the dataset's annotated objects. On nuScenes these are the 3D
 *    boxes projected into the image (`Frame.detections2D`), so a label's 2D
 *    rectangle is an APPROXIMATION of the object's outline, not a hand-drawn
 *    2D box (Immutable Rule #6 — say so wherever results are shown).
 *  - PREDICTIONS: what a 2D detector (YOLO, run offline by
 *    `scripts/predict_nuscenes.py`) drew on that image, each with a score.
 *
 * A prediction is deliberately NOT a `Detection2D`. `detections2D` and
 * `detections3D` are the 2D / 3D halves of the same object and share one id
 * (Immutable Rule #1); a prediction has no 3D half and is a different thing
 * from the label it may match. Keeping it a separate type — with a `score`
 * instead of `confidence` — means the two can never be mixed up, and surfaces
 * that draw labels keep hiding the placeholder confidence (F2-E) untouched.
 */

/** Rectangle in image pixels, origin at the top-left. Same shape as `Detection2D['bbox']`. */
export type Box2D = { x: number; y: number; width: number; height: number };

/** One model prediction on one camera image. */
export type Prediction2D = {
  /**
   * `pred:<frameId>:<camera>:<index in the file>`. The `pred:` prefix cannot
   * collide with a label id (nuScenes instance tokens are hex only); the frame
   * id and (F6) the camera keep a kept selection from pointing at a different
   * prediction after a frame or camera switch — the same index exists in every
   * photo.
   */
  id: string;
  /** The class name exactly as the model reported it (e.g. "person", "traffic light"). */
  class: string;
  /** The model's confidence in this prediction, 0–1. */
  score: number;
  bbox: Box2D;
};

/** How the predictions were produced — shown next to every number. */
export type PredictionModelInfo = {
  name: string;
  /** Model input size in pixels (the longer image side is resized to this). */
  imageSize?: number;
  /** Predictions below this score were not written to the file. */
  minScore?: number;
  library?: string;
  /** (F7.5) The weights file the script loaded, e.g. "yolov8n.pt" (see `describeWeights`). */
  weights?: string;
};

export type PredictionSet = {
  model: PredictionModelInfo;
  /** (F6) Every camera the file has predictions for, in the file's order. */
  cameras: string[];
  /**
   * Predictions per frame id, then per camera name, highest score first.
   * One PHOTO is the unit: a frame without an entry was not run at all, and a
   * camera missing from a frame's entry means that photo was not run. An empty
   * list means the model looked at the photo and reported nothing.
   */
  byFrame: Map<string, Map<string, Prediction2D[]>>;
};

// --- raw file (written by scripts/predict_nuscenes.py) ------------------------

/** `[x, y, width, height]` in image pixels. */
export type RawPredictionBox = [number, number, number, number];

export type RawPrediction = { class: string; score: number; bbox: RawPredictionBox };

/**
 * The file, in either version:
 *  - `@1` (F5): one `camera` for the whole file, `predictions` per frame;
 *  - `@2` (F6): `cameras` per frame — `{ "CAM_FRONT": [...], "CAM_BACK": [...] }`.
 */
export type RawPredictionFile = {
  /** Format name + version, e.g. "ai-detection-viewer/predictions@2". */
  format: string;
  /** @1: the one camera of the file. */
  camera?: string;
  /** @2: every camera in the file. */
  cameras?: string[];
  model: {
    name: string;
    weights?: string;
    library?: string;
    imageSize?: number;
    minScore?: number;
    nmsIou?: number;
  };
  frames: {
    token: string;
    /** @1 */
    predictions?: RawPrediction[];
    /** @2 */
    cameras?: Record<string, RawPrediction[]>;
  }[];
};

// --- evaluation ---------------------------------------------------------------

export type EvaluationRules = {
  /** Predictions scoring below this are treated as if the model had not made them. */
  minScore: number;
  /** Minimum overlap (IoU) for a prediction to count as having found a label. */
  iouThreshold: number;
  /**
   * (F6) Leave out bicycle / motorcycle predictions that sit inside a bicycle
   * rack (see `IgnoredPrediction`). On unless set to `false` — the switch
   * exists so the effect of the rule can be measured and tested.
   */
  ignoreRackRegions?: boolean;
};

/**
 * The four outcomes. In detector-evaluation terms: found = true positive (TP),
 * missed = false negative (FN), false alarm = false positive (FP). "Not
 * scored" is a label that is left out of the score either way (an "ignore"
 * region): finding it earns nothing, missing it costs nothing.
 */
export type EvalKind = 'found' | 'missed' | 'false-alarm' | 'not-scored';

/** Fields every result about a LABEL carries. */
type LabelResult = {
  /** The label's object id — the same id as its 2D and 3D boxes (Rule #1). */
  objectId: string;
  class: string;
  /** Distance of the 3D box from the ego vehicle in metres (measured). */
  distance: number;
};

export type FoundResult = LabelResult & {
  kind: 'found';
  predictionId: string;
  score: number;
  iou: number;
};

/** Why the closest prediction did not count as finding a missed label. */
export type MissReason =
  /** It is of another class. */
  | 'wrong-class'
  /** Right class, but its score is under the current minimum score. */
  | 'below-min-score'
  /** Right class and score, but it overlaps the label too little. */
  | 'low-overlap'
  /** It would have qualified, but it was matched to another label it overlaps more. */
  | 'matched-elsewhere';

export type MissedResult = LabelResult & {
  kind: 'missed';
  /**
   * The prediction that overlaps this label most (any class, any score in the
   * file), or `null` when nothing overlaps it noticeably. A FACT to help read
   * the miss — not a diagnosis of the model.
   */
  nearest: { predictionId: string; class: string; score: number; iou: number; reason: MissReason } | null;
};

export type NotScoredResult = LabelResult & {
  kind: 'not-scored';
  reason: 'low-visibility';
  /** Predictions that landed on this label. They are neither right nor wrong. */
  predictionIds: string[];
};

/** How the closest label relates to a false alarm. */
export type FalseAlarmRelation =
  /** The closest label is of another class (the model named the object wrongly). */
  | 'other-class'
  /** Same class and enough overlap, but that label is matched to a higher-scoring prediction. */
  | 'matched-elsewhere'
  /** Same class, but too little overlap. */
  | 'low-overlap';

export type FalseAlarmResult = {
  kind: 'false-alarm';
  predictionId: string;
  class: string;
  score: number;
  /** The label that overlaps this prediction most (any class), or `null`. */
  nearest: { objectId: string; class: string; iou: number; relation: FalseAlarmRelation } | null;
};

export type EvalResult = FoundResult | MissedResult | NotScoredResult | FalseAlarmResult;

/**
 * (F6) A model box that is left out of the score because of WHERE it is: on a
 * bicycle rack. nuScenes labels a rack as one box and gives the bikes parked
 * in it no boxes of their own, so a detector that finds those bikes — correctly
 * — would be charged one false alarm per bike. Such a box is neither right nor
 * wrong: it is not a result, is not counted anywhere, and cannot be selected.
 * (The nuScenes detection benchmark filters the same boxes, by their centre.)
 */
export type IgnoredPrediction = {
  predictionId: string;
  class: string;
  score: number;
  /** The rack label (its object id) whose rectangle contains the box's centre. */
  regionObjectId: string;
  reason: 'bicycle-rack';
};

export type EvalCounts = {
  found: number;
  missed: number;
  falseAlarm: number;
  notScored: number;
};

/**
 * The evaluation of ONE PHOTO — one camera's image of one frame. (The name
 * dates from F5, when a frame had one photo; F6 evaluates each of a frame's
 * photos separately and combines them in `FrameCamerasEvaluation`.)
 */
export type FrameEvaluation = {
  frameId: string;
  /** Label results in the frame's label order, then false alarms by score (highest first). */
  results: EvalResult[];
  counts: EvalCounts;
  /**
   * 3D boxes of the frame that take no part in the evaluation OF THIS PHOTO:
   * not in this camera's image, or of a class the model cannot name.
   */
  notEvaluated: number;
  /** (F6) Model boxes left out because they sit in a bicycle rack. Not counted anywhere. */
  ignored: IgnoredPrediction[];
};

/** Recall inside one distance band `[from, to)` in metres. */
export type RecallBin = { from: number; to: number; found: number; total: number };

export type ClassRecall = { class: string; found: number; total: number };

export type EvalSummary = EvalCounts & {
  /** found / (found + false alarms); `null` when the model made no scored prediction. */
  precision: number | null;
  /** found / (found + missed); `null` when there was nothing to find. */
  recall: number | null;
  /** Only bands that contain at least one scored label, nearest first. */
  byDistance: RecallBin[];
  /** Classes with at least one scored label, most labels first. */
  byClass: ClassRecall[];
};

import type { Detection2D, Detection3D, Frame } from '@/lib/types';
import { detectionDistance } from '@/lib/selectors/distance-filter';
import {
  BICYCLE_RACK_CLASS,
  isEvaluatedClass,
  isRackMemberClass,
  toEvaluatedClass,
} from './classes';
import { iou } from './iou';
import type {
  Box2D,
  EvalCounts,
  EvalResult,
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
} from './types';

/**
 * Minimum overlap for a prediction to count as having found a label.
 *
 * The common benchmark value is 0.5. Here it is 0.3 because a label's 2D
 * rectangle is the projection of a 3D box and is looser than the object:
 * measured on this sample (2026-11-25), correct person detections overlap
 * their label with a median IoU of only ~0.5, and at 0.5 28 correct detections
 * were counted twice as wrong (one false alarm + one miss each). The value is
 * shown in the UI next to the results.
 */
export const IOU_THRESHOLD = 0.3;

/** Default of the "Min score" slider — the detector's own default threshold. */
export const DEFAULT_MIN_SCORE = 0.25;

/**
 * nuScenes visibility level that is left out of the score: less than 40% of
 * the object is visible. Measured recall there was 3 of 26 — a miss on such an
 * object says more about the occlusion than about the model.
 *
 * Caveat stated in the UI: nuScenes records visibility over ALL SIX cameras,
 * not for the front camera alone.
 */
export const UNSCORED_VISIBILITY = 'v0-40';

/** Below this overlap a "closest" box is not worth mentioning. */
const NEAREST_MIN_IOU = 0.1;

type Label = {
  detection: Detection2D;
  distance: number;
  /** The "found" result, once a prediction has been matched with this label. */
  matchedBy: FoundResult | null;
};

/**
 * Evaluate one frame: decide for every label whether the model found it, and
 * for every prediction whether it corresponds to a label.
 *
 * Pure function of (frame, predictions, rules) — it runs at the selector level
 * every time the score slider moves, never at parse time.
 *
 * The matching is the standard greedy one (as in PASCAL VOC / COCO):
 *  1. Take the predictions at or above `minScore`, highest score first.
 *  2. Each takes the still-unmatched label OF ITS CLASS it overlaps most; if
 *     that overlap reaches `iouThreshold` the label is FOUND. A label is
 *     matched at most once, so a second box on the same object is a false alarm.
 *  3. A prediction left without a label is a FALSE ALARM — unless it sits on a
 *     label that is not scored (step 4), in which case it is dropped.
 *  4. Labels of low visibility are NOT SCORED: neither found nor missed.
 *  5. Every other unmatched label is MISSED.
 *  6. (F6) A bicycle / motorcycle prediction left without a label whose CENTRE
 *     lies inside a bicycle-rack label is IGNORED (`IgnoredPrediction`): the
 *     rack is one label for many bikes, so the box is neither right nor wrong.
 *     Checked last — a bike standing next to a rack with its own label is
 *     matched (or absorbed) like any other.
 *
 * Labels are the frame's `detections2D` (boxes that project into the image) of
 * an evaluated class; predictions of a class that is not evaluated are ignored.
 *
 * (F6) `frame` is ONE PHOTO: for a frame with several cameras pass
 * `frameAsCamera(frame, name)` and that camera's predictions.
 */
export function evaluateFrame(
  frame: Frame,
  predictions: readonly Prediction2D[],
  rules: EvaluationRules,
): FrameEvaluation {
  const boxById = new Map<string, Detection3D>(frame.detections3D.map((d) => [d.id, d]));

  const scored: Label[] = [];
  const unscored: (Label & { predictionIds: string[] })[] = [];
  for (const detection of frame.detections2D) {
    if (!isEvaluatedClass(detection.class)) continue;
    const box = boxById.get(detection.id);
    const label: Label = {
      detection,
      // Every 2D label has a 3D box with the same id (Rule #1); 0 is defensive.
      distance: box ? detectionDistance(box) : 0,
      matchedBy: null,
    };
    if (box?.annotation?.visibility === UNSCORED_VISIBILITY) {
      unscored.push({ ...label, predictionIds: [] });
    } else {
      scored.push(label);
    }
  }

  // Predictions that take part: an evaluated class and a high enough score.
  // The array is already score-sorted by the parser; sort again so the function
  // does not depend on that (stable: equal scores keep their order).
  const active = predictions
    .map((prediction) => ({ prediction, cls: toEvaluatedClass(prediction.class) }))
    .filter(
      (p): p is { prediction: Prediction2D; cls: string } =>
        p.cls !== null && p.prediction.score >= rules.minScore,
    )
    .sort((a, b) => b.prediction.score - a.prediction.score);

  // (F6) Bicycle racks in this photo: regions, not labels to be found.
  const racks =
    rules.ignoreRackRegions === false
      ? []
      : frame.detections2D.filter((d) => d.class === BICYCLE_RACK_CLASS);
  const ignored: IgnoredPrediction[] = [];

  const falseAlarms: FalseAlarmResult[] = [];
  for (const { prediction, cls } of active) {
    let best: Label | null = null;
    let bestIou = 0;
    for (const label of scored) {
      if (label.matchedBy || label.detection.class !== cls) continue;
      const overlap = iou(prediction.bbox, label.detection.bbox);
      if (overlap > bestIou) {
        best = label;
        bestIou = overlap;
      }
    }
    if (best && bestIou >= rules.iouThreshold) {
      best.matchedBy = {
        kind: 'found',
        objectId: best.detection.id,
        class: best.detection.class,
        distance: best.distance,
        predictionId: prediction.id,
        score: prediction.score,
        iou: bestIou,
      };
      continue;
    }

    // On an object that is not scored → neither right nor wrong.
    const absorber = unscored.find(
      (label) =>
        label.detection.class === cls &&
        iou(prediction.bbox, label.detection.bbox) >= rules.iouThreshold,
    );
    if (absorber) {
      absorber.predictionIds.push(prediction.id);
      continue;
    }

    // (F6) In a bicycle rack → the rack is the label; its bikes have none.
    if (racks.length > 0 && isRackMemberClass(cls)) {
      const rack = racks.find((region) => centreInside(prediction.bbox, region.bbox));
      if (rack) {
        ignored.push({
          predictionId: prediction.id,
          class: cls,
          score: prediction.score,
          regionObjectId: rack.id,
          reason: 'bicycle-rack',
        });
        continue;
      }
    }

    falseAlarms.push({
      kind: 'false-alarm',
      predictionId: prediction.id,
      class: cls,
      score: prediction.score,
      nearest: nearestLabel(prediction, cls, frame.detections2D, rules),
    });
  }

  // Label results in the frame's label order.
  const byLabelId = new Map<string, EvalResult>();
  for (const label of scored) {
    byLabelId.set(
      label.detection.id,
      label.matchedBy ?? missed(label, predictions, rules),
    );
  }
  for (const label of unscored) {
    const result: NotScoredResult = {
      kind: 'not-scored',
      objectId: label.detection.id,
      class: label.detection.class,
      distance: label.distance,
      reason: 'low-visibility',
      predictionIds: label.predictionIds,
    };
    byLabelId.set(label.detection.id, result);
  }
  const labelResults: EvalResult[] = [];
  for (const detection of frame.detections2D) {
    const result = byLabelId.get(detection.id);
    if (result) labelResults.push(result);
  }

  const results = [...labelResults, ...falseAlarms];
  return {
    frameId: frame.id,
    results,
    counts: countResults(results),
    notEvaluated: frame.detections3D.filter((d) => !byLabelId.has(d.id)).length,
    ignored,
  };
}

/**
 * Whether the centre of `inner` lies inside `outer` (edges included). The rack
 * rule asks this instead of an IoU: one bike covers a small part of a rack, so
 * their IoU is always low, but the bike's middle is on the rack.
 */
function centreInside(inner: Box2D, outer: Box2D): boolean {
  const cx = inner.x + inner.width / 2;
  const cy = inner.y + inner.height / 2;
  return (
    cx >= outer.x && cx <= outer.x + outer.width && cy >= outer.y && cy <= outer.y + outer.height
  );
}

/** A missed label, with the prediction that overlaps it most (for the reader). */
function missed(
  label: Label,
  predictions: readonly Prediction2D[],
  rules: EvaluationRules,
): MissedResult {
  let nearest: Prediction2D | null = null;
  let nearestIou = 0;
  // ALL predictions of the frame — any class, any score — so the answer can be
  // "the model saw something here, but called it a person" or "…but was unsure".
  for (const prediction of predictions) {
    const overlap = iou(prediction.bbox, label.detection.bbox);
    if (overlap > nearestIou) {
      nearest = prediction;
      nearestIou = overlap;
    }
  }
  const base = {
    kind: 'missed' as const,
    objectId: label.detection.id,
    class: label.detection.class,
    distance: label.distance,
  };
  if (!nearest || nearestIou < NEAREST_MIN_IOU) return { ...base, nearest: null };

  let reason: MissReason;
  if (toEvaluatedClass(nearest.class) !== label.detection.class) reason = 'wrong-class';
  else if (nearest.score < rules.minScore) reason = 'below-min-score';
  else if (nearestIou < rules.iouThreshold) reason = 'low-overlap';
  // Right class, score and overlap, yet this label is unmatched: the prediction
  // was given to another label that it overlaps more.
  else reason = 'matched-elsewhere';

  return {
    ...base,
    nearest: {
      predictionId: nearest.id,
      class: nearest.class,
      score: nearest.score,
      iou: nearestIou,
      reason,
    },
  };
}

/** The label (of any class, scored or not) that a false alarm overlaps most. */
function nearestLabel(
  prediction: Prediction2D,
  cls: string,
  labels: readonly Detection2D[],
  rules: EvaluationRules,
): FalseAlarmResult['nearest'] {
  let nearest: Detection2D | null = null;
  let nearestIou = 0;
  for (const label of labels) {
    const overlap = iou(prediction.bbox, label.bbox);
    if (overlap > nearestIou) {
      nearest = label;
      nearestIou = overlap;
    }
  }
  if (!nearest || nearestIou < NEAREST_MIN_IOU) return null;

  let relation: FalseAlarmRelation;
  if (nearest.class !== cls) relation = 'other-class';
  else if (nearestIou >= rules.iouThreshold) relation = 'matched-elsewhere';
  else relation = 'low-overlap';
  return { objectId: nearest.id, class: nearest.class, iou: nearestIou, relation };
}

export function countResults(results: readonly EvalResult[]): EvalCounts {
  const counts: EvalCounts = { found: 0, missed: 0, falseAlarm: 0, notScored: 0 };
  for (const result of results) {
    if (result.kind === 'found') counts.found += 1;
    else if (result.kind === 'missed') counts.missed += 1;
    else if (result.kind === 'false-alarm') counts.falseAlarm += 1;
    else counts.notScored += 1;
  }
  return counts;
}

/**
 * The result a selection id refers to, or `undefined`.
 *
 * A label is selected by its object id; a false alarm by its prediction id. A
 * prediction that FOUND a label resolves to that label's result, so clicking
 * either box of a matched pair selects the same thing.
 */
export function findResult(
  evaluation: FrameEvaluation,
  id: string | null | undefined,
): EvalResult | undefined {
  if (!id) return undefined;
  return evaluation.results.find((result) => {
    if (result.kind === 'false-alarm') return result.predictionId === id;
    if (result.objectId === id) return true;
    if (result.kind === 'found') return result.predictionId === id;
    if (result.kind === 'not-scored') return result.predictionIds.includes(id);
    return false;
  });
}

/**
 * The id to put in `selectedObjectId` for a result: the label's object id when
 * there is a label (so the 3D box and the list row highlight too), otherwise
 * the prediction's id.
 */
export function selectionIdOf(result: EvalResult): string {
  return result.kind === 'false-alarm' ? result.predictionId : result.objectId;
}

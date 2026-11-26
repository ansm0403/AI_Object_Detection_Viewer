import type { EvalResult, FrameCamerasEvaluation } from '@/lib/evaluation';
import { detectionDistance } from '@/lib/selectors/distance-filter';
import type { Frame } from '@/lib/types';
import { classLabel } from '@/lib/ui/class-label';

/**
 * (F7) Search conditions: "find the frames where …".
 *
 * A condition measures ONE number on a frame (how many pedestrians within
 * 20 m, how many boxes without LiDAR points, how many labels the model missed)
 * and a frame matches when that number reaches the condition's minimum. Several
 * conditions must all hold.
 *
 * Everything here is a pure function of the frames the app already holds and —
 * for the model conditions — of the evaluation the screen itself uses. So a
 * frame found by "5 pedestrians within 20 m" shows exactly five (or more) such
 * boxes when it is opened: the search and the screen run the same code
 * (`detectionDistance`, `evaluateFrames`). Nothing is precomputed offline
 * (design doc F7, decision 4; Immutable Rule #3).
 */
export type SearchCondition =
  /** Boxes of a class within a distance of the car. `class: null` = any class; `within: null` = any distance. */
  | { kind: 'objects'; class: string | null; within: number | null; min: number }
  /** Boxes with no LiDAR point inside (nuScenes' own count) — a label-quality signal. */
  | { kind: 'no-lidar'; min: number }
  /**
   * What the camera detector did in the frame's photos, at the default rules
   * (score ≥ 0.25, IoU ≥ 0.3):
   *  - `missed`: labels the model missed;
   *  - `false-alarm`: model boxes that matched no label;
   *  - `unlabelled`: false alarms with NO label of any class nearby — the ones
   *    that may be real objects the dataset did not label.
   */
  | { kind: 'model'; what: 'missed' | 'false-alarm' | 'unlabelled'; min: number }
  /** The scene is (or is not) described as a night scene. About the scene, not the frame. */
  | { kind: 'time'; night: boolean };

/** One frame with what the conditions need to know about it. */
export type SearchFrameContext = {
  frame: Frame;
  /** Whether the frame's scene is described as a night scene. */
  night: boolean;
  /**
   * The frame's evaluation at the default rules. `null` / `undefined` = the
   * frame was not evaluated (no predictions): a model condition can then not
   * be answered, which is not the same as "0 missed".
   */
  evaluation?: FrameCamerasEvaluation | null;
};

const atLeastOne = (n: number): number => (Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1);

/**
 * A condition with its numbers made usable: the minimum is a whole number ≥ 1
 * (a minimum of 0 would match every frame and say nothing), a distance is a
 * positive number or "any".
 */
export function normalizeCondition(condition: SearchCondition): SearchCondition {
  switch (condition.kind) {
    case 'objects': {
      const within =
        condition.within !== null && Number.isFinite(condition.within) && condition.within > 0
          ? condition.within
          : null;
      return { ...condition, class: condition.class || null, within, min: atLeastOne(condition.min) };
    }
    case 'no-lidar':
    case 'model':
      return { ...condition, min: atLeastOne(condition.min) };
    case 'time':
      return condition;
  }
}

/**
 * The ids of the frame's 3D boxes that COUNT toward the condition, or `null`
 * when the condition is not about 3D boxes (scene conditions; false alarms,
 * which are model boxes without a 3D box).
 */
export function conditionBoxIds(
  condition: SearchCondition,
  context: SearchFrameContext,
): Set<string> | null {
  const { frame, evaluation } = context;
  switch (condition.kind) {
    case 'objects': {
      const ids = new Set<string>();
      for (const box of frame.detections3D) {
        if (condition.class !== null && box.class !== condition.class) continue;
        // Inclusive, like the distance filter: a box at exactly 20 m is "within 20 m".
        if (condition.within !== null && detectionDistance(box) > condition.within) continue;
        ids.add(box.id);
      }
      return ids;
    }
    case 'no-lidar': {
      const ids = new Set<string>();
      for (const box of frame.detections3D) {
        if (box.annotation?.lidarPoints === 0) ids.add(box.id);
      }
      return ids;
    }
    case 'model': {
      if (condition.what !== 'missed') return null;
      const ids = new Set<string>();
      if (!evaluation) return ids;
      // A label is missed PER PHOTO; the box is marked if any photo missed it.
      for (const photo of evaluation.byCamera.values()) {
        for (const result of photo.results) {
          if (result.kind === 'missed') ids.add(result.objectId);
        }
      }
      return ids;
    }
    case 'time':
      return null;
  }
}

/**
 * The number the condition measures on this frame, or `null` when it cannot be
 * measured here (a model condition on a frame without predictions).
 *
 * `objects` / `no-lidar` count 3D boxes. The `model` values count per PHOTO,
 * added over the frame's cameras — the same numbers the evaluation panel and
 * the timeline show ("19 missed"), so an object two cameras miss counts twice.
 * `time` is 1 when the scene's day/night matches, else 0.
 */
export function conditionValue(
  condition: SearchCondition,
  context: SearchFrameContext,
): number | null {
  switch (condition.kind) {
    case 'objects':
    case 'no-lidar':
      return conditionBoxIds(condition, context)?.size ?? 0;
    case 'model': {
      const evaluation = context.evaluation;
      if (!evaluation) return null;
      if (condition.what === 'missed') return evaluation.counts.missed;
      if (condition.what === 'false-alarm') return evaluation.counts.falseAlarm;
      let unlabelled = 0;
      for (const photo of evaluation.byCamera.values()) {
        for (const result of photo.results) {
          if (result.kind === 'false-alarm' && result.nearest === null) unlabelled += 1;
        }
      }
      return unlabelled;
    }
    case 'time':
      return context.night === condition.night ? 1 : 0;
  }
}

/** Whether the frame meets the condition. A value that cannot be measured does not match. */
export function matchesCondition(condition: SearchCondition, context: SearchFrameContext): boolean {
  const value = conditionValue(condition, context);
  if (value === null) return false;
  return condition.kind === 'time' ? value === 1 : value >= condition.min;
}

/**
 * The boxes to keep in colour in the 3D view: every box that counts toward at
 * least one condition. `null` = no condition is about boxes, so nothing should
 * be dimmed.
 */
export function highlightedBoxIds(
  conditions: readonly SearchCondition[],
  context: SearchFrameContext,
): Set<string> | null {
  let union: Set<string> | null = null;
  for (const condition of conditions) {
    const ids = conditionBoxIds(condition, context);
    if (ids === null) continue;
    if (union === null) union = new Set();
    for (const id of ids) union.add(id);
  }
  return union;
}

/** Whether any condition needs the model's evaluation. */
export function needsEvaluation(conditions: readonly SearchCondition[]): boolean {
  return conditions.some((condition) => condition.kind === 'model');
}

const MODEL_NOUN: Record<Extract<SearchCondition, { kind: 'model' }>['what'], string> = {
  missed: 'model missed',
  'false-alarm': 'model false alarms',
  unlabelled: 'false alarms with no label nearby',
};

/** What the condition counts, without the minimum: "person within 20 m". */
export function conditionSubject(condition: SearchCondition): string {
  switch (condition.kind) {
    case 'objects': {
      const what = condition.class === null ? 'boxes' : classLabel(condition.class);
      return condition.within === null ? what : `${what} within ${condition.within} m`;
    }
    case 'no-lidar':
      return 'boxes without LiDAR points';
    case 'model':
      return MODEL_NOUN[condition.what];
    case 'time':
      return condition.night ? 'night scene' : 'day scene';
  }
}

/** The condition as the chip shows it: "person within 20 m ≥ 5", "night scene". */
export function describeCondition(condition: SearchCondition): string {
  const subject = conditionSubject(condition);
  return condition.kind === 'time' ? subject : `${subject} ≥ ${condition.min}`;
}

/** A frame's value as text next to a hit: "20 person within 20 m". */
export function describeValue(condition: SearchCondition, value: number | null): string {
  if (condition.kind === 'time') return conditionSubject(condition);
  if (value === null) return 'not evaluated';
  return `${value} ${conditionSubject(condition)}`;
}

/** Whether two conditions are the same question (used to avoid adding one twice). */
export function sameCondition(a: SearchCondition, b: SearchCondition): boolean {
  return JSON.stringify(normalizeCondition(a)) === JSON.stringify(normalizeCondition(b));
}

/**
 * Of one photo's evaluation results, the ones the MODEL conditions count:
 * missed labels for `missed`, every false alarm for `false-alarm`, and only the
 * false alarms with no label nearby for `unlabelled`. Used to draw, in the
 * photo, exactly the boxes that made the frame match.
 *
 * Without any model condition the results are returned unchanged.
 */
export function resultsForConditions(
  conditions: readonly SearchCondition[],
  results: readonly EvalResult[],
): EvalResult[] {
  const wanted = new Set<'missed' | 'false-alarm' | 'unlabelled'>();
  for (const condition of conditions) {
    if (condition.kind === 'model') wanted.add(condition.what);
  }
  if (wanted.size === 0) return [...results];
  return results.filter((result) => {
    if (result.kind === 'missed') return wanted.has('missed');
    if (result.kind !== 'false-alarm') return false;
    return wanted.has('false-alarm') || (wanted.has('unlabelled') && result.nearest === null);
  });
}

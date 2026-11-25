/**
 * Which classes take part in the evaluation, and how the model's class names
 * map to this app's class names.
 *
 * The detector (YOLO trained on COCO) names 80 classes; the dataset names its
 * own. Only classes BOTH sides can express are evaluated:
 *  - a label of any other class (e.g. `static_object.bicycle_rack`) is not
 *    something the model could have reported, so it is left out;
 *  - a prediction of any other class (e.g. "traffic light", "handbag") has no
 *    label to be compared with, so it is left out as well.
 *
 * The app-side names are the ones `lib/nuscenes/parser.ts` (`CATEGORY_MAP`)
 * already produces for nuScenes categories; this file only adds the model side.
 * The offline script writes the model's names unfiltered — the choice of what
 * to evaluate lives here, in tested code (Immutable Rule #3).
 */
// A Map, not an object literal: a model class named "constructor" or "toString"
// must not resolve to something inherited from Object.prototype.
const MODEL_CLASS_TO_APP_CLASS = new Map<string, string>([
  ['person', 'person'],
  ['bicycle', 'bicycle'],
  ['car', 'car'],
  ['motorcycle', 'motorcycle'],
  ['bus', 'bus'],
  ['truck', 'truck'],
]);

/** App class names that are evaluated, in display order. */
export const EVALUATED_CLASSES: readonly string[] = [
  'person',
  'bicycle',
  'car',
  'motorcycle',
  'bus',
  'truck',
];

const EVALUATED = new Set(EVALUATED_CLASSES);

/**
 * (F6) The label class that marks a GROUP of objects labelled as one: a
 * bicycle rack. The parser leaves this nuScenes category unmapped, so this is
 * its raw name.
 */
export const BICYCLE_RACK_CLASS = 'static_object.bicycle_rack';

/**
 * (F6) Model classes that a rack swallows: what stands in a bicycle rack. The
 * same two the nuScenes detection benchmark filters inside bike racks.
 */
const RACK_MEMBER_CLASSES = new Set(['bicycle', 'motorcycle']);

/** Whether a prediction of this (app) class is left out when it sits inside a bicycle rack. */
export function isRackMemberClass(appClass: string): boolean {
  return RACK_MEMBER_CLASSES.has(appClass);
}

/** The app class a model class is compared against, or `null` when it is not evaluated. */
export function toEvaluatedClass(modelClass: string): string | null {
  return MODEL_CLASS_TO_APP_CLASS.get(modelClass) ?? null;
}

/** Whether a LABEL of this (app) class takes part in the evaluation. */
export function isEvaluatedClass(appClass: string): boolean {
  return EVALUATED.has(appClass);
}

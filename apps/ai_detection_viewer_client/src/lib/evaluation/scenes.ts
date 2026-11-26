import type { Frame } from '@/lib/types';
import { evaluateFrames } from './evaluate';
import { precisionOf, recallOf } from './metrics';
import type { EvalCounts, EvaluationRules, PredictionSet } from './types';

/**
 * (F7) The evaluation of SEVERAL scenes: one line per scene, the total, and the
 * day / night split.
 *
 * Each scene is evaluated exactly as the screen evaluates the scene it shows
 * (`evaluateFrames`, per photo); this only adds the counts up. Nothing about
 * the matching rules changes here.
 *
 * Why scenes are kept apart instead of pooling 2,424 photos into one number:
 * a scene is ~20 s of one drive, and its frames show the same objects again and
 * again. The spread BETWEEN scenes (and between drives) is the honest picture;
 * one pooled percentage hides it. The split carries the number of drives for
 * the same reason — in nuScenes-mini "night" is a single drive.
 */

/** One scene to evaluate. */
export type SceneInput = {
  name: string;
  night: boolean;
  /** The drive (`log`) the scene was cut from; `null` when unknown. */
  drive: string | null;
  frames: readonly Frame[];
  /** `null` = the scene has no (usable) predictions: it is listed as not evaluated. */
  predictions: PredictionSet | null;
};

export type Score = {
  counts: EvalCounts;
  precision: number | null;
  recall: number | null;
  /** Photos and frames the counts cover. */
  photos: number;
  frames: number;
};

export type SceneScore = Score & { scene: string; night: boolean; drive: string | null };

/** A group of scenes (day or night), with how many scenes and DRIVES it stands on. */
export type GroupScore = Score & { scenes: number; drives: number };

export type ScenesEvaluation = {
  /** One line per evaluated scene, in the given order. */
  scenes: SceneScore[];
  /** Scenes that could not be evaluated (no predictions), in the given order. */
  notEvaluated: string[];
  total: GroupScore;
  day: GroupScore;
  night: GroupScore;
};

const NO_COUNTS: EvalCounts = { found: 0, missed: 0, falseAlarm: 0, notScored: 0 };

function addCounts(a: EvalCounts, b: EvalCounts): EvalCounts {
  return {
    found: a.found + b.found,
    missed: a.missed + b.missed,
    falseAlarm: a.falseAlarm + b.falseAlarm,
    notScored: a.notScored + b.notScored,
  };
}

function group(scores: readonly SceneScore[]): GroupScore {
  let counts = NO_COUNTS;
  let photos = 0;
  let frames = 0;
  const drives = new Set<string>();
  let unknownDrives = 0;
  for (const score of scores) {
    counts = addCounts(counts, score.counts);
    photos += score.photos;
    frames += score.frames;
    if (score.drive === null) unknownDrives += 1;
    else drives.add(score.drive);
  }
  return {
    counts,
    precision: precisionOf(counts),
    recall: recallOf(counts),
    photos,
    frames,
    scenes: scores.length,
    // A scene whose drive is unknown counts as its own drive (it cannot be
    // shown to share one).
    drives: drives.size + unknownDrives,
  };
}

/**
 * Evaluate every scene with the same rules and add the results up.
 *
 * Precision and recall of a group are computed from the group's SUMMED counts
 * (every photo weighs the same), not as an average of the scenes' percentages.
 */
export function evaluateScenes(
  scenes: readonly SceneInput[],
  rules: EvaluationRules,
): ScenesEvaluation {
  const scores: SceneScore[] = [];
  const notEvaluated: string[] = [];
  for (const scene of scenes) {
    if (!scene.predictions) {
      notEvaluated.push(scene.name);
      continue;
    }
    const evaluation = evaluateFrames(scene.frames, scene.predictions, rules);
    if (evaluation.evaluatedPhotos === 0) {
      notEvaluated.push(scene.name);
      continue;
    }
    const { found, missed, falseAlarm, notScored } = evaluation.summary;
    const counts: EvalCounts = { found, missed, falseAlarm, notScored };
    scores.push({
      scene: scene.name,
      night: scene.night,
      drive: scene.drive,
      counts,
      precision: precisionOf(counts),
      recall: recallOf(counts),
      photos: evaluation.evaluatedPhotos,
      frames: evaluation.evaluatedFrames,
    });
  }
  return {
    scenes: scores,
    notEvaluated,
    total: group(scores),
    day: group(scores.filter((score) => !score.night)),
    night: group(scores.filter((score) => score.night)),
  };
}

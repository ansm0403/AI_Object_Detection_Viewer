import type { Frame } from '@/lib/types';
import type { FrameCamerasEvaluation } from './evaluate';
import type { Box2D, EvalResult, FalseAlarmResult, PredictionSet } from './types';

/**
 * (F7.5) The false alarms that have NO label nearby.
 *
 * A false alarm is a model box that matched no label. Most of them sit on or
 * next to some label (another class, too little overlap, a second box on an
 * object). The rest overlap no label of any class at all (`nearest === null`,
 * i.e. IoU < 0.1 with every label of the photo). Those are the open question of
 * the evaluation: each is either a mistake of the model — or a real object the
 * dataset did not label, in which case the "false alarm" is the dataset's
 * omission and precision is understated. Only looking at the photo can tell.
 *
 * This module lists them, in a FIXED order, so a reproducible sample can be
 * drawn from the list (`lib/sampling`).
 */

/** Whether a result is a false alarm with no label of any class nearby. */
export function isUnlabelledFalseAlarm(result: EvalResult): result is FalseAlarmResult {
  return result.kind === 'false-alarm' && result.nearest === null;
}

/** One such model box, with what is needed to find it and to show it. */
export type UnlabelledFalseAlarm = {
  scene: string;
  frameId: string;
  /** 0-based position of the frame in its scene. */
  frameIndex: number;
  camera: string;
  /** The prediction's id (`pred:<frameId>:<camera>:<index>`) — unique across scenes. */
  predictionId: string;
  /** The class the model reported (app class name). */
  class: string;
  score: number;
  /** In the original photo's pixels. `null` only if the predictions do not hold the id. */
  bbox: Box2D | null;
};

/** One scene with its evaluation (per frame, as `evaluateFrames(...).byFrame`). */
export type UnlabelledSceneInput = {
  name: string;
  frames: readonly Frame[];
  predictions: PredictionSet | null;
  evaluation: ReadonlyMap<string, FrameCamerasEvaluation> | null;
};

/**
 * Every false alarm with no label nearby, in a fixed order: scenes as given,
 * frames in scene order, cameras in the frame's camera order, results in
 * result order (false alarms by score, highest first).
 *
 * The order matters: the sample is "the first N of this list after a seeded
 * shuffle", so the same scenes and the same evaluation always give the same
 * list — and the same sample. Callers pass the evaluation at the DEFAULT rules;
 * a scene without an evaluation contributes nothing.
 */
export function listUnlabelledFalseAlarms(
  scenes: readonly UnlabelledSceneInput[],
): UnlabelledFalseAlarm[] {
  const list: UnlabelledFalseAlarm[] = [];
  for (const scene of scenes) {
    if (!scene.evaluation) continue;
    scene.frames.forEach((frame, frameIndex) => {
      const evaluation = scene.evaluation?.get(frame.id);
      if (!evaluation) return;
      for (const [camera, photo] of evaluation.byCamera) {
        const predictions = scene.predictions?.byFrame.get(frame.id)?.get(camera);
        for (const result of photo.results) {
          if (!isUnlabelledFalseAlarm(result)) continue;
          const prediction = predictions?.find((p) => p.id === result.predictionId);
          list.push({
            scene: scene.name,
            frameId: frame.id,
            frameIndex,
            camera,
            predictionId: result.predictionId,
            class: result.class,
            score: result.score,
            bbox: prediction ? prediction.bbox : null,
          });
        }
      }
    });
  }
  return list;
}

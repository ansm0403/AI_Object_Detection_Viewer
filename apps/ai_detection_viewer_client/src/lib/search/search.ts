import type { FrameCamerasEvaluation } from '@/lib/evaluation';
import type { Frame } from '@/lib/types';
import {
  conditionValue,
  matchesCondition,
  type SearchCondition,
  type SearchFrameContext,
} from './conditions';

/** One scene as the search sees it. */
export type SearchScene = {
  name: string;
  night: boolean;
  frames: readonly Frame[];
  /**
   * The scene's evaluation per frame id, at the default rules. Only needed for
   * model conditions; omitted or `null` → those conditions match nothing in
   * this scene (it was not evaluated).
   */
  evaluation?: ReadonlyMap<string, FrameCamerasEvaluation> | null;
};

/** A frame that meets every condition. */
export type SearchHit = {
  scene: string;
  frameId: string;
  /** 0-based position of the frame in its scene. */
  frameIndex: number;
  /** The frame's 3D box count (for context next to the values). */
  boxCount: number;
  /** One value per condition, in the conditions' order (`null` = not measurable). */
  values: (number | null)[];
  thumbnailUrl?: string;
};

export type SceneMatches = { scene: string; night: boolean; matched: number; total: number };

export type SearchResult = {
  /** Matching frames: scene by scene in the given order, frames in sequence order. */
  hits: SearchHit[];
  /** How many frames were searched. */
  frames: number;
  /** Per scene searched, in the given order — including scenes with no match. */
  byScene: SceneMatches[];
  /** How many scenes have at least one matching frame. */
  scenesWithMatches: number;
};

/**
 * Find the frames that meet ALL conditions, over the scenes given.
 *
 * No conditions → every frame is a hit (the list then simply shows the data).
 * Only the scenes passed in are searched: the caller passes the ones whose
 * boxes are in memory and says so on screen ("7 / 10 scenes").
 *
 * Cost: one pass over the boxes per condition — measured 0.5 ms for 404 frames
 * and 18,538 boxes (design doc F7 §2.5), so it runs on every change without a
 * precomputed index.
 */
export function searchScenes(
  scenes: readonly SearchScene[],
  conditions: readonly SearchCondition[],
): SearchResult {
  const hits: SearchHit[] = [];
  const byScene: SceneMatches[] = [];
  let frames = 0;
  for (const scene of scenes) {
    let matched = 0;
    scene.frames.forEach((frame, frameIndex) => {
      const context: SearchFrameContext = {
        frame,
        night: scene.night,
        evaluation: scene.evaluation?.get(frame.id) ?? null,
      };
      if (!conditions.every((condition) => matchesCondition(condition, context))) return;
      matched += 1;
      hits.push({
        scene: scene.name,
        frameId: frame.id,
        frameIndex,
        boxCount: frame.detections3D.length,
        values: conditions.map((condition) => conditionValue(condition, context)),
        ...(frame.thumbnailUrl ? { thumbnailUrl: frame.thumbnailUrl } : {}),
      });
    });
    frames += scene.frames.length;
    byScene.push({ scene: scene.name, night: scene.night, matched, total: scene.frames.length });
  }
  return {
    hits,
    frames,
    byScene,
    scenesWithMatches: byScene.filter((entry) => entry.matched > 0).length,
  };
}

export type HitOrder = 'scene' | 'value';

/**
 * The hits in display order.
 *  - `scene`: as found — scene by scene, frames in sequence.
 *  - `value`: the largest value of the FIRST condition first ("the most crowded
 *    frames on top"); equal values keep the scene order. A value that could not
 *    be measured sorts last.
 * Returns a new array.
 */
export function sortHits(hits: readonly SearchHit[], order: HitOrder): SearchHit[] {
  if (order === 'scene') return [...hits];
  const value = (hit: SearchHit): number => hit.values[0] ?? -Infinity;
  // Array.prototype.sort is stable, so ties keep the scene order.
  return [...hits].sort((a, b) => value(b) - value(a));
}

/**
 * The hit `delta` places from the current frame in the list, without wrapping
 * (stepping past either end stays there, like the review queue). When the
 * current frame is not a hit, a forward step lands on the first hit and a
 * backward step on the last. `null` when there are no hits.
 */
export function stepHit(
  hits: readonly SearchHit[],
  currentFrameId: string | null,
  delta: number,
): SearchHit | null {
  if (hits.length === 0) return null;
  const move = Number.isFinite(delta) ? Math.trunc(delta) : 0;
  const index = currentFrameId === null ? -1 : hits.findIndex((hit) => hit.frameId === currentFrameId);
  if (index === -1) return move < 0 ? hits[hits.length - 1] : hits[0];
  return hits[Math.min(hits.length - 1, Math.max(0, index + move))];
}

/** A ready-made search, offered as a one-click chip. */
export type SearchPreset = { id: string; label: string; hint: string; conditions: SearchCondition[] };

export const SEARCH_PRESETS: readonly SearchPreset[] = [
  {
    id: 'crowded',
    label: 'Crowded',
    hint: 'At least 5 pedestrians within 20 m of the car',
    conditions: [{ kind: 'objects', class: 'person', within: 20, min: 5 }],
  },
  {
    id: 'no-lidar',
    label: 'No-LiDAR boxes ≥ 10',
    hint: 'At least 10 boxes with no LiDAR point inside — boxes with no sensor evidence in the frame',
    conditions: [{ kind: 'no-lidar', min: 10 }],
  },
  {
    id: 'night',
    label: 'Night',
    hint: 'Frames of scenes described as night scenes',
    conditions: [{ kind: 'time', night: true }],
  },
  {
    id: 'model-missed',
    label: 'Model missed ≥ 15',
    hint: 'The camera detector missed at least 15 labels in the frame’s photos (score ≥ 0.25)',
    conditions: [{ kind: 'model', what: 'missed', min: 15 }],
  },
  {
    id: 'unlabelled',
    label: 'Unlabelled? ≥ 3',
    hint: 'At least 3 model boxes with no label of any class nearby — possibly real objects the dataset did not label',
    conditions: [{ kind: 'model', what: 'unlabelled', min: 3 }],
  },
];

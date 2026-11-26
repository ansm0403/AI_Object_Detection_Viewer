import { describe, expect, it } from 'vitest';
import type { EvalResult, FrameCamerasEvaluation, FrameEvaluation } from '@/lib/evaluation';
import type { Detection3D, Frame } from '@/lib/types';
import {
  conditionBoxIds,
  conditionSubject,
  conditionValue,
  describeCondition,
  describeValue,
  highlightedBoxIds,
  matchesCondition,
  needsEvaluation,
  normalizeCondition,
  resultsForConditions,
  sameCondition,
  type SearchCondition,
  type SearchFrameContext,
} from './conditions';

// A box at a given distance straight ahead (render frame: forward = −z).
const box = (id: string, cls: string, metres: number, lidarPoints?: number): Detection3D => ({
  id,
  class: cls,
  confidence: 1,
  bbox3D: { center: [0, 0, -metres], size: [1, 1, 1] },
  ...(lidarPoints === undefined ? {} : { annotation: { lidarPoints } }),
});
const frame = (boxes: Detection3D[]): Frame => ({
  id: 'f',
  imageUrl: '',
  imageWidth: 1600,
  imageHeight: 900,
  detections2D: [],
  detections3D: boxes,
  pointCloud: [],
  source: 'nuscenes-measured',
});
const context = (boxes: Detection3D[], extra: Partial<SearchFrameContext> = {}): SearchFrameContext => ({
  frame: frame(boxes),
  night: false,
  ...extra,
});

// A frame's evaluation with given per-photo results (only what the search reads).
const missed = (objectId: string): EvalResult => ({ kind: 'missed', objectId, class: 'car', distance: 10, nearest: null });
const found = (objectId: string): EvalResult => ({
  kind: 'found', objectId, class: 'car', distance: 10, predictionId: `p-${objectId}`, score: 0.9, iou: 0.8,
});
const falseAlarm = (id: string, nearLabel: boolean): EvalResult => ({
  kind: 'false-alarm',
  predictionId: id,
  class: 'car',
  score: 0.5,
  nearest: nearLabel ? { objectId: 'x', class: 'truck', iou: 0.4, relation: 'other-class' } : null,
});
function evaluationOf(photos: Record<string, EvalResult[]>): FrameCamerasEvaluation {
  const byCamera = new Map<string, FrameEvaluation>();
  const counts = { found: 0, missed: 0, falseAlarm: 0, notScored: 0 };
  for (const [camera, results] of Object.entries(photos)) {
    const own = { found: 0, missed: 0, falseAlarm: 0, notScored: 0 };
    for (const r of results) {
      if (r.kind === 'found') own.found += 1;
      else if (r.kind === 'missed') own.missed += 1;
      else if (r.kind === 'false-alarm') own.falseAlarm += 1;
      else own.notScored += 1;
    }
    byCamera.set(camera, { frameId: 'f', results, counts: own, notEvaluated: 0, ignored: [] });
    counts.found += own.found;
    counts.missed += own.missed;
    counts.falseAlarm += own.falseAlarm;
  }
  return { frameId: 'f', byCamera, camerasWithoutPredictions: [], counts, ignored: 0, objects: new Map(), notEvaluated: 0 };
}

const PEOPLE_20M: SearchCondition = { kind: 'objects', class: 'person', within: 20, min: 2 };

describe('objects condition', () => {
  const boxes = [
    box('p1', 'person', 5),
    box('p2', 'person', 20), // exactly on the limit
    box('p3', 'person', 20.01),
    box('c1', 'car', 3),
  ];

  it('counts boxes of the class within the distance (the limit is inclusive)', () => {
    expect(conditionValue(PEOPLE_20M, context(boxes))).toBe(2);
    expect([...(conditionBoxIds(PEOPLE_20M, context(boxes)) ?? [])]).toEqual(['p1', 'p2']);
  });

  it('matches when the count reaches the minimum', () => {
    expect(matchesCondition(PEOPLE_20M, context(boxes))).toBe(true);
    expect(matchesCondition({ ...PEOPLE_20M, min: 3 }, context(boxes))).toBe(false);
  });

  it('`within: null` means any distance; `class: null` means any class', () => {
    expect(conditionValue({ kind: 'objects', class: 'person', within: null, min: 1 }, context(boxes))).toBe(3);
    expect(conditionValue({ kind: 'objects', class: null, within: 10, min: 1 }, context(boxes))).toBe(2);
    expect(conditionValue({ kind: 'objects', class: null, within: null, min: 1 }, context(boxes))).toBe(4);
  });

  it('a class the frame does not have counts 0 and does not match', () => {
    const c: SearchCondition = { kind: 'objects', class: 'bus', within: null, min: 1 };
    expect(conditionValue(c, context(boxes))).toBe(0);
    expect(matchesCondition(c, context(boxes))).toBe(false);
  });

  it('a frame without boxes counts 0', () => {
    expect(conditionValue(PEOPLE_20M, context([]))).toBe(0);
  });
});

describe('no-lidar condition', () => {
  const boxes = [box('a', 'car', 5, 0), box('b', 'car', 6, 12), box('c', 'car', 7, 0), box('d', 'car', 8)];

  it('counts boxes whose LiDAR point count is 0 — not boxes whose count is unknown', () => {
    const c: SearchCondition = { kind: 'no-lidar', min: 2 };
    expect(conditionValue(c, context(boxes))).toBe(2);
    expect([...(conditionBoxIds(c, context(boxes)) ?? [])]).toEqual(['a', 'c']);
    expect(matchesCondition(c, context(boxes))).toBe(true);
    expect(matchesCondition({ kind: 'no-lidar', min: 3 }, context(boxes))).toBe(false);
  });
});

describe('model conditions', () => {
  const evaluation = evaluationOf({
    CAM_FRONT: [missed('a'), missed('b'), found('c'), falseAlarm('p1', false), falseAlarm('p2', true)],
    CAM_BACK: [missed('a'), falseAlarm('p3', false)],
  });
  const withEval = context([box('a', 'car', 5), box('b', 'car', 6), box('c', 'car', 7)], { evaluation });

  it('missed / false alarms are counted per photo, added over the cameras', () => {
    expect(conditionValue({ kind: 'model', what: 'missed', min: 1 }, withEval)).toBe(3); // a twice, b once
    expect(conditionValue({ kind: 'model', what: 'false-alarm', min: 1 }, withEval)).toBe(3);
  });

  it('"unlabelled" counts only the false alarms with no label of any class nearby', () => {
    expect(conditionValue({ kind: 'model', what: 'unlabelled', min: 1 }, withEval)).toBe(2);
  });

  it('the missed BOXES are each marked once, whatever the number of photos that missed them', () => {
    expect([...(conditionBoxIds({ kind: 'model', what: 'missed', min: 1 }, withEval) ?? [])]).toEqual(['a', 'b']);
  });

  it('false alarms are model boxes with no 3D box: the condition is not about boxes', () => {
    expect(conditionBoxIds({ kind: 'model', what: 'false-alarm', min: 1 }, withEval)).toBeNull();
    expect(conditionBoxIds({ kind: 'model', what: 'unlabelled', min: 1 }, withEval)).toBeNull();
  });

  it('a frame that was not evaluated cannot be measured, and does not match — not even "≥ 1"', () => {
    for (const evaluationValue of [null, undefined]) {
      const notEvaluated = context([box('a', 'car', 5)], { evaluation: evaluationValue });
      for (const what of ['missed', 'false-alarm', 'unlabelled'] as const) {
        const c: SearchCondition = { kind: 'model', what, min: 1 };
        expect(conditionValue(c, notEvaluated)).toBeNull();
        expect(matchesCondition(c, notEvaluated)).toBe(false);
      }
      expect([...(conditionBoxIds({ kind: 'model', what: 'missed', min: 1 }, notEvaluated) ?? [])]).toEqual([]);
    }
  });

  it('matches on the minimum', () => {
    expect(matchesCondition({ kind: 'model', what: 'missed', min: 3 }, withEval)).toBe(true);
    expect(matchesCondition({ kind: 'model', what: 'missed', min: 4 }, withEval)).toBe(false);
  });
});

describe('time condition', () => {
  it('is about the scene: every frame of a night scene matches "night"', () => {
    const night: SearchCondition = { kind: 'time', night: true };
    const day: SearchCondition = { kind: 'time', night: false };
    expect(matchesCondition(night, context([], { night: true }))).toBe(true);
    expect(matchesCondition(night, context([], { night: false }))).toBe(false);
    expect(matchesCondition(day, context([], { night: false }))).toBe(true);
    expect(matchesCondition(day, context([], { night: true }))).toBe(false);
    expect(conditionBoxIds(night, context([], { night: true }))).toBeNull();
  });
});

describe('highlightedBoxIds', () => {
  const boxes = [box('p1', 'person', 5), box('c1', 'car', 3, 0), box('c2', 'car', 30, 5)];

  it('is the union of the boxes every box-condition counts', () => {
    const ids = highlightedBoxIds(
      [{ kind: 'objects', class: 'person', within: 20, min: 1 }, { kind: 'no-lidar', min: 1 }],
      context(boxes),
    );
    expect([...(ids ?? [])].sort()).toEqual(['c1', 'p1']);
  });

  it('is null when no condition is about boxes (nothing to dim)', () => {
    expect(highlightedBoxIds([], context(boxes))).toBeNull();
    expect(highlightedBoxIds([{ kind: 'time', night: true }], context(boxes))).toBeNull();
    expect(highlightedBoxIds([{ kind: 'model', what: 'false-alarm', min: 1 }], context(boxes))).toBeNull();
  });

  it('is an EMPTY set (dim everything) when a box-condition counts nothing in this frame', () => {
    const ids = highlightedBoxIds([{ kind: 'objects', class: 'bus', within: null, min: 1 }], context(boxes));
    expect(ids).not.toBeNull();
    expect(ids?.size).toBe(0);
  });
});

describe('normalizeCondition', () => {
  it('makes the minimum a whole number of at least 1', () => {
    for (const min of [0, -3, 0.9, Number.NaN]) {
      expect(normalizeCondition({ kind: 'no-lidar', min })).toEqual({ kind: 'no-lidar', min: 1 });
    }
    expect(normalizeCondition({ kind: 'model', what: 'missed', min: 4.8 })).toEqual({ kind: 'model', what: 'missed', min: 4 });
  });

  it('turns a non-positive or non-numeric distance into "any distance", an empty class into "any class"', () => {
    for (const within of [0, -5, Number.NaN, Infinity]) {
      expect(normalizeCondition({ kind: 'objects', class: 'car', within, min: 2 })).toEqual({
        kind: 'objects', class: 'car', within: null, min: 2,
      });
    }
    expect(normalizeCondition({ kind: 'objects', class: '', within: 20, min: 2 })).toEqual({
      kind: 'objects', class: null, within: 20, min: 2,
    });
  });

  it('leaves a time condition alone', () => {
    expect(normalizeCondition({ kind: 'time', night: true })).toEqual({ kind: 'time', night: true });
  });
});

describe('describing conditions', () => {
  it('reads like the chip in the bar', () => {
    expect(describeCondition(PEOPLE_20M)).toBe('person within 20 m ≥ 2');
    expect(describeCondition({ kind: 'objects', class: null, within: null, min: 60 })).toBe('boxes ≥ 60');
    expect(describeCondition({ kind: 'objects', class: 'car', within: null, min: 10 })).toBe('car ≥ 10');
    expect(describeCondition({ kind: 'no-lidar', min: 10 })).toBe('boxes without LiDAR points ≥ 10');
    expect(describeCondition({ kind: 'model', what: 'missed', min: 15 })).toBe('model missed ≥ 15');
    expect(describeCondition({ kind: 'model', what: 'unlabelled', min: 3 })).toBe('false alarms with no label nearby ≥ 3');
    expect(describeCondition({ kind: 'time', night: true })).toBe('night scene');
    expect(describeCondition({ kind: 'time', night: false })).toBe('day scene');
  });

  it('uses the short class name', () => {
    expect(conditionSubject({ kind: 'objects', class: 'movable_object.barrier', within: 30, min: 1 })).toBe('barrier within 30 m');
  });

  it("describes a frame's value", () => {
    expect(describeValue(PEOPLE_20M, 20)).toBe('20 person within 20 m');
    expect(describeValue({ kind: 'model', what: 'missed', min: 15 }, null)).toBe('not evaluated');
    expect(describeValue({ kind: 'time', night: true }, 1)).toBe('night scene');
  });
});

describe('needsEvaluation / sameCondition', () => {
  it('only model conditions need the evaluation', () => {
    expect(needsEvaluation([PEOPLE_20M, { kind: 'time', night: true }, { kind: 'no-lidar', min: 1 }])).toBe(false);
    expect(needsEvaluation([PEOPLE_20M, { kind: 'model', what: 'missed', min: 1 }])).toBe(true);
    expect(needsEvaluation([])).toBe(false);
  });

  it('two conditions are the same when they ask the same question after normalising', () => {
    expect(sameCondition(PEOPLE_20M, { ...PEOPLE_20M })).toBe(true);
    expect(sameCondition({ kind: 'no-lidar', min: 0 }, { kind: 'no-lidar', min: 1 })).toBe(true);
    expect(sameCondition(PEOPLE_20M, { ...PEOPLE_20M, min: 3 })).toBe(false);
    expect(sameCondition(PEOPLE_20M, { kind: 'no-lidar', min: 2 })).toBe(false);
  });
});

describe('resultsForConditions', () => {
  const results = [missed('a'), found('b'), falseAlarm('p1', false), falseAlarm('p2', true)];
  const ids = (list: EvalResult[]) => list.map((r) => (r.kind === 'false-alarm' ? r.predictionId : r.objectId));

  it('"missed" keeps the missed labels', () => {
    expect(ids(resultsForConditions([{ kind: 'model', what: 'missed', min: 1 }], results))).toEqual(['a']);
  });

  it('"false-alarm" keeps every false alarm; "unlabelled" only those with no label nearby', () => {
    expect(ids(resultsForConditions([{ kind: 'model', what: 'false-alarm', min: 1 }], results))).toEqual(['p1', 'p2']);
    expect(ids(resultsForConditions([{ kind: 'model', what: 'unlabelled', min: 1 }], results))).toEqual(['p1']);
  });

  it('several model conditions keep the union, in the original order', () => {
    expect(
      ids(
        resultsForConditions(
          [{ kind: 'model', what: 'unlabelled', min: 1 }, { kind: 'model', what: 'missed', min: 1 }],
          results,
        ),
      ),
    ).toEqual(['a', 'p1']);
  });

  it('without a model condition nothing is filtered (and the input array is not returned itself)', () => {
    const same = resultsForConditions([PEOPLE_20M, { kind: 'time', night: true }], results);
    expect(same).toEqual(results);
    expect(same).not.toBe(results);
  });

  it('found and not-scored results are never part of a model condition', () => {
    const all: SearchCondition[] = [
      { kind: 'model', what: 'missed', min: 1 },
      { kind: 'model', what: 'false-alarm', min: 1 },
    ];
    expect(ids(resultsForConditions(all, results))).toEqual(['a', 'p1', 'p2']);
  });
});

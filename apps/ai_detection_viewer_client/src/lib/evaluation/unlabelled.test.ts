import { describe, expect, it } from 'vitest';
import { evaluateFrames } from './evaluate';
import { box, makeFrame, makePrediction, TEST_CAMERA } from './test-helpers';
import type { PredictionSet } from './types';
import { isUnlabelledFalseAlarm, listUnlabelledFalseAlarms } from './unlabelled';

const RULES = { minScore: 0.25, iouThreshold: 0.3 };

/** A one-photo scene: labels at the left, predictions wherever the test puts them. */
function scene(name: string, frameIds: string[], predictionsOf: (frameId: string) => ReturnType<typeof makePrediction>[]) {
  const frames = frameIds.map((id) =>
    makeFrame([{ id: `${id}-label`, class: 'car', bbox: box(0, 0, 100, 100) }], id),
  );
  const predictions: PredictionSet = {
    model: { name: 'test' },
    cameras: [TEST_CAMERA],
    byFrame: new Map(frameIds.map((id) => [id, new Map([['', predictionsOf(id)]])])),
  };
  return { name, frames, predictions, evaluation: evaluateFrames(frames, predictions, RULES).byFrame };
}

describe('isUnlabelledFalseAlarm', () => {
  it('is true only for a false alarm with no label nearby', () => {
    expect(isUnlabelledFalseAlarm({ kind: 'false-alarm', predictionId: 'p', class: 'car', score: 0.5, nearest: null })).toBe(true);
    expect(
      isUnlabelledFalseAlarm({
        kind: 'false-alarm',
        predictionId: 'p',
        class: 'car',
        score: 0.5,
        nearest: { objectId: 'o', class: 'truck', iou: 0.4, relation: 'other-class' },
      }),
    ).toBe(false);
    expect(isUnlabelledFalseAlarm({ kind: 'missed', objectId: 'o', class: 'car', distance: 10, nearest: null })).toBe(false);
  });
});

describe('listUnlabelledFalseAlarms', () => {
  it('lists the model boxes that overlap no label, with where they are and what they look like', () => {
    const input = scene('scene-a', ['f1'], (id) => [
      makePrediction(0, 'car', 0.9, box(0, 0, 100, 100), id, ''), // finds the label
      makePrediction(1, 'person', 0.6, box(500, 500, 40, 80), id, ''), // nothing there
    ]);
    expect(listUnlabelledFalseAlarms([input])).toEqual([
      {
        scene: 'scene-a',
        frameId: 'f1',
        frameIndex: 0,
        camera: '',
        predictionId: 'pred:f1::1',
        class: 'person',
        score: 0.6,
        bbox: box(500, 500, 40, 80),
      },
    ]);
  });

  it('leaves out false alarms that sit on a label (other class, or too little overlap)', () => {
    const input = scene('scene-a', ['f1'], (id) => [
      makePrediction(0, 'truck', 0.9, box(0, 0, 100, 100), id, ''), // a truck on the car label
      makePrediction(1, 'car', 0.8, box(60, 60, 100, 100), id, ''), // overlaps the label a little (IoU ≈ 0.09 < 0.1 → none)
      makePrediction(2, 'car', 0.7, box(40, 40, 100, 100), id, ''), // IoU ≈ 0.22: nearby, too little overlap
    ]);
    const list = listUnlabelledFalseAlarms([input]);
    expect(list.map((item) => item.predictionId)).toEqual(['pred:f1::1']);
  });

  it('leaves out predictions under the minimum score (they are not results at all)', () => {
    const input = scene('scene-a', ['f1'], (id) => [makePrediction(0, 'car', 0.1, box(500, 500, 40, 40), id, '')]);
    expect(listUnlabelledFalseAlarms([input])).toEqual([]);
  });

  it('keeps a fixed order: scenes as given, frames in order, then by score', () => {
    const predictionsOf = (id: string) => [
      makePrediction(0, 'car', 0.5, box(500, 500, 40, 40), id, ''),
      makePrediction(1, 'car', 0.9, box(700, 500, 40, 40), id, ''),
    ];
    const a = scene('scene-a', ['a1', 'a2'], predictionsOf);
    const b = scene('scene-b', ['b1'], predictionsOf);
    expect(listUnlabelledFalseAlarms([a, b]).map((item) => `${item.scene}/${item.frameIndex}/${item.score}`)).toEqual([
      'scene-a/0/0.9',
      'scene-a/0/0.5',
      'scene-a/1/0.9',
      'scene-a/1/0.5',
      'scene-b/0/0.9',
      'scene-b/0/0.5',
    ]);
    // …and the same input gives the same list again.
    expect(listUnlabelledFalseAlarms([a, b])).toEqual(listUnlabelledFalseAlarms([a, b]));
  });

  it('a scene without an evaluation contributes nothing', () => {
    const input = scene('scene-a', ['f1'], (id) => [makePrediction(0, 'car', 0.9, box(500, 500, 40, 40), id, '')]);
    expect(listUnlabelledFalseAlarms([{ ...input, evaluation: null }])).toEqual([]);
    expect(listUnlabelledFalseAlarms([])).toEqual([]);
  });

  it('still lists a box whose rectangle cannot be looked up', () => {
    const input = scene('scene-a', ['f1'], (id) => [makePrediction(0, 'car', 0.9, box(500, 500, 40, 40), id, '')]);
    const [item] = listUnlabelledFalseAlarms([{ ...input, predictions: null }]);
    expect(item).toMatchObject({ predictionId: 'pred:f1::0', bbox: null });
  });
});

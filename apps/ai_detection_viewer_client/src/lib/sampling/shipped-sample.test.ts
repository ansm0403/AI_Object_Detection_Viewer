import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MIN_SCORE,
  IOU_THRESHOLD,
  evaluateFrames,
  listUnlabelledFalseAlarms,
  parsePredictions,
  type UnlabelledFalseAlarm,
} from '@/lib/evaluation';
import { parseNuScenes, parseSceneCatalog } from '@/lib/nuscenes';
import { readPublicJson } from '@/lib/nuscenes/test-helpers';
import { conditionValue } from '@/lib/search';
import { SAMPLE_SEED, drawOrder, sampleOf } from './order';

/**
 * The population and the sample on the SHIPPED data (F7.5).
 *
 * The population — false alarms with no label nearby, at the default rules —
 * is what the app's sample check draws from; its size and the drawn order are
 * locked here so that "the same sample every time" also holds across code
 * changes. If the data or the scoring changes, this fails and the change (and
 * the fact that stored verdicts no longer match) is visible.
 */
// "<scene> <frame number> <prediction id>" of the first five sampled boxes.
const LOCKED_FIRST_FIVE: string[] = [
  'scene-0757 31 pred:bad8a002637046178fe0f8216e5bc355:CAM_FRONT:8',
  'scene-0655 26 pred:0402e40724984f3b833496067d46c771:CAM_FRONT_RIGHT:21',
  'scene-0916 9 pred:5b7cb170eee6468aa1fdbd3abcf63c5a:CAM_FRONT_RIGHT:22',
  'scene-0061 34 pred:b73152cab88f49d9ba195da81fde1809:CAM_FRONT_RIGHT:6',
  'scene-0061 39 pred:ed5fc18c31904f96a8f0dbb99ff069c0:CAM_FRONT_RIGHT:0',
];

const catalog = parseSceneCatalog(readPublicJson('/sample-data/nuscenes/scenes.json'));
if (!catalog) throw new Error('scenes.json did not parse');
const loaded = catalog.scenes.map((info) => {
  const predictions = info.predictionsUrl ? parsePredictions(readPublicJson(info.predictionsUrl)) : null;
  if (!predictions) throw new Error(`no predictions for ${info.name}`);
  return { name: info.name, night: info.night, frames: parseNuScenes(readPublicJson(info.framesUrl)), predictions };
});
const populationAt = (iouThreshold: number): UnlabelledFalseAlarm[] =>
  listUnlabelledFalseAlarms(
    loaded.map((scene) => ({
      ...scene,
      evaluation: evaluateFrames(scene.frames, scene.predictions, { minScore: DEFAULT_MIN_SCORE, iouThreshold }).byFrame,
    })),
  );
const population = populationAt(IOU_THRESHOLD);
const tally = (key: (item: UnlabelledFalseAlarm) => string, items = population) => {
  const counts: Record<string, number> = {};
  for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
  return counts;
};

describe('the population: false alarms with no label nearby (default rules)', () => {
  it('has 1,452 boxes', () => {
    expect(population).toHaveLength(1452);
  });

  it('is the same set at IoU 0.5 — the IoU choice does not move the sample', () => {
    expect(populationAt(0.5).map((item) => item.predictionId)).toEqual(
      population.map((item) => item.predictionId),
    );
  });

  it('is what Explore\'s "false alarms with no label nearby" condition counts', () => {
    let fromSearch = 0;
    for (const scene of loaded) {
      const evaluation = evaluateFrames(scene.frames, scene.predictions, {
        minScore: DEFAULT_MIN_SCORE,
        iouThreshold: IOU_THRESHOLD,
      }).byFrame;
      for (const frame of scene.frames) {
        fromSearch +=
          conditionValue(
            { kind: 'model', what: 'unlabelled', min: 1 },
            { frame, night: scene.night, evaluation: evaluation.get(frame.id) ?? null },
          ) ?? 0;
      }
    }
    expect(fromSearch).toBe(1452);
  });

  it('every box has a unique id and a rectangle', () => {
    expect(new Set(population.map((item) => item.predictionId)).size).toBe(1452);
    expect(population.every((item) => item.bbox !== null)).toBe(true);
  });

  it('is spread over the scenes, cameras and classes as the design doc reports (F7.5 §2.1)', () => {
    expect(tally((item) => item.scene)).toEqual({
      'scene-0061': 122,
      'scene-0103': 445,
      'scene-0553': 140,
      'scene-0655': 260,
      'scene-0757': 154,
      'scene-0796': 53,
      'scene-0916': 94,
      'scene-1077': 28,
      'scene-1094': 94,
      'scene-1100': 62,
    });
    expect(tally((item) => item.camera)).toEqual({
      CAM_FRONT: 505,
      CAM_FRONT_LEFT: 191,
      CAM_FRONT_RIGHT: 263,
      CAM_BACK: 140,
      CAM_BACK_LEFT: 98,
      CAM_BACK_RIGHT: 255,
    });
    expect(tally((item) => item.class)).toEqual({ car: 1129, person: 238, bus: 34, truck: 30, bicycle: 21 });
    expect(population.filter((item) => item.score >= 0.5)).toHaveLength(377);
  });
});

describe('the sample drawn from it', () => {
  const order = drawOrder(population, SAMPLE_SEED);

  it('is the same every time', () => {
    expect(drawOrder(populationAt(IOU_THRESHOLD), SAMPLE_SEED).map((item) => item.predictionId)).toEqual(
      order.map((item) => item.predictionId),
    );
  });

  it('starts with these boxes (locked: stored verdicts are keyed by them)', () => {
    expect(sampleOf(order, 5).map((item) => `${item.scene} ${item.frameIndex + 1} ${item.predictionId}`)).toEqual(
      LOCKED_FIRST_FIVE,
    );
  });

  it('the first hundred come from several scenes and cameras, roughly as the population does', () => {
    const sample = sampleOf(order, 100);
    expect(new Set(sample.map((item) => item.predictionId)).size).toBe(100);
    expect(Object.keys(tally((item) => item.scene, sample)).length).toBeGreaterThanOrEqual(8);
    expect(Object.keys(tally((item) => item.camera, sample)).length).toBe(6);
    // scene-0103 holds 31 % of the population; a random hundred should not be far off.
    const from0103 = sample.filter((item) => item.scene === 'scene-0103').length;
    expect(from0103).toBeGreaterThan(15);
    expect(from0103).toBeLessThan(47);
  });

  it('a sample of 200 starts with the sample of 100', () => {
    expect(sampleOf(order, 200).slice(0, 100)).toEqual(sampleOf(order, 100));
  });
});

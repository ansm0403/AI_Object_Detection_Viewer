import { describe, expect, it } from 'vitest';
import { parseNuScenes, parseSceneCatalog } from '@/lib/nuscenes';
import { readPublicJson } from '@/lib/nuscenes/test-helpers';
import { evaluateFrames } from './evaluate';
import { DEFAULT_MIN_SCORE, IOU_THRESHOLD } from './match';
import { parsePredictions } from './parse';
import { evaluateScenes, type SceneInput } from './scenes';

const RULES = { minScore: DEFAULT_MIN_SCORE, iouThreshold: IOU_THRESHOLD };

const catalog = parseSceneCatalog(readPublicJson('/sample-data/nuscenes/scenes.json'));
if (!catalog) throw new Error('scenes.json did not parse');
const scenes: SceneInput[] = catalog.scenes.map((info) => ({
  name: info.name,
  night: info.night,
  drive: info.log?.name ?? null,
  frames: parseNuScenes(readPublicJson(info.framesUrl)),
  predictions: info.predictionsUrl ? parsePredictions(readPublicJson(info.predictionsUrl)) : null,
}));
const flat = (c: { found: number; missed: number; falseAlarm: number; notScored: number }) => [
  c.found,
  c.missed,
  c.falseAlarm,
  c.notScored,
];

describe('evaluateScenes on the shipped scenes', () => {
  const result = evaluateScenes(scenes, RULES);

  it('has one line per scene, and each is what evaluating that scene alone gives', () => {
    expect(result.scenes.map((s) => s.scene)).toEqual(catalog.scenes.map((s) => s.name));
    expect(result.notEvaluated).toEqual([]);
    for (const [index, scene] of scenes.entries()) {
      if (!scene.predictions) throw new Error('missing predictions');
      const alone = evaluateFrames(scene.frames, scene.predictions, RULES);
      expect(flat(result.scenes[index].counts)).toEqual(flat(alone.summary));
      expect(result.scenes[index].photos).toBe(alone.evaluatedPhotos);
    }
  });

  it('the per-scene numbers of the design doc (F7 §2.7)', () => {
    expect(
      result.scenes.map((s) => `${s.scene} ${flat(s.counts).join('/')} ${Math.round((s.recall ?? 0) * 100)}%`),
    ).toEqual([
      'scene-0061 759/885/393/739 46%',
      'scene-0103 1200/470/758/699 72%',
      'scene-0553 643/512/398/360 56%',
      'scene-0655 1010/316/704/1201 76%',
      'scene-0757 314/163/240/56 66%',
      'scene-0796 421/211/132/181 67%',
      'scene-0916 1364/648/414/1010 68%',
      'scene-1077 206/550/83/125 27%',
      'scene-1094 412/1032/232/656 29%',
      'scene-1100 397/505/160/251 44%',
    ]);
  });

  it('the total is the sum over the scenes: 6,726 / 5,292 / 3,514 / 5,278 in 2,424 photos', () => {
    expect(flat(result.total.counts)).toEqual([6726, 5292, 3514, 5278]);
    expect([result.total.photos, result.total.frames, result.total.scenes]).toEqual([2424, 404, 10]);
    expect(result.total.precision).toBeCloseTo(6726 / (6726 + 3514), 10);
    expect(result.total.recall).toBeCloseTo(6726 / (6726 + 5292), 10);
  });

  it('day scenes: 7 scenes from 7 drives, recall 5,711 / 8,916', () => {
    expect([result.day.scenes, result.day.drives]).toEqual([7, 7]);
    expect([result.day.counts.found, result.day.counts.found + result.day.counts.missed]).toEqual([5711, 8916]);
  });

  it('night scenes: 3 scenes from ONE drive, recall 1,015 / 3,102', () => {
    expect([result.night.scenes, result.night.drives]).toEqual([3, 1]);
    expect([result.night.counts.found, result.night.counts.found + result.night.counts.missed]).toEqual([1015, 3102]);
  });

  it('day and night add up to the total, and the total counts 8 drives', () => {
    expect(result.day.counts.found + result.night.counts.found).toBe(result.total.counts.found);
    expect(result.day.photos + result.night.photos).toBe(result.total.photos);
    expect(result.total.drives).toBe(8);
  });
});

describe('evaluateScenes — edges', () => {
  it('a scene without predictions is listed as not evaluated and adds nothing', () => {
    const [first, second] = scenes;
    const result = evaluateScenes([first, { ...second, predictions: null }], RULES);
    expect(result.scenes.map((s) => s.scene)).toEqual([first.name]);
    expect(result.notEvaluated).toEqual([second.name]);
    expect(result.total.scenes).toBe(1);
  });

  it('predictions that cover none of the frames also count as not evaluated', () => {
    const [first, second] = scenes;
    // The second scene, paired with the FIRST scene's predictions: no frame matches.
    const result = evaluateScenes([{ ...second, predictions: first.predictions }], RULES);
    expect(result.scenes).toEqual([]);
    expect(result.notEvaluated).toEqual([second.name]);
  });

  it('no scenes → empty groups with no percentages', () => {
    const result = evaluateScenes([], RULES);
    expect(result.scenes).toEqual([]);
    expect(result.total).toMatchObject({ precision: null, recall: null, photos: 0, scenes: 0, drives: 0 });
    expect(result.night.scenes).toBe(0);
  });

  it('a scene whose drive is unknown counts as a drive of its own', () => {
    const [first, second] = scenes;
    const result = evaluateScenes([{ ...first, drive: null }, { ...second, drive: null }], RULES);
    expect(result.total.drives).toBe(2);
  });

  it('a stricter score changes every scene the same way the single-scene evaluation would', () => {
    const strict = { minScore: 0.6, iouThreshold: IOU_THRESHOLD };
    const result = evaluateScenes(scenes.slice(0, 2), strict);
    const alone = scenes.slice(0, 2).map((scene) => {
      if (!scene.predictions) throw new Error('missing predictions');
      return flat(evaluateFrames(scene.frames, scene.predictions, strict).summary);
    });
    expect(result.scenes.map((s) => flat(s.counts))).toEqual(alone);
    expect(result.scenes[0].counts.found).toBeLessThan(759);
  });
});

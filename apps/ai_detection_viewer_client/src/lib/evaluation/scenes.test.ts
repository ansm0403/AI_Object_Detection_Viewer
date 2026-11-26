import { describe, expect, it } from 'vitest';
import { parseNuScenes, parseSceneCatalog } from '@/lib/nuscenes';
import { readPublicJson } from '@/lib/nuscenes/test-helpers';
import { compareByDistance } from './distance-compare';
import { summarizeDrives } from './drives';
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
  driveDate: info.log?.date,
  driveLocation: info.log?.location,
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

describe('F7.5 on the shipped scenes: drives, distinct objects, distance, IoU 0.5', () => {
  const result = evaluateScenes(scenes, RULES);
  const pct = (value: number | null) => (value === null ? '—' : `${(value * 100).toFixed(1)}%`);

  it('the default rules still give the locked totals (nothing about the scoring changed)', () => {
    expect(flat(result.total.counts)).toEqual([6726, 5292, 3514, 5278]);
  });

  it('IoU 0.5 gives the numbers the F7 design probe reported: P 51.1 % / R 45.4 %, day 52.3 %, night 25.9 %', () => {
    const strict = evaluateScenes(scenes, { minScore: DEFAULT_MIN_SCORE, iouThreshold: 0.5 });
    expect(flat(strict.total.counts)).toEqual([5462, 6556, 5231, 5278]);
    expect([pct(strict.total.precision), pct(strict.total.recall)]).toEqual(['51.1%', '45.4%']);
    expect([strict.day.counts.found, strict.day.counts.found + strict.day.counts.missed]).toEqual([4659, 8916]);
    expect([strict.night.counts.found, strict.night.counts.found + strict.night.counts.missed]).toEqual([803, 3102]);
    expect([pct(strict.day.recall), pct(strict.night.recall)]).toEqual(['52.3%', '25.9%']);
  });

  it('the 12,018 scored labels are 654 distinct objects: 483 in the day drives, 171 in the night drive', () => {
    expect(result.total.scoredObjects).toBe(654);
    expect([result.day.scoredObjects, result.night.scoredObjects]).toEqual([483, 171]);
    expect(result.scenes.reduce((sum, scene) => sum + scene.scoredObjects, 0)).toBe(654);
  });

  it('one row per drive — eight rows, oldest first, the night drive holding three scenes', () => {
    const rows = summarizeDrives(result.scenes).map(
      (row) =>
        `${row.date} ${row.location} [${row.scenes.map((name) => name.replace('scene-', '')).join(',')}]` +
        ` ${row.night ? 'night' : 'day'} objects ${row.scoredObjects} ${row.counts.found}/${row.counts.found + row.counts.missed}` +
        ` R ${pct(row.recall)} P ${pct(row.precision)}`,
    );
    expect(rows).toEqual([
      '2018-07-24 singapore-onenorth [0061] day objects 86 759/1644 R 46.2% P 65.9%',
      '2018-08-01 boston-seaport [0103] day objects 106 1200/1670 R 71.9% P 61.3%',
      '2018-08-27 boston-seaport [0655] day objects 100 1010/1326 R 76.2% P 58.9%',
      '2018-08-28 boston-seaport [0553] day objects 35 643/1155 R 55.7% P 61.8%',
      '2018-08-30 boston-seaport [0757] day objects 23 314/477 R 65.8% P 56.7%',
      '2018-10-02 singapore-queenstown [0796] day objects 43 421/632 R 66.6% P 76.1%',
      '2018-10-08 singapore-queenstown [0916] day objects 90 1364/2012 R 67.8% P 76.7%',
      '2018-11-21 singapore-hollandvillage [1077,1094,1100] night objects 171 1015/3102 R 32.7% P 68.1%',
    ]);
  });

  it('the drives add up to the total', () => {
    const rows = summarizeDrives(result.scenes);
    expect(rows.reduce((sum, row) => sum + row.counts.found, 0)).toBe(6726);
    expect(rows.reduce((sum, row) => sum + row.counts.missed, 0)).toBe(5292);
    expect(rows.reduce((sum, row) => sum + row.scoredObjects, 0)).toBe(654);
  });

  it('day against night in the same distance band (found/labels)', () => {
    const comparison = compareByDistance(result.day.byDistance, result.night.byDistance);
    const cell = (c: { found: number; total: number }) => `${c.found}/${c.total}`;
    expect(
      comparison.rows.map((row) => `${row.from}-${row.to ?? '+'} ${cell(row.a)} ${cell(row.b)}${row.comparable ? '' : ' (thin)'}`),
    ).toEqual([
      '0-10 838/1108 154/280',
      '10-20 1740/2209 228/769',
      '20-30 1463/2121 321/836',
      '30-40 755/1226 138/478',
      '40-50 395/799 48/239',
      '50-60 242/636 70/179',
      '60-70 158/378 24/93',
      '70-80 63/244 28/95',
      '80-90 42/115 1/56',
      '90-+ 15/80 3/77',
    ]);
  });

  it('distance does not explain the day / night gap: with the day distance mix, night recall is 33.9 % (plain 32.7 %)', () => {
    const comparison = compareByDistance(result.day.byDistance, result.night.byDistance);
    expect(pct(result.night.recall)).toBe('32.7%');
    expect(pct(comparison.bAtMixOfA)).toBe('33.9%');
    expect(pct(result.day.recall)).toBe('64.1%');
    expect(pct(comparison.aAtMixOfB)).toBe('63.6%');
    // The bands both groups have labels in hold 99.9 % of the day labels and all night labels.
    expect(pct(comparison.coverageA)).toBe('99.9%');
    expect(comparison.coverageB).toBe(1);
  });

  it('the bands of the groups add up to their scored labels', () => {
    const labels = (bins: { total: number }[]) => bins.reduce((sum, bin) => sum + bin.total, 0);
    expect(labels(result.day.byDistance)).toBe(8916);
    expect(labels(result.night.byDistance)).toBe(3102);
    expect(labels(result.total.byDistance)).toBe(12018);
  });
});

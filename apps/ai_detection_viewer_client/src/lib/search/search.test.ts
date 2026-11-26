import { describe, expect, it } from 'vitest';
import { DEFAULT_MIN_SCORE, IOU_THRESHOLD, evaluateFrames, parsePredictions } from '@/lib/evaluation';
import { parseNuScenes, parseSceneCatalog } from '@/lib/nuscenes';
import { readPublicJson } from '@/lib/nuscenes/test-helpers';
import type { Detection3D, Frame } from '@/lib/types';
import { conditionBoxIds, type SearchCondition } from './conditions';
import { SEARCH_PRESETS, searchScenes, sortHits, stepHit, type SearchScene } from './search';

const box = (id: string, cls: string, metres: number): Detection3D => ({
  id,
  class: cls,
  confidence: 1,
  bbox3D: { center: [0, 0, -metres], size: [1, 1, 1] },
});
const frame = (id: string, people: number, thumb?: string): Frame => ({
  id,
  imageUrl: '',
  imageWidth: 1600,
  imageHeight: 900,
  detections2D: [],
  detections3D: [
    ...Array.from({ length: people }, (_, i) => box(`${id}-p${i}`, 'person', 5 + i)),
    box(`${id}-car`, 'car', 3),
  ],
  pointCloud: [],
  source: 'nuscenes-measured',
  ...(thumb ? { thumbnailUrl: thumb } : {}),
});

const SCENES: SearchScene[] = [
  { name: 's1', night: false, frames: [frame('a', 0), frame('b', 3, '/t/b.webp'), frame('c', 5)] },
  { name: 's2', night: true, frames: [frame('d', 4), frame('e', 1)] },
  { name: 's3', night: false, frames: [] },
];
const PEOPLE: SearchCondition = { kind: 'objects', class: 'person', within: 20, min: 3 };

describe('searchScenes', () => {
  it('finds the frames that meet the condition, scene by scene in sequence order', () => {
    const result = searchScenes(SCENES, [PEOPLE]);
    expect(result.hits.map((h) => [h.scene, h.frameId, h.frameIndex, h.values[0]])).toEqual([
      ['s1', 'b', 1, 3],
      ['s1', 'c', 2, 5],
      ['s2', 'd', 0, 4],
    ]);
  });

  it('reports how many frames were searched and the matches per scene, including scenes without any', () => {
    const result = searchScenes(SCENES, [PEOPLE]);
    expect(result.frames).toBe(5);
    expect(result.byScene).toEqual([
      { scene: 's1', night: false, matched: 2, total: 3 },
      { scene: 's2', night: true, matched: 1, total: 2 },
      { scene: 's3', night: false, matched: 0, total: 0 },
    ]);
    expect(result.scenesWithMatches).toBe(2);
  });

  it('each hit carries the box count and the thumbnail of its frame', () => {
    const [hit] = searchScenes(SCENES, [PEOPLE]).hits;
    expect(hit.boxCount).toBe(4);
    expect(hit.thumbnailUrl).toBe('/t/b.webp');
    expect(searchScenes(SCENES, [PEOPLE]).hits[1]).not.toHaveProperty('thumbnailUrl');
  });

  it('several conditions must ALL hold, and a hit has one value per condition', () => {
    const result = searchScenes(SCENES, [PEOPLE, { kind: 'time', night: true }]);
    expect(result.hits.map((h) => h.frameId)).toEqual(['d']);
    expect(result.hits[0].values).toEqual([4, 1]);
  });

  it('no conditions → every frame is a hit', () => {
    const result = searchScenes(SCENES, []);
    expect(result.hits.map((h) => h.frameId)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(result.hits[0].values).toEqual([]);
  });

  it('nothing matches → no hits, and the per-scene totals are still there', () => {
    const result = searchScenes(SCENES, [{ ...PEOPLE, min: 99 }]);
    expect(result.hits).toEqual([]);
    expect(result.scenesWithMatches).toBe(0);
    expect(result.byScene.map((s) => s.total)).toEqual([3, 2, 0]);
  });

  it('no scenes → an empty result', () => {
    expect(searchScenes([], [PEOPLE])).toEqual({ hits: [], frames: 0, byScene: [], scenesWithMatches: 0 });
  });

  it('a model condition matches nothing in a scene that has no evaluation', () => {
    const result = searchScenes(SCENES, [{ kind: 'model', what: 'missed', min: 1 }]);
    expect(result.hits).toEqual([]);
  });
});

describe('sortHits', () => {
  const hits = searchScenes(SCENES, [PEOPLE]).hits; // b:3, c:5, d:4

  it('"scene" keeps the order found', () => {
    expect(sortHits(hits, 'scene').map((h) => h.frameId)).toEqual(['b', 'c', 'd']);
  });

  it('"value" puts the largest value of the first condition on top', () => {
    expect(sortHits(hits, 'value').map((h) => h.frameId)).toEqual(['c', 'd', 'b']);
  });

  it('equal values keep the scene order, and the input is not changed', () => {
    const same = searchScenes(
      [{ name: 's', night: false, frames: [frame('x', 3), frame('y', 3), frame('z', 4)] }],
      [PEOPLE],
    ).hits;
    expect(sortHits(same, 'value').map((h) => h.frameId)).toEqual(['z', 'x', 'y']);
    expect(same.map((h) => h.frameId)).toEqual(['x', 'y', 'z']);
  });

  it('with no conditions there is no value: the order stays', () => {
    const all = searchScenes(SCENES, []).hits;
    expect(sortHits(all, 'value').map((h) => h.frameId)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('stepHit', () => {
  const hits = searchScenes(SCENES, [PEOPLE]).hits; // b, c, d

  it('moves to the neighbouring hit and stops at either end', () => {
    expect(stepHit(hits, 'b', 1)?.frameId).toBe('c');
    expect(stepHit(hits, 'c', -1)?.frameId).toBe('b');
    expect(stepHit(hits, 'd', 1)?.frameId).toBe('d');
    expect(stepHit(hits, 'b', -1)?.frameId).toBe('b');
    expect(stepHit(hits, 'b', 5)?.frameId).toBe('d');
  });

  it('from a frame that is not a hit: forward goes to the first hit, back to the last', () => {
    expect(stepHit(hits, 'a', 1)?.frameId).toBe('b');
    expect(stepHit(hits, 'a', -1)?.frameId).toBe('d');
    expect(stepHit(hits, null, 1)?.frameId).toBe('b');
  });

  it('no hits → nowhere to go', () => {
    expect(stepHit([], 'a', 1)).toBeNull();
  });
});

describe('search over the shipped scenes (the numbers the design doc measured)', () => {
  const catalog = parseSceneCatalog(readPublicJson('/sample-data/nuscenes/scenes.json'));
  if (!catalog) throw new Error('scenes.json did not parse');
  const rules = { minScore: DEFAULT_MIN_SCORE, iouThreshold: IOU_THRESHOLD };
  const scenes: SearchScene[] = catalog.scenes.map((info) => {
    const frames = parseNuScenes(readPublicJson(info.framesUrl));
    const predictions = info.predictionsUrl ? parsePredictions(readPublicJson(info.predictionsUrl)) : null;
    return {
      name: info.name,
      night: info.night,
      frames,
      evaluation: predictions ? evaluateFrames(frames, predictions, rules).byFrame : null,
    };
  });

  it('"person within 20 m ≥ 5" finds 177 of 404 frames, in 7 scenes', () => {
    const result = searchScenes(scenes, [{ kind: 'objects', class: 'person', within: 20, min: 5 }]);
    expect(result.frames).toBe(404);
    expect(result.hits).toHaveLength(177);
    expect(result.scenesWithMatches).toBe(7);
    expect(result.byScene.map((s) => `${s.scene} ${s.matched}/${s.total}`)).toEqual([
      'scene-0061 28/39',
      'scene-0103 29/40',
      'scene-0553 37/41',
      'scene-0655 0/41',
      'scene-0757 0/41',
      'scene-0796 3/40',
      'scene-0916 20/41',
      'scene-1077 0/41',
      'scene-1094 20/40',
      'scene-1100 40/40',
    ]);
  });

  it('"model missed ≥ 15" finds 135 frames', () => {
    const result = searchScenes(scenes, [{ kind: 'model', what: 'missed', min: 15 }]);
    expect(result.hits).toHaveLength(135);
  });

  it('"night" finds every frame of the three night scenes (121), and nothing else', () => {
    const result = searchScenes(scenes, [{ kind: 'time', night: true }]);
    expect(result.hits).toHaveLength(41 + 40 + 40);
    expect(new Set(result.hits.map((h) => h.scene))).toEqual(new Set(['scene-1077', 'scene-1094', 'scene-1100']));
  });

  it('the value on a hit is the number of boxes the frame really has (what the screen will show)', () => {
    const condition: SearchCondition = { kind: 'objects', class: 'person', within: 20, min: 5 };
    const result = searchScenes(scenes, [condition]);
    for (const hit of result.hits.slice(0, 40)) {
      const scene = scenes.find((s) => s.name === hit.scene);
      const found = scene?.frames[hit.frameIndex];
      if (!found) throw new Error('hit points at a missing frame');
      expect(found.id).toBe(hit.frameId);
      expect(conditionBoxIds(condition, { frame: found, night: false })?.size).toBe(hit.values[0]);
      expect(hit.values[0]).toBeGreaterThanOrEqual(5);
    }
  });

  it('every preset finds something in this data, and its conditions are already normal', () => {
    for (const preset of SEARCH_PRESETS) {
      const result = searchScenes(scenes, preset.conditions);
      expect(result.hits.length, preset.id).toBeGreaterThan(0);
      expect(result.hits.length, preset.id).toBeLessThan(404);
    }
  });
});

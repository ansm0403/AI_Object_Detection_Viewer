import { afterEach, describe, expect, it, vi } from 'vitest';
import { isNightDescription, parseSceneCatalog } from './catalog';

const scene = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  description: 'Parking lot, parked cars',
  log: { name: 'n015-2018-10-08-15-36-50+0800', location: 'singapore-queenstown', dateCaptured: '2018-10-08' },
  frameCount: 41,
  boxCount: 2424,
  framesPath: `/sample-data/nuscenes/scenes/${name}/frames.json`,
  predictionsPath: `/sample-data/nuscenes/scenes/${name}/predictions.json`,
  ...extra,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isNightDescription', () => {
  it('reads "Night" as the first tag of the description', () => {
    expect(isNightDescription('Night, big street, bus stop')).toBe(true);
    expect(isNightDescription('night, after rain')).toBe(true);
    expect(isNightDescription('  Night')).toBe(true);
  });

  it('is false when the description does not start with that tag', () => {
    expect(isNightDescription('Parking lot, bicycle rack')).toBe(false);
    expect(isNightDescription('')).toBe(false);
    // A word that merely starts with "night", or "night" later in the text.
    expect(isNightDescription('Nightclub entrance, many peds')).toBe(false);
    expect(isNightDescription('Busy street, cars parked overnight')).toBe(false);
    expect(isNightDescription('Intersection, turn left at night')).toBe(false);
  });
});

describe('parseSceneCatalog', () => {
  it('reads every scene with its paths, counts and drive', () => {
    const catalog = parseSceneCatalog({
      version: '1.3',
      source: { dataset: 'nuScenes', version: 'v1.0-mini', license: 'CC BY-NC-SA 4.0' },
      photo: { format: 'webp', width: 960, height: 540, sourceWidth: 1600, sourceHeight: 900 },
      scenes: [scene('scene-0916'), scene('scene-1094', { description: 'Night, after rain, many peds' })],
    });
    expect(catalog?.scenes).toEqual([
      {
        name: 'scene-0916',
        description: 'Parking lot, parked cars',
        night: false,
        log: { name: 'n015-2018-10-08-15-36-50+0800', location: 'singapore-queenstown', date: '2018-10-08' },
        frameCount: 41,
        boxCount: 2424,
        framesUrl: '/sample-data/nuscenes/scenes/scene-0916/frames.json',
        predictionsUrl: '/sample-data/nuscenes/scenes/scene-0916/predictions.json',
      },
      expect.objectContaining({ name: 'scene-1094', night: true }),
    ]);
    expect(catalog?.photo).toEqual({ width: 960, height: 540, sourceWidth: 1600, sourceHeight: 900 });
    expect(catalog?.source).toEqual({ dataset: 'nuScenes', version: 'v1.0-mini', license: 'CC BY-NC-SA 4.0' });
  });

  it('returns null and warns when the root is not a catalog', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const raw of [null, undefined, 'x', 3, [], {}, { scenes: 'no' }]) {
      expect(parseSceneCatalog(raw)).toBeNull();
    }
    expect(warn).toHaveBeenCalled();
  });

  it('an empty list is a valid catalog with no scenes', () => {
    expect(parseSceneCatalog({ scenes: [] })).toEqual({ scenes: [], photo: null, source: null });
  });

  it('skips an entry without a name or a frames path, and a repeated name, keeping the rest', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const catalog = parseSceneCatalog({
      scenes: [
        scene('scene-0061'),
        null,
        { name: 'scene-x' }, // no frames path
        scene('', {}), // empty name
        scene('scene-0061', { frameCount: 99 }), // repeated
        scene('scene-0103'),
      ],
    });
    expect(catalog?.scenes.map((s) => s.name)).toEqual(['scene-0061', 'scene-0103']);
    expect(catalog?.scenes[0].frameCount).toBe(41);
    expect(warn).toHaveBeenCalledTimes(4);
  });

  it('falls back field by field: a scene with only a name and a path still works', () => {
    const catalog = parseSceneCatalog({
      scenes: [
        { name: 'scene-a', framesPath: '/a/frames.json' },
        scene('scene-b', { frameCount: -1, boxCount: 2.5, log: { location: 'somewhere' }, predictionsPath: '' }),
      ],
    });
    expect(catalog?.scenes[0]).toEqual({
      name: 'scene-a',
      description: '',
      night: false,
      log: null,
      frameCount: 0,
      boxCount: 0,
      framesUrl: '/a/frames.json',
      predictionsUrl: null,
    });
    expect(catalog?.scenes[1]).toMatchObject({ frameCount: 0, boxCount: 0, log: null, predictionsUrl: null });
  });

  it('drops photo / source info that is incomplete instead of guessing', () => {
    const catalog = parseSceneCatalog({
      scenes: [scene('scene-0916')],
      photo: { width: 960, height: 540 },
      source: { version: 'v1.0-mini' },
    });
    expect(catalog?.photo).toBeNull();
    expect(catalog?.source).toBeNull();
  });
});

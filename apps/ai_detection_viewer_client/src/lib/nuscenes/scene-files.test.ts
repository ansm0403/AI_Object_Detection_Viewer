import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_MIN_SCORE, IOU_THRESHOLD, evaluateFrames, parsePredictions } from '@/lib/evaluation';
import type { PredictionSet } from '@/lib/evaluation';
import type { Frame } from '@/lib/types';
import { parseSceneCatalog } from './catalog';
import { parseNuScenes, parseNuScenesPoints } from './parser';

/**
 * The SHIPPED scene files (F7, format 1.3): `scenes.json`, one frames file and
 * one predictions file per scene, one points file per frame.
 *
 * The expected totals were counted on the original nuScenes-mini tables before
 * the files existed (design doc F7 §2.1 and §2.7, 2026-11-26). If the files are
 * regenerated differently, this fails and the change is visible.
 */
const PUBLIC_DIR = new URL('../../../public/', import.meta.url);
const fileOf = (publicPath: string): URL => new URL(publicPath.replace(/^\//, ''), PUBLIC_DIR);
const readJson = (publicPath: string): unknown => JSON.parse(readFileSync(fileOf(publicPath), 'utf-8'));

const catalog = parseSceneCatalog(readJson('/sample-data/nuscenes/scenes.json'));
if (!catalog) throw new Error('scenes.json did not parse');

const framesByScene = new Map<string, Frame[]>();
const predictions: PredictionSet = { model: { name: '' }, cameras: [], byFrame: new Map() };
for (const scene of catalog.scenes) {
  framesByScene.set(scene.name, parseNuScenes(readJson(scene.framesUrl)));
  if (!scene.predictionsUrl) continue;
  const set = parsePredictions(readJson(scene.predictionsUrl));
  if (!set) throw new Error(`predictions of ${scene.name} did not parse`);
  predictions.model = set.model;
  for (const camera of set.cameras) {
    if (!predictions.cameras.includes(camera)) predictions.cameras.push(camera);
  }
  for (const [frameId, byCamera] of set.byFrame) predictions.byFrame.set(frameId, byCamera);
}
const allFrames = [...framesByScene.values()].flat();
const RULES = { minScore: DEFAULT_MIN_SCORE, iouThreshold: IOU_THRESHOLD };
const counts = (frames: Frame[]) => {
  const s = evaluateFrames(frames, predictions, RULES).summary;
  return [s.found, s.missed, s.falseAlarm, s.notScored];
};

describe('shipped scene files: what is there', () => {
  it('is all of nuScenes-mini: 10 scenes, 404 frames, 18,538 boxes, 2,424 photos', () => {
    expect(catalog.scenes).toHaveLength(10);
    expect(allFrames).toHaveLength(404);
    expect(allFrames.reduce((n, f) => n + f.detections3D.length, 0)).toBe(18538);
    expect(allFrames.reduce((n, f) => n + (f.cameras?.length ?? 0), 0)).toBe(2424);
  });

  it('the catalog agrees with each scene file (frame and box counts)', () => {
    for (const scene of catalog.scenes) {
      const frames = framesByScene.get(scene.name) ?? [];
      expect(frames).toHaveLength(scene.frameCount);
      expect(frames.reduce((n, f) => n + f.detections3D.length, 0)).toBe(scene.boxCount);
    }
  });

  it('frame ids are unique across scenes (a saved review points at one frame)', () => {
    expect(new Set(allFrames.map((f) => f.id)).size).toBe(allFrames.length);
  });

  it('the three night scenes are the ones nuScenes describes as night — and they are ONE drive', () => {
    const night = catalog.scenes.filter((s) => s.night);
    expect(night.map((s) => s.name)).toEqual(['scene-1077', 'scene-1094', 'scene-1100']);
    expect(new Set(night.map((s) => s.log?.name)).size).toBe(1);
    // The seven day scenes come from seven different drives.
    const day = catalog.scenes.filter((s) => !s.night);
    expect(new Set(day.map((s) => s.log?.name)).size).toBe(7);
  });

  it('every photo, thumbnail and points file the frames name exists', () => {
    const missing: string[] = [];
    for (const frame of allFrames) {
      const paths = [
        ...(frame.cameras ?? []).map((view) => view.imageUrl),
        frame.thumbnailUrl ?? '(no thumbnail)',
        frame.pointCloudSource?.url ?? '(no points file)',
      ];
      for (const path of paths) if (!existsSync(fileOf(path))) missing.push(path);
    }
    expect(missing).toEqual([]);
  });

  it('photos keep the ORIGINAL pixel size as their coordinate system (the files are smaller)', () => {
    expect(catalog.photo).toEqual({ width: 960, height: 540, sourceWidth: 1600, sourceHeight: 900 });
    for (const frame of allFrames) {
      for (const view of frame.cameras ?? []) {
        expect([view.imageWidth, view.imageHeight]).toEqual([1600, 900]);
      }
    }
  });

  it('a points file holds the number of points the frames file says, for the frame it names', () => {
    // One frame per scene (reading all 404 files would only repeat the check).
    for (const frames of framesByScene.values()) {
      const frame = frames[Math.floor(frames.length / 2)];
      const source = frame.pointCloudSource;
      if (!source) throw new Error(`frame ${frame.id} has no points file`);
      const raw = readJson(source.url) as { token: string };
      expect(raw.token).toBe(frame.id);
      expect(parseNuScenesPoints(raw)).toHaveLength(source.count ?? -1);
      expect(frame.pointCloud).toEqual([]);
    }
  });
});

describe('shipped scene files: the numbers the project has reported before', () => {
  // Frames 1–10 of scene-0916 are the ten frames the app shipped before F7.
  const firstTen = (framesByScene.get('scene-0916') ?? []).slice(0, 10);

  it('the ten frames shipped before F7: 349 / 182 / 107 / 180 over their 60 photos', () => {
    expect(counts(firstTen)).toEqual([349, 182, 107, 180]);
  });

  it('…and 91 / 83 / 13 / 26 in the front camera', () => {
    const front = evaluateFrames(firstTen, predictions, RULES).byCamera.find((c) => c.camera === 'CAM_FRONT');
    const s = front?.summary;
    expect([s?.found, s?.missed, s?.falseAlarm, s?.notScored]).toEqual([91, 83, 13, 26]);
  });

  it('those ten frames have 583 boxes (the review total before F7)', () => {
    expect(firstTen.reduce((n, f) => n + f.detections3D.length, 0)).toBe(583);
  });

  it('all 404 frames: 6,726 / 5,292 / 3,514 / 5,278 over 2,424 photos', () => {
    const evaluation = evaluateFrames(allFrames, predictions, RULES);
    expect(evaluation.evaluatedPhotos).toBe(2424);
    expect(counts(allFrames)).toEqual([6726, 5292, 3514, 5278]);
  });

  it('day scenes and night scenes (the comparison the README reports, with its caveats)', () => {
    const framesOf = (night: boolean) =>
      catalog.scenes.filter((s) => s.night === night).flatMap((s) => framesByScene.get(s.name) ?? []);
    const [dayFound, dayMissed] = counts(framesOf(false));
    const [nightFound, nightMissed] = counts(framesOf(true));
    expect([dayFound, dayFound + dayMissed]).toEqual([5711, 8916]); // 64%
    expect([nightFound, nightFound + nightMissed]).toEqual([1015, 3102]); // 33%
  });

  it('the model saw the original photos, not the reduced copies', () => {
    const raw = readJson(catalog.scenes[0].predictionsUrl ?? '') as { model: { photos?: unknown } };
    expect(raw.model.photos).toEqual({ source: 'original', width: 1600, height: 900 });
  });
});

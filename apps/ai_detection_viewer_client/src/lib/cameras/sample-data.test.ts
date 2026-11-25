import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseNuScenes } from '@/lib/nuscenes';
import { CAMERA_DISPLAY_ORDER, DEFAULT_CAMERA } from './names';
import { pickCamera, visibleFraction } from './pick';
import { camerasByObject, camerasSeeing, frameAsCamera } from './views';

/**
 * The six cameras of the SHIPPED sample (`nuscenes.json`, format 1.2).
 *
 * The expected counts were measured independently on the original nuScenes-mini
 * tables (a Python re-implementation of the projection, 2026-11-26, design doc
 * F6 §2.3) before this module existed. If the file is regenerated differently,
 * or the projection rule changes, this fails and the change is visible.
 */
const PUBLIC_DIR = new URL('../../../public/', import.meta.url);
const frames = parseNuScenes(
  JSON.parse(readFileSync(new URL('sample-data/nuscenes/nuscenes.json', PUBLIC_DIR), 'utf-8')),
);
const DATASET_ORDER = [
  'CAM_FRONT',
  'CAM_FRONT_LEFT',
  'CAM_FRONT_RIGHT',
  'CAM_BACK',
  'CAM_BACK_LEFT',
  'CAM_BACK_RIGHT',
];
const shortId = (frameIndex: number, prefix: string): string => {
  const box = frames[frameIndex].detections3D.find((d) => d.id.startsWith(prefix));
  if (!box) throw new Error(`no box ${prefix} in frame ${frameIndex + 1}`);
  return box.id;
};

describe('shipped sample: six cameras', () => {
  it('every frame has the six cameras, the default one first', () => {
    expect(frames).toHaveLength(10);
    for (const frame of frames) {
      expect(frame.cameras?.map((v) => v.name)).toEqual(DATASET_ORDER);
      expect(frame.cameras?.[0].name).toBe(DEFAULT_CAMERA);
      expect(frame.detections2D).toBe(frame.cameras?.[0].detections2D);
    }
    expect([...CAMERA_DISPLAY_ORDER].sort()).toEqual([...DATASET_ORDER].sort());
  });

  it('all 60 photos are 1600×900, distinct, and exist on disk', () => {
    const views = frames.flatMap((f) => f.cameras ?? []);
    expect(views).toHaveLength(60);
    expect(new Set(views.map((v) => v.imageUrl)).size).toBe(60);
    for (const view of views) {
      expect([view.imageWidth, view.imageHeight]).toEqual([1600, 900]);
      expect(view.imageUrl.startsWith(`/sample-data/nuscenes/${view.name.toLowerCase()}/`)).toBe(true);
      expect(existsSync(new URL(view.imageUrl.slice(1), PUBLIC_DIR))).toBe(true);
    }
  });

  it('boxes per camera: 200 / 79 / 184 / 55 / 36 / 169', () => {
    const perCamera = DATASET_ORDER.map((name) =>
      frames.reduce((sum, f) => sum + frameAsCamera(f, name).detections2D.length, 0),
    );
    expect(perCamera).toEqual([200, 79, 184, 55, 36, 169]);
  });

  it('of the 583 boxes, 443 are seen by one camera, 140 by two, none by no camera', () => {
    const counts = new Map<number, number>();
    let boxes = 0;
    for (const frame of frames) {
      const byObject = camerasByObject(frame);
      for (const box of frame.detections3D) {
        boxes += 1;
        const n = byObject.get(box.id)?.length ?? 0;
        counts.set(n, (counts.get(n) ?? 0) + 1);
      }
    }
    expect(boxes).toBe(583);
    expect(Object.fromEntries(counts)).toEqual({ 1: 443, 2: 140 });
  });

  it('two cameras that share an object are always neighbours on the car', () => {
    const pairs = new Map<string, number>();
    for (const frame of frames) {
      for (const names of camerasByObject(frame).values()) {
        if (names.length === 2) pairs.set(names.join('+'), (pairs.get(names.join('+')) ?? 0) + 1);
      }
    }
    expect(Object.fromEntries(pairs)).toEqual({
      'CAM_FRONT_RIGHT+CAM_BACK_RIGHT': 61,
      'CAM_FRONT+CAM_FRONT_RIGHT': 33,
      'CAM_FRONT+CAM_FRONT_LEFT': 24,
      'CAM_BACK+CAM_BACK_RIGHT': 9,
      'CAM_FRONT_LEFT+CAM_BACK_LEFT': 7,
      'CAM_BACK+CAM_BACK_LEFT': 6,
    });
  });

  it('every 2D box belongs to a 3D box of its frame, once per view (Rule #1)', () => {
    for (const frame of frames) {
      const ids3D = new Set(frame.detections3D.map((d) => d.id));
      for (const view of frame.cameras ?? []) {
        const ids = view.detections2D.map((d) => d.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids.every((id) => ids3D.has(id))).toBe(true);
      }
    }
  });

  it('every projected box has its eight corners and a visible share in (0, 1]', () => {
    for (const frame of frames) {
      for (const view of frame.cameras ?? []) {
        for (const detection of view.detections2D) {
          expect(detection.corners).toHaveLength(8);
          const fraction = visibleFraction(detection);
          expect(fraction).toBeGreaterThan(0);
          expect(fraction).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe('shipped sample: which camera to show (frame 6)', () => {
  const frame = frames[5];
  const bus = shortId(5, '8a26f7'); // behind the car: rear + rear-right cameras
  const edgeCar = shortId(5, 'e3f3d9'); // cut off at the right edge of the front photo

  it('the bus is seen by the two rear cameras; the rear camera shows more of it', () => {
    expect(camerasSeeing(frame, bus)).toEqual(['CAM_BACK', 'CAM_BACK_RIGHT']);
    expect(pickCamera(frame, bus, 'CAM_FRONT')).toBe('CAM_BACK');
    expect(pickCamera(frame, bus, 'CAM_BACK_RIGHT')).toBe('CAM_BACK_RIGHT'); // already in view
  });

  it('the car at the edge of the front photo is whole in the front-right photo', () => {
    expect(camerasSeeing(frame, edgeCar)).toEqual(['CAM_FRONT', 'CAM_FRONT_RIGHT']);
    const front = frameAsCamera(frame, 'CAM_FRONT').detections2D.find((d) => d.id === edgeCar);
    const right = frameAsCamera(frame, 'CAM_FRONT_RIGHT').detections2D.find((d) => d.id === edgeCar);
    expect(front && visibleFraction(front)).toBeLessThan(0.5);
    expect(right && visibleFraction(right)).toBe(1);
    expect(pickCamera(frame, edgeCar, 'CAM_BACK')).toBe('CAM_FRONT_RIGHT');
    expect(pickCamera(frame, edgeCar, 'CAM_FRONT')).toBe('CAM_FRONT'); // stays: it is in view
  });
});

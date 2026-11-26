import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseNuScenes } from '@/lib/nuscenes';
import { readReferenceFramesRaw } from '@/lib/nuscenes/test-helpers';
import { buildFrames } from './build-frames';

const PUBLIC_DIR = new URL('../../../public/', import.meta.url);
const readSample = (path: string): unknown =>
  JSON.parse(readFileSync(new URL(path, PUBLIC_DIR), 'utf-8'));

// The first ten frames of scene-0916 (the reference sample).
const nuscenes: unknown = readReferenceFramesRaw();
const coco = readSample('sample-data/sample.json');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildFrames', () => {
  it('nuScenes: returns exactly what parseNuScenes returns, as the real annotations', () => {
    const built = buildFrames('nuscenes', nuscenes);
    expect(built.planted).toBeNull();
    expect(built.frames).toEqual(parseNuScenes(nuscenes));
    expect(built.frames[0].source).toBe('nuscenes-measured');
  });

  it('COCO: every 2D box gets an estimated 3D box with the same id (Rule #1), never a measured one', () => {
    const built = buildFrames('coco', coco);
    expect(built.planted).toBeNull();
    expect(built.frames.length).toBeGreaterThan(0);
    for (const frame of built.frames) {
      expect(frame.source).not.toBe('nuscenes-measured');
      expect(frame.detections3D.map((d) => d.id)).toEqual(frame.detections2D.map((d) => d.id));
    }
  });

  it('practice: same frames and box ids, some boxes changed, and the answer key comes with them', () => {
    const real = buildFrames('nuscenes', nuscenes);
    const practice = buildFrames('nuscenes', nuscenes, { practice: true });

    expect(practice.planted).not.toBeNull();
    expect(practice.planted?.length).toBeGreaterThan(0);
    expect(practice.frames.map((f) => f.id)).toEqual(real.frames.map((f) => f.id));
    expect(practice.frames).not.toEqual(real.frames);
    // Every planted error points at a box that exists in the practice frames.
    for (const planted of practice.planted ?? []) {
      const frame = practice.frames.find((f) => f.id === planted.frameId);
      expect(frame?.detections3D.some((d) => d.id === planted.objectId)).toBe(true);
    }
  });

  it('practice is deterministic and does not modify the input', () => {
    const before = JSON.stringify(nuscenes);
    const a = buildFrames('nuscenes', nuscenes, { practice: true });
    const b = buildFrames('nuscenes', nuscenes, { practice: true });
    expect(a.planted).toEqual(b.planted);
    expect(a.frames).toEqual(b.frames);
    expect(JSON.stringify(nuscenes)).toBe(before);
  });

  it('the practice flag means nothing for COCO (there are no measured boxes to modify)', () => {
    // COCO's point cloud is generated at random on every call (a visual stand-in,
    // not data), so the comparison is on the boxes.
    const boxes = (built: ReturnType<typeof buildFrames>) =>
      built.frames.map((f) => ({ id: f.id, d2: f.detections2D, d3: f.detections3D }));
    const practice = buildFrames('coco', coco, { practice: true });
    expect(practice.planted).toBeNull();
    expect(boxes(practice)).toEqual(boxes(buildFrames('coco', coco)));
  });

  it('invalid input gives no frames instead of throwing', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const raw of [null, undefined, 'text', 42, {}, { frames: 'no' }]) {
      expect(buildFrames('nuscenes', raw).frames).toEqual([]);
      expect(buildFrames('nuscenes', raw, { practice: true }).frames).toEqual([]);
      expect(buildFrames('coco', raw).frames).toEqual([]);
    }
  });
});

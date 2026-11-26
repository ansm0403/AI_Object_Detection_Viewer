import { describe, expect, it } from 'vitest';
import type { CameraView } from '@/lib/types';
import { preloadOrder, upcomingFrames } from './preload';
import { multiCameraFrame, singleImageFrame, view } from './test-helpers';

const photo = (frame: number, camera: string): CameraView => ({
  ...view(camera),
  imageUrl: `/f${frame}/${camera}.jpg`,
});
const frames = [0, 1, 2, 3].map((i) =>
  multiCameraFrame([photo(i, 'CAM_FRONT'), photo(i, 'CAM_BACK')], `frame-${i}`),
);

describe('preloadOrder', () => {
  it('starts with the current frame, all its cameras, default first', () => {
    expect(preloadOrder(frames, 1, 0)).toEqual(['/f1/CAM_FRONT.jpg', '/f1/CAM_BACK.jpg']);
  });

  it('continues in playback order', () => {
    expect(preloadOrder(frames, 1, 1)).toEqual([
      '/f1/CAM_FRONT.jpg',
      '/f1/CAM_BACK.jpg',
      '/f2/CAM_FRONT.jpg',
      '/f2/CAM_BACK.jpg',
    ]);
  });

  it('wraps around the end, because playback loops', () => {
    expect(preloadOrder(frames, 3, 2)).toEqual([
      '/f3/CAM_FRONT.jpg',
      '/f3/CAM_BACK.jpg',
      '/f0/CAM_FRONT.jpg',
      '/f0/CAM_BACK.jpg',
      '/f1/CAM_FRONT.jpg',
      '/f1/CAM_BACK.jpg',
    ]);
  });

  it('fetches every photo once when asked for more frames than there are', () => {
    for (const ahead of [3, 4, 100, Infinity]) {
      const urls = preloadOrder(frames, 2, ahead);
      expect(urls).toHaveLength(8);
      expect(new Set(urls).size).toBe(8);
      expect(urls[0]).toBe('/f2/CAM_FRONT.jpg');
    }
  });

  it('treats a negative or non-numeric distance as "the current frame only"', () => {
    expect(preloadOrder(frames, 0, -3)).toHaveLength(2);
    expect(preloadOrder(frames, 0, Number.NaN)).toHaveLength(2);
    expect(preloadOrder(frames, 0, 1.9)).toHaveLength(4);
  });

  it('returns nothing for no frames or an index outside them', () => {
    expect(preloadOrder([], 0, 5)).toEqual([]);
    expect(preloadOrder(frames, -1, 5)).toEqual([]);
    expect(preloadOrder(frames, 4, 5)).toEqual([]);
    expect(preloadOrder(frames, 1.5, 5)).toEqual([]);
  });

  it('skips an empty URL and never repeats one', () => {
    const shared = [
      multiCameraFrame([photo(0, 'CAM_FRONT'), { ...view('CAM_BACK'), imageUrl: '' }], 'a'),
      multiCameraFrame([photo(0, 'CAM_FRONT')], 'b'), // same file as frame a
    ];
    expect(preloadOrder(shared, 0, 1)).toEqual(['/f0/CAM_FRONT.jpg']);
  });

  it('handles frames with one image (no cameras)', () => {
    const coco = [singleImageFrame([], 'c0'), singleImageFrame([], 'c1')];
    expect(preloadOrder(coco, 0, 1)).toEqual(['/img/c0.jpg', '/img/c1.jpg']);
  });
});

describe('upcomingFrames', () => {
  const items = ['f0', 'f1', 'f2', 'f3', 'f4'];

  it('is the current frame followed by the next ones in playback order', () => {
    expect(upcomingFrames(items, 1, 2)).toEqual(['f1', 'f2', 'f3']);
  });

  it('wraps around the end and never repeats a frame', () => {
    expect(upcomingFrames(items, 3, 3)).toEqual(['f3', 'f4', 'f0', 'f1']);
    expect(upcomingFrames(items, 3, 99)).toEqual(['f3', 'f4', 'f0', 'f1', 'f2']);
    expect(upcomingFrames(items, 0, Infinity)).toEqual(items);
  });

  it('0, negative or non-numeric distance → only the current frame', () => {
    for (const ahead of [0, -2, Number.NaN]) expect(upcomingFrames(items, 2, ahead)).toEqual(['f2']);
  });

  it('a fractional distance is rounded down', () => {
    expect(upcomingFrames(items, 0, 2.9)).toEqual(['f0', 'f1', 'f2']);
  });

  it('an index outside the list, or an empty list, gives nothing', () => {
    expect(upcomingFrames(items, 5, 2)).toEqual([]);
    expect(upcomingFrames(items, -1, 2)).toEqual([]);
    expect(upcomingFrames(items, 1.5, 2)).toEqual([]);
    expect(upcomingFrames([], 0, 2)).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import type { CameraView } from '@/lib/types';
import { preloadOrder } from './preload';
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

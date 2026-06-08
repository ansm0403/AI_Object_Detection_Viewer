import { describe, it, expect } from 'vitest';
import { AUTOPLAY_INTERVAL_MS, nextFrameIndex } from './autoplay';

describe('nextFrameIndex', () => {
  it('advances a middle frame by one', () => {
    expect(nextFrameIndex(2, 10, { loop: true })).toBe(3);
    expect(nextFrameIndex(0, 10, { loop: false })).toBe(1);
  });

  it('loops from the last frame back to 0 when looping', () => {
    expect(nextFrameIndex(9, 10, { loop: true })).toBe(0);
  });

  it('stops (null) at the last frame when not looping', () => {
    expect(nextFrameIndex(9, 10, { loop: false })).toBeNull();
  });

  it('treats a not-found / negative index as "start from the top"', () => {
    expect(nextFrameIndex(-1, 10, { loop: true })).toBe(0);
    expect(nextFrameIndex(-1, 10, { loop: false })).toBe(0);
  });

  it('handles a single-frame sequence', () => {
    // Looping a 1-frame sequence stays on frame 0; without loop it stops.
    expect(nextFrameIndex(0, 1, { loop: true })).toBe(0);
    expect(nextFrameIndex(0, 1, { loop: false })).toBeNull();
  });

  it('returns null when there are no frames', () => {
    expect(nextFrameIndex(0, 0, { loop: true })).toBeNull();
    expect(nextFrameIndex(-1, 0, { loop: false })).toBeNull();
  });

  it('is defensive against a stale index past the end', () => {
    // e.g. the current frame was replaced by a dataset swap mid-tick.
    expect(nextFrameIndex(15, 10, { loop: true })).toBe(0);
    expect(nextFrameIndex(15, 10, { loop: false })).toBeNull();
  });

  it('exposes the real ~2 Hz keyframe cadence', () => {
    expect(AUTOPLAY_INTERVAL_MS).toBe(500);
  });
});

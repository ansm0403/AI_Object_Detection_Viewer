import { describe, expect, it } from 'vitest';
import { frameHasConfidence } from './frame-has-confidence';

describe('frameHasConfidence', () => {
  it('is true for COCO estimated frames (YOLOv8n prediction scores)', () => {
    expect(frameHasConfidence({ source: 'coco-estimated' })).toBe(true);
  });

  it('is true when `source` is absent (legacy COCO frames, pre-F2)', () => {
    expect(frameHasConfidence({})).toBe(true);
  });

  it('is false for nuScenes measured frames — the 1.0 is a placeholder, not a score (Rule #6)', () => {
    expect(frameHasConfidence({ source: 'nuscenes-measured' })).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { frameBoxesForCamera, selectFollowTarget, type Vec3 } from './camera-framing';
import type { Detection3D } from '@/lib/types';

// Minimal Detection3D fixture — only id + center matter for follow targeting.
const det = (id: string, center: Vec3): Detection3D => ({
  id,
  class: 'car',
  confidence: 1,
  bbox3D: { center, size: [1, 1, 1] },
});

describe('frameBoxesForCamera', () => {
  it('returns the forward-looking fallback for an empty cloud', () => {
    const { position, target } = frameBoxesForCamera([]);
    // Looks toward −z (forward), the opposite of the COCO camera.
    expect(target[2]).toBeLessThan(position[2]);
  });

  it('centers the target on the horizontal mid-point of the cloud', () => {
    const centers: Vec3[] = [
      [-10, 0, -30],
      [10, 0, -10],
    ];
    const { target } = frameBoxesForCamera(centers);
    expect(target[0]).toBeCloseTo(0); // (−10 + 10) / 2
    expect(target[2]).toBeCloseTo(-20); // (−30 + −10) / 2
  });

  it('places the camera behind (+z) and above (+y) the target', () => {
    const centers: Vec3[] = [
      [0, 1, -20],
      [5, 1, -5],
    ];
    const { position, target } = frameBoxesForCamera(centers);
    expect(position[2]).toBeGreaterThan(target[2]); // behind, looking forward
    expect(position[1]).toBeGreaterThan(target[1]); // elevated
  });

  it('keeps the look target near the ground for a flat cloud', () => {
    // All boxes are ~1 m up; the target must not float to the cloud's y-center
    // if that exceeds the ground cap (here it does not, so it tracks cy).
    const { target } = frameBoxesForCamera([[0, 1, -10]]);
    expect(target[1]).toBeLessThanOrEqual(2);
  });

  it('backs the camera farther for a wider cloud', () => {
    const tight = frameBoxesForCamera([
      [-2, 0, -2],
      [2, 0, -2],
    ]);
    const wide = frameBoxesForCamera([
      [-40, 0, -2],
      [40, 0, -2],
    ]);
    const standoff = (f: ReturnType<typeof frameBoxesForCamera>) =>
      f.position[2] - f.target[2];
    expect(standoff(wide)).toBeGreaterThan(standoff(tight));
  });
});

describe('selectFollowTarget (F2-D-1)', () => {
  const detections = [
    det('a', [1, 2, 3]),
    det('b', [-4, 5, -6]),
  ];

  it('returns the selected detection center', () => {
    expect(selectFollowTarget(detections, 'b')).toEqual([-4, 5, -6]);
  });

  it('returns null when nothing is selected', () => {
    expect(selectFollowTarget(detections, null)).toBeNull();
    expect(selectFollowTarget(detections, undefined)).toBeNull();
  });

  it('returns null when the selected id is absent in this frame (fallback to fixed)', () => {
    expect(selectFollowTarget(detections, 'gone')).toBeNull();
  });

  it('returns null for an empty detection list', () => {
    expect(selectFollowTarget([], 'a')).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { frameBoxesForCamera, type Vec3 } from './camera-framing';

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

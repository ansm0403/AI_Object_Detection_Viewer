import { describe, expect, it } from 'vitest';
import type { NuScenesAnnotation, NuScenesPrepped } from '@/lib/nuscenes';
import {
  DEFAULT_PRACTICE_SEED,
  EXPECTED_REASON,
  makePracticeSet,
  scorePractice,
  yawQuatWXYZ,
  type InCameraFn,
  type PlantedError,
} from './practice';
import { withReasonToggled, withVerdict } from './records';
import type { ReviewMap } from './types';

const IDENTITY: [number, number, number, number] = [1, 0, 0, 0];
const K: NuScenesPrepped['frames'][number]['calibratedSensor']['cameraIntrinsic'] = [
  [1000, 0, 800],
  [0, 1000, 450],
  [0, 0, 1],
];

function ann(i: number, extra: Partial<NuScenesAnnotation> = {}): NuScenesAnnotation {
  // Alternate cars (elongated) and pedestrians (near-square footprint).
  const car = i % 2 === 0;
  return {
    instanceToken: `obj-${i}`,
    category: car ? 'vehicle.car' : 'human.pedestrian.adult',
    translation: [i * 3, 10, 1],
    size: car ? [1.9, 4.5, 1.7] : [0.6, 0.7, 1.7], // [w, l, h]
    rotation: IDENTITY,
    annotationToken: `ann-${i}`,
    numLidarPts: 30,
    visibility: 'v80-100',
    ...extra,
  };
}

function sample(frameCount = 3, boxesPerFrame = 20): NuScenesPrepped {
  return {
    version: '1.1',
    frames: Array.from({ length: frameCount }, (_, f) => ({
      token: `frame-${f}`,
      timestamp: f,
      image: { path: '/x.jpg', width: 1600, height: 900 },
      egoPose: { translation: [0, 0, 0], rotation: IDENTITY },
      calibratedSensor: { translation: [0, 0, 0], rotation: IDENTITY, cameraIntrinsic: K },
      annotations: Array.from({ length: boxesPerFrame }, (_, i) => ann(i)),
      lidar: {
        points: [1, 2, 3],
        egoPose: { translation: [0, 0, 0], rotation: IDENTITY },
        calibratedSensor: { translation: [0, 0, 0], rotation: IDENTITY },
      },
    })),
  };
}

const run = (raw: NuScenesPrepped, seed?: number, inCamera?: InCameraFn) => {
  const result = makePracticeSet(raw, { seed, inCamera });
  return { prepped: result.prepped as NuScenesPrepped, planted: result.planted };
};
function find(set: NuScenesPrepped, error: PlantedError): NuScenesAnnotation {
  const found = set.frames
    .find((f) => f.token === error.frameId)
    ?.annotations.find((a) => a.instanceToken === error.objectId);
  if (!found) throw new Error(`annotation not found: ${error.frameId}/${error.objectId}`);
  return found;
}
const original = (raw: NuScenesPrepped, error: PlantedError) => find(raw, error);

describe('makePracticeSet', () => {
  it('is deterministic: same input + seed → the same boxes changed the same way', () => {
    const a = run(sample());
    const b = run(sample());
    expect(a.planted).toEqual(b.planted);
    expect(a.prepped).toEqual(b.prepped);
    expect(run(sample(), DEFAULT_PRACTICE_SEED).planted).toEqual(a.planted);
  });

  it('a different seed plants a different set', () => {
    expect(run(sample(), 7).planted).not.toEqual(run(sample(), 8).planted);
  });

  it('never mutates the input', () => {
    const raw = sample();
    const snapshot = JSON.parse(JSON.stringify(raw));
    run(raw);
    expect(raw).toEqual(snapshot);
  });

  it('plants about 10% of each frame, each on a distinct box', () => {
    const { planted } = run(sample(3, 20));
    for (const frameId of ['frame-0', 'frame-1', 'frame-2']) {
      const inFrame = planted.filter((p) => p.frameId === frameId);
      expect(inFrame).toHaveLength(2);
      expect(new Set(inFrame.map((p) => p.objectId)).size).toBe(2);
    }
  });

  it('changes ONLY the planted boxes; ids, tokens and LiDAR stay as they were', () => {
    const raw = sample();
    const { prepped, planted } = run(raw);
    const plantedKeys = new Set(planted.map((p) => `${p.frameId}/${p.objectId}`));
    prepped.frames.forEach((frame, f) => {
      expect(frame.lidar).toBe(raw.frames[f].lidar); // shared, untouched
      frame.annotations.forEach((a, i) => {
        const before = raw.frames[f].annotations[i];
        expect(a.instanceToken).toBe(before.instanceToken);
        expect(a.annotationToken).toBe(before.annotationToken);
        if (plantedKeys.has(`${frame.token}/${a.instanceToken}`)) expect(a).not.toEqual(before);
        else expect(a).toBe(before);
      });
    });
  });

  it('only plants in boxes with enough LiDAR points to be checkable', () => {
    const raw = sample(1, 20);
    raw.frames[0].annotations = raw.frames[0].annotations.map((a, i) =>
      i < 17 ? { ...a, numLidarPts: 2 } : a,
    );
    const { planted } = run(raw);
    expect(planted.length).toBeGreaterThan(0);
    for (const p of planted) expect(original(raw, p).numLidarPts).toBeGreaterThanOrEqual(5);
  });

  it('plants nothing in a frame where no box is checkable', () => {
    const raw = sample(1, 10);
    raw.frames[0].annotations = raw.frames[0].annotations.map((a) => ({ ...a, numLidarPts: 0 }));
    expect(run(raw).planted).toEqual([]);
  });

  it('falls back to every box when the data has no LiDAR counts (format 1.0)', () => {
    const raw = sample(1, 20);
    raw.frames[0].annotations = raw.frames[0].annotations.map((a) => {
      const copy = { ...a };
      delete copy.numLidarPts;
      return copy;
    });
    expect(run(raw).planted).toHaveLength(2);
  });

  it('each kind of error changes exactly what it says', () => {
    // Many frames so that every kind appears at least once.
    const raw = sample(40, 20);
    const { prepped, planted } = run(raw);
    const kinds = new Set(planted.map((p) => p.kind));
    expect(kinds).toEqual(new Set(['position', 'size', 'heading', 'class']));

    for (const error of planted) {
      const before = original(raw, error);
      const after = find(prepped, error);
      const moved = Math.hypot(
        after.translation[0] - before.translation[0],
        after.translation[1] - before.translation[1],
      );
      switch (error.kind) {
        case 'position':
          expect(moved).toBeGreaterThanOrEqual(1.0 - 1e-9);
          expect(moved).toBeLessThanOrEqual(1.6 + 1e-9);
          expect(after.translation[2]).toBe(before.translation[2]); // stays on the ground
          expect(after.size).toEqual(before.size);
          expect(after.rotation).toEqual(before.rotation);
          expect(after.category).toBe(before.category);
          break;
        case 'size': {
          const factor = after.size[0] / before.size[0];
          expect(factor > 1.4 || factor < 0.7).toBe(true);
          expect(after.size[1] / before.size[1]).toBeCloseTo(factor, 9);
          expect(after.size[2] / before.size[2]).toBeCloseTo(factor, 9);
          // The bottom face keeps its height: centre z − h/2 is unchanged.
          expect(after.translation[2] - after.size[2] / 2).toBeCloseTo(
            before.translation[2] - before.size[2] / 2,
            9,
          );
          expect(moved).toBe(0);
          break;
        }
        case 'heading': {
          expect(after.rotation).not.toEqual(before.rotation);
          expect(Math.hypot(...after.rotation)).toBeCloseTo(1, 9);
          // Identity → pure yaw: angle = 2·atan2(z, w), within 30–60°.
          const degrees = Math.abs((2 * Math.atan2(after.rotation[3], after.rotation[0]) * 180) / Math.PI);
          expect(degrees).toBeGreaterThanOrEqual(30 - 1e-6);
          expect(degrees).toBeLessThanOrEqual(60 + 1e-6);
          expect(after.translation).toEqual(before.translation);
          expect(after.size).toEqual(before.size);
          // Only elongated boxes (cars here) get a heading error.
          expect(before.category).toBe('vehicle.car');
          break;
        }
        case 'class':
          expect(after.category).not.toBe(before.category);
          expect(after.translation).toEqual(before.translation);
          expect(after.size).toEqual(before.size);
          break;
      }
      expect(error.detail).not.toBe('');
    }
  });

  it('never turns a small box: heading errors need a long, elongated box', () => {
    const raw = sample(40, 20);
    // Make the pedestrians elongated by RATIO (0.4 × 0.8) but still small.
    for (const frame of raw.frames) {
      frame.annotations = frame.annotations.map((a) =>
        a.category === 'vehicle.car' ? a : { ...a, size: [0.4, 0.8, 1.7] },
      );
    }
    const headings = run(raw).planted.filter((p) => p.kind === 'heading');
    expect(headings.length).toBeGreaterThan(0);
    for (const p of headings) expect(original(raw, p).category).toBe('vehicle.car');
  });

  describe('with camera information', () => {
    // Boxes 0–4 of every frame are in the camera.
    const inCamera: InCameraFn = (_frame, id) => Number(id.split('-')[1]) < 5;

    it('puts class errors only on boxes that are in the camera', () => {
      const raw = sample(40, 20);
      const classErrors = run(raw, undefined, inCamera).planted.filter((p) => p.kind === 'class');
      expect(classErrors.length).toBeGreaterThan(0);
      for (const p of classErrors) expect(inCamera(p.frameId, p.objectId)).toBe(true);
    });

    it('gives half of each frame’s errors (rounded up) to in-camera boxes', () => {
      const { planted } = run(sample(10, 20), undefined, inCamera); // 2 errors per frame
      for (let f = 0; f < 10; f += 1) {
        const inFrame = planted.filter((p) => p.frameId === `frame-${f}`);
        expect(inFrame).toHaveLength(2);
        expect(inFrame.filter((p) => inCamera(p.frameId, p.objectId)).length).toBeGreaterThanOrEqual(1);
      }
    });

    it('accepts an in-camera box as a candidate even with few LiDAR points', () => {
      const raw = sample(1, 20);
      // Nothing has enough points; only the camera makes boxes 0–4 checkable.
      raw.frames[0].annotations = raw.frames[0].annotations.map((a) => ({ ...a, numLidarPts: 1 }));
      expect(run(raw).planted).toEqual([]);
      const { planted } = run(raw, undefined, inCamera);
      expect(planted).toHaveLength(2);
      for (const p of planted) expect(inCamera(p.frameId, p.objectId)).toBe(true);
    });

    it('stays deterministic', () => {
      expect(run(sample(), 3, inCamera).planted).toEqual(run(sample(), 3, inCamera).planted);
    });
  });

  it('passes malformed input through unchanged, with nothing planted', () => {
    for (const bad of [null, 'x', 42, {}, { frames: 'nope' }]) {
      expect(makePracticeSet(bad)).toEqual({ prepped: bad, planted: [] });
    }
  });

  it('skips malformed frames and annotations instead of throwing', () => {
    const raw = sample(2, 10) as unknown as { frames: unknown[] };
    raw.frames[0] = { token: 'broken' }; // no annotations array
    (raw.frames[1] as { annotations: unknown[] }).annotations[0] = { instanceToken: 5 };
    const { planted } = makePracticeSet(raw);
    expect(planted.every((p) => p.frameId === 'frame-1')).toBe(true);
    expect(planted.length).toBeGreaterThan(0);
  });
});

describe('yawQuatWXYZ', () => {
  it('turns the identity by the given angle about z', () => {
    const q = yawQuatWXYZ(IDENTITY, Math.PI / 2);
    expect(q[0]).toBeCloseTo(Math.SQRT1_2, 12);
    expect(q[1]).toBeCloseTo(0, 12);
    expect(q[2]).toBeCloseTo(0, 12);
    expect(q[3]).toBeCloseTo(Math.SQRT1_2, 12);
  });

  it('composes: two quarter turns make a half turn', () => {
    const q = yawQuatWXYZ(yawQuatWXYZ(IDENTITY, Math.PI / 2), Math.PI / 2);
    expect(Math.abs(q[3])).toBeCloseTo(1, 12);
    expect(q[0]).toBeCloseTo(0, 12);
  });

  it('keeps unit length for an arbitrary quaternion', () => {
    const q = yawQuatWXYZ([0.5, 0.5, 0.5, 0.5], 0.7);
    expect(Math.hypot(...q)).toBeCloseTo(1, 12);
  });
});

describe('scorePractice', () => {
  const planted: PlantedError[] = [
    { frameId: 'f1', objectId: 'a', kind: 'size', detail: '' },
    { frameId: 'f1', objectId: 'b', kind: 'position', detail: '' },
    { frameId: 'f1', objectId: 'c', kind: 'class', detail: '' },
    { frameId: 'f2', objectId: 'a', kind: 'heading', detail: '' },
  ];
  const T = 'T';

  it('everything is pending before any review', () => {
    expect(scorePractice(planted, {})).toEqual({
      planted: 4,
      found: 0,
      foundWithReason: 0,
      missed: 0,
      pending: 4,
      falseAlarms: 0,
    });
  });

  it('classifies found / missed / pending / false alarm', () => {
    let reviews: ReviewMap = {};
    reviews = withVerdict(reviews, 'f1', 'a', 'rejected', T); // found
    reviews = withVerdict(reviews, 'f1', 'b', 'approved', T); // missed
    reviews = withVerdict(reviews, 'f1', 'c', 'unsure', T); // pending
    reviews = withVerdict(reviews, 'f1', 'z', 'rejected', T); // false alarm
    reviews = withVerdict(reviews, 'f1', 'y', 'approved', T); // correct approve: not counted
    expect(scorePractice(planted, reviews)).toEqual({
      planted: 4,
      found: 1,
      foundWithReason: 0,
      missed: 1,
      pending: 2, // f1/c (unsure) + f2/a (unreviewed)
      falseAlarms: 1,
    });
  });

  it('credits the reason only when it matches the kind of error', () => {
    let reviews = withVerdict({}, 'f1', 'a', 'rejected', T);
    reviews = withReasonToggled(reviews, 'f1', 'a', 'wrong_position'); // wrong reason
    expect(scorePractice(planted, reviews).foundWithReason).toBe(0);
    reviews = withReasonToggled(reviews, 'f1', 'a', EXPECTED_REASON.size);
    expect(scorePractice(planted, reviews)).toMatchObject({ found: 1, foundWithReason: 1 });
  });

  it('can be limited to one frame', () => {
    let reviews = withVerdict({}, 'f2', 'a', 'rejected', T);
    reviews = withVerdict(reviews, 'f2', 'q', 'rejected', T);
    expect(scorePractice(planted, reviews, 'f1')).toMatchObject({
      planted: 3,
      found: 0,
      pending: 3,
      falseAlarms: 0,
    });
    expect(scorePractice(planted, reviews, 'f2')).toMatchObject({
      planted: 1,
      found: 1,
      falseAlarms: 1,
    });
  });

  it('the same object in another frame is a separate case', () => {
    // f2/a is planted, but only f1/a was rejected.
    const reviews = withVerdict({}, 'f1', 'a', 'rejected', T);
    expect(scorePractice(planted, reviews, 'f2')).toMatchObject({ found: 0, pending: 1 });
  });
});

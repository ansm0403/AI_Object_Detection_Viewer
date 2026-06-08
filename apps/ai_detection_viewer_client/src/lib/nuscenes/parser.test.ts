import { describe, expect, it, vi } from 'vitest';
import { __testing, parseNuScenes } from './parser';
import type { NuScenesAnnotation, NuScenesPrepped } from './types';

// Identity ego + identity sensor means GLOBAL = EGO = CAMERA coords, so the
// expected transforms are hand-checkable. Intrinsic mirrors the projection test.
const IDENTITY_WXYZ: [number, number, number, number] = [1, 0, 0, 0];
const K: [
  [number, number, number],
  [number, number, number],
  [number, number, number],
] = [
  [1000, 0, 800],
  [0, 1000, 450],
  [0, 0, 1],
];

// A box in front of the camera (camera z = 10 > 0): produces 2D + 3D.
const FRONT: NuScenesAnnotation = {
  instanceToken: 'inst-front',
  category: 'vehicle.car',
  translation: [3, 5, 10],
  size: [2, 4, 1.5], // [w, l, h]
  rotation: IDENTITY_WXYZ,
};
// A box behind the camera (camera z = -10): 3D only, no valid 2D.
const BEHIND: NuScenesAnnotation = {
  instanceToken: 'inst-behind',
  category: 'human.pedestrian.adult',
  translation: [0, 0, -10],
  size: [1, 1, 2],
  rotation: IDENTITY_WXYZ,
};

function preppedWith(annotations: NuScenesAnnotation[]): NuScenesPrepped {
  return {
    version: '1.0',
    frames: [
      {
        token: 'sample-token-1',
        timestamp: 1000,
        image: { path: '/sample-data/nuscenes/cam_front/a.jpg', width: 1600, height: 900 },
        egoPose: { translation: [0, 0, 0], rotation: IDENTITY_WXYZ },
        calibratedSensor: {
          translation: [0, 0, 0],
          rotation: IDENTITY_WXYZ,
          cameraIntrinsic: K,
        },
        annotations,
      },
    ],
  };
}

describe('parseNuScenes', () => {
  it('builds one Frame per prepped frame with measured-3D provenance', () => {
    const [frame] = parseNuScenes(preppedWith([FRONT]));
    expect(frame.id).toBe('sample-token-1');
    expect(frame.imageUrl).toBe('/sample-data/nuscenes/cam_front/a.jpg');
    expect(frame.imageWidth).toBe(1600);
    expect(frame.imageHeight).toBe(900);
    expect(frame.source).toBe('nuscenes-measured');
    expect(frame.pointCloud).toEqual([]); // no fake LiDAR points (Rule #6)
  });

  it('shares the instance-derived id between the 2D and 3D box (Rule #1)', () => {
    const [frame] = parseNuScenes(preppedWith([FRONT]));
    expect(frame.detections3D).toHaveLength(1);
    expect(frame.detections2D).toHaveLength(1);
    expect(frame.detections2D[0].id).toBe('inst-front');
    expect(frame.detections3D[0].id).toBe('inst-front');
    // General invariant: every projected 2D box has a matching 3D box id.
    const ids3D = new Set(frame.detections3D.map((d) => d.id));
    for (const d2 of frame.detections2D) expect(ids3D.has(d2.id)).toBe(true);
  });

  it('keeps the 3D box but drops the 2D box when it is behind the camera', () => {
    const [frame] = parseNuScenes(preppedWith([FRONT, BEHIND]));
    expect(frame.detections3D).toHaveLength(2); // both boxes render in 3D
    expect(frame.detections2D).toHaveLength(1); // only the front box projects
    expect(frame.detections2D[0].id).toBe('inst-front');
  });

  it('measures (not fakes) confidence as 1.0 on both boxes (Rule #6)', () => {
    const [frame] = parseNuScenes(preppedWith([FRONT]));
    expect(frame.detections3D[0].confidence).toBe(1);
    expect(frame.detections2D[0].confidence).toBe(1);
  });

  it('applies global→ego→three to the center and reorders size to [l,w,h]', () => {
    const [frame] = parseNuScenes(preppedWith([FRONT]));
    const { center, size, rotation } = frame.detections3D[0].bbox3D;
    // ego (identity) = [3,5,10]; egoToThree → (-y, z, -x) = [-5, 10, -3].
    expect(center[0]).toBeCloseTo(-5, 10);
    expect(center[1]).toBeCloseTo(10, 10);
    expect(center[2]).toBeCloseTo(-3, 10);
    // nuScenes size [w,l,h] = [2,4,1.5] → local [l,w,h] = [4,2,1.5].
    expect(size).toEqual([4, 2, 1.5]);
    // Rotation is always present on measured boxes (a 4-tuple quaternion).
    expect(rotation).toHaveLength(4);
    expect(rotation!.every((n) => Number.isFinite(n))).toBe(true);
  });

  it('maps known nuScenes categories onto the project palette classes', () => {
    const [frame] = parseNuScenes(preppedWith([FRONT, BEHIND]));
    const byId = new Map(frame.detections3D.map((d) => [d.id, d.class]));
    expect(byId.get('inst-front')).toBe('car'); // vehicle.car → car
    expect(byId.get('inst-behind')).toBe('person'); // human.pedestrian.adult → person
  });
});

describe('parseNuScenes defensive behavior', () => {
  it('returns [] and warns on an invalid root', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseNuScenes(null)).toEqual([]);
    expect(parseNuScenes({})).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('skips a malformed annotation but keeps the valid ones in the frame', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bad = { instanceToken: 'x', category: 'vehicle.car', translation: [1, 2], size: [1, 1, 1], rotation: IDENTITY_WXYZ };
    const [frame] = parseNuScenes(
      preppedWith([FRONT, bad as unknown as NuScenesAnnotation]),
    );
    expect(frame.detections3D).toHaveLength(1);
    expect(frame.detections3D[0].id).toBe('inst-front');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('skips a duplicate instance token within a frame', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const [frame] = parseNuScenes(preppedWith([FRONT, { ...FRONT }]));
    expect(frame.detections3D).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('mapCategory', () => {
  it('maps known categories and passes unmapped ones through unchanged', () => {
    expect(__testing.mapCategory('vehicle.car')).toBe('car');
    expect(__testing.mapCategory('vehicle.bicycle')).toBe('bicycle');
    expect(__testing.mapCategory('movable_object.barrier')).toBe(
      'movable_object.barrier',
    );
  });

  it('maps the extra driving classes to clean short names', () => {
    expect(__testing.mapCategory('vehicle.truck')).toBe('truck');
    expect(__testing.mapCategory('vehicle.bus.rigid')).toBe('bus');
    expect(__testing.mapCategory('vehicle.bus.bendy')).toBe('bus');
    expect(__testing.mapCategory('vehicle.motorcycle')).toBe('motorcycle');
  });

  it('leaves rare categories unmapped (no indefinite palette expansion)', () => {
    expect(__testing.mapCategory('static_object.bicycle_rack')).toBe(
      'static_object.bicycle_rack',
    );
  });
});

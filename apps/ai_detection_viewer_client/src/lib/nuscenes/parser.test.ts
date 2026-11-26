import { describe, expect, it, vi } from 'vitest';
import { __testing, parseNuScenes, parseNuScenesPoints } from './parser';
import type { Detection2D, Frame } from '@/lib/types';
import type { NuScenesAnnotation, NuScenesLidar, NuScenesPrepped } from './types';

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

function preppedWith(
  annotations: NuScenesAnnotation[],
  lidar?: NuScenesLidar,
): NuScenesPrepped {
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
        ...(lidar ? { lidar } : {}),
      },
    ],
  };
}

// Identity LiDAR calib + identity LiDAR ego + identity camera ego means
// sensor = global = ego, so only the render axis flip (egoToThree:
// (x,y,z)→(-y,z,-x)) applies — hand-checkable.
function lidarWith(points: number[]): NuScenesLidar {
  return {
    points,
    egoPose: { translation: [0, 0, 0], rotation: IDENTITY_WXYZ },
    calibratedSensor: { translation: [0, 0, 0], rotation: IDENTITY_WXYZ },
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
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(parseNuScenes(null)).toEqual([]);
    expect(parseNuScenes({})).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('skips a malformed annotation but keeps the valid ones in the frame', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
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
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const [frame] = parseNuScenes(preppedWith([FRONT, { ...FRONT }]));
    expect(frame.detections3D).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('parseNuScenes LiDAR point cloud (F2-B)', () => {
  it('fills pointCloud from lidar.points, one Point3D per (x,y,z) triple', () => {
    const [frame] = parseNuScenes(
      preppedWith([FRONT], lidarWith([1, 2, 3, 4, 5, 6])),
    );
    expect(frame.pointCloud).toHaveLength(2); // 6 numbers → 2 points
  });

  it('aligns each point through sensor→global→ego→three (identity poses → axis flip only)', () => {
    const [frame] = parseNuScenes(preppedWith([FRONT], lidarWith([1, 2, 3])));
    // egoToThree([1,2,3]) = (-y, z, -x) = [-2, 3, -1].
    const p = frame.pointCloud[0];
    expect(p.x).toBeCloseTo(-2, 5);
    expect(p.y).toBeCloseTo(3, 5);
    expect(p.z).toBeCloseTo(-1, 5);
  });

  it('LiDAR points carry NO detectionId (environment, always shown)', () => {
    const [frame] = parseNuScenes(preppedWith([FRONT], lidarWith([1, 2, 3, 4, 5, 6])));
    for (const p of frame.pointCloud) expect(p.detectionId).toBeUndefined();
  });

  it('yields an empty pointCloud when the frame has no lidar', () => {
    const [frame] = parseNuScenes(preppedWith([FRONT]));
    expect(frame.pointCloud).toEqual([]);
  });

  it('skips malformed lidar (non-triple-length points) without throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const [frame] = parseNuScenes(preppedWith([FRONT], lidarWith([1, 2, 3, 4])));
    expect(frame.pointCloud).toEqual([]);
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

// F4 — review facts carried per box (prepped format 1.1). They are optional
// extras: an older file without them, or a wrong-typed value, must never cost
// the box itself.
describe('parseNuScenes annotation info (F4)', () => {
  const REVIEWABLE: NuScenesAnnotation = {
    ...FRONT,
    annotationToken: 'ann-front-1',
    numLidarPts: 12,
    visibility: 'v60-80',
  };

  it('carries the box token, LiDAR point count and visibility onto the 3D box', () => {
    const [frame] = parseNuScenes(preppedWith([REVIEWABLE]));
    expect(frame.detections3D[0].annotation).toEqual({
      token: 'ann-front-1',
      lidarPoints: 12,
      visibility: 'v60-80',
    });
  });

  it('keeps 0 LiDAR points as 0 (a real value, not "missing")', () => {
    const [frame] = parseNuScenes(preppedWith([{ ...REVIEWABLE, numLidarPts: 0 }]));
    expect(frame.detections3D[0].annotation?.lidarPoints).toBe(0);
  });

  it('leaves `annotation` off entirely for a format-1.0 box (no new fields)', () => {
    const [frame] = parseNuScenes(preppedWith([FRONT]));
    expect(frame.detections3D).toHaveLength(1);
    expect('annotation' in frame.detections3D[0]).toBe(false);
  });

  it('drops only the wrong-typed fields and still keeps the box', () => {
    const broken = {
      ...FRONT,
      annotationToken: 42,
      numLidarPts: -3,
      visibility: 'v10-20',
    } as unknown as NuScenesAnnotation;
    const partial = {
      ...FRONT,
      instanceToken: 'inst-partial',
      annotationToken: 'ann-2',
      numLidarPts: 1.5,
      visibility: null,
    } as unknown as NuScenesAnnotation;
    const [frame] = parseNuScenes(preppedWith([broken, partial]));
    expect(frame.detections3D).toHaveLength(2);
    expect(frame.detections3D[0].annotation).toBeUndefined();
    expect(frame.detections3D[1].annotation).toEqual({ token: 'ann-2' });
  });

  it('keeps the eight projected corners on the 2D box, bounded by its rectangle', () => {
    // FRONT: centre (3,5,10), [w,l,h] = [2,4,1.5] → local [l,w,h] = [4,2,1.5].
    // Corner 0 = (3−2, 5−1, 10−0.75) = (1, 4, 9.25) with identity poses.
    const [frame] = parseNuScenes(preppedWith([FRONT, BEHIND]));
    expect(frame.detections2D).toHaveLength(1);
    const { corners, bbox } = frame.detections2D[0];
    expect(corners).toHaveLength(8);
    expect(corners![0][0]).toBeCloseTo(800 + 1000 / 9.25, 6);
    expect(corners![0][1]).toBeCloseTo(450 + 4000 / 9.25, 6);
    // Unclamped corners can only lie on or outside the (image-clamped) rectangle's far sides.
    expect(Math.min(...corners!.map((c) => c[0]))).toBeCloseTo(bbox.x, 6);
  });

  it('does not copy the review facts onto the projected 2D box', () => {
    // The verdict is about the 3D box; the 2D box is only its projection.
    const [frame] = parseNuScenes(preppedWith([REVIEWABLE]));
    expect(frame.detections2D).toHaveLength(1);
    expect('annotation' in frame.detections2D[0]).toBe(false);
  });
});

describe('parseNuScenes cameras (F6)', () => {
  // The parser always gives a nuScenes frame at least one camera view.
  const camerasOf = (frame: Frame) => frame.cameras ?? [];
  const cornerOf = (detection: Detection2D) => (detection.corners ?? [])[0];
  // With identity poses GLOBAL = EGO = CAMERA. A camera turned half a turn
  // about its y axis looks the other way: (x, y, z) → (−x, y, −z). So FRONT
  // (z = +10) is in front of the forward camera and behind the rear one, and
  // BEHIND (z = −10) the other way round.
  const HALF_TURN_Y: [number, number, number, number] = [0, 0, 1, 0];
  const camera = (
    channel: string,
    overrides: {
      egoTranslation?: [number, number, number];
      sensorRotation?: [number, number, number, number];
    } = {},
  ) => ({
    channel,
    image: { path: `/sample-data/nuscenes/${channel.toLowerCase()}/a.jpg`, width: 1600, height: 900 },
    egoPose: { translation: overrides.egoTranslation ?? [0, 0, 0], rotation: IDENTITY_WXYZ },
    calibratedSensor: {
      translation: [0, 0, 0] as [number, number, number],
      rotation: overrides.sensorRotation ?? IDENTITY_WXYZ,
      cameraIntrinsic: K,
    },
  });
  const withCameras = (cameras: unknown, annotations = [FRONT, BEHIND]): NuScenesPrepped => {
    const prepped = preppedWith(annotations);
    (prepped.frames[0] as Record<string, unknown>).cameras = cameras;
    return prepped;
  };
  const FORWARD = camera('CAM_FRONT');
  const REAR = camera('CAM_BACK', { sensorRotation: HALF_TURN_Y });

  it('a file without cameras (format 1.0 / 1.1) yields the one camera it always was', () => {
    const [frame] = parseNuScenes(preppedWith([FRONT, BEHIND]));
    expect(frame.cameras).toHaveLength(1);
    expect(camerasOf(frame)[0].name).toBe('CAM_FRONT');
    expect(camerasOf(frame)[0].imageUrl).toBe('/sample-data/nuscenes/cam_front/a.jpg');
    expect(camerasOf(frame)[0].detections2D.map((d) => d.id)).toEqual(['inst-front']);
  });

  it('builds one view per camera, in file order, each with its own photo', () => {
    const [frame] = parseNuScenes(withCameras([FORWARD, REAR]));
    expect(camerasOf(frame).map((v) => v.name)).toEqual(['CAM_FRONT', 'CAM_BACK']);
    expect(camerasOf(frame)[1].imageUrl).toBe('/sample-data/nuscenes/cam_back/a.jpg');
    expect(camerasOf(frame)[1].imageWidth).toBe(1600);
  });

  it('projects each box into the cameras that face it', () => {
    const [frame] = parseNuScenes(withCameras([FORWARD, REAR]));
    expect(camerasOf(frame)[0].detections2D.map((d) => d.id)).toEqual(['inst-front']);
    expect(camerasOf(frame)[1].detections2D.map((d) => d.id)).toEqual(['inst-behind']);
    // Every 3D box is seen by a camera now; with the forward camera alone,
    // inst-behind had no 2D box at all.
    expect(frame.detections3D).toHaveLength(2);
  });

  it('the top-level image fields ARE the first camera (same array, not a copy)', () => {
    const [frame] = parseNuScenes(withCameras([FORWARD, REAR]));
    expect(frame.detections2D).toBe(camerasOf(frame)[0].detections2D);
    expect(frame.imageUrl).toBe(camerasOf(frame)[0].imageUrl);
    expect(frame.imageWidth).toBe(camerasOf(frame)[0].imageWidth);
    expect(frame.imageHeight).toBe(camerasOf(frame)[0].imageHeight);
  });

  it('the first camera gives exactly the 2D boxes the file gave before it listed cameras', () => {
    const [before] = parseNuScenes(preppedWith([FRONT, BEHIND]));
    const [after] = parseNuScenes(withCameras([FORWARD, REAR]));
    expect(after.detections2D).toEqual(before.detections2D);
  });

  it('adding cameras does not move a single 3D box or LiDAR point', () => {
    const lidar = lidarWith([1, 2, 3, 4, 5, 6]);
    const plain = preppedWith([FRONT, BEHIND], lidar);
    const listed = preppedWith([FRONT, BEHIND], lidar);
    // A second camera whose photo was taken with the car 1 m further on.
    (listed.frames[0] as Record<string, unknown>).cameras = [
      FORWARD,
      camera('CAM_BACK', { egoTranslation: [1, 0, 0], sensorRotation: HALF_TURN_Y }),
    ];
    const [before] = parseNuScenes(plain);
    const [after] = parseNuScenes(listed);
    expect(after.detections3D).toEqual(before.detections3D);
    expect(after.pointCloud).toEqual(before.pointCloud);
  });

  it('one object seen by two cameras keeps ONE id in both views (Rule #1)', () => {
    const [frame] = parseNuScenes(withCameras([FORWARD, camera('CAM_FRONT_RIGHT')], [FRONT]));
    const [a, b] = camerasOf(frame);
    expect(a.detections2D[0].id).toBe('inst-front');
    expect(b.detections2D[0].id).toBe('inst-front');
    expect(frame.detections3D[0].id).toBe('inst-front');
  });

  it("projects with each photo's OWN ego pose (the cameras do not fire together)", () => {
    // Same lens, same mounting — but when the second photo was taken the car
    // was 1 m further along x. The box, 10 m ahead, must sit 1 m × (1000 px /
    // 10 m) = 100 px further left in that photo.
    const [frame] = parseNuScenes(
      withCameras([FORWARD, camera('CAM_LATER', { egoTranslation: [1, 0, 0] })], [FRONT]),
    );
    const first = camerasOf(frame)[0].detections2D[0];
    const later = camerasOf(frame)[1].detections2D[0];
    expect(later.bbox.y).toBeCloseTo(first.bbox.y, 6);
    expect(cornerOf(later)[1]).toBeCloseTo(cornerOf(first)[1], 6);
    // Corner 0 is 9.25 m ahead (see the F4 corner test): 1 m → 1000 / 9.25 px.
    expect(cornerOf(first)[0] - cornerOf(later)[0]).toBeCloseTo(1000 / 9.25, 6);
  });

  it('gives every view its own corners (F4 zoom draws the projected box in any camera)', () => {
    const [frame] = parseNuScenes(withCameras([FORWARD, REAR]));
    expect(camerasOf(frame)[1].detections2D[0].corners).toHaveLength(8);
  });

  it('skips a malformed camera and a repeated channel, keeping the valid ones', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const broken = { ...camera('CAM_BROKEN'), calibratedSensor: { translation: [0, 0, 0] } };
    const [frame] = parseNuScenes(
      withCameras([FORWARD, broken, null, 'CAM_BACK', camera('CAM_FRONT'), { ...REAR, channel: '' }, REAR]),
    );
    expect(camerasOf(frame).map((v) => v.name)).toEqual(['CAM_FRONT', 'CAM_BACK']);
    expect(warn).toHaveBeenCalledTimes(5);
    warn.mockRestore();
  });

  it('when the FIRST camera is unusable, the next one becomes the default view', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const [frame] = parseNuScenes(withCameras([{ channel: 'CAM_FRONT' }, REAR]));
    expect(camerasOf(frame).map((v) => v.name)).toEqual(['CAM_BACK']);
    expect(frame.imageUrl).toBe('/sample-data/nuscenes/cam_back/a.jpg');
    expect(frame.detections2D).toBe(camerasOf(frame)[0].detections2D);
    expect(frame.detections2D.map((d) => d.id)).toEqual(['inst-behind']);
    warn.mockRestore();
  });

  it.each([
    ['an empty list', []],
    ['only unusable entries', [null, { channel: 'CAM_FRONT' }]],
    ['something that is not a list', { CAM_FRONT: FORWARD }],
  ])('falls back to the top-level camera for %s — the frame is never lost', (_label, cameras) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const [frame] = parseNuScenes(withCameras(cameras));
    expect(frame.cameras).toHaveLength(1);
    expect(camerasOf(frame)[0].name).toBe('CAM_FRONT');
    expect(frame.detections2D.map((d) => d.id)).toEqual(['inst-front']);
    expect(frame.detections3D).toHaveLength(2);
    warn.mockRestore();
  });

  it('a camera that sees nothing still gets an (empty) view', () => {
    const [frame] = parseNuScenes(withCameras([FORWARD, REAR], [FRONT]));
    expect(camerasOf(frame)[1].detections2D).toEqual([]);
  });
});

describe('parseNuScenes scene files (F7, format 1.3)', () => {
  const POINTS_PATH = '/sample-data/nuscenes/scenes/scene-x/points/sample-token-1.json';
  const THUMB_PATH = '/sample-data/nuscenes/scenes/scene-x/thumb/sample-token-1.webp';

  // The same frame as `preppedWith`, as a scene's frames file writes it: the
  // LiDAR entry is a reference, and there is a thumbnail.
  function sceneFile(lidar: unknown, extra: Record<string, unknown> = {}): unknown {
    const base = preppedWith([FRONT, BEHIND]);
    return {
      version: '1.3',
      scene: 'scene-x',
      frames: [{ ...base.frames[0], lidar, ...extra }],
    };
  }

  it('a frame whose points are in their own file has no inline points, only where to get them', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const [frame] = parseNuScenes(sceneFile({ path: POINTS_PATH, pointCount: 5991 }, { thumb: THUMB_PATH }));
    expect(frame.pointCloud).toEqual([]);
    expect(frame.pointCloudSource).toEqual({ url: POINTS_PATH, count: 5991 });
    expect(frame.thumbnailUrl).toBe(THUMB_PATH);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('the boxes and camera views are exactly those of the single-file frame', () => {
    const [split] = parseNuScenes(sceneFile({ path: POINTS_PATH, pointCount: 2 }));
    const [inline] = parseNuScenes(preppedWith([FRONT, BEHIND], lidarWith([1, 2, 3, 4, 5, 6])));
    expect(split.detections3D).toEqual(inline.detections3D);
    expect(split.detections2D).toEqual(inline.detections2D);
    expect(split.cameras).toEqual(inline.cameras);
  });

  it('a single-file frame (inline points) gets no point source and no thumbnail', () => {
    const [frame] = parseNuScenes(preppedWith([FRONT], lidarWith([1, 2, 3])));
    expect(frame).not.toHaveProperty('pointCloudSource');
    expect(frame).not.toHaveProperty('thumbnailUrl');
    expect(frame.pointCloud).toHaveLength(1);
  });

  it('a broken reference is skipped like any malformed lidar: boxes stay, no points, no source', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const lidar of [
      { path: '', pointCount: 3 },
      { path: POINTS_PATH },
      { path: POINTS_PATH, pointCount: -1 },
      { path: POINTS_PATH, pointCount: 2.5 },
      { pointCount: 3 },
    ]) {
      const [frame] = parseNuScenes(sceneFile(lidar));
      expect(frame.pointCloud).toEqual([]);
      expect(frame).not.toHaveProperty('pointCloudSource');
      expect(frame.detections3D).toHaveLength(2);
    }
    expect(warn).toHaveBeenCalledTimes(5);
    warn.mockRestore();
  });

  it('a wrong-typed thumbnail is dropped, the frame is kept', () => {
    for (const thumb of [42, '', null, { path: THUMB_PATH }]) {
      const [frame] = parseNuScenes(sceneFile({ path: POINTS_PATH, pointCount: 1 }, { thumb }));
      expect(frame).not.toHaveProperty('thumbnailUrl');
      expect(frame.detections3D).toHaveLength(2);
    }
  });
});

describe('parseNuScenesPoints (F7)', () => {
  // A non-identity setup, so the test would notice a pose being ignored or the
  // wrong one being used: the car moved 2 m between the LiDAR sweep and the photo.
  const lidar: NuScenesLidar = {
    points: [1, 2, 3, -4, 5, 0.5, 10, -20, 1.25],
    egoPose: { translation: [100, 50, 0], rotation: [0.9659258, 0, 0, 0.2588190] },
    calibratedSensor: { translation: [0.9, 0, 1.8], rotation: [0.7071068, 0, 0, -0.7071068] },
  };
  const frameEgoPose = { translation: [101.7, 51, 0] as [number, number, number], rotation: [0.9659258, 0, 0, 0.2588190] as [number, number, number, number] };

  function inlineFrame(): NuScenesPrepped {
    const base = preppedWith([FRONT]);
    return { version: '1.2', frames: [{ ...base.frames[0], egoPose: frameEgoPose, lidar }] };
  }

  it('gives exactly the points the single-file parser gives for the same values', () => {
    const [frame] = parseNuScenes(inlineFrame());
    const points = parseNuScenesPoints({ token: 'sample-token-1', frameEgoPose, lidar });
    expect(points).toEqual(frame.pointCloud);
    expect(points).toHaveLength(3);
    // …and they are really transformed (not the raw sensor values).
    expect(points?.[0]).not.toEqual({ x: 1, y: 2, z: 3 });
  });

  it('uses the FRAME ego pose from the file (a different pose moves the points)', () => {
    const here = parseNuScenesPoints({ token: 't', frameEgoPose, lidar });
    const moved = parseNuScenesPoints({
      token: 't',
      frameEgoPose: { ...frameEgoPose, translation: [103.7, 51, 0] },
      lidar,
    });
    expect(moved).not.toEqual(here);
  });

  it('points carry no detectionId (environment points)', () => {
    const points = parseNuScenesPoints({ token: 't', frameEgoPose, lidar });
    for (const point of points ?? []) expect(point).not.toHaveProperty('detectionId');
  });

  it('a valid file with zero points gives an empty list, not null', () => {
    expect(parseNuScenesPoints({ token: 't', frameEgoPose, lidar: { ...lidar, points: [] } })).toEqual([]);
  });

  it('returns null and warns for anything that is not a points file', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const bad: unknown[] = [
      null,
      undefined,
      'text',
      [1, 2, 3],
      {},
      { token: 't', frameEgoPose }, // no lidar
      { token: 't', lidar }, // no frame pose
      { frameEgoPose, lidar }, // no token
      { token: 't', frameEgoPose, lidar: { ...lidar, points: [1, 2, 3, 4] } }, // not triples
      { token: 't', frameEgoPose, lidar: { ...lidar, points: [1, 2, 'x'] } },
      { token: 't', frameEgoPose: { translation: [0, 0], rotation: [1, 0, 0, 0] }, lidar },
      // A frames-file reference is not a points file.
      { token: 't', frameEgoPose, lidar: { path: '/p.json', pointCount: 3 } },
    ];
    for (const raw of bad) expect(parseNuScenesPoints(raw)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(bad.length);
    warn.mockRestore();
  });
});

describe('parseNuScenesPoints — the frame it is for (Edge_F#7 Case 3)', () => {
  const lidar = lidarWith([1, 2, 3]);
  const frameEgoPose = { translation: [0, 0, 0] as [number, number, number], rotation: IDENTITY_WXYZ };

  it('accepts a file that names the expected frame', () => {
    expect(parseNuScenesPoints({ token: 'frame-a', frameEgoPose, lidar }, 'frame-a')).toHaveLength(1);
  });

  it('rejects a file that names another frame, with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(parseNuScenesPoints({ token: 'frame-b', frameEgoPose, lidar }, 'frame-a')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('does not check the frame when none is expected', () => {
    expect(parseNuScenesPoints({ token: 'anything', frameEgoPose, lidar })).toHaveLength(1);
  });
});

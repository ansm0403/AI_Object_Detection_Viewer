import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  egoQuatToThree,
  egoToThree,
  globalQuatToEgo,
  globalToEgo,
  nuSizeToLocal,
  quatNuToThree,
  sensorToGlobal,
  type Pose,
  type QuatXYZW,
  type Vec3,
} from './transforms';

// nuScenes identity quaternion (w-first) and a +90° yaw about the up-axis (z).
// cos45 = sin45 = 0.70710678…
const IDENTITY_WXYZ: [number, number, number, number] = [1, 0, 0, 0];
const YAW90_WXYZ: [number, number, number, number] = [
  Math.SQRT1_2,
  0,
  0,
  Math.SQRT1_2,
];

function applyQuat(q: QuatXYZW, v: Vec3): Vec3 {
  const out = new THREE.Vector3(v[0], v[1], v[2]).applyQuaternion(
    new THREE.Quaternion(q[0], q[1], q[2], q[3]),
  );
  return [out.x, out.y, out.z];
}

function expectVecClose(actual: Vec3, expected: Vec3) {
  for (let i = 0; i < 3; i++) {
    expect(actual[i]).toBeCloseTo(expected[i], 10);
  }
}

describe('quatNuToThree', () => {
  it('reorders [w, x, y, z] → [x, y, z, w]', () => {
    expect(quatNuToThree([0.1, 0.2, 0.3, 0.4])).toEqual([0.2, 0.3, 0.4, 0.1]);
  });

  it('returns Three.js identity [0,0,0,1] when rotation is absent', () => {
    expect(quatNuToThree(undefined)).toEqual([0, 0, 0, 1]);
  });

  it('maps nuScenes identity [1,0,0,0] → Three.js identity [0,0,0,1]', () => {
    expect(quatNuToThree(IDENTITY_WXYZ)).toEqual([0, 0, 0, 1]);
  });
});

describe('globalToEgo', () => {
  it('with identity ego rotation, subtracts the ego translation', () => {
    // ego at (10,20,0), no rotation → global (13,24,5) is (3,4,5) from the car.
    const ego = globalToEgo([13, 24, 5], {
      translation: [10, 20, 0],
      rotation: IDENTITY_WXYZ,
    });
    expectVecClose(ego, [3, 4, 5]);
  });

  it('undoes the ego yaw (a point 1 m ahead of a +90°-yawed car)', () => {
    // The car is yawed +90° about z, so its forward (+x) now points along
    // global +y. A point at global (0,1,0) is therefore 1 m straight ahead →
    // ego (1,0,0). globalToEgo applies R_ego⁻¹ (a −90° yaw).
    const ego = globalToEgo([0, 1, 0], {
      translation: [0, 0, 0],
      rotation: YAW90_WXYZ,
    });
    expectVecClose(ego, [1, 0, 0]);
  });
});

describe('globalQuatToEgo', () => {
  it('identity box under identity ego → identity (Three.js order)', () => {
    expect(globalQuatToEgo(IDENTITY_WXYZ, IDENTITY_WXYZ)).toEqual([0, 0, 0, 1]);
  });

  it('cancels the ego yaw when box and ego share the same global yaw', () => {
    // A box yawed the same +90° as the car has zero relative rotation in ego.
    const q = globalQuatToEgo(YAW90_WXYZ, YAW90_WXYZ);
    expectVecClose([q[0], q[1], q[2]], [0, 0, 0]);
    expect(q[3]).toBeCloseTo(1, 10);
  });
});

describe('egoToThree (axis flip (x,y,z)→(-y,z,-x))', () => {
  it('maps a sample point', () => {
    // ego: 1 m forward, 2 m left, 3 m up → three: x=-2, y=3 (up), z=-1.
    expect(egoToThree([1, 2, 3])).toEqual([-2, 3, -1]);
  });

  it('sends ego up (z) to three up (y)', () => {
    expect(egoToThree([0, 0, 1])).toEqual([-0, 1, -0]);
  });

  it('sends ego forward (x) into the screen (three -z)', () => {
    expect(egoToThree([1, 0, 0])).toEqual([-0, 0, -1]);
  });
});

describe('egoQuatToThree', () => {
  // Operator identity that the function must satisfy for boxes to render right:
  //   R_flip · (q_ego · u) === (q_flip · q_ego) · u   for every local vector u.
  // i.e. flipping a rotated vector == rotating by the flipped quaternion.
  const probes: Vec3[] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [0.3, -0.7, 0.5],
  ];

  it('identity ego orientation → applying it equals the plain axis flip', () => {
    const qThree = egoQuatToThree([0, 0, 0, 1]);
    for (const u of probes) {
      expectVecClose(applyQuat(qThree, u), egoToThree(u));
    }
  });

  it('commutes the axis flip with an arbitrary ego orientation', () => {
    const qEgo = quatNuToThree(YAW90_WXYZ); // some non-trivial ego orientation
    const qThree = egoQuatToThree(qEgo);
    for (const u of probes) {
      const lhs = egoToThree(applyQuat(qEgo, u)); // R_flip · (q_ego · u)
      const rhs = applyQuat(qThree, u); // (q_flip · q_ego) · u
      expectVecClose(rhs, lhs);
    }
  });
});

describe('nuSizeToLocal', () => {
  it('reorders nuScenes [w, l, h] → local-axis [l, w, h]', () => {
    expect(nuSizeToLocal([2, 4, 1.5])).toEqual([4, 2, 1.5]);
  });
});

describe('sensorToGlobal (F2-B — LiDAR sensor → global)', () => {
  it('identity poses with zero translation → input unchanged', () => {
    const g = sensorToGlobal(
      [2, -3, 4],
      { translation: [0, 0, 0], rotation: IDENTITY_WXYZ },
      { translation: [0, 0, 0], rotation: IDENTITY_WXYZ },
    );
    expectVecClose(g, [2, -3, 4]);
  });

  it('with identity rotations, adds the calib then the ego translation', () => {
    const g = sensorToGlobal(
      [1, 1, 1],
      { translation: [1, 2, 3], rotation: IDENTITY_WXYZ },
      { translation: [10, 0, 0], rotation: IDENTITY_WXYZ },
    );
    expectVecClose(g, [12, 3, 4]);
  });

  it('applies the sensor mount, then the +90° ego yaw, then the car position', () => {
    const calib: Pose = { translation: [1, 0, 0], rotation: IDENTITY_WXYZ };
    const ego: Pose = { translation: [10, 20, 0], rotation: YAW90_WXYZ };
    // p_ego = R_calib·[2,0,0] + [1,0,0] = [3,0,0]; ego yaw90 sends x→y → [0,3,0];
    // + car position [10,20,0] = [10,23,0].
    expectVecClose(sensorToGlobal([2, 0, 0], calib, ego), [10, 23, 0]);
  });

  it('round-trips: globalToEgo(sensorToGlobal(p, calib, ego), ego) recovers the sensor→ego point', () => {
    // This is the property the alignment relies on: routing a LiDAR point through
    // GLOBAL and back into an ego frame must cleanly undo the ego hop, leaving
    // only the sensor→ego (calibration) part. (In the app the two ego poses
    // differ — LiDAR vs camera timestamp — which is exactly the offset GLOBAL
    // routing corrects; here we use one ego to assert the inverse is exact.)
    const calib: Pose = { translation: [1, 0, 0], rotation: IDENTITY_WXYZ };
    const ego: Pose = { translation: [10, 20, 0], rotation: YAW90_WXYZ };
    const pSensor: Vec3 = [2, 0, 0];
    const backToEgo = globalToEgo(sensorToGlobal(pSensor, calib, ego), ego);
    expectVecClose(backToEgo, [3, 0, 0]);
  });
});

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { lerpVec3, slerpQuat } from './interpolation';
import type { Vec3, QuatXYZW } from './transforms';

describe('lerpVec3 (F2-D-2)', () => {
  const a: Vec3 = [0, 0, 0];
  const b: Vec3 = [10, -4, 2];

  it('returns the start exactly at t=0', () => {
    expect(lerpVec3(a, b, 0)).toEqual(a);
  });

  it('returns the end exactly at t=1', () => {
    expect(lerpVec3(a, b, 1)).toEqual(b);
  });

  it('returns the midpoint at t=0.5', () => {
    expect(lerpVec3(a, b, 0.5)).toEqual([5, -2, 1]);
  });

  it('clamps t outside [0,1] to the endpoints', () => {
    expect(lerpVec3(a, b, -3)).toEqual(a);
    expect(lerpVec3(a, b, 2)).toEqual(b);
  });
});

describe('slerpQuat (F2-D-2)', () => {
  // Identity and a 90° rotation about z, as [x,y,z,w].
  const id: QuatXYZW = [0, 0, 0, 1];
  const z90 = (() => {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    return [q.x, q.y, q.z, q.w] as QuatXYZW;
  })();

  it('returns the start orientation at t=0', () => {
    const r = slerpQuat(id, z90, 0);
    expect(r[0]).toBeCloseTo(0);
    expect(r[1]).toBeCloseTo(0);
    expect(r[2]).toBeCloseTo(0);
    expect(r[3]).toBeCloseTo(1);
  });

  it('returns the end orientation at t=1', () => {
    const r = slerpQuat(id, z90, 1);
    expect(r[0]).toBeCloseTo(z90[0]);
    expect(r[1]).toBeCloseTo(z90[1]);
    expect(r[2]).toBeCloseTo(z90[2]);
    expect(r[3]).toBeCloseTo(z90[3]);
  });

  it('takes the shortest arc to the half-angle at t=0.5 (45° about z)', () => {
    const r = slerpQuat(id, z90, 0.5);
    const q45 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 4);
    expect(r[0]).toBeCloseTo(q45.x);
    expect(r[1]).toBeCloseTo(q45.y);
    expect(r[2]).toBeCloseTo(q45.z);
    expect(r[3]).toBeCloseTo(q45.w);
  });

  it('returns a unit (normalized) quaternion', () => {
    const r = slerpQuat(id, z90, 0.37);
    const mag = Math.hypot(r[0], r[1], r[2], r[3]);
    expect(mag).toBeCloseTo(1);
  });

  it('interpolating identity with identity stays identity', () => {
    expect(slerpQuat(id, id, 0.5)).toEqual([0, 0, 0, 1]);
  });
});

'use client';

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Point3D } from '@/lib/types';

type Props = {
  points: Point3D[];
  size?: number;
  color?: string;
};

export function PointCloud({ points, size = 0.04, color = '#cbd5f5' }: Props) {
  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i++) {
      positions[i * 3] = points[i].x;
      positions[i * 3 + 1] = points[i].y;
      positions[i * 3 + 2] = points[i].z;
    }
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geom;
  }, [points]);

  const ref = useRef<THREE.Points>(null);

  if (points.length === 0) return null;

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial size={size} color={color} sizeAttenuation />
    </points>
  );
}

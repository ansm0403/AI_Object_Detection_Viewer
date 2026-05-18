'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Point3D } from '@/lib/types';

type Props = {
  points: Point3D[];
  // When provided, only points whose `detectionId` is in this set are uploaded
  // to the GPU. `undefined` keeps all points. Edge_#4 Case 5 (Option A).
  visibleIds?: Set<string>;
  size?: number;
  color?: string;
};

export function PointCloud({ points, visibleIds, size = 0.04, color = '#cbd5f5' }: Props) {
  const visiblePoints = useMemo(
    () => (visibleIds ? points.filter((p) => visibleIds.has(p.detectionId)) : points),
    [points, visibleIds],
  );

  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(visiblePoints.length * 3);
    for (let i = 0; i < visiblePoints.length; i++) {
      positions[i * 3] = visiblePoints[i].x;
      positions[i * 3 + 1] = visiblePoints[i].y;
      positions[i * 3 + 2] = visiblePoints[i].z;
    }
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geom;
  }, [visiblePoints]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  const ref = useRef<THREE.Points>(null);

  if (visiblePoints.length === 0) return null;

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial size={size} color={color} sizeAttenuation />
    </points>
  );
}

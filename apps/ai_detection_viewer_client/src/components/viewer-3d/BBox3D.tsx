'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Detection3D } from '@/lib/types';

const CLASS_COLORS: Record<string, string> = {
  person: '#4ade80',
  bicycle: '#facc15',
  car: '#f87171',
};
const DEFAULT_COLOR = '#60a5fa';

type Props = {
  detection: Detection3D;
};

export function BBox3D({ detection }: Props) {
  const [sx, sy, sz] = detection.bbox3D.size;

  const geometry = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(sx, sy, sz)),
    [sx, sy, sz],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  const color = CLASS_COLORS[detection.class] ?? DEFAULT_COLOR;

  return (
    <lineSegments position={detection.bbox3D.center} geometry={geometry}>
      <lineBasicMaterial color={color} />
    </lineSegments>
  );
}

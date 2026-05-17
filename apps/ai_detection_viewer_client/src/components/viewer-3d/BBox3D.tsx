'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Detection3D } from '@/lib/types';

const CLASS_COLORS: Record<string, string> = {
  person: '#4ade80',
  bicycle: '#facc15',
  car: '#f87171',
};
const DEFAULT_COLOR = '#60a5fa';
const SELECTED_COLOR = '#ffffff';

// Scale pulse constants — easy to swap for other animation styles later.
const PULSE_FREQUENCY = 4;   // rad/s (~0.64 Hz)
const PULSE_AMPLITUDE = 0.04; // ±4% scale

type Props = {
  detection: Detection3D;
  isSelected?: boolean;
  onClick?: () => void;
};

export function BBox3D({ detection, isSelected = false, onClick }: Props) {
  const [sx, sy, sz] = detection.bbox3D.size;

  const geometry = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(sx, sy, sz)),
    [sx, sy, sz],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    if (isSelected) {
      const pulse = 1 + Math.sin(clock.getElapsedTime() * PULSE_FREQUENCY) * PULSE_AMPLITUDE;
      groupRef.current.scale.setScalar(pulse);
    } else {
      groupRef.current.scale.setScalar(1);
    }
  });

  const wireColor = isSelected ? SELECTED_COLOR : (CLASS_COLORS[detection.class] ?? DEFAULT_COLOR);

  return (
    <group ref={groupRef} position={detection.bbox3D.center}>
      {/* Invisible full-volume mesh for reliable raycasting — line segments alone are hard to click.
          DoubleSide ensures clicks register from inside the bbox volume when the camera orbits in. */}
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
      >
        <boxGeometry args={[sx, sy, sz]} />
        <meshBasicMaterial side={THREE.DoubleSide} transparent opacity={0} />
      </mesh>
      <lineSegments geometry={geometry}>
        <lineBasicMaterial color={wireColor} />
      </lineSegments>
    </group>
  );
}

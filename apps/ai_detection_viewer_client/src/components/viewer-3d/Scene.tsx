'use client';

import { OrbitControls } from '@react-three/drei';
import type { Frame } from '@/lib/types';
import { PointCloud } from './PointCloud';
import { BBox3D } from './BBox3D';

type Props = {
  frame: Frame;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  visibleIds?: Set<string>;
};

// Roughly the midpoint of MIN_Z..MAX_Z in bbox-estimator.ts. Both the camera
// and OrbitControls target use it so the user starts looking at the scene
// rather than past it.
const SCENE_CENTER_Z = 4.5;

export function Scene({ frame, selectedId, onSelect, visibleIds }: Props) {
  const visibleDetections3D = visibleIds
    ? frame.detections3D.filter((d) => visibleIds.has(d.id))
    : frame.detections3D;

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 10]} intensity={0.5} />

      <PointCloud points={frame.pointCloud} visibleIds={visibleIds} />

      {visibleDetections3D.map((d) => (
        <BBox3D
          key={d.id}
          detection={d}
          isSelected={d.id === selectedId}
          onClick={() => onSelect?.(d.id)}
        />
      ))}

      <OrbitControls
        target={[0, 0, SCENE_CENTER_Z]}
        enableDamping
        makeDefault
      />
    </>
  );
}

export { SCENE_CENTER_Z };

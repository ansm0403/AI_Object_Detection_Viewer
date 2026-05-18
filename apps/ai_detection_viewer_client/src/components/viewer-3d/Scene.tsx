'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Grid, OrbitControls } from '@react-three/drei';
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

// Floor plane y. Empirically below estimator's y range so objects sit above
// the grid. Tune in 1-unit steps if objects clip through or float.
const GRID_Y = -3;

export function Scene({ frame, selectedId, onSelect, visibleIds }: Props) {
  const visibleDetections3D = visibleIds
    ? frame.detections3D.filter((d) => visibleIds.has(d.id))
    : frame.detections3D;

  // Grid is a giant Plane mesh — without this, raycast would always hit the
  // floor and `<Canvas onPointerMissed>` would never fire, breaking the
  // "click empty space to deselect" contract from Step 5. Edge_#9.5 Case A.
  const gridRef = useRef<THREE.Mesh>(null);
  useEffect(() => {
    if (gridRef.current) gridRef.current.raycast = () => {};
  }, []);

  return (
    <>
      <fog attach="fog" args={['#0a0a0a', 10, 28]} />

      <ambientLight intensity={0.6} />
      <hemisphereLight args={['#a3a3a3', '#27272a', 0.35]} />
      <directionalLight position={[5, 8, 10]} intensity={0.5} />

      <Grid
        ref={gridRef}
        position={[0, GRID_Y, SCENE_CENTER_Z]}
        args={[40, 40]}
        cellSize={0.5}
        cellThickness={0.6}
        cellColor="#3f3f46"
        sectionSize={2}
        sectionThickness={1}
        sectionColor="#52525b"
        fadeDistance={25}
        fadeStrength={1.2}
        infiniteGrid
      />

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
        rotateSpeed={0.5}
        zoomSpeed={0.6}
        panSpeed={0.6}
      />
    </>
  );
}

export { SCENE_CENTER_Z };

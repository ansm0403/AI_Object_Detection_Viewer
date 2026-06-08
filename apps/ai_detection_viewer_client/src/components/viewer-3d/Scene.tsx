'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Grid, OrbitControls } from '@react-three/drei';
import type { Detection3D, Frame } from '@/lib/types';
import { PointCloud } from './PointCloud';
import { BBox3D } from './BBox3D';

type Props = {
  frame: Frame;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  visibleIds?: Set<string>;
  // (F2-A) OrbitControls look target. Defaults to the COCO scene center; the
  // nuScenes path passes a target fit to the measured box cloud.
  target?: [number, number, number];
  // (F2-A) Whether to render the depth fog. The fog range is tuned for COCO's
  // compact z∈[1,8] scene; on nuScenes (boxes tens of metres out) it would
  // fully occlude every box, so the nuScenes path disables it. Default = on.
  fog?: boolean;
  // (F2-D-2) The NEXT keyframe (nuScenes autoplay) + whether playback is running.
  // Each box looks up its OWN next-keyframe pose by stable instance id and tweens
  // toward it while playing (paused → exact measured keyframe, Rule #6).
  nextFrame?: Frame | null;
  playing?: boolean;
};

// Roughly the midpoint of MIN_Z..MAX_Z in bbox-estimator.ts. Both the camera
// and OrbitControls target use it so the user starts looking at the scene
// rather than past it.
const SCENE_CENTER_Z = 4.5;

// Floor plane y. Empirically below estimator's y range so objects sit above
// the grid. Tune in 1-unit steps if objects clip through or float.
const GRID_Y = -3;

export function Scene({
  frame,
  selectedId,
  onSelect,
  visibleIds,
  target = [0, 0, SCENE_CENTER_Z],
  fog = true,
  nextFrame,
  playing = false,
}: Props) {
  const visibleDetections3D = visibleIds
    ? frame.detections3D.filter((d) => visibleIds.has(d.id))
    : frame.detections3D;

  // (F2-D-2) Map each instance id → its pose in the NEXT keyframe, so a box can
  // tween from its current pose toward where the SAME object is next. Built once
  // per frame; a box whose id is absent (the object appears/disappears) gets no
  // next pose and simply holds at its current measured pose (no tween, no NaN).
  const nextPoseById = useMemo(() => {
    const m = new Map<string, Detection3D['bbox3D']>();
    if (nextFrame) {
      for (const d of nextFrame.detections3D) m.set(d.id, d.bbox3D);
    }
    return m;
  }, [nextFrame]);

  // 빈 공간 클릭 시 선택 해제를 보장하는 코드. drei <Grid infiniteGrid>는
  // 실제로는 거대한 plane mesh라 raycast가 항상 grid에 맞아 <Canvas
  // onPointerMissed>가 발화 안 함 → mesh의 raycast를 no-op으로 덮어써
  // raycaster에 "보이지 않게" 만듦으로써 Step 5의 deselect 계약을 복구.
  const gridRef = useRef<THREE.Mesh>(null);
  useEffect(() => {
    if (gridRef.current) gridRef.current.raycast = () => {};
  }, []);

  return (
    <>
      {fog && <fog attach="fog" args={['#0a0a0a', 10, 28]} />}

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

      {/* key=d.id. On nuScenes d.id is the `instance` token (track id), stable
          for the SAME object across frames — and the Canvas is not remounted per
          frame (F2-C) — so React REUSES each BBox3D component as the object moves
          frame to frame, just updating its position/rotation props (a snap, the
          F2-C MVP choice). ── Extension seam (box tween, decision 4-B, deferred):
          because the component persists, it can later interpolate between its
          previous and current pose over AUTOPLAY_INTERVAL_MS (position lerp +
          quaternion slerp, pure fns in lib/geometry) for smooth motion. The
          LiDAR cloud stays per-keyframe, so only the box would be tweened. */}
      {visibleDetections3D.map((d) => {
        const next = nextPoseById.get(d.id);
        return (
          <BBox3D
            key={d.id}
            detection={d}
            isSelected={d.id === selectedId}
            onClick={() => onSelect?.(d.id)}
            // (F2-D-2) tween inputs. `frameId` resets each box's interpolation
            // clock on a keyframe switch; `playing` gates the tween (off → exact
            // measured pose). `next*` is the same object's next-keyframe pose, or
            // undefined when it has no match next frame (→ hold current pose).
            frameId={frame.id}
            playing={playing}
            nextCenter={next?.center}
            nextRotation={next?.rotation}
          />
        );
      })}

      <OrbitControls
        target={target}
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

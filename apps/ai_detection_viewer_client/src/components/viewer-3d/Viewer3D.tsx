'use client';

import { useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import type { Frame } from '@/lib/types';
import { frameBoxesForCamera, selectFollowTarget } from '@/lib/geometry';
import { Scene } from './Scene';
import { HintBox } from './HintBox';

type Viewer3DProps = {
  frame: Frame;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  visibleIds?: Set<string>;
  // (F2-D-1) Camera mode (nuScenes only). 'fixed' = the frozen overview framing
  // (F2-C default); 'follow' = aim the OrbitControls target at the selected
  // object each frame so it stays centered as it moves. Falls back to fixed when
  // there is no selection / the object isn't in this frame.
  cameraMode?: 'fixed' | 'follow';
  // (F2-D-2) The NEXT keyframe + whether autoplay is running, threaded to Scene
  // so each box can tween from its current pose toward its next-keyframe pose
  // WHILE PLAYING (paused/scrubbing shows the exact measured keyframe — Rule #6).
  nextFrame?: Frame | null;
  playing?: boolean;
};

export function Viewer3D({
  frame,
  selectedId,
  onSelect,
  visibleIds,
  cameraMode = 'fixed',
  nextFrame,
  playing = false,
}: Viewer3DProps) {
  // nuScenes boxes sit at real measured positions (tens of metres ahead, Three
  // forward = −z) so the COCO camera (at −z looking +z) faces away from them.
  // Fit the camera to the actual box cloud and look forward instead. COCO keeps
  // its tuned camera + scene fog (Edge_#4 Case 2).
  const isMeasured = frame.source === 'nuscenes-measured';

  // (F2-C) Freeze the framing to the MOUNT frame. On nuScenes this component is
  // NOT remounted per frame (stable `key` in page.tsx, Edge_F#2 Case 6), so the
  // Canvas camera + OrbitControls persist across frame switches and autoplay.
  // The camera position is one-time `<Canvas>` init anyway, but the `target` is
  // re-applied to OrbitControls whenever it changes — so if we recomputed
  // `frameBoxesForCamera` from the moving box cloud each frame, the camera would
  // re-aim every 0.5 s and defeat the stable-camera goal. Capturing the first
  // frame's framing keeps target stable; the scene's box cloud is consistent
  // across the short sequence, so frame 0's fit is representative.
  //
  // ── Extension seam (camera-follow, decision 3-B, deferred): `target` is the
  // single point the camera aims at. To make the camera FOLLOW the selected
  // object later, pass that object's current center as `target` per frame
  // (recomputed from `selectedId` + `frame.detections3D`) instead of this frozen
  // framing. No other wiring changes — the prop already flows to OrbitControls.
  const mountFrame = useRef(frame).current;
  const framing = useMemo(
    () =>
      isMeasured
        ? frameBoxesForCamera(mountFrame.detections3D.map((d) => d.bbox3D.center))
        : null,
    [isMeasured, mountFrame],
  );
  const cameraPosition = framing ? framing.position : ([0, 0, -10] as const);
  // nuScenes boxes can be ~90 units from the fitted camera — well past COCO's
  // far=100 only by a little, but the camera also backs off, so widen it.
  const cameraFar = isMeasured ? 600 : 100;

  // (F2-D-1) Camera-follow target. In 'follow' mode aim OrbitControls at the
  // selected object's CURRENT center (recomputed each frame from the live
  // `frame`, so it tracks the moving box — decision Q2 = snap). The camera
  // POSITION stays the one-time init, so the view stays 3rd-person/orbitable;
  // only the pivot tracks. `selectFollowTarget` returns null when nothing is
  // selected or the object is absent in this frame → fall back to the frozen
  // fixed framing (never aim at empty space). COCO (no framing) keeps undefined.
  const followTarget =
    isMeasured && cameraMode === 'follow'
      ? selectFollowTarget(frame.detections3D, selectedId)
      : null;
  const target = followTarget ?? (framing ? framing.target : undefined);

  return (
    <div className="relative overflow-hidden w-full aspect-[4/3] bg-neutral-950 rounded">
      {/* 3D 씬을 렌더링하는 R3F Canvas. COCO estimator는 "큰 bbox = 작은 z =
          가까움"으로 깊이를 인코딩 → 카메라를 -z 위치에 두고 +z 방향을 응시.
          nuScenes는 실측 위치라 박스 클라우드에 맞춰 카메라를 -z(전방)로 향함. */}
      {/* `flat` disables R3F's default ACES filmic tone mapping. ACES desaturates
          bright colors toward white, which washed out the point cloud's depth
          colors (and the bbox wires) — verified by rendering, see Edge_F#1 Case 3.
          For a data-viz scene we want true colors, not a filmic look. */}
      <Canvas
        flat
        camera={{ position: cameraPosition, fov: 50, near: 0.1, far: cameraFar }}
        dpr={[1, 2]}
        onPointerMissed={() => onSelect?.(null)}
      >
        <color attach="background" args={['#0a0a0a']} />
        <Scene
          frame={frame}
          selectedId={selectedId}
          onSelect={onSelect}
          visibleIds={visibleIds}
          target={target}
          fog={isMeasured ? false : undefined}
          nextFrame={nextFrame}
          playing={playing}
        />
      </Canvas>
      <HintBox />
      <span className="sr-only">
        3D scene; drag to orbit, scroll to zoom.
      </span>
    </div>
  );
}

'use client';

import { Canvas } from '@react-three/fiber';
import type { Frame } from '@/lib/types';
import { frameBoxesForCamera } from '@/lib/geometry';
import { Scene } from './Scene';
import { HintBox } from './HintBox';

type Viewer3DProps = {
  frame: Frame;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  visibleIds?: Set<string>;
};

export function Viewer3D({ frame, selectedId, onSelect, visibleIds }: Viewer3DProps) {
  // nuScenes boxes sit at real measured positions (tens of metres ahead, Three
  // forward = −z) so the COCO camera (at −z looking +z) faces away from them.
  // Fit the camera to the actual box cloud and look forward instead. COCO keeps
  // its tuned camera + scene fog (Edge_#4 Case 2). The camera/fog are one-time
  // init; Viewer3D remounts on frame change via `key`, so this re-fits per frame.
  const isMeasured = frame.source === 'nuscenes-measured';
  const framing = isMeasured
    ? frameBoxesForCamera(frame.detections3D.map((d) => d.bbox3D.center))
    : null;
  const cameraPosition = framing ? framing.position : ([0, 0, -10] as const);
  // nuScenes boxes can be ~90 units from the fitted camera — well past COCO's
  // far=100 only by a little, but the camera also backs off, so widen it.
  const cameraFar = isMeasured ? 600 : 100;

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
          target={framing ? framing.target : undefined}
          fog={isMeasured ? false : undefined}
        />
      </Canvas>
      <HintBox />
      <span className="sr-only">
        3D scene; drag to orbit, scroll to zoom.
      </span>
    </div>
  );
}

'use client';

import { Canvas } from '@react-three/fiber';
import type { Frame } from '@/lib/types';
import { Scene, SCENE_CENTER_Z } from './Scene';
import { HintBox } from './HintBox';

type Viewer3DProps = {
  frame: Frame;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  visibleIds?: Set<string>;
};

export function Viewer3D({ frame, selectedId, onSelect, visibleIds }: Viewer3DProps) {
  return (
    <div className="relative overflow-hidden w-full aspect-[4/3] bg-neutral-950 rounded">
      {/* 3D 씬을 렌더링하는 R3F Canvas. estimator는 "큰 bbox = 작은 z = 가까움"으로
          깊이를 인코딩 → 카메라를 -z 위치에 두고 +z 방향을 응시하게 해서 큰
          bbox가 화면 앞에 보이도록 깊이 의미와 일치시킴. */}
      {/* `flat` disables R3F's default ACES filmic tone mapping. ACES desaturates
          bright colors toward white, which washed out the point cloud's depth
          colors (and the bbox wires) — verified by rendering, see Edge_F#1 Case 3.
          For a data-viz scene we want true colors, not a filmic look. */}
      <Canvas
        flat
        camera={{ position: [0, 0, -10], fov: 50, near: 0.1, far: 100 }}
        dpr={[1, 2]}
        onPointerMissed={() => onSelect?.(null)}
      >
        <color attach="background" args={['#0a0a0a']} />
        <Scene
          frame={frame}
          selectedId={selectedId}
          onSelect={onSelect}
          visibleIds={visibleIds}
        />
      </Canvas>
      <HintBox />
      <span className="sr-only">
        3D scene centered near z={SCENE_CENTER_Z}; drag to orbit, scroll to
        zoom.
      </span>
    </div>
  );
}

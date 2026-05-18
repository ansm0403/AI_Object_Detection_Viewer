'use client';

import { Canvas } from '@react-three/fiber';
import type { Frame } from '@/lib/types';
import { Scene, SCENE_CENTER_Z } from './Scene';

type Viewer3DProps = {
  frame: Frame;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  visibleIds?: Set<string>;
};

export function Viewer3D({ frame, selectedId, onSelect, visibleIds }: Viewer3DProps) {
  return (
    <div className="relative overflow-hidden w-full aspect-[4/3] bg-neutral-950 rounded">
      <Canvas
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
      <span className="sr-only">
        3D scene centered near z={SCENE_CENTER_Z}; drag to orbit, scroll to
        zoom.
      </span>
    </div>
  );
}

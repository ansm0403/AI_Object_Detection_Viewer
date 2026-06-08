'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Point3D } from '@/lib/types';
import { depthToColor, depthRange } from '@/lib/geometry';
import { selectVisiblePoints } from '@/lib/selectors';

type Props = {
  points: Point3D[];
  // Filters which points are uploaded to the GPU (see `selectVisiblePoints`):
  // COCO's estimated points obey their owning box's id; F2-B's real LiDAR points
  // (no detectionId) always show. `undefined` keeps all points. Edge_#4 Case 5.
  visibleIds?: Set<string>;
  size?: number;
};

// size 0.2 (world units, with sizeAttenuation): smaller looked like faint specks
// where the per-point depth color was unreadable — verified by rendering (Edge_F#1
// Case 3). The Canvas runs `flat` (no tone mapping) so these colors stay vivid.
export function PointCloud({ points, visibleIds, size = 0.2 }: Props) {
  const visiblePoints = useMemo(
    () => selectVisiblePoints(points, visibleIds),
    [points, visibleIds],
  );

  // Color domain is fit to the FULL frame's point-z range (pre-filter), so
  // toggling class filters does NOT recolor the cloud — only frame switches do.
  // Per-frame fit (not the estimator's fixed [1,8]) is what makes the gradient
  // visible; see depth-color.ts and Edge_F#1 Case 1.
  const [zMin, zMax] = useMemo(() => depthRange(points), [points]);

  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(visiblePoints.length * 3);
    // Per-vertex color: one RGB triple (0..1) per point, derived from its depth
    // (z) so the cloud reads as 3D. Conversion lives in lib/geometry/depth-color
    // (Immutable Rule #3). Range is this frame's own [zMin, zMax] so the gradient
    // fills the whole ramp.
    const colors = new Float32Array(visiblePoints.length * 3);
    for (let i = 0; i < visiblePoints.length; i++) {
      positions[i * 3] = visiblePoints[i].x;
      positions[i * 3 + 1] = visiblePoints[i].y;
      positions[i * 3 + 2] = visiblePoints[i].z;

      const [r, g, b] = depthToColor(visiblePoints[i].z, zMin, zMax);
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geom;
  }, [visiblePoints, zMin, zMax]); // 필터/프레임 변경 → 새 BufferGeometry 생성

  // [GPU 메모리 누수] 같은 프레임을 고정한 채 클래스 필터를 반복 조작하면
  // geometry가 정상 12개 대비 49개까지 단조 증가하는 WebGL 누수를 발견.
  //
  // 원인: WebGL 버퍼는 JS GC가 회수하지 못해 명시적 해제가 필요하다. 게다가 R3F는
  //   JSX 자식으로 선언한 geometry만 자동 dispose하고, 위처럼 명령형으로 만들어 prop으로
  //   주입한 것은 사용자 책임이라 매 재생성마다 이전 인스턴스가 GPU에 그대로 잔존했다.
  //
  // 해결: cleanup에서 직접 dispose. geometry가 바뀔 때마다 이전 것을 해제해 누적을 0으로 유지.
  //   (WebGLRenderer.info.memory.geometries 콘솔 측정으로 49 → 4~12 안정 확인)
  useEffect(() => () => geometry.dispose(), [geometry]);

  const ref = useRef<THREE.Points>(null);

  if (visiblePoints.length === 0) return null;

  return (
    <points ref={ref} geometry={geometry}>
      {/* vertexColors shades each point by its own `color` attribute. The base
          color stays white (#ffffff) because vertexColors MULTIPLIES it into the
          per-vertex color — white (1,1,1) is the multiplicative identity, so the
          depth ramp shows through unchanged. */}
      <pointsMaterial size={size} vertexColors sizeAttenuation />
    </points>
  );
}

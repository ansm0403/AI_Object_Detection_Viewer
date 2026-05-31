'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Point3D } from '@/lib/types';

type Props = {
  points: Point3D[];
  // When provided, only points whose `detectionId` is in this set are uploaded
  // to the GPU. `undefined` keeps all points. Edge_#4 Case 5 (Option A).
  visibleIds?: Set<string>;
  size?: number;
  color?: string;
};

export function PointCloud({ points, visibleIds, size = 0.04, color = '#cbd5f5' }: Props) {
  const visiblePoints = useMemo(
    () => (visibleIds ? points.filter((p) => visibleIds.has(p.detectionId)) : points),
    [points, visibleIds],
  );

  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(visiblePoints.length * 3);
    for (let i = 0; i < visiblePoints.length; i++) {
      positions[i * 3] = visiblePoints[i].x;
      positions[i * 3 + 1] = visiblePoints[i].y;
      positions[i * 3 + 2] = visiblePoints[i].z;
    }
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geom;
  }, [visiblePoints]); // 클래스 필터 변경 → visiblePoints 변경 → 매번 새 BufferGeometry 생성

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
      <pointsMaterial size={size} color={color} sizeAttenuation />
    </points>
  );
}

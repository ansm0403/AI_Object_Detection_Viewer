'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Detection3D } from '@/lib/types';
import { getClassColor, SELECTED_COLOR } from '@/lib/ui/class-colors';
import { BBoxLabel } from './BBoxLabel';

// Scale pulse constants — easy to swap for other animation styles later.
const PULSE_FREQUENCY = 4;   // rad/s (~0.64 Hz)
const PULSE_AMPLITUDE = 0.04; // ±4% scale

// Hover (F1-B): a static size bump + a class-color tint lightened toward white.
// Kept visually distinct from the selected look (white wire + pulse): hover stays
// a tinted *class* color (not white) and is statically larger than the selected
// pulse range (0.96–1.04). Values were bumped from 1.02/0.45 after render review —
// on the near-black bg with 1px wires the subtle version barely read. See Edge_F#1 Case 4.
const HOVER_SCALE = 1.06;
const HOVER_TINT_AMOUNT = 0.6; // lerp class color toward white by 60%

// Vertical gap above the box top where the F1-C info label is anchored, in world
// units. Small so the pill hugs the box without floating far away.
const LABEL_Y_PAD = 0.15;

type Props = {
  detection: Detection3D;
  isSelected?: boolean;
  onClick?: () => void;
};

export function BBox3D({ detection, isSelected = false, onClick }: Props) {
  const [sx, sy, sz] = detection.bbox3D.size;
  const [hovered, setHovered] = useState(false);

  const geometry = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(sx, sy, sz)),
    [sx, sy, sz],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    if (isSelected) {
      const pulse = 1 + Math.sin(clock.getElapsedTime() * PULSE_FREQUENCY) * PULSE_AMPLITUDE;
      group.scale.setScalar(pulse);
    } else if (hovered) {
      group.scale.setScalar(HOVER_SCALE);
    } else {
      group.scale.setScalar(1);
    }
  });

  const baseColor = getClassColor(detection.class);

  // Lightened class tint for the hover look. Memoized so the material isn't
  // handed a fresh THREE.Color every render.
  const hoverColor = useMemo(
    () => new THREE.Color(baseColor).lerp(new THREE.Color('#ffffff'), HOVER_TINT_AMOUNT),
    [baseColor],
  );

  // Selection wins over hover, so a selected box keeps its white + pulse look
  // even while hovered.
  const wireColor = isSelected ? SELECTED_COLOR : hovered ? hoverColor : baseColor;

  // Cursor feedback. Only the effect-when-hovered branch touches the cursor, so
  // its cleanup runs both on un-hover AND on unmount — that unmount path is the
  // defensive reset for when a hovered box disappears (frame switch / filtered
  // out) before onPointerOut can fire. React runs cleanups before new effects,
  // so moving the pointer from one box to the next never leaves the cursor
  // stuck on 'auto'.
  useEffect(() => {
    if (!hovered) return;
    document.body.style.cursor = 'pointer';
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, [hovered]);

  const showLabel = isSelected || hovered;

  return (
    // Outer group: position only. The label lives here so the selected-box pulse
    // (applied to the inner group) does not jitter the label's anchor.
    <group position={detection.bbox3D.center}>
      {/* Inner group carries the pulse/hover scale. */}
      <group ref={groupRef}>
        {/* Invisible full-volume mesh for reliable raycasting — line segments alone are hard to click.
            DoubleSide ensures clicks register from inside the bbox volume when the camera orbits in.
            Hover (F1-B) hangs off this same mesh; stopPropagation keeps only the front box highlighted
            when boxes overlap, matching the click behavior. */}
        <mesh
          onClick={(e) => {
            e.stopPropagation();
            onClick?.();
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(true);
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            setHovered(false);
          }}
        >
          <boxGeometry args={[sx, sy, sz]} />
          <meshBasicMaterial side={THREE.DoubleSide} transparent opacity={0} />
        </mesh>
        <lineSegments geometry={geometry}>
          <lineBasicMaterial color={wireColor} />
        </lineSegments>
      </group>

      {/* F1-C: info label anchored above the box top, shown for selected/hovered
          boxes only. pointer-events-none inside BBoxLabel keeps empty-space
          deselect (onPointerMissed) working. */}
      {showLabel && (
        <BBoxLabel
          position={[0, sy / 2 + LABEL_Y_PAD, 0]}
          label={detection.class}
          confidence={detection.confidence}
          color={baseColor}
        />
      )}
    </group>
  );
}

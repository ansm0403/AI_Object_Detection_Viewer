'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Detection3D } from '@/lib/types';
import { getClassColor, SELECTED_COLOR } from '@/lib/ui/class-colors';
import { lerpVec3, slerpQuat } from '@/lib/geometry';
import { AUTOPLAY_INTERVAL_MS } from '@/lib/sequence';
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

// Identity quaternion [x, y, z, w] — no rotation. Used for COCO estimated boxes
// (and any box without measured orientation) so they keep their axis-aligned
// look exactly as before F2.
const IDENTITY_QUAT: [number, number, number, number] = [0, 0, 0, 1];

// (F2-D-2) Keyframe duration in seconds — the tween normalizes elapsed time over
// this so t reaches 1 right as autoplay advances to the next keyframe (both use
// AUTOPLAY_INTERVAL_MS, so the glide is paced to the real cadence).
const INTERVAL_SEC = AUTOPLAY_INTERVAL_MS / 1000;

type Props = {
  detection: Detection3D;
  isSelected?: boolean;
  onClick?: () => void;
  // (F2-D-2) Inter-frame tween inputs (nuScenes autoplay; absent on COCO).
  // `frameId` changes each keyframe and resets the tween clock; `playing` gates
  // the tween (off → exact measured pose, Rule #6); `nextCenter`/`nextRotation`
  // are the SAME object's pose in the next keyframe (absent → hold current pose).
  frameId?: string;
  playing?: boolean;
  nextCenter?: [number, number, number];
  nextRotation?: [number, number, number, number];
};

export function BBox3D({
  detection,
  isSelected = false,
  onClick,
  frameId,
  playing = false,
  nextCenter,
  nextRotation,
}: Props) {
  const [sx, sy, sz] = detection.bbox3D.size;
  const [hovered, setHovered] = useState(false);

  const geometry = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(sx, sy, sz)),
    [sx, sy, sz],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  // Inner group: orientation (quaternion) + the pulse/hover scale.
  const groupRef = useRef<THREE.Group>(null);
  // Outer group: position. Driven imperatively so the box can be tweened between
  // keyframes; the JSX `position` below seeds the first frame to avoid a flash.
  const outerRef = useRef<THREE.Group>(null);

  // (F2-D-2) Tween clock. `startRef` marks when the current keyframe began; t is
  // elapsed-since-then normalized over INTERVAL_SEC. It resets to 0 on a keyframe
  // switch (frameId change) and on a play (re)start, so a tween always begins at
  // a real measured pose.
  const startRef = useRef(0);
  const prevFrameId = useRef(frameId);
  const prevPlaying = useRef(playing);

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();

    if (frameId !== prevFrameId.current) {
      prevFrameId.current = frameId;
      startRef.current = elapsed;
    }
    if (playing && !prevPlaying.current) {
      startRef.current = elapsed;
    }
    prevPlaying.current = playing;

    // Tween ONLY while playing and the object has a next-keyframe pose. Paused /
    // scrubbing / a disappearing object → exact measured pose (Immutable Rule #6:
    // an interpolated in-between pose is not a measurement, so never show it as a
    // static state).
    const t = Math.min(1, (elapsed - startRef.current) / INTERVAL_SEC);
    const center = detection.bbox3D.center;
    const rotation = detection.bbox3D.rotation ?? IDENTITY_QUAT;

    const outer = outerRef.current;
    if (outer) {
      const p =
        playing && nextCenter !== undefined ? lerpVec3(center, nextCenter, t) : center;
      outer.position.set(p[0], p[1], p[2]);
    }

    const inner = groupRef.current;
    if (inner) {
      const q =
        playing && nextCenter !== undefined && nextRotation !== undefined
          ? slerpQuat(rotation, nextRotation, t)
          : rotation;
      inner.quaternion.set(q[0], q[1], q[2], q[3]);

      if (isSelected) {
        const pulse = 1 + Math.sin(elapsed * PULSE_FREQUENCY) * PULSE_AMPLITUDE;
        inner.scale.setScalar(pulse);
      } else if (hovered) {
        inner.scale.setScalar(HOVER_SCALE);
      } else {
        inner.scale.setScalar(1);
      }
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
    // (applied to the inner group) does not jitter the label's anchor. The
    // `position` here just seeds the first render; useFrame then drives it (so a
    // tween can move it between keyframes — F2-D-2).
    <group ref={outerRef} position={detection.bbox3D.center}>
      {/* Inner group carries the pulse/hover scale AND the measured orientation
          (F2-A). The quaternion [x,y,z,w] comes straight off Detection3D (set by
          lib/nuscenes for measured boxes; absent → identity for COCO). Rotation
          and uniform scale compose independently, so the F1 pulse/hover scale is
          unaffected. The wireframe + click mesh rotate with the box; the label
          stays on the unrotated outer group so it hangs upright above the box. */}
      <group ref={groupRef} quaternion={detection.bbox3D.rotation ?? IDENTITY_QUAT}>
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

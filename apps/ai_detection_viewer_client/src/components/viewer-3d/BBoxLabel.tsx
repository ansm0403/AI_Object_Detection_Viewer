'use client';

import { Html } from '@react-three/drei';

type Props = {
  /** Local position relative to the parent group (the bbox center). */
  position: [number, number, number];
  label: string;
  confidence: number;
  /** Class color, used as the accent dot. */
  color: string;
};

/**
 * A small info pill anchored to a 3D point via drei `<Html>` (F1-C).
 *
 * `<Html>` pins a normal DOM node to a 3D coordinate and re-projects it every
 * frame, so the pill tracks its bbox as the camera orbits/zooms. No
 * `distanceFactor` → the pill keeps a constant on-screen size (a UI name tag),
 * which stays readable at any zoom.
 *
 * CRITICAL: the pill MUST NOT capture pointer events. The `<Canvas>` relies on
 * `onPointerMissed` (empty-space click) to deselect; an interactive overlay
 * sitting over the canvas would swallow those clicks and silently break
 * deselect. Hence `pointer-events-none` on both the `<Html>` container and the
 * inner node.
 */
export function BBoxLabel({ position, label, confidence, color }: Props) {
  return (
    <Html
      position={position}
      center
      // Keep the pill above the box top, not centered on the anchor point.
      style={{ pointerEvents: 'none', transform: 'translate(-50%, -120%)' }}
      // occlude OFF for F1 (Edge_F#1 decision): the pill shows even when its box
      // sits behind another — acceptable with ≤2 labels on screen at once.
    >
      <div className="pointer-events-none select-none flex items-center gap-1.5 whitespace-nowrap rounded-md border border-white/10 bg-zinc-900/85 px-2 py-1 text-xs leading-none text-zinc-100 shadow-lg backdrop-blur-sm">
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-zinc-400">
          {(confidence * 100).toFixed(0)}%
        </span>
      </div>
    </Html>
  );
}

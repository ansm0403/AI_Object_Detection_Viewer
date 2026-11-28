'use client';

import { useEffect, useRef } from 'react';
import { makeInsideTest, viewBoxOf, type BevView, type PixelSize } from '@/lib/editing';
import type { Detection3D, Point3D } from '@/lib/types';

/** Points outside the box: the sky tone the app uses for "data", made quiet. */
const POINT_COLOR = 'rgba(125, 211, 252, 0.6)';
/** Points inside the box being edited. */
export const INSIDE_COLOR = '#fde047';

type Props = {
  points: readonly Point3D[];
  view: BevView;
  size: PixelSize;
  /** The box being edited (render frame): the points inside it are drawn in `INSIDE_COLOR`. */
  highlight: Detection3D['bbox3D'] | null;
};

/**
 * (F8) The LiDAR points of the top view, painted on ONE canvas under the SVG
 * that draws the boxes.
 *
 * Why a canvas and not SVG: a frame has thousands of points (2,880–7,638 in
 * the shipped data). As SVG elements they tripled the work per mouse move
 * while a box was dragged and produced long frames; one canvas paints them in
 * well under a millisecond (measured on the 156-box frame, production build —
 * F8 design doc §2.5). The boxes stay SVG: a few hundred shapes that need
 * crisp lines and pointer events.
 *
 * A point of the render frame is at top-view `[x, z]` — no conversion.
 */
export function BevPoints({ points, view, size, highlight }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || size.width === 0 || size.height === 0) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.width * ratio);
    canvas.height = Math.round(size.height * ratio);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, size.width, size.height);

    const box = viewBoxOf(view, size);
    const scale = 1 / view.metresPerPixel;
    const inside = highlight ? makeInsideTest(highlight) : null;
    // Two passes, so the highlighted points are never painted over.
    context.fillStyle = POINT_COLOR;
    const marked: number[] = [];
    for (const point of points) {
      const x = (point.x - box.x) * scale;
      const y = (point.z - box.y) * scale;
      if (x < -2 || y < -2 || x > size.width + 2 || y > size.height + 2) continue;
      if (inside?.(point)) {
        marked.push(x, y);
        continue;
      }
      context.fillRect(x - 1, y - 1, 2, 2);
    }
    context.fillStyle = INSIDE_COLOR;
    for (let i = 0; i < marked.length; i += 2) {
      context.fillRect(marked[i] - 1.5, marked[i + 1] - 1.5, 3, 3);
    }
  }, [points, view, size, highlight]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
      style={{ width: size.width, height: size.height }}
    />
  );
}

'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  fitViewTo,
  footprintOf,
  footprintOfRendered,
  panView,
  scaleBarMetres,
  viewBoxOf,
  zoomView,
  type BevPoint,
  type BevProjector,
  type BevView,
  type PixelSize,
} from '@/lib/editing';
import type { Frame, Point3D } from '@/lib/types';
import { getClassColor } from '@/lib/ui/class-colors';
import { ViewerLabel } from '@/components/workspace';
import { BevPoints, INSIDE_COLOR } from './BevPoints';
import type { EditTarget } from './useBoxEditor';

type PointsStatus = 'inline' | 'loading' | 'ready' | 'failed';

type Props = {
  /** The frame as it is drawn (edits laid over): every box of it is shown. */
  frame: Frame;
  /** The frame's LiDAR points, when they have arrived. */
  points: readonly Point3D[] | null;
  pointsStatus: PointsStatus;
  projector: BevProjector;
  /** The box being edited; `null` when no box is selected or it is not in this frame. */
  target: EditTarget | null;
  /** Shown in the middle when there is nothing to edit (why, and what to do). */
  emptyMessage?: string;
  /** CSS `transform-origin` of the entrance animation (the list row of the box), or `null`. */
  growFrom: string | null;
};

/** Sizes of the handles on screen, in pixels (they do not grow when zooming in). */
const CORNER_PX = 9;
const SIDE_PX = 7;
const KNOB_RADIUS_PX = 6;
const KNOB_DISTANCE_PX = 26;
/** The arrow that marks the car, in pixels: a marker of where it is and which way it faces, not its outline. */
const CAR_MARK_PX: readonly (readonly [number, number])[] = [
  [0, -11],
  [7, 8],
  [0, 4],
  [-7, 8],
];
/** Distance rings around the car, metres. */
const RINGS = [10, 20, 30, 40, 50, 60, 70, 80];
/** The view shown while there is no box to fit to: the car in the middle, 60 m across the shorter side. */
const HOME_METRES = 60;
/** Below this width the second legend line (how to operate) does not fit and is left to the panel. */
const LEGEND_HINT_MIN_WIDTH = 460;

const polygon = (points: readonly BevPoint[]) =>
  points.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' ');

/**
 * (F8) The top view (bird's-eye view) of one frame, centred on the box being
 * edited.
 *
 *  - The box being edited: a white rectangle, its FRONT edge in sky; the
 *    dataset's own box as a dashed outline once the two differ.
 *  - Every other box of the frame: a thin outline in its class colour.
 *  - The LiDAR points (canvas, underneath); the ones inside the box in yellow —
 *    points are what a box is checked against.
 *  - The car: a small arrow at the origin, with a dashed ring every 10 m.
 *
 * The front of the car is up. Wheel = zoom about the pointer; dragging the
 * empty background = pan. This component draws and reports; what a drag DOES
 * to a box is `lib/editing` (Immutable Rule #3).
 */
export function BevEditor({
  frame,
  points,
  pointsStatus,
  projector,
  target,
  emptyMessage,
  growFrom,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<PixelSize>({ width: 0, height: 0 });

  // The element's size, kept up to date (window resize, focus ↔ split view).
  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const read = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    read();
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const footprint = useMemo(
    () => (target ? footprintOf(target.values, projector) : null),
    [target, projector],
  );
  const labelFootprint = useMemo(
    () => (target?.edited ? footprintOf(target.label, projector) : null),
    [target, projector],
  );

  // What is on screen. Fitted to the box whenever ANOTHER box becomes the
  // target (or the first size is known); zooming, panning and editing the box
  // itself leave it alone. Kept in state and replaced while rendering when the
  // key differs (React's "derive from props, keep the previous value").
  const targetKey = target ? `${target.frameId}/${target.objectId}` : `none:${frame.id}`;
  const sized = size.width > 0 && size.height > 0;
  const [fitted, setFitted] = useState<{ key: string; view: BevView } | null>(null);
  if (sized && fitted?.key !== targetKey) {
    setFitted({
      key: targetKey,
      view: footprint
        ? fitViewTo(footprint, size)
        : { centre: [0, 0], metresPerPixel: HOME_METRES / Math.min(size.width, size.height) },
    });
  }
  const view = sized && fitted?.key === targetKey ? fitted.view : null;

  // Wheel = zoom about the pointer. A native listener, because React's
  // `onWheel` is passive and could not stop the page from scrolling on the
  // narrow layout.
  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const anchor: [number, number] = [event.clientX - rect.left, event.clientY - rect.top];
      const factor = Math.exp(event.deltaY * 0.0015);
      setFitted((current) =>
        current
          ? {
              key: current.key,
              view: zoomView(
                current.view,
                { width: element.clientWidth, height: element.clientHeight },
                factor,
                anchor,
              ),
            }
          : current,
      );
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  // Dragging the background pans the view.
  const pan = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pan.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const from = pan.current;
    if (!from) return;
    const delta: [number, number] = [event.clientX - from.x, event.clientY - from.y];
    pan.current = { x: event.clientX, y: event.clientY };
    setFitted((current) => (current ? { key: current.key, view: panView(current.view, delta) } : current));
  };
  const onPointerEnd = () => {
    pan.current = null;
  };

  const others = useMemo(
    () =>
      frame.detections3D
        .filter((d) => d.id !== target?.objectId)
        .map((d) => ({ id: d.id, color: getClassColor(d.class), points: polygon(footprintOfRendered(d.bbox3D)) })),
    [frame, target?.objectId],
  );

  const box = view ? viewBoxOf(view, size) : null;
  const px = view ? view.metresPerPixel : 0;
  const knob: BevPoint | null = footprint
    ? [
        footprint.sides.front[0] + footprint.forward[0] * KNOB_DISTANCE_PX * px,
        footprint.sides.front[1] + footprint.forward[1] * KNOB_DISTANCE_PX * px,
      ]
    : null;
  const barMetres = view ? scaleBarMetres(view) : 0;

  const pointsNote =
    pointsStatus === 'loading'
      ? 'loading points…'
      : pointsStatus === 'failed'
        ? 'points unavailable'
        : null;

  return (
    <div
      ref={rootRef}
      // Narrow screens stack the zones: the editor needs a height of its own there.
      className="bev-grow relative h-[70vh] lg:h-full w-full overflow-hidden rounded-lg border border-zinc-800 bg-neutral-950 select-none"
      style={growFrom ? { transformOrigin: growFrom } : { transformOrigin: '0 50%' }}
    >
      {view && points && points.length > 0 && (
        <BevPoints points={points} view={view} size={size} highlight={target?.shown.bbox3D ?? null} />
      )}
      {view && box && (
        <svg
          role="img"
          aria-label="Top view of the frame"
          width={size.width}
          height={size.height}
          viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
          className="absolute inset-0 touch-none cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          {/* A ring every 10 m around the car. */}
          <g fill="none" stroke="#3f3f46" strokeWidth={1} strokeDasharray="2 4">
            {RINGS.map((radius) => (
              <circle key={radius} cx={0} cy={0} r={radius} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
          {/* The car: an arrow at the origin, pointing forward (up). A fixed
              size on screen — it marks the place, it is not the car's outline. */}
          <polygon
            data-part="car"
            points={polygon(CAR_MARK_PX.map(([x, y]): BevPoint => [x * px, y * px]))}
            fill="#52525b"
            stroke="#a1a1aa"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          {/* The other boxes of the frame. Not clickable here: a drag near a
              neighbour must not grab the neighbour. */}
          <g fill="none" strokeWidth={1} strokeOpacity={0.55} pointerEvents="none">
            {others.map((other) => (
              <polygon
                key={other.id}
                points={other.points}
                stroke={other.color}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
          {labelFootprint && (
            <polygon
              data-part="label"
              points={polygon(labelFootprint.corners)}
              fill="none"
              stroke="#a1a1aa"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          )}
          {footprint && knob && (
            <g data-part="target">
              <polygon
                data-part="box"
                points={polygon(footprint.corners)}
                fill="rgba(255,255,255,0.07)"
                stroke="#ffffff"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
              {/* The front edge: which way the box is heading. */}
              <line
                data-part="front"
                x1={footprint.corners[0][0]}
                y1={footprint.corners[0][1]}
                x2={footprint.corners[1][0]}
                y2={footprint.corners[1][1]}
                stroke="#38bdf8"
                strokeWidth={4}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
              <line
                x1={footprint.sides.front[0]}
                y1={footprint.sides.front[1]}
                x2={knob[0]}
                y2={knob[1]}
                stroke="#38bdf8"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
              <circle
                data-handle="rotate"
                cx={knob[0]}
                cy={knob[1]}
                r={KNOB_RADIUS_PX * px}
                fill="#0a0a0a"
                stroke="#38bdf8"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
              {(['front', 'right', 'back', 'left'] as const).map((side) => (
                <Square key={side} handle={side} at={footprint.sides[side]} size={SIDE_PX * px} fill="#e4e4e7" />
              ))}
              {(['front-left', 'front-right', 'back-right', 'back-left'] as const).map((corner, i) => (
                <Square key={corner} handle={corner} at={footprint.corners[i]} size={CORNER_PX * px} fill="#ffffff" />
              ))}
            </g>
          )}
        </svg>
      )}

      <ViewerLabel>
        Top view · LiDAR points
        {pointsNote && <span className="ml-1.5 normal-case tracking-normal font-medium text-amber-300">· {pointsNote}</span>}
      </ViewerLabel>
      {/* In a narrow view the name tag with a points note needs the whole row. */}
      {!(pointsNote && size.width < LEGEND_HINT_MIN_WIDTH) && (
        <span
          data-part="compass"
          className="absolute top-2 right-2 z-10 pointer-events-none rounded px-1.5 py-0.5 text-[10px] font-medium text-zinc-300 bg-zinc-950/70 ring-1 ring-zinc-700 whitespace-nowrap"
        >
          ↑ front of the car
        </span>
      )}

      {!target && emptyMessage && (
        <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-zinc-400 pointer-events-none">
          <span className="rounded-md bg-zinc-950/80 px-3 py-2 ring-1 ring-zinc-700">{emptyMessage}</span>
        </p>
      )}

      {/* Legend (left) and scale bar (right). The legend keeps clear of the bar. */}
      <span
        data-part="legend"
        className="absolute bottom-2 left-2 z-10 max-w-[calc(100%-7.5rem)] pointer-events-none rounded px-1.5 py-1 text-[10px] leading-4 text-zinc-400 bg-zinc-950/70 ring-1 ring-zinc-700"
      >
        <span className="whitespace-nowrap">
          <span aria-hidden="true" style={{ color: INSIDE_COLOR }}>
            ■
          </span>{' '}
          points inside the box
          {labelFootprint && <span className="text-zinc-300"> · - - - nuScenes label</span>}
        </span>
        {size.width >= LEGEND_HINT_MIN_WIDTH && (
          <span className="block whitespace-nowrap">Wheel: zoom · drag the background: pan · rings: every 10 m</span>
        )}
      </span>
      {view && (
        <span
          data-part="scale"
          className="absolute bottom-2 right-2 z-10 pointer-events-none inline-flex items-center gap-1.5 rounded px-1.5 py-1 text-[10px] leading-4 text-zinc-300 bg-zinc-950/70 ring-1 ring-zinc-700 whitespace-nowrap tabular-nums"
        >
          <span
            aria-hidden="true"
            className="inline-block h-1.5 border-x border-b border-zinc-300"
            style={{ width: barMetres / view.metresPerPixel }}
          />
          {barMetres} m
        </span>
      )}
    </div>
  );
}

function Square({
  handle,
  at,
  size,
  fill,
}: {
  handle: string;
  at: BevPoint;
  size: number;
  fill: string;
}) {
  return (
    <rect
      data-handle={handle}
      x={at[0] - size / 2}
      y={at[1] - size / 2}
      width={size}
      height={size}
      fill={fill}
      stroke="#18181b"
      strokeWidth={1}
      vectorEffect="non-scaling-stroke"
    />
  );
}

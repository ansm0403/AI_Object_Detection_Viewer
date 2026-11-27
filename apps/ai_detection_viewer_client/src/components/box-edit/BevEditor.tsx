'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  fitViewTo,
  footprintOf,
  footprintOfRendered,
  panView,
  pixelToBev,
  scaleBarMetres,
  viewBoxOf,
  zoomView,
  type BevPoint,
  type BevProjector,
  type BevView,
  type DragHandle,
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
  /** Why the box cannot be changed right now (shown; the handles do not react); `null` = it can. */
  locked: string | null;
  /**
   * A handle (or the box itself: `'move'`) was grabbed at this top-view point.
   * Returns false when the drag is not accepted; the pointer then pans the view.
   */
  onDragStart: (handle: DragHandle, at: BevPoint) => boolean;
  /** The pointer is now at this top-view point (at most once per painted frame). */
  onDrag: (at: BevPoint) => void;
  /** The pointer was released: the change is taken. */
  onDragEnd: () => void;
  /** The drag was interrupted (the browser took the pointer away): the change is dropped. */
  onDragCancel: () => void;
};

/** Sizes of the handles on screen, in pixels (they do not grow when zooming in). */
const CORNER_PX = 9;
const SIDE_PX = 7;
const KNOB_RADIUS_PX = 6;
const KNOB_DISTANCE_PX = 26;
/**
 * What is grabbed is larger than what is drawn: the side of a handle's hit area,
 * in pixels. On a box that is small on screen (zoomed far out, or a pedestrian)
 * the hit areas shrink with it — never beyond a third of its shorter side — so
 * the middle of the box is always free to grab the box itself. Without this a
 * drag on a small box resized it instead of moving it.
 */
const HIT_PX = 18;
/**
 * Below this size on screen (the box's shorter side, in pixels) the handles are
 * not offered at all: they would sit on top of each other and of the box, and a
 * drag meant to move the box would resize it. The box can still be moved; to
 * resize or turn it, zoom in (the view says so).
 */
const MIN_BOX_PX_FOR_HANDLES = 24;
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
  locked,
  onDragStart,
  onDrag,
  onDragEnd,
  onDragCancel,
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

  // One pointer gesture at a time: a handle (or the box) being dragged, or the
  // background being dragged to pan the view.
  const gesture = useRef<{ kind: 'box' } | { kind: 'pan'; x: number; y: number } | null>(null);
  // Pointer moves arrive faster than the screen is painted (a mouse can report
  // hundreds per second). Only the latest one is applied, once per frame: every
  // application rebuilds the box, its projections and the views that draw them.
  const pending = useRef<BevPoint | null>(null);
  const scheduled = useRef(0);
  const flush = () => {
    scheduled.current = 0;
    const at = pending.current;
    pending.current = null;
    if (at) onDrag(at);
  };
  useEffect(() => () => cancelAnimationFrame(scheduled.current), []);

  const pointOf = (event: ReactPointerEvent<SVGSVGElement>): BevPoint | null => {
    if (!view) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    return pixelToBev(view, size, [event.clientX - rect.left, event.clientY - rect.top]);
  };
  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || gesture.current) return;
    const handle = (event.target as Element).closest('[data-handle]')?.getAttribute('data-handle');
    const at = pointOf(event);
    // Capture keeps the drag alive when the pointer leaves the view. It can be
    // refused (the pointer is already gone); the drag then simply ends at the edge.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* no capture: nothing to undo */
    }
    if (handle && at && onDragStart(handle as DragHandle, at)) {
      gesture.current = { kind: 'box' };
      return;
    }
    gesture.current = { kind: 'pan', x: event.clientX, y: event.clientY };
  };
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const current = gesture.current;
    if (!current) return;
    if (current.kind === 'box') {
      pending.current = pointOf(event);
      if (scheduled.current === 0) scheduled.current = requestAnimationFrame(flush);
      return;
    }
    const delta: [number, number] = [event.clientX - current.x, event.clientY - current.y];
    gesture.current = { kind: 'pan', x: event.clientX, y: event.clientY };
    setFitted((state) => (state ? { key: state.key, view: panView(state.view, delta) } : state));
  };
  const onPointerUp = () => {
    const current = gesture.current;
    gesture.current = null;
    if (current?.kind !== 'box') return;
    // The last position must not be lost to the frame that has not come yet.
    cancelAnimationFrame(scheduled.current);
    flush();
    onDragEnd();
  };
  const onPointerCancel = () => {
    const current = gesture.current;
    gesture.current = null;
    cancelAnimationFrame(scheduled.current);
    scheduled.current = 0;
    pending.current = null;
    if (current?.kind === 'box') onDragCancel();
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
  // The hit area of a handle, in metres (see HIT_PX).
  const shorterPx = target && px > 0 ? Math.min(target.values.size[0], target.values.size[1]) / px : 0;
  const hit = Math.max(SIDE_PX, Math.min(HIT_PX, shorterPx / 3)) * px;
  const handlesShown = shorterPx >= MIN_BOX_PX_FOR_HANDLES;

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
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
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
            <g data-part="target" data-locked={locked ? 'true' : undefined}>
              <polygon
                data-part="box"
                data-handle="move"
                points={polygon(footprint.corners)}
                fill="rgba(255,255,255,0.07)"
                stroke="#ffffff"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                style={{ cursor: locked ? 'not-allowed' : 'move' }}
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
              {handlesShown && (
              <g opacity={locked ? 0.35 : 1}>
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
                  cx={knob[0]}
                  cy={knob[1]}
                  r={KNOB_RADIUS_PX * px}
                  fill="#0a0a0a"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
                {/* What is grabbed is larger than what is drawn. */}
                <circle
                  data-handle="rotate"
                  cx={knob[0]}
                  cy={knob[1]}
                  r={Math.max(hit * 0.6, KNOB_RADIUS_PX * px)}
                  fill="transparent"
                  style={{ cursor: locked ? 'not-allowed' : 'grab' }}
                />
                {(['front', 'right', 'back', 'left'] as const).map((side) => (
                  <Square
                    key={side}
                    handle={side}
                    at={footprint.sides[side]}
                    size={SIDE_PX * px}
                    hit={hit}
                    fill="#e4e4e7"
                    cursor={locked ? 'not-allowed' : resizeCursor(footprint.center, footprint.sides[side])}
                  />
                ))}
                {(['front-left', 'front-right', 'back-right', 'back-left'] as const).map((corner, i) => (
                  <Square
                    key={corner}
                    handle={corner}
                    at={footprint.corners[i]}
                    size={CORNER_PX * px}
                    hit={hit}
                    fill="#ffffff"
                    cursor={locked ? 'not-allowed' : resizeCursor(footprint.center, footprint.corners[i])}
                  />
                ))}
              </g>
              )}
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

      {target && !locked && !handlesShown && view && (
        <span
          data-part="zoom-hint"
          className="absolute top-9 left-2 z-10 pointer-events-none rounded px-1.5 py-0.5 text-[10px] font-medium text-zinc-300 bg-zinc-950/80 ring-1 ring-zinc-700 whitespace-nowrap"
        >
          Zoom in to resize or turn the box
        </span>
      )}
      {target && locked && (
        <span
          data-part="locked"
          role="status"
          className="absolute top-9 left-2 z-10 pointer-events-none rounded px-1.5 py-0.5 text-[10px] font-medium text-amber-300 bg-zinc-950/80 ring-1 ring-amber-500/40 whitespace-nowrap"
        >
          {locked}
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
          <span className="block whitespace-nowrap">
            Drag the box: move · squares: resize · knob: turn · wheel: zoom · background: pan
          </span>
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

/**
 * The resize cursor for a handle that sits in direction `to` from `from` on
 * screen: the double arrow that points along that direction, to the nearest 45°.
 */
function resizeCursor(from: BevPoint, to: BevPoint): string {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  // 0..180°, measured on screen (y down).
  const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 180) % 180;
  if (angle < 22.5 || angle >= 157.5) return 'ew-resize';
  if (angle < 67.5) return 'nwse-resize';
  if (angle < 112.5) return 'ns-resize';
  return 'nesw-resize';
}

function Square({
  handle,
  at,
  size,
  hit,
  fill,
  cursor,
}: {
  handle: string;
  at: BevPoint;
  /** Side of the square that is drawn, in metres. */
  size: number;
  /** Side of the (invisible) square that is grabbed, in metres. */
  hit: number;
  fill: string;
  cursor: string;
}) {
  return (
    <>
      <rect
        x={at[0] - size / 2}
        y={at[1] - size / 2}
        width={size}
        height={size}
        fill={fill}
        stroke="#18181b"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
      <rect
        data-handle={handle}
        x={at[0] - hit / 2}
        y={at[1] - hit / 2}
        width={hit}
        height={hit}
        fill="transparent"
        style={{ cursor }}
      />
    </>
  );
}

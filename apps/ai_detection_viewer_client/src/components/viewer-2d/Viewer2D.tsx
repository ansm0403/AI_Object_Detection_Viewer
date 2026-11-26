'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { Detection2D, Frame } from '@/lib/types';
import { BOX_EDGES, BOX_FRONT_FACE, zoomRegion, type ImageRegion } from '@/lib/geometry';
import { getClassColor, SELECTED_COLOR } from '@/lib/ui/class-colors';
import { classLabel } from '@/lib/ui/class-label';
import type { ImageOverlay, ImageRect } from '@/lib/ui/image-overlay';
import { frameHasConfidence } from '@/lib/selectors';
import { PANEL_CLASS, ViewerLabel } from '@/components/workspace';

type Viewer2DProps = {
  frame: Frame;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  // 현재 필터를 통과한 id 목록. `undefined`이면 "필터 없음"으로 간주하여
  // 컴포넌트를 단독으로 사용할 수 있다 (예: 테스트, 데모).
  visibleIds?: Set<string>;
  // (F3) Name tag in the top-left corner (e.g. the camera name). Optional.
  label?: string;
  // (F4) Zoom mode. When true and the selected box is in this image, the view
  // crops to the area around it and draws the projected 3D box (its 12 edges,
  // front face highlighted) instead of the bounding rectangle. With nothing
  // selected — or a box that is not in this image — the full image is shown.
  zoom?: boolean;
  // (F4) Flips Full ↔ Zoom. When omitted the toggle is not rendered and the
  // viewer behaves exactly as before F4 (COCO).
  onToggleZoom?: () => void;
  // (F4) Key shown next to the toggle (the page owns the shortcut).
  zoomShortcut?: string;
  // (F5) Ready-made rectangles to draw INSTEAD of the frame's own 2D boxes.
  // The viewer does not know what they mean (evaluate mode passes labels and
  // model boxes, see lib/evaluation/overlay): it draws each one as described
  // and, in zoom mode, crops to `overlay.focus`. Omitted → the viewer draws the
  // frame's boxes exactly as before.
  overlay?: ImageOverlay;
  // (F5) Content of the legend pill in the bottom-left corner. Only used with
  // `overlay`, and then always shown (zoomed or not).
  legend?: ReactNode;
  // (F6) What to say after "Selected box is outside <label>" — the page passes
  // where the box IS (e.g. "seen by FR, BR"). Omitted → "check it in the 3D
  // view", for a box no camera shows.
  outsideNote?: string;
};

const SELECTED_STROKE_WIDTH = 4;
const DEFAULT_STROKE_WIDTH = 2;
// Zoom-mode strokes are in SCREEN pixels (`vector-effect: non-scaling-stroke`):
// the crop changes with every box, and widths given in image pixels would get
// thicker or thinner with it.
const WIRE_COLOR = '#ffffff';
const FRONT_COLOR = '#38bdf8'; // sky-400

export function Viewer2D({
  frame,
  selectedId,
  onSelect,
  visibleIds,
  label,
  zoom = false,
  onToggleZoom,
  zoomShortcut,
  overlay,
  legend,
  outsideNote,
}: Viewer2DProps) {
  const [imageError, setImageError] = useState(false);
  // (F6) Keyed on the photo, not only the frame: another camera of the same
  // frame is another file, and its failure / success is its own.
  useEffect(() => { setImageError(false); }, [frame.id, frame.imageUrl]);
  // 화면에 그릴 2D detection 목록을 만드는 부분. SVG는 CSS z-index를 무시하고
  // paint order(배열 순서)대로 hit-test 하므로, 면적 오름차순으로 정렬해 큰
  // bbox가 마지막에 그려지게 → 겹친 영역에서 큰 객체가 클릭 우선순위를 가짐.
  // (F5) With an `overlay` the frame's own boxes are not drawn at all.
  const detections = overlay
    ? []
    : (
        visibleIds
          ? frame.detections2D.filter((d) => visibleIds.has(d.id))
          : frame.detections2D
      )
        .slice()
        .sort(
          (a, b) =>
            a.bbox.width * a.bbox.height - b.bbox.width * b.bbox.height,
        );
  const showConfidence = frameHasConfidence(frame);

  // (F4) What the zoom centres on: the selected box, if it is drawn here.
  const selected = selectedId
    ? detections.find((d) => d.id === selectedId) ?? null
    : null;
  // (F5) …or, with an overlay, the area the overlay asks to keep in view.
  const focus = overlay ? overlay.focus : (selected?.bbox ?? null);
  const whole: ImageRegion = { x: 0, y: 0, width: frame.imageWidth, height: frame.imageHeight };
  const region = zoom && focus ? zoomRegion(focus, frame.imageWidth, frame.imageHeight) : whole;
  // The F4 presentation (projected 3D box, faint neighbours) — never with an overlay.
  const zoomed = zoom && selected !== null;
  // The selected object exists in 3D but has no projection in this image
  // (beside / behind the camera, Edge_F#2 Case 1). Say so, instead of leaving
  // the reviewer looking for a highlight that cannot be there. Only on viewers
  // that have the zoom toggle, i.e. where boxes are projections of 3D boxes.
  const outsideImage =
    onToggleZoom !== undefined &&
    selectedId != null &&
    !frame.detections2D.some((d) => d.id === selectedId) &&
    frame.detections3D.some((d) => d.id === selectedId);

  return (
    // 크기는 부모 칸이 정한다(F3: WorkspaceShell). 이 컴포넌트는 받은 칸을 채우기만
    // 하고, 사진은 preserveAspectRatio="meet"로 칸 안에 비율을 유지해 들어간다.
    // 선택 해제 핸들러는 <svg>가 아니라 wrapper에 둔다.
    // 이미지의 종횡비가 칸의 종횡비와 다를 때 생기는 letterbox/pillarbox 영역을 클릭해도
    // 선택이 해제되도록 하기 위해서다.
    // <rect>들은 stopPropagation을 호출하므로,
    // bbox 클릭은 여전히 “선택만 하기”로 처리된다.
    // Edge_#9.5 Case B.
    <div
      className={`relative w-full h-full ${PANEL_CLASS}`}
      onClick={() => onSelect?.(null)}
    >
    {label && <ViewerLabel>{label}</ViewerLabel>}
    {onToggleZoom && (
      <ZoomToggle zoom={zoom} onToggle={onToggleZoom} shortcut={zoomShortcut} />
    )}
    <svg
      viewBox={`${region.x} ${region.y} ${region.width} ${region.height}`}
      preserveAspectRatio="xMidYMid meet"
      className="w-full h-full block"
    >
      <defs>
        {/* 선택된 bbox에 적용할 SVG 글로우 필터 — 외부 패키지 불필요.
            선택된 요소 하나에만 렌더링되므로 성능 영향 무시할 수 있음. */}
        <filter id="bbox-selected-glow" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {imageError ? (
        <>
          <rect
            x={0}
            y={0}
            width={frame.imageWidth}
            height={frame.imageHeight}
            fill="#27272a"
          />
          <text
            x={region.x + region.width / 2}
            y={region.y + region.height / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#71717a"
            fontSize={(14 * region.width) / frame.imageWidth}
            fontFamily="sans-serif"
          >
            Image unavailable
          </text>
        </>
      ) : (
        <image
          href={frame.imageUrl}
          x={0}
          y={0}
          width={frame.imageWidth}
          height={frame.imageHeight}
          onError={() => setImageError(true)}
        />
      )}
      {detections.map((d) => {
        const isSelected = d.id === selectedId;

        // (F4) Zoomed view: the selected box is drawn as its projected 3D box
        // (below); the others stay as faint clickable rectangles without labels
        // so they do not compete with it.
        if (zoomed) {
          return (
            <rect
              key={d.id}
              x={d.bbox.x}
              y={d.bbox.y}
              width={d.bbox.width}
              height={d.bbox.height}
              fill="transparent"
              stroke={isSelected ? 'none' : getClassColor(d.class)}
              strokeOpacity={0.4}
              strokeWidth={1.2}
              vectorEffect="non-scaling-stroke"
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.(d.id);
              }}
            />
          );
        }

        const color = isSelected ? SELECTED_COLOR : getClassColor(d.class);
        const strokeWidth = isSelected ? SELECTED_STROKE_WIDTH : DEFAULT_STROKE_WIDTH;
        // Measured (nuScenes) frames: class only — the 1.0 is a parser
        // placeholder, not a score (Rule #6). Same flag as the 3D label pill.
        // (F7) Short class name: "movable_object.trafficcone" would cover the box.
        const labelText = showConfidence
          ? `${classLabel(d.class)} ${d.confidence.toFixed(2)}`
          : classLabel(d.class);
        // 글자당 약 7px로 fontSize=12 sans-serif를 근사. 의도적으로 약간 크게 잡아
        // 불확실할 때 end-anchor 쪽으로 치우치게 함; 오판해도 시각적으로 표시 안 남.
        const estLabelWidth = labelText.length * 7;
        const overflowRight = d.bbox.x + estLabelWidth > frame.imageWidth;
        const labelX = overflowRight
          ? d.bbox.x + d.bbox.width - 2
          : d.bbox.x + 2;
        const labelAnchor = overflowRight ? 'end' : 'start';
        // 위쪽 우선; 아래로 대체; 둘 다 이미지를 벗어나면 bbox 내부 상단.
        const labelY =
          d.bbox.y > 16
            ? d.bbox.y - 3
            : d.bbox.y + d.bbox.height + 14 <= frame.imageHeight - 2
              ? d.bbox.y + d.bbox.height + 14
              : d.bbox.y + 14;

        return (
          <g key={d.id}>
            <rect
              x={d.bbox.x}
              y={d.bbox.y}
              width={d.bbox.width}
              height={d.bbox.height}
              fill="transparent"
              stroke={color}
              strokeWidth={strokeWidth}
              filter={isSelected ? 'url(#bbox-selected-glow)' : undefined}
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.(d.id);
              }}
            />
            <text
              x={labelX}
              y={labelY}
              textAnchor={labelAnchor}
              fill={color}
              fontSize={12}
              fontFamily="sans-serif"
              style={{ userSelect: 'none', pointerEvents: 'none' }}
            >
              {labelText}
            </text>
          </g>
        );
      })}
      {zoomed && <ProjectedBox detection={selected} />}
      {overlay && <OverlayRects rects={overlay.rects} region={region} onSelect={onSelect} />}
    </svg>
    {overlay && legend && (
      <span className="absolute left-2 bottom-2 z-10 pointer-events-none select-none inline-flex items-center gap-2.5 rounded px-2 py-0.5 text-[10px] text-zinc-300 bg-zinc-950/75 ring-1 ring-zinc-700">
        {legend}
      </span>
    )}
    {zoomed && selected.corners && (
      <span className="absolute left-2 bottom-2 z-10 pointer-events-none select-none inline-flex items-center gap-2 rounded px-2 py-0.5 text-[10px] text-zinc-300 bg-zinc-950/75 ring-1 ring-zinc-700">
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-0.5 bg-white" />
          3D box projected
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-0.5 bg-sky-400" />
          front
        </span>
      </span>
    )}
    {outsideImage && (
      <span
        // (F5) Sits above the legend pill when there is one.
        className={`absolute left-1/2 ${overlay && legend ? 'bottom-9' : 'bottom-2.5'} z-10 -translate-x-1/2 whitespace-nowrap pointer-events-none select-none rounded px-2.5 py-1 text-[11px] text-amber-200 bg-zinc-950/80 ring-1 ring-amber-500/45`}
      >
        Selected box is outside {label ?? 'this camera'} · {outsideNote ?? 'check it in the 3D view'}
      </span>
    )}
    </div>
  );
}

/**
 * (F4) The selected 3D box as it projects into the photo: its 12 edges in
 * white, with the front (heading) face outlined in sky blue and crossed, so the
 * reviewer can compare the box's extent AND orientation with the object. Falls
 * back to the plain bounding rectangle when the box carries no projected
 * corners (data without them).
 */
function ProjectedBox({ detection }: { detection: Detection2D }) {
  const corners = detection.corners;
  if (!corners || corners.length !== 8) {
    return (
      <rect
        x={detection.bbox.x}
        y={detection.bbox.y}
        width={detection.bbox.width}
        height={detection.bbox.height}
        fill="none"
        stroke={WIRE_COLOR}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
    );
  }
  const front = new Set<number>(BOX_FRONT_FACE);
  const line = (a: number, b: number, stroke: string, width: number, key: string) => (
    <line
      key={key}
      x1={corners[a][0]}
      y1={corners[a][1]}
      x2={corners[b][0]}
      y2={corners[b][1]}
      stroke={stroke}
      strokeWidth={width}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
    />
  );
  const [f0, f1, f2, f3] = BOX_FRONT_FACE;
  return (
    <g pointerEvents="none">
      {BOX_EDGES.filter(([a, b]) => !(front.has(a) && front.has(b))).map(([a, b]) =>
        line(a, b, WIRE_COLOR, 1.6, `e${a}-${b}`),
      )}
      {BOX_FRONT_FACE.map((a, i) =>
        line(a, BOX_FRONT_FACE[(i + 1) % 4], FRONT_COLOR, 2.2, `f${a}`),
      )}
      {/* Diagonals mark the front face so the heading reads at a glance. */}
      {line(f0, f2, FRONT_COLOR, 1.2, 'd1')}
      {line(f1, f3, FRONT_COLOR, 1.2, 'd2')}
    </g>
  );
}

// (F5) How an overlay rectangle is stroked, by emphasis. Widths and dashes are
// in SCREEN pixels (`non-scaling-stroke`), so they look the same in the full
// image and at any zoom.
const OVERLAY_STYLE: Record<
  ImageRect['emphasis'],
  { width: number; opacity: number; dash: string }
> = {
  selected: { width: 2.6, opacity: 1, dash: '7 4' },
  normal: { width: 1.5, opacity: 0.95, dash: '5 3' },
  dim: { width: 1.1, opacity: 0.35, dash: '4 3' },
};

/**
 * (F5) Draws an overlay: every rectangle as described, then the captions on
 * top of all of them. A rectangle with a `selectId` is clickable (its whole
 * area, like the regular boxes); one without is context and lets clicks through.
 */
function OverlayRects({
  rects,
  region,
  onSelect,
}: {
  rects: ImageRect[];
  region: ImageRegion;
  onSelect?: (id: string | null) => void;
}) {
  // Caption size follows the visible region, so it is the same on screen in the
  // full image and at any zoom (~3% of the cell width ≈ 11–12 px).
  const fontSize = region.width * 0.03;
  const right = region.x + region.width;
  const bottom = region.y + region.height;
  return (
    <>
      {rects.map((rect) => {
        const style = OVERLAY_STYLE[rect.emphasis];
        const { selectId } = rect;
        return (
          <rect
            key={rect.key}
            x={rect.bbox.x}
            y={rect.bbox.y}
            width={rect.bbox.width}
            height={rect.bbox.height}
            fill="transparent"
            stroke={rect.color}
            strokeWidth={style.width}
            strokeOpacity={style.opacity}
            strokeDasharray={rect.dashed ? style.dash : undefined}
            vectorEffect="non-scaling-stroke"
            pointerEvents={selectId ? undefined : 'none'}
            className={selectId ? 'cursor-pointer' : undefined}
            onClick={
              selectId
                ? (e) => {
                    e.stopPropagation();
                    onSelect?.(selectId);
                  }
                : undefined
            }
          />
        );
      })}
      {rects.map((rect) => {
        if (!rect.caption) return null;
        const { bbox } = rect;
        // Dashed boxes (labels) are captioned below, solid ones (model boxes)
        // above, so the two captions of a matched pair do not collide. Each
        // moves inside the box when it would leave the visible region.
        const below = bbox.y + bbox.height + fontSize * 1.15;
        const above = bbox.y - fontSize * 0.45;
        const y = rect.dashed
          ? below <= bottom - fontSize * 0.3
            ? below
            : bbox.y + bbox.height - fontSize * 0.45
          : above >= region.y + fontSize
            ? above
            : bbox.y + fontSize * 1.15;
        const estimatedWidth = rect.caption.length * fontSize * 0.56;
        const fitsFromLeft = Math.max(bbox.x, region.x) + estimatedWidth <= right;
        return (
          <text
            key={`caption:${rect.key}`}
            x={fitsFromLeft ? Math.max(bbox.x, region.x + fontSize * 0.3) : Math.min(bbox.x + bbox.width, right - fontSize * 0.3)}
            y={y}
            textAnchor={fitsFromLeft ? 'start' : 'end'}
            fill={rect.color}
            fontSize={fontSize}
            fontWeight={600}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            // Dark outline behind the letters: readable on any part of the photo.
            stroke="#09090b"
            strokeWidth={fontSize * 0.28}
            strokeLinejoin="round"
            paintOrder="stroke"
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          >
            {rect.caption}
          </text>
        );
      })}
    </>
  );
}

function ZoomToggle({
  zoom,
  onToggle,
  shortcut,
}: {
  zoom: boolean;
  onToggle: () => void;
  shortcut?: string;
}) {
  const segment = (active: boolean) =>
    [
      'px-1.5 py-0.5 rounded-[3px]',
      active ? 'bg-sky-400/25 text-sky-100 ring-1 ring-inset ring-sky-400/45' : 'text-zinc-400',
    ].join(' ');
  return (
    <button
      type="button"
      aria-pressed={zoom}
      aria-label={zoom ? 'Show the full camera image' : 'Zoom the camera image to the selected box'}
      aria-keyshortcuts={shortcut}
      title="Full image / zoom to the selected box"
      // The wrapper deselects on click; this is a control, not empty space.
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
        // Same reason as the verdict buttons: do not leave a focused button
        // behind for Space / Enter to re-trigger.
        if (e.detail > 0) e.currentTarget.blur();
      }}
      className="absolute top-2 right-2 z-10 inline-flex items-center gap-0.5 rounded p-0.5 text-[10px] font-semibold uppercase tracking-wider bg-zinc-950/75 ring-1 ring-zinc-700 hover:ring-zinc-500"
    >
      <span className={segment(!zoom)}>Full</span>
      <span className={segment(zoom)}>Zoom</span>
      {shortcut && (
        <kbd className="ml-1 mr-0.5 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-[3px] border border-zinc-600 font-mono text-[10px] leading-none text-zinc-500">
          {shortcut}
        </kbd>
      )}
    </button>
  );
}

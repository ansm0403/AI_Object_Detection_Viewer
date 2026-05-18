'use client';

import { useEffect, useState } from 'react';
import type { Frame } from '@/lib/types';
import { getClassColor, SELECTED_COLOR } from '@/lib/ui/class-colors';

type Viewer2DProps = {
  frame: Frame;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  // Ids that pass the current filters. `undefined` means "no filter" so the
  // component works standalone (e.g. tests, demos).
  visibleIds?: Set<string>;
};

const SELECTED_STROKE_WIDTH = 4;
const DEFAULT_STROKE_WIDTH = 2;

export function Viewer2D({ frame, selectedId, onSelect, visibleIds }: Viewer2DProps) {
  const [imageError, setImageError] = useState(false);
  useEffect(() => { setImageError(false); }, [frame.id]);
  // Paint smaller bboxes first so larger ones land on top. This mirrors the
  // 3D estimator's depth convention (larger bbox area → smaller z → closer to
  // camera) so a click in an overlap region selects the same object the 3D
  // viewer shows as front-most. See docs/edgecases/Edge_#2.md Case 1 and
  // docs/edgecases/Edge_#4.md Case 1. Heuristic limit: frames where a larger
  // background object encloses a smaller foreground object will be wrong;
  // ObjectList remains the non-spatial fallback.
  const detections = (
    visibleIds
      ? frame.detections2D.filter((d) => visibleIds.has(d.id))
      : frame.detections2D
  )
    .slice()
    .sort(
      (a, b) =>
        a.bbox.width * a.bbox.height - b.bbox.width * b.bbox.height,
    );
  return (
    // Deselect handler on the wrapper (not the <svg>) so clicks on the
    // letterbox/pillarbox bands that appear when the image aspect ratio
    // differs from 4:3 also clear the selection. <rect>s call
    // stopPropagation so bbox clicks still resolve to select-only.
    // Edge_#9.5 Case B.
    <div
      className="relative w-full aspect-[4/3] bg-zinc-950 rounded overflow-hidden"
      onClick={() => onSelect?.(null)}
    >
    <svg
      viewBox={`0 0 ${frame.imageWidth} ${frame.imageHeight}`}
      preserveAspectRatio="xMidYMid meet"
      className="w-full h-full block"
    >
      <defs>
        {/* Native SVG glow for selected bbox — no external packages needed.
            Rendered only for the one selected element; performance impact is negligible. */}
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
            x={frame.imageWidth / 2}
            y={frame.imageHeight / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#71717a"
            fontSize={14}
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
        const color = isSelected ? SELECTED_COLOR : getClassColor(d.class);
        const strokeWidth = isSelected ? SELECTED_STROKE_WIDTH : DEFAULT_STROKE_WIDTH;
        const labelText = `${d.class} ${d.confidence.toFixed(2)}`;
        // ~7 px/char approximates fontSize=12 sans-serif. Slight overestimate
        // biases toward end-anchoring when in doubt; misclassification is invisible.
        const estLabelWidth = labelText.length * 7;
        const overflowRight = d.bbox.x + estLabelWidth > frame.imageWidth;
        const labelX = overflowRight
          ? d.bbox.x + d.bbox.width - 2
          : d.bbox.x + 2;
        const labelAnchor = overflowRight ? 'end' : 'start';
        // Prefer above; fall back to below; inside-top if both clip the image.
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
    </svg>
    </div>
  );
}

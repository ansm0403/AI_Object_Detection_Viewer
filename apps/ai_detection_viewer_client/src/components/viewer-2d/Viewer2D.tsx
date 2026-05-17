'use client';

import type { Frame } from '@/lib/types';

type Viewer2DProps = {
  frame: Frame;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
};

const CLASS_COLORS: Record<string, string> = {
  person: '#4ade80',
  bicycle: '#facc15',
  car: '#f87171',
};

const DEFAULT_COLOR = '#60a5fa';

const SELECTED_COLOR = '#ffffff';
const SELECTED_STROKE_WIDTH = 4;
const DEFAULT_STROKE_WIDTH = 2;

export function Viewer2D({ frame, selectedId, onSelect }: Viewer2DProps) {
  return (
    <svg
      viewBox={`0 0 ${frame.imageWidth} ${frame.imageHeight}`}
      preserveAspectRatio="xMidYMid meet"
      className="w-full h-auto block"
      onClick={() => onSelect?.(null)}
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
      <image
        href={frame.imageUrl}
        x={0}
        y={0}
        width={frame.imageWidth}
        height={frame.imageHeight}
      />
      {frame.detections2D.map((d) => {
        const isSelected = d.id === selectedId;
        const color = isSelected ? SELECTED_COLOR : (CLASS_COLORS[d.class] ?? DEFAULT_COLOR);
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
  );
}

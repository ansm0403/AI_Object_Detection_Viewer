'use client';

import { useEffect, useState } from 'react';
import type { Frame } from '@/lib/types';
import { getClassColor, SELECTED_COLOR } from '@/lib/ui/class-colors';

type Viewer2DProps = {
  frame: Frame;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  // 현재 필터를 통과한 id 목록. `undefined`이면 "필터 없음"으로 간주하여
  // 컴포넌트를 단독으로 사용할 수 있다 (예: 테스트, 데모).
  visibleIds?: Set<string>;
};

const SELECTED_STROKE_WIDTH = 4;
const DEFAULT_STROKE_WIDTH = 2;

export function Viewer2D({ frame, selectedId, onSelect, visibleIds }: Viewer2DProps) {
  const [imageError, setImageError] = useState(false);
  useEffect(() => { setImageError(false); }, [frame.id]);
  // 화면에 그릴 2D detection 목록을 만드는 부분. SVG는 CSS z-index를 무시하고
  // paint order(배열 순서)대로 hit-test 하므로, 면적 오름차순으로 정렬해 큰
  // bbox가 마지막에 그려지게 → 겹친 영역에서 큰 객체가 클릭 우선순위를 가짐.
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
    // 선택 해제 핸들러는 <svg>가 아니라 wrapper에 둔다.
    // 이미지의 종횡비가 4:3과 다를 때 생기는 letterbox/pillarbox 영역을 클릭해도
    // 선택이 해제되도록 하기 위해서다.
    // <rect>들은 stopPropagation을 호출하므로,
    // bbox 클릭은 여전히 “선택만 하기”로 처리된다.
    // Edge_#9.5 Case B.
    <div
      className="relative w-full aspect-[4/3] bg-zinc-900 rounded-lg ring-1 ring-inset ring-zinc-800 overflow-hidden"
      onClick={() => onSelect?.(null)}
    >
    <svg
      viewBox={`0 0 ${frame.imageWidth} ${frame.imageHeight}`}
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
    </svg>
    </div>
  );
}

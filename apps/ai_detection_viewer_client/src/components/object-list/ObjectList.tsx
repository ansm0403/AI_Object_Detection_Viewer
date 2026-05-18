'use client';

import { useEffect, useRef } from 'react';
import type { Frame } from '@/lib/types';
import { getClassColor } from '@/lib/ui/class-colors';

type ObjectListProps = {
  frame: Frame;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  // Ids that pass the current filters. The list keeps showing ALL detections
  // (so the non-spatial selection path from Edge_#4 Case 1 still works for
  // filtered-out objects); hidden rows are dimmed instead.
  visibleIds?: Set<string>;
};

export function ObjectList({ frame, selectedId, onSelect, visibleIds }: ObjectListProps) {
  const selectedRef = useRef<HTMLLIElement | null>(null);

  // Scroll selected row into view when selection changes from outside the list.
  // Adjusts the <ul>'s scrollTop directly instead of calling scrollIntoView —
  // the latter chains up to every scrollable ancestor (including <body>) and
  // can scroll the page on short viewports. See Edge_#9.5 Case C.
  useEffect(() => {
    if (!selectedId) return;
    const li = selectedRef.current;
    const ul = li?.parentElement;
    if (!li || !ul) return;
    const liTop = li.offsetTop;
    const liBottom = liTop + li.offsetHeight;
    const viewTop = ul.scrollTop;
    const viewBottom = viewTop + ul.clientHeight;
    if (liTop < viewTop) {
      ul.scrollTop = liTop;
    } else if (liBottom > viewBottom) {
      ul.scrollTop = liBottom - ul.clientHeight;
    }
  }, [selectedId]);

  return (
    <div
      className="flex flex-col max-h-[60vh] md:max-h-none h-full bg-zinc-900 rounded-lg overflow-hidden"
      onClick={() => onSelect?.(null)}
    >
      <div
        className="px-3 py-2 border-b border-zinc-800 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
          Objects
          <span className="ml-2 text-zinc-500 font-normal normal-case tracking-normal">
            ({frame.detections2D.length})
          </span>
        </h2>
      </div>

      {frame.detections2D.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-zinc-500">No objects detected in this frame.</p>
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto divide-y divide-zinc-800">
          {frame.detections2D.map((d) => {
            const isSelected = d.id === selectedId;
            const isHidden = visibleIds ? !visibleIds.has(d.id) : false;
            const color = getClassColor(d.class);

            return (
              <li
                key={d.id}
                ref={isSelected ? selectedRef : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect?.(d.id);
                }}
                className={[
                  'flex items-center gap-2 px-3 py-2 cursor-pointer select-none',
                  'transition-colors duration-100',
                  isSelected
                    ? 'bg-zinc-800 ring-1 ring-inset ring-sky-400/60'
                    : 'hover:bg-zinc-800/60',
                  // Filtered-out rows: dimmed but still clickable so they
                  // remain a non-spatial selection path (Edge_#4 Case 1).
                  isHidden ? 'opacity-40' : '',
                ].join(' ')}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="flex-1 text-sm text-zinc-100 truncate">{d.class}</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {/* Confidence gauge track */}
                  <span className="w-12 h-1 rounded bg-zinc-800 overflow-hidden">
                    <span
                      className="block h-full bg-sky-400/70 rounded"
                      style={{ width: `${d.confidence * 100}%` }}
                    />
                  </span>
                  <span className="text-xs text-zinc-400 tabular-nums w-8 text-right">
                    {d.confidence.toFixed(2)}
                  </span>
                </span>
                <span className="text-xs text-zinc-600 tabular-nums shrink-0 ml-1">
                  {d.id}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

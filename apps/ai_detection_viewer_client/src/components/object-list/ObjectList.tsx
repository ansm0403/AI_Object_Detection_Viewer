'use client';

import type { Frame } from '@/lib/types';

type ObjectListProps = {
  frame: Frame;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
};

// Mirrors Viewer2D CLASS_COLORS — consolidated in Step 9 UI Cleanup.
const CLASS_COLORS: Record<string, string> = {
  person: '#4ade80',
  bicycle: '#facc15',
  car: '#f87171',
};
const DEFAULT_COLOR = '#60a5fa';

export function ObjectList({ frame, selectedId, onSelect }: ObjectListProps) {
  return (
    <div
      className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden"
      onClick={() => onSelect?.(null)}
    >
      <div className="px-3 py-2 border-b border-gray-700 shrink-0">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
          Objects
          <span className="ml-2 text-gray-500 font-normal normal-case tracking-normal">
            ({frame.detections2D.length})
          </span>
        </h2>
      </div>

      {frame.detections2D.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-gray-500">No objects detected in this frame.</p>
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto divide-y divide-gray-800">
          {frame.detections2D.map((d) => {
            const isSelected = d.id === selectedId;
            const color = CLASS_COLORS[d.class] ?? DEFAULT_COLOR;

            return (
              <li
                key={d.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect?.(d.id);
                }}
                className={[
                  'flex items-center gap-2 px-3 py-2 cursor-pointer select-none',
                  'transition-colors duration-100',
                  isSelected
                    ? 'bg-gray-700 ring-1 ring-inset ring-white/60'
                    : 'hover:bg-gray-800',
                ].join(' ')}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="flex-1 text-sm text-gray-100 truncate">{d.class}</span>
                <span className="text-xs text-gray-400 tabular-nums shrink-0">
                  {d.confidence.toFixed(2)}
                </span>
                <span className="text-xs text-gray-600 tabular-nums shrink-0 ml-1">
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

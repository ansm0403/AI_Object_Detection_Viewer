'use client';

import { getClassColor } from '@/lib/ui/class-colors';

type Props = {
  // Insertion order is render order. `selectClassCounts` preserves first
  // appearance in `frame.detections2D`.
  counts: Map<string, number>;
  // Direct store reflection. Permissive-empty semantic mirrors ClassToggles:
  // empty Set = every class active (show all).
  visibleClasses: Set<string>;
  onToggleClass: (className: string) => void;
};

export function ClassCountBar({ counts, visibleClasses, onToggleClass }: Props) {
  const showAll = visibleClasses.size === 0;
  const rows = [...counts.entries()];
  const maxCount = Math.max(1, ...rows.map(([, c]) => c));

  return (
    <section className="px-3 py-3 border-t border-zinc-800">
      <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
        Classes
      </h3>
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-500">No detections in this frame.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map(([className, count]) => {
            const active = showAll || visibleClasses.has(className);
            const color = getClassColor(className);
            const pct = (count / maxCount) * 100;
            return (
              <li key={className}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleClass(className);
                  }}
                  aria-pressed={active}
                  className={[
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded text-left',
                    'transition-colors select-none',
                    active
                      ? 'bg-sky-400/10 hover:bg-sky-400/20'
                      : 'bg-transparent hover:bg-zinc-800/60 opacity-50',
                  ].join(' ')}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: active ? color : '#3f3f46' }}
                  />
                  <span className="text-sm text-zinc-100 w-16 shrink-0 truncate">
                    {className}
                  </span>
                  <span className="flex-1 h-1.5 rounded bg-zinc-800 overflow-hidden">
                    <span
                      className="block h-full rounded"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: active ? color : '#3f3f46',
                      }}
                    />
                  </span>
                  <span className="text-xs text-zinc-300 tabular-nums w-6 text-right">
                    {count}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

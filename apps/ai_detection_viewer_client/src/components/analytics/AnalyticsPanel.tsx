'use client';

import type { Frame } from '@/lib/types';
import { SelectedObjectInfo } from '@/components/inspector';
import { ConfidenceHistogram, ClassCountBar } from '@/components/charts';

type Props = {
  frame: Frame;
  selectedId: string | null;
  buckets: number[];
  threshold: number;
  counts: Map<string, number>;
  visibleClasses: Set<string>;
  onToggleClass: (className: string) => void;
};

export function AnalyticsPanel({
  frame,
  selectedId,
  buckets,
  threshold,
  counts,
  visibleClasses,
  onToggleClass,
}: Props) {
  return (
    <aside className="flex flex-col bg-zinc-900 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-zinc-800 shrink-0">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
          Analytics
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        <SelectedObjectInfo frame={frame} selectedId={selectedId} />
        <ConfidenceHistogram buckets={buckets} threshold={threshold} />
        <ClassCountBar
          counts={counts}
          visibleClasses={visibleClasses}
          onToggleClass={onToggleClass}
        />
      </div>
    </aside>
  );
}

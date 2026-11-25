'use client';

import type { Frame } from '@/lib/types';
import { SelectedObjectInfo } from '@/components/inspector';
import { ConfidenceHistogram, ClassCountBar } from '@/components/charts';
import { frameHasConfidence } from '@/lib/selectors';
import { PANEL_CLASS, PanelHeader, SECTION_TITLE_CLASS } from '@/components/workspace';

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
    <aside className={`flex flex-col h-full ${PANEL_CLASS}`}>
      <PanelHeader title="Analytics" />
      <div className="flex-1 overflow-y-auto">
        <SelectedObjectInfo frame={frame} selectedId={selectedId} />
        {/* Measured (nuScenes) frames have no model scores — every box would
            land in the top bucket as a fake "100%" distribution (Rule #6). Swap
            the histogram for a one-line note, mirroring how Filters swaps the
            confidence slider for the distance slider on the same frames. */}
        {frameHasConfidence(frame) ? (
          <ConfidenceHistogram buckets={buckets} threshold={threshold} />
        ) : (
          <NoConfidenceNote />
        )}
        <ClassCountBar
          counts={counts}
          visibleClasses={visibleClasses}
          onToggleClass={onToggleClass}
        />
      </div>
    </aside>
  );
}

// Keeps the "Confidence" slot (same heading + spacing as ConfidenceHistogram)
// so the panel doesn't reflow when switching datasets, but states plainly that
// measured annotations carry no model score instead of drawing a fake one.
function NoConfidenceNote() {
  return (
    <section className="px-3 py-3 border-t border-zinc-800">
      <h3 className={`${SECTION_TITLE_CLASS} mb-2`}>Confidence</h3>
      <p className="text-xs text-zinc-500">
        Measured annotations · no confidence scores
      </p>
    </section>
  );
}

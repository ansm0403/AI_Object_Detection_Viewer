'use client';

import type { ReactNode } from 'react';
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
  // (F4) The panel doubles as the review panel on measured frames. It stays
  // unaware of what a review is: the page passes a title, a right-hand header
  // note and a block of controls. `controls` is rendered ABOVE the scroll area
  // so it never scrolls out of reach. All three absent → the panel is exactly
  // the pre-F4 "Analytics" panel (COCO).
  title?: string;
  headerRight?: ReactNode;
  controls?: ReactNode;
};

export function AnalyticsPanel({
  frame,
  selectedId,
  buckets,
  threshold,
  counts,
  visibleClasses,
  onToggleClass,
  title = 'Analytics',
  headerRight,
  controls,
}: Props) {
  return (
    <aside className={`flex flex-col h-full ${PANEL_CLASS}`}>
      <PanelHeader title={title}>{headerRight}</PanelHeader>
      {controls}
      <div className="flex-1 min-h-0 overflow-y-auto">
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

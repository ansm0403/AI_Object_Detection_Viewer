'use client';

import type { ReactNode } from 'react';
import type { Frame } from '@/lib/types';

export type DatasetId = 'coco' | 'nuscenes';

type HeaderProps = {
  frameIndex: number;
  frameCount: number;
  detectionCount: number;
  // (F2-A) Active dataset + switcher. COCO and nuScenes coexist; the switcher
  // is an app-level mode, so it lives in the Header (not the per-frame Filters).
  datasetId: DatasetId;
  onSelectDataset: (id: DatasetId) => void;
  // (F2-A) Provenance of the current frame's 3D data, surfaced as an
  // Estimated/Measured badge so depth source is never misrepresented
  // (Immutable Rule #6). Optional/absent → no badge.
  source?: Frame['source'];
  // (F4) Extra content at the right of the bar, after the frame meta (the page
  // passes the review progress on nuScenes). The Header does not know what it
  // is — it stays presentation-only and reads no store.
  children?: ReactNode;
  // (F4-F) Practice mode. `practiceActive` = the data on screen IS the practice
  // set (some boxes deliberately modified): the provenance badge then says so
  // and never reads "Measured" (Immutable Rule #6). `practiceRequested` drives
  // the toggle's pressed state (it leads `practiceActive` by one data load).
  // The toggle is rendered only when `onTogglePractice` is passed (nuScenes).
  practiceActive?: boolean;
  practiceRequested?: boolean;
  onTogglePractice?: () => void;
};

const DATASETS: { id: DatasetId; label: string }[] = [
  { id: 'coco', label: 'COCO' },
  { id: 'nuscenes', label: 'nuScenes' },
];

export function Header({
  frameIndex,
  frameCount,
  detectionCount,
  datasetId,
  onSelectDataset,
  source,
  children,
  practiceActive = false,
  practiceRequested = false,
  onTogglePractice,
}: HeaderProps) {
  const measured = source === 'nuscenes-measured';
  // Only render a badge when we know the provenance.
  const badge = practiceActive
    ? {
        // The LiDAR and the photos are still measured, but the BOXES on screen
        // are not the dataset's annotations any more — say that, in the amber
        // used for "not the real thing".
        text: 'Practice · labels modified',
        className: 'bg-amber-500/15 text-amber-300 ring-amber-500/40',
        title:
          'Practice set — some boxes were deliberately changed. These are NOT the original nuScenes annotations.',
      }
    : source
    ? {
        text: measured ? 'Measured' : 'Estimated',
        // Measured = real sensor 3D (emerald); Estimated = inferred from 2D (amber).
        className: measured
          ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30'
          : 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
        title: measured
          ? 'Measured 3D — real nuScenes sensor annotations'
          : 'Estimated 3D — inferred from 2D bounding boxes',
      }
    : null;

  return (
    // (F3) A flush app bar across the top of the workspace (not a floating card).
    <header className="flex items-center justify-between flex-wrap gap-x-4 gap-y-2 h-full bg-zinc-900 border-b border-zinc-800 px-4 py-2">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-zinc-100 tracking-tight">
          AI Detection Viewer
        </span>

        {/* Dataset switcher (segmented control). */}
        <div
          role="group"
          aria-label="Dataset"
          className="flex items-center rounded-md bg-zinc-800 p-0.5"
        >
          {DATASETS.map((d) => {
            const active = d.id === datasetId;
            return (
              <button
                key={d.id}
                type="button"
                aria-pressed={active}
                onClick={() => onSelectDataset(d.id)}
                className={[
                  'px-2.5 py-1 text-xs rounded transition-colors',
                  active
                    ? 'bg-sky-500/20 text-sky-200 ring-1 ring-inset ring-sky-400/40'
                    : 'text-zinc-400 hover:text-zinc-200',
                ].join(' ')}
              >
                {d.label}
              </button>
            );
          })}
        </div>

        {badge && (
          <span
            title={badge.title}
            className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded ring-1 ring-inset ${badge.className}`}
          >
            {badge.text}
          </span>
        )}

        {onTogglePractice && (
          <button
            type="button"
            aria-pressed={practiceRequested}
            title="Practice set: the same scene with a few boxes deliberately made wrong, to practise catching errors. Reviews are kept separately."
            onClick={(e) => {
              onTogglePractice();
              if (e.detail > 0) e.currentTarget.blur();
            }}
            className={[
              'inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-[11px] transition-colors',
              practiceRequested
                ? 'bg-amber-400 text-zinc-950 font-semibold hover:bg-amber-300'
                : 'text-zinc-400 ring-1 ring-inset ring-zinc-700 hover:text-zinc-200 hover:ring-zinc-500',
            ].join(' ')}
          >
            <span
              aria-hidden="true"
              className={`w-1.5 h-1.5 rounded-full ${practiceRequested ? 'bg-zinc-950' : 'bg-zinc-600'}`}
            />
            Practice
          </button>
        )}
      </div>

      {/* (F3) The header is also shown while loading / on error so the dataset
          switcher stays usable; there is no frame meta to show then. */}
      {frameCount > 0 && (
        <div className="flex items-center flex-wrap gap-x-3.5 gap-y-1">
          <span className="text-xs text-zinc-400 tabular-nums">
            Frame {frameIndex}/{frameCount}
            {/* (F4) With the review progress next to it, the bar does not fit
                one line below 1280px: the box count yields (it is also the
                "OBJECTS n" title of the list). Without review content it stays. */}
            <span className={children ? 'hidden xl:inline' : undefined}>
              {' '}
              · {detectionCount} detections
            </span>
          </span>
          {/* (F4) Review progress / actions for datasets that are reviewed. */}
          {children && (
            <>
              <span aria-hidden="true" className="hidden lg:block w-px h-5 bg-zinc-800" />
              {children}
            </>
          )}
        </div>
      )}
    </header>
  );
}

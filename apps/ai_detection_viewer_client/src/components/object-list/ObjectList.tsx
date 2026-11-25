'use client';

import { useMemo, type ReactNode } from 'react';
import type { Detection3D, Frame } from '@/lib/types';
import { bestViewsByObject, cameraShortName } from '@/lib/cameras';
import { getClassColor } from '@/lib/ui/class-colors';
import { displayId } from '@/lib/ui/display-id';
import { PANEL_CLASS, PanelHeader, useScrollSelectedIntoView } from '@/components/workspace';
import { detectionDistance, frameHasConfidence } from '@/lib/selectors';
import type { Verdict } from '@/lib/review';
import { EvidenceBars, StatusIcon } from '@/components/review';

type ObjectListProps = {
  frame: Frame;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  // Ids of the 3D boxes that pass the current filters (F3: the 3D visible set).
  // The list keeps showing ALL boxes (so the non-spatial selection path from
  // Edge_#4 Case 1 still works for filtered-out objects); hidden rows are
  // dimmed instead.
  visibleIds?: Set<string>;
  // (F4) Review verdict per object id for THIS frame. When passed, every row
  // ends with a status icon (unreviewed rows get the empty ring). Omitted on
  // datasets that are not reviewed (COCO) → no status column.
  verdicts?: Map<string, Verdict>;
  // (F4) The frame's 3D boxes in the order to list them (the review queue
  // order). Omitted → the dataset order (`frame.detections3D`). The list does
  // not sort anything itself; ordering is `lib/review`'s job.
  boxes?: Detection3D[];
  // (F4) Identifies the current ordering. When it changes, the selected row is
  // scrolled back into view (the same row may have moved far away).
  orderKey?: string;
  // (F4) A thin bar under the title row (the page passes the order control).
  toolbar?: ReactNode;
};

/**
 * (F3, decision 4) Lists every 3D box of the frame, not only the ones one
 * camera sees. The 3D view is the main view (Rule #5), and on nuScenes most
 * boxes are beside / behind the front camera — they were reachable only by
 * clicking in the 3D view before. Rows on measured frames show (F6) which
 * camera's photo shows the box and its distance from the ego vehicle. COCO is
 * 1:1 (2D and 3D share ids), so it lists the same objects.
 */
export function ObjectList({
  frame,
  selectedId,
  onSelect,
  visibleIds,
  verdicts,
  boxes: orderedBoxes,
  orderKey,
  toolbar,
}: ObjectListProps) {
  // Scroll the selected row into view when the selection changes from outside
  // the list (3D / camera click, J / K, auto-advance after a verdict) or when
  // the list is re-ordered. (F5) The logic moved, unchanged, into a hook shared
  // with the evaluation result list.
  //
  // (F6) The row's POSITION is part of the key, not only the ordering's name:
  // under "Unsure first" a verdict moves the selected row to another group while
  // the selection and the ordering stay the same (rejecting the top unsure box
  // sent its row about 900px below the visible list — Edge_F#6 Case 1). The result
  // list had the same need in F5 (Edge_F#5 Case 3).
  const listed = orderedBoxes ?? frame.detections3D;
  const selectedIndex = selectedId ? listed.findIndex((box) => box.id === selectedId) : -1;
  const selectedRef = useScrollSelectedIntoView(selectedId, `${orderKey ?? ''}:${selectedIndex}`);
  // Measured (nuScenes) frames have no model score — the parser's 1.0 is a
  // placeholder, so the confidence gauge is not shown (Rule #6).
  const showConfidence = frameHasConfidence(frame);
  // Measured frames: distance is real metres and "in camera" is meaningful
  // (some boxes have no projection). On COCO both would be fake or trivially
  // true, so neither is shown there.
  const isMeasured = frame.source === 'nuscenes-measured';
  // A 3D box is "seen by a camera" when it has a 2D projection with the same id
  // in that camera's photo (Immutable Rule #1: same object → same id across 2D
  // and 3D). (F6) Asked of EVERY camera of the frame, best view first — not of
  // `frame.detections2D`, which is the default camera alone.
  const camerasById = useMemo(() => bestViewsByObject(frame), [frame]);
  const cameraCount = frame.cameras?.length ?? 1;
  const boxes = orderedBoxes ?? frame.detections3D;
  const unseenCount = boxes.reduce((n, box) => n + (camerasById.has(box.id) ? 0 : 1), 0);

  return (
    <div
      className={`flex flex-col h-full ${PANEL_CLASS}`}
      onClick={() => onSelect?.(null)}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <PanelHeader title="Objects" count={boxes.length}>
          {isMeasured && (
            <span
              className="flex items-center gap-1 text-[11px] text-zinc-500 tabular-nums"
              title={
                cameraCount > 1
                  ? `${boxes.length - unseenCount} of ${boxes.length} boxes are in at least one of the ${cameraCount} camera photos`
                  : undefined
              }
            >
              <CameraIcon inCamera />
              {cameraCount > 1
                ? `${cameraCount} cameras${unseenCount > 0 ? ` · ${unseenCount} unseen` : ''}`
                : `${boxes.length - unseenCount} in camera`}
            </span>
          )}
        </PanelHeader>
        {toolbar}
      </div>

      {boxes.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-zinc-500">No objects in this frame.</p>
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto divide-y divide-zinc-800/70">
          {boxes.map((d) => {
            const isSelected = d.id === selectedId;
            const isHidden = visibleIds ? !visibleIds.has(d.id) : false;
            const seenBy = camerasById.get(d.id) ?? NO_CAMERAS;
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
                  // h-8: dense 32px rows so ~20 of 40 boxes fit at 1440×900.
                  // Tighter gaps below 1400px, where the list column is 240px
                  // and the row carries up to seven cells (F4).
                  'flex items-center gap-1.5 min-[1400px]:gap-2 px-3 h-8 cursor-pointer select-none',
                  'transition-colors duration-100',
                  isSelected
                    ? 'bg-sky-400/10 ring-1 ring-inset ring-sky-400/60'
                    : 'hover:bg-zinc-800/60',
                  // Filtered-out rows: dimmed but still clickable so they
                  // remain a non-spatial selection path (Edge_#4 Case 1).
                  isHidden ? 'opacity-40' : '',
                ].join(' ')}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span title={d.class} className="flex-1 min-w-0 text-sm text-zinc-100 truncate">
                  {d.class}
                </span>
                {isMeasured &&
                  (cameraCount > 1 ? (
                    <CameraTag seenBy={seenBy} />
                  ) : (
                    <CameraIcon inCamera={seenBy.length > 0} />
                  ))}
                {/* (F4) LiDAR evidence — only when the data carries the count. */}
                {d.annotation?.lidarPoints !== undefined && (
                  <EvidenceBars points={d.annotation.lidarPoints} />
                )}
                {showConfidence ? (
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
                ) : isMeasured ? (
                  // Measured distance from the ego vehicle (real metres).
                  // (F6) Narrower below 1400px: the camera tag next to it took
                  // 10px more than the icon it replaced, and the class name
                  // must not pay for it.
                  <span className="text-[11px] text-zinc-500 tabular-nums w-8 min-[1400px]:w-10 text-right shrink-0">
                    {Math.round(detectionDistance(d))} m
                  </span>
                ) : (
                  <span className="text-xs text-zinc-500 tabular-nums w-8 text-right shrink-0">
                    —
                  </span>
                )}
                {/* (F3, decision 7) Short id; the full id is in the tooltip
                    and in the details panel. */}
                <span
                  title={d.id}
                  className="shrink-0 w-10 min-[1400px]:w-12 text-right font-mono text-[11px] text-zinc-500 min-[1400px]:ml-1"
                >
                  {displayId(d.id)}
                </span>
                {verdicts && <StatusIcon verdict={verdicts.get(d.id)} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const NO_CAMERAS: string[] = [];

// (F6) Which camera shows the box, on frames with several cameras: the short
// name of its best view ("FR"), plus "+" when a second camera sees it too. The
// row is narrow, so the full list of cameras is in the tooltip (and in the
// evidence line of the selected box). "—" = no camera sees it.
function CameraTag({ seenBy }: { seenBy: string[] }) {
  const label =
    seenBy.length === 0 ? 'No camera sees this box' : `Seen by ${seenBy.join(', ')}`;
  return (
    <span
      title={label}
      aria-label={label}
      className={`shrink-0 w-[22px] text-right text-[10px] font-semibold tracking-wide tabular-nums ${
        seenBy.length === 0 ? 'text-zinc-700' : 'text-zinc-400'
      }`}
    >
      {seenBy.length === 0 ? '—' : cameraShortName(seenBy[0])}
      {seenBy.length > 1 && <span className="text-zinc-500">+</span>}
    </span>
  );
}

// Inline icon (no icon library in this project). Dim + struck through when the
// box has no projection in the camera image.
function CameraIcon({ inCamera }: { inCamera: boolean }) {
  const label = inCamera ? 'In camera image' : 'Not in camera image';
  return (
    <span title={label} aria-label={label} role="img" className="shrink-0">
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke={inCamera ? '#a1a1aa' : '#3f3f46'}
        strokeWidth="1.4"
        aria-hidden="true"
      >
        <rect x="1.5" y="4.5" width="9" height="7" rx="1.5" />
        <path d="M10.5 7l4-2v6l-4-2" />
        {!inCamera && <path d="M2 2l12 12" />}
      </svg>
    </span>
  );
}

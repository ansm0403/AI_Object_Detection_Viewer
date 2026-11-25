'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { Frame } from '@/lib/types';
import { getClassColor } from '@/lib/ui/class-colors';
import { displayId } from '@/lib/ui/display-id';
import { PANEL_CLASS, PanelHeader } from '@/components/workspace';
import { detectionDistance, frameHasConfidence } from '@/lib/selectors';

type ObjectListProps = {
  frame: Frame;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  // Ids of the 3D boxes that pass the current filters (F3: the 3D visible set).
  // The list keeps showing ALL boxes (so the non-spatial selection path from
  // Edge_#4 Case 1 still works for filtered-out objects); hidden rows are
  // dimmed instead.
  visibleIds?: Set<string>;
};

/**
 * (F3, decision 4) Lists every 3D box of the frame, not only the ones the
 * camera sees. The 3D view is the main view (Rule #5), and on nuScenes most
 * boxes are beside / behind the front camera and have no 2D projection — they
 * were reachable only by clicking in the 3D view before. Rows on measured
 * frames show whether the box is in the camera image and its distance from the
 * ego vehicle. COCO is 1:1 (2D and 3D share ids), so it lists the same objects.
 */
export function ObjectList({ frame, selectedId, onSelect, visibleIds }: ObjectListProps) {
  const selectedRef = useRef<HTMLLIElement | null>(null);
  // Measured (nuScenes) frames have no model score — the parser's 1.0 is a
  // placeholder, so the confidence gauge is not shown (Rule #6).
  const showConfidence = frameHasConfidence(frame);
  // Measured frames: distance is real metres and "in camera" is meaningful
  // (some boxes have no projection). On COCO both would be fake or trivially
  // true, so neither is shown there.
  const isMeasured = frame.source === 'nuscenes-measured';
  // A 3D box is "in the camera" when it has a 2D projection with the same id
  // (Immutable Rule #1: same object → same id across 2D and 3D).
  const idsInCamera = useMemo(
    () => new Set(frame.detections2D.map((d) => d.id)),
    [frame],
  );
  const boxes = frame.detections3D;

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
      className={`flex flex-col h-full ${PANEL_CLASS}`}
      onClick={() => onSelect?.(null)}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <PanelHeader title="Objects" count={boxes.length}>
          {isMeasured && (
            <span className="flex items-center gap-1 text-[11px] text-zinc-500 tabular-nums">
              <CameraIcon inCamera />
              {idsInCamera.size} in camera
            </span>
          )}
        </PanelHeader>
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
            const inCamera = idsInCamera.has(d.id);
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
                  'flex items-center gap-2 px-3 h-8 cursor-pointer select-none',
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
                {isMeasured && <CameraIcon inCamera={inCamera} />}
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
                  <span className="text-[11px] text-zinc-500 tabular-nums w-10 text-right shrink-0">
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
                  className="shrink-0 w-12 text-right font-mono text-[11px] text-zinc-500 ml-1"
                >
                  {displayId(d.id)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
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

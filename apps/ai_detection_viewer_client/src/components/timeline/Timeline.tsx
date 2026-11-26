'use client';

import { useState, type ReactNode } from 'react';
import type { Frame } from '@/lib/types';
import type { ReviewCounts } from '@/lib/review';
import { timelineBars, timelineTicks, type TimelineBar } from '@/lib/ui/timeline-bars';
import { PANEL_CLASS, PanelTitle } from '@/components/workspace';

type TimelineProps = {
  frames: Frame[];
  selectedFrameId: string | null;
  onSelectFrame: (id: string) => void;
  // (F2-C) Autoplay controls. Both are passed together (nuScenes only); when
  // `onTogglePlay` is omitted the play button is not rendered, so COCO — whose
  // frames are independent and don't track — shows no autoplay affordance.
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  // (F2-D-1) Camera-follow toggle (nuScenes only). `cameraMode` is the current
  // mode and `onToggleCameraMode` flips Fixed↔Follow; when the callback is
  // omitted the toggle is not rendered (COCO has no follow mode). This is a pure
  // VIEW flag — it does NOT touch `selectedObjectId` (Immutable Rule #2).
  cameraMode?: 'fixed' | 'follow';
  onToggleCameraMode?: () => void;
  // Jump back to the first frame (and stop playback). Like Filters' reset, but
  // for the sequence position. Passed nuScenes-only — COCO frames are
  // independent so "return to frame 1" carries no sequence meaning; when the
  // callback is omitted the button is not rendered.
  onReset?: () => void;
  // (F4) Review counts per frame id. When passed, each thumbnail badge reads
  // "reviewed/total" instead of the bare box count, so finished and untouched
  // frames can be told apart at a glance. Omitted on COCO (not reviewed).
  reviewCounts?: Map<string, ReviewCounts>;
  // (F5) Ready-made badge per frame id. When passed, a frame's badge shows this
  // instead of the counts above — the timeline does not know what the text
  // means (evaluate mode passes "N missed"). A frame without an entry falls
  // back to its count.
  badges?: Map<string, TimelineBadge>;
  // (F7) How the frames are drawn.
  //  - 'thumbnails' (default): one photo per frame, scrolling sideways. Fine for
  //    ten independent images (COCO).
  //  - 'scrubber': one narrow cell with a bar per frame, so a whole scene (~40
  //    frames) fits in one row without scrolling, and the bars show where in the
  //    scene the work is. The photo appears when a cell is hovered.
  variant?: 'thumbnails' | 'scrubber';
  // (F7) Shown in place of the "Frames N" title, above the transport buttons —
  // the scene picker. The timeline does not know what it is.
  leading?: ReactNode;
};

export type TimelineBadge = {
  text: string;
  /** Tooltip. */
  title?: string;
  /** `alert` = needs attention (rose), `good` = nothing wrong (emerald), `match` =
   *  matches the search (amber, F7), `muted` = no data / no match. */
  tone: 'alert' | 'good' | 'match' | 'muted';
  /** (F7) The number behind `text` (e.g. missed labels), for the scrubber's bar height. */
  value?: number;
};

const BADGE_BASE = 'absolute top-1 right-1 px-1.5 py-0.5 text-[10px] tabular-nums rounded ring-1';

const BADGE_TONE: Record<TimelineBadge['tone'], string> = {
  alert: 'bg-zinc-950/80 text-rose-300 ring-rose-400/40',
  good: 'bg-zinc-950/80 text-emerald-300 ring-zinc-800',
  match: 'bg-zinc-950/80 text-amber-300 ring-amber-400/40',
  muted: 'bg-zinc-950/80 text-zinc-500 ring-zinc-800',
};

export function Timeline({
  frames,
  selectedFrameId,
  onSelectFrame,
  isPlaying = false,
  onTogglePlay,
  cameraMode = 'fixed',
  onToggleCameraMode,
  onReset,
  reviewCounts,
  badges,
  variant = 'thumbnails',
  leading,
}: TimelineProps) {
  if (frames.length === 0) return null;

  return (
    // (F3) One row: title + transport controls on the left, thumbnails on the
    // right. Fills the height the WorkspaceShell gives the timeline row.
    // (F7) The scrubber needs width for its cells. On narrow screens (below the
    // supported 1024 px) the controls would take the whole row and leave the
    // cells 0 px wide (Edge_F#7 Case 4), so there the two parts stack.
    <div
      className={`flex h-full ${PANEL_CLASS} ${
        variant === 'scrubber' ? 'flex-col lg:flex-row lg:items-center' : 'items-center'
      }`}
    >
      <div
        className={`flex flex-col justify-center gap-2 px-3 py-2 shrink-0 border-zinc-800 ${
          variant === 'scrubber' ? 'border-b lg:border-b-0 lg:border-r lg:h-full' : 'h-full border-r'
        }`}
      >
        {leading ?? <PanelTitle title="Frames" count={frames.length} />}
        <div className="flex items-center gap-1.5">
          {onTogglePlay && (
            <button
              type="button"
              onClick={onTogglePlay}
              aria-pressed={isPlaying}
              aria-label={isPlaying ? 'Pause autoplay' : 'Play sequence'}
              className={[
                'inline-flex items-center gap-1.5 rounded px-2.5 py-1',
                'text-xs font-medium transition-colors',
                isPlaying
                  ? 'bg-sky-400 text-zinc-950 hover:bg-sky-300'
                  : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700 ring-1 ring-zinc-700',
              ].join(' ')}
            >
              {/* Inline glyphs keep this dependency-free (no icon lib in MVP). */}
              <span aria-hidden="true">{isPlaying ? '❙❙' : '▶'}</span>
              {isPlaying ? 'Pause' : 'Play'}
            </button>
          )}
          {/* (F2-D-1) Camera mode toggle — keeps the SELECTED object centered as
              it moves (Follow) vs the fixed overview (Fixed, the default). Pure
              view flag; falls back to Fixed behavior when nothing is selected. */}
          {onToggleCameraMode && (
            <button
              type="button"
              onClick={onToggleCameraMode}
              aria-pressed={cameraMode === 'follow'}
              aria-label={
                cameraMode === 'follow'
                  ? 'Switch to fixed camera'
                  : 'Follow the selected object'
              }
              className={[
                'inline-flex items-center gap-1.5 rounded px-2.5 py-1',
                'text-xs font-medium transition-colors',
                cameraMode === 'follow'
                  ? 'bg-emerald-400 text-zinc-950 hover:bg-emerald-300'
                  : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700 ring-1 ring-zinc-700',
              ].join(' ')}
            >
              <span aria-hidden="true">◎</span>
              {cameraMode === 'follow' ? 'Following' : 'Follow'}
            </button>
          )}
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              aria-label="Reset to first frame"
              title="Reset to first frame"
              className={[
                'inline-flex items-center gap-1.5 rounded px-2.5 py-1',
                'text-xs font-medium transition-colors',
                'bg-zinc-800 text-zinc-200 hover:bg-zinc-700 ring-1 ring-zinc-700',
              ].join(' ')}
            >
              {/* Monochrome glyph (U+21BA) to match the ◎ / ▶ transport
                  buttons — ⏮ rendered as a color emoji and stood out. */}
              <span aria-hidden="true">↺</span>
              Reset
            </button>
          )}
        </div>
      </div>
      {variant === 'scrubber' ? (
        <Scrubber
          frames={frames}
          selectedFrameId={selectedFrameId}
          onSelectFrame={onSelectFrame}
          reviewCounts={reviewCounts}
          badges={badges}
        />
      ) : (
      /* py-1 keeps the active thumbnail's ring inside the scroll box (an
          overflow-x container also clips vertically). */
      <ul className="flex flex-1 min-w-0 items-center gap-2 overflow-x-auto px-2 py-1">
        {frames.map((frame, idx) => {
          const isActive = frame.id === selectedFrameId;
          const badge = badges?.get(frame.id);
          return (
            <li key={frame.id} className="shrink-0">
              <button
                type="button"
                onClick={() => onSelectFrame(frame.id)}
                aria-pressed={isActive}
                className={[
                  'group relative block w-24 h-14 rounded overflow-hidden',
                  'bg-zinc-800 transition-all',
                  isActive
                    ? 'ring-2 ring-sky-400'
                    : 'ring-1 ring-zinc-800 hover:ring-zinc-600',
                ].join(' ')}
              >
                {/* Native <img> on purpose: next/image needs domain config and
                    these are local public/ assets at a tiny size. */}
                <img
                  src={frame.imageUrl}
                  alt={`Frame ${idx + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    const sibling = e.currentTarget.nextElementSibling as HTMLElement | null;
                    if (sibling?.dataset.fallback) sibling.style.display = 'flex';
                  }}
                />
                <span
                  data-fallback="1"
                  className="absolute inset-0 hidden items-center justify-center text-[10px] text-zinc-500 text-center px-1"
                >
                  Image unavailable
                </span>
                {/* Object-count badge — always shown including 0. Counts 3D
                    boxes, the same basis as the header and the object list
                    (F3 decision 4). */}
                {badge ? (
                  <span className={`${BADGE_BASE} ${BADGE_TONE[badge.tone]}`} title={badge.title}>
                    {badge.text}
                  </span>
                ) : (
                  <CountBadge
                    total={frame.detections3D.length}
                    reviewed={reviewCounts?.get(frame.id)?.reviewed}
                  />
                )}
                <span
                  className={[
                    'absolute bottom-0 left-0 right-0 px-1 py-0.5',
                    'text-[10px] tabular-nums text-center',
                    isActive
                      ? 'bg-sky-400 text-zinc-950 font-semibold'
                      : 'bg-zinc-950/70 text-zinc-300',
                  ].join(' ')}
                >
                  #{idx + 1}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      )}
    </div>
  );
}

// --- (F7) scrubber ----------------------------------------------------------

const BAR_TONE: Record<TimelineBar['tone'], string> = {
  boxes: 'bg-zinc-600',
  alert: 'bg-rose-400',
  good: 'bg-emerald-400/70',
  match: 'bg-amber-400',
  muted: 'bg-zinc-700',
};

/** Width of the hover preview: the thumbnail's own width (192×108) plus padding. */
const PREVIEW_WIDTH = 204;

type ScrubberProps = Pick<
  TimelineProps,
  'frames' | 'selectedFrameId' | 'onSelectFrame' | 'reviewCounts' | 'badges'
>;

/**
 * One cell per frame, all of them in one row. Each cell is a button (click or
 * keyboard) with a bar whose height comes from the pure `timelineBars`.
 * Hovering or focusing a cell shows that frame's small photo and its numbers
 * above the row.
 *
 * The preview is `position: fixed`: the timeline panel clips its content
 * (rounded corners), so a popup inside it would be cut off.
 */
function Scrubber({ frames, selectedFrameId, onSelectFrame, reviewCounts, badges }: ScrubberProps) {
  const [preview, setPreview] = useState<{ index: number; x: number; y: number } | null>(null);

  const bars = timelineBars(
    frames.map((frame) => ({ id: frame.id, boxCount: frame.detections3D.length })),
    { reviewCounts, badges },
  );
  const activeIndex = frames.findIndex((frame) => frame.id === selectedFrameId);
  const ticks = new Set(timelineTicks(frames.length, activeIndex));

  const showPreview = (index: number, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const half = PREVIEW_WIDTH / 2;
    // Keep the popup inside the window at both ends of the row.
    const x = Math.min(window.innerWidth - half - 8, Math.max(half + 8, rect.left + rect.width / 2));
    setPreview({ index, x, y: rect.top });
  };
  const previewFrame = preview ? frames[preview.index] : undefined;
  const previewBar = preview ? bars[preview.index] : undefined;

  return (
    <div
      className="flex min-w-0 flex-col px-2 pt-2 pb-1 h-20 lg:h-full lg:flex-1"
      onMouseLeave={() => setPreview(null)}
    >
      <ul className="flex flex-1 min-h-0 items-stretch">
        {frames.map((frame, index) => {
          const bar = bars[index];
          const isActive = index === activeIndex;
          return (
            <li key={frame.id} className="flex-1 min-w-0">
              <button
                type="button"
                onClick={() => onSelectFrame(frame.id)}
                onMouseEnter={(event) => showPreview(index, event.currentTarget)}
                onFocus={(event) => showPreview(index, event.currentTarget)}
                onBlur={() => setPreview(null)}
                aria-pressed={isActive}
                aria-label={`Frame ${index + 1}: ${bar.text}`}
                className={[
                  'flex h-full w-full items-end px-px rounded-sm transition-colors',
                  isActive ? 'bg-sky-400/25 ring-1 ring-inset ring-sky-400' : 'hover:bg-zinc-800',
                ].join(' ')}
              >
                {/* The bar. A minimum height keeps a frame with a zero value visible. */}
                <span
                  className={`relative block w-full overflow-hidden rounded-[2px] ${BAR_TONE[bar.tone]}`}
                  style={{ height: `max(3px, ${Math.round(bar.height * 100)}%)` }}
                >
                  {bar.fill > 0 && (
                    <span
                      className="absolute inset-x-0 bottom-0 bg-emerald-400"
                      style={{ height: `${Math.round(bar.fill * 100)}%` }}
                    />
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {/* Frame numbers: the first, every fifth, and the one on screen. */}
      <div className="flex h-4 shrink-0 items-center" aria-hidden="true">
        {frames.map((frame, index) => (
          <span key={frame.id} className="relative flex-1 min-w-0 h-full">
            {ticks.has(index + 1) && (
              <span
                className={[
                  'absolute left-1/2 top-0.5 -translate-x-1/2 whitespace-nowrap text-[10px] leading-none tabular-nums',
                  index === activeIndex ? 'text-sky-300 font-semibold' : 'text-zinc-600',
                ].join(' ')}
              >
                {index + 1}
              </span>
            )}
          </span>
        ))}
      </div>
      {preview && previewFrame && previewBar && (
        <div
          role="tooltip"
          className="fixed z-50 pointer-events-none rounded-md border border-zinc-700 bg-zinc-950 p-1.5 shadow-xl"
          style={{
            left: preview.x,
            top: preview.y - 6,
            width: PREVIEW_WIDTH,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {/* Native <img> on purpose (local public/ asset, tiny). Keyed by frame
              so a previous frame's photo is never shown under a new number. */}
          <img
            key={previewFrame.id}
            src={previewFrame.thumbnailUrl ?? previewFrame.imageUrl}
            alt=""
            width={192}
            height={108}
            className="block h-[108px] w-[192px] rounded-sm bg-zinc-800 object-cover"
          />
          <div className="mt-1 flex items-baseline justify-between gap-2 px-0.5 text-[11px] tabular-nums">
            <span className="font-semibold text-zinc-200">#{preview.index + 1}</span>
            <span className="truncate text-zinc-400">{previewBar.text}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Thumbnail badge. Without review data: the 3D box count (same basis as the
// header and the object list, F3 decision 4). With review data (F4):
// "reviewed/total" — green once anything is reviewed, and a filled green badge
// when the whole frame is done.
function CountBadge({ total, reviewed }: { total: number; reviewed: number | undefined }) {
  const base = BADGE_BASE;
  if (reviewed === undefined) {
    return <span className={`${base} bg-zinc-950/80 text-zinc-300 ring-zinc-800`}>{total}</span>;
  }
  const done = total > 0 && reviewed >= total;
  const tone = done
    ? 'bg-emerald-400 text-zinc-950 font-semibold ring-emerald-300'
    : reviewed > 0
      ? 'bg-zinc-950/80 text-emerald-300 ring-zinc-800'
      : 'bg-zinc-950/80 text-zinc-300 ring-zinc-800';
  return (
    <span
      className={`${base} ${tone}`}
      title={`${reviewed} of ${total} boxes reviewed`}
    >
      {reviewed}/{total}
    </span>
  );
}

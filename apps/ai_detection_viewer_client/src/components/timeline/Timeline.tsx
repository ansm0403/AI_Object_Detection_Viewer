'use client';

import type { Frame } from '@/lib/types';
import type { ReviewCounts } from '@/lib/review';
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
}: TimelineProps) {
  if (frames.length === 0) return null;

  return (
    // (F3) One row: title + transport controls on the left, thumbnails on the
    // right. Fills the height the WorkspaceShell gives the timeline row.
    <div className={`flex items-center h-full ${PANEL_CLASS}`}>
      <div className="flex flex-col justify-center gap-2 px-3 py-2 h-full shrink-0 border-r border-zinc-800">
        <PanelTitle title="Frames" count={frames.length} />
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
      {/* py-1 keeps the active thumbnail's ring inside the scroll box (an
          overflow-x container also clips vertically). */}
      <ul className="flex flex-1 min-w-0 items-center gap-2 overflow-x-auto px-2 py-1">
        {frames.map((frame, idx) => {
          const isActive = frame.id === selectedFrameId;
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
                <CountBadge
                  total={frame.detections3D.length}
                  reviewed={reviewCounts?.get(frame.id)?.reviewed}
                />
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
    </div>
  );
}

// Thumbnail badge. Without review data: the 3D box count (same basis as the
// header and the object list, F3 decision 4). With review data (F4):
// "reviewed/total" — green once anything is reviewed, and a filled green badge
// when the whole frame is done.
function CountBadge({ total, reviewed }: { total: number; reviewed: number | undefined }) {
  const base = 'absolute top-1 right-1 px-1.5 py-0.5 text-[10px] tabular-nums rounded ring-1';
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

'use client';

import type { Frame } from '@/lib/types';

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
}: TimelineProps) {
  if (frames.length === 0) return null;

  return (
    <div className="bg-zinc-900 rounded-lg px-3 py-2">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
          Frames
          <span className="ml-2 text-zinc-600 font-normal normal-case tracking-normal">
            ({frames.length})
          </span>
        </h2>
        <div className="flex items-center gap-2">
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
        </div>
      </div>
      <ul className="flex gap-2 overflow-x-auto pb-1">
        {frames.map((frame, idx) => {
          const isActive = frame.id === selectedFrameId;
          return (
            <li key={frame.id} className="shrink-0">
              <button
                type="button"
                onClick={() => onSelectFrame(frame.id)}
                aria-pressed={isActive}
                className={[
                  'group relative block w-24 aspect-[4/3] rounded overflow-hidden',
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
                {/* Detection-count badge — always shown including 0 */}
                <span className="absolute top-1 right-1 px-1.5 py-0.5 text-[10px] tabular-nums rounded bg-zinc-950/80 text-zinc-300 ring-1 ring-zinc-800">
                  {frame.detections2D.length}
                </span>
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

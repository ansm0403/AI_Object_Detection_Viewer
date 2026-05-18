'use client';

import type { Frame } from '@/lib/types';

type TimelineProps = {
  frames: Frame[];
  selectedFrameId: string | null;
  onSelectFrame: (id: string) => void;
};

export function Timeline({ frames, selectedFrameId, onSelectFrame }: TimelineProps) {
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

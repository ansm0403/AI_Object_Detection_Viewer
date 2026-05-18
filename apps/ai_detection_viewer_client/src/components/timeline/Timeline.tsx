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
    <div className="bg-gray-900 rounded-lg px-3 py-2">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Frames
          <span className="ml-2 text-gray-600 font-normal normal-case tracking-normal">
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
                  'bg-neutral-950 transition-all',
                  isActive
                    ? 'ring-2 ring-white'
                    : 'ring-1 ring-gray-700 hover:ring-gray-500',
                ].join(' ')}
              >
                {/* Native <img> on purpose: next/image needs domain config and
                    these are local public/ assets at a tiny size. */}
                <img
                  src={frame.imageUrl}
                  alt={`Frame ${idx + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <span
                  className={[
                    'absolute bottom-0 left-0 right-0 px-1 py-0.5',
                    'text-[10px] tabular-nums text-center',
                    isActive
                      ? 'bg-white text-black font-semibold'
                      : 'bg-black/60 text-gray-300',
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

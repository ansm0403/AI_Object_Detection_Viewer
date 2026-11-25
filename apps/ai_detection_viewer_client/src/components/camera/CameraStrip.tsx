'use client';

import { useEffect, useState } from 'react';
import { cameraShortName } from '@/lib/cameras';

/** What one thumbnail shows. Everything except the photo is decided by the page. */
export type CameraThumb = {
  /** Camera channel, e.g. "CAM_FRONT_LEFT". */
  name: string;
  imageUrl: string;
  /**
   * Where the selected object is in this photo, as fractions (0–1) of the
   * image. Omitted when this camera does not see it. Drawn as a small white
   * box, so an object in the overlap of two cameras shows on both thumbnails.
   */
  marker?: { x: number; y: number; width: number; height: number };
  /** A small count in the corner (evaluate mode: labels missed in this photo). */
  badge?: { text: string; tone: 'alert' | 'muted'; title?: string };
};

type Props = {
  /** The cameras in display order (the look-around order, see `lib/cameras`). */
  cameras: CameraThumb[];
  /** The camera shown in the large image. */
  activeName: string;
  onSelect: (name: string) => void;
  /** Keys that step through the cameras, for the tooltip (the page owns them). */
  shortcutHint?: string;
};

const BADGE_TONE = {
  alert: 'bg-rose-400/90 text-zinc-950',
  muted: 'bg-zinc-950/70 text-zinc-400',
} as const;

/**
 * (F6) The row of camera thumbnails under the large camera image.
 *
 * Six small photos in look-around order: the one with the sky-blue frame is
 * the camera shown above; a click shows another. It is a VIEW control — it
 * changes which photo is looked at, never what is selected (Immutable Rule #2:
 * `selectedObjectId` stays the only selection).
 *
 * The strip knows nothing about review or evaluation: markers and badges are
 * handed in. Its height follows its width (each thumbnail keeps the photos'
 * 16:9), so the `WorkspaceShell` only has to give it the column.
 */
export function CameraStrip({ cameras, activeName, onSelect, shortcutHint }: Props) {
  return (
    // px-0.5: room for the active thumbnail's 2px ring at both ends of the row.
    <div role="group" aria-label="Cameras" className="flex gap-1 px-0.5">
      {cameras.map((camera) => (
        <Thumb
          key={camera.name}
          camera={camera}
          active={camera.name === activeName}
          onSelect={onSelect}
          shortcutHint={shortcutHint}
        />
      ))}
    </div>
  );
}

function Thumb({
  camera,
  active,
  onSelect,
  shortcutHint,
}: {
  camera: CameraThumb;
  active: boolean;
  onSelect: (name: string) => void;
  shortcutHint?: string;
}) {
  const [failed, setFailed] = useState(false);
  // A new frame brings a new photo: forget the previous photo's failure.
  useEffect(() => {
    setFailed(false);
  }, [camera.imageUrl]);
  const { marker, badge } = camera;
  const short = cameraShortName(camera.name);
  const title = [
    camera.name,
    active ? 'shown above' : 'click to show',
    marker ? 'the selected box is in this photo' : null,
    shortcutHint ? `${shortcutHint} to step` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={`${camera.name}${marker ? ', sees the selected box' : ''}`}
      title={title}
      onClick={(e) => {
        onSelect(camera.name);
        // Same rule as the verdict buttons (F4): a mouse click must not leave a
        // focused button behind for Space / Enter to press again.
        if (e.detail > 0) e.currentTarget.blur();
      }}
      className={[
        'group relative flex-1 min-w-0 aspect-video rounded overflow-hidden bg-zinc-800 transition-shadow',
        active ? 'ring-2 ring-sky-400' : 'ring-1 ring-zinc-700 hover:ring-zinc-500',
      ].join(' ')}
    >
      {failed ? null : (
        // Native <img> on purpose, like the timeline thumbnails: local public/
        // assets at a tiny size. The same file as the large image, so showing a
        // camera costs no extra download.
        <img
          src={camera.imageUrl}
          alt=""
          draggable={false}
          onError={() => setFailed(true)}
          className={`block w-full h-full object-cover ${active ? '' : 'opacity-80 group-hover:opacity-100'}`}
        />
      )}
      {marker && (
        <span
          aria-hidden="true"
          className="absolute rounded-[1px] border-[1.5px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
          style={{
            left: `${marker.x * 100}%`,
            top: `${marker.y * 100}%`,
            // A distant object is a pixel or two at this size: keep the mark findable.
            width: `max(${marker.width * 100}%, 5px)`,
            height: `max(${marker.height * 100}%, 5px)`,
          }}
        />
      )}
      <span
        className={[
          'absolute left-0 bottom-0 px-1 rounded-tr-[3px] text-[9px] leading-[13px] font-semibold tracking-wide',
          active ? 'bg-sky-400 text-zinc-950' : 'bg-zinc-950/75 text-zinc-300',
        ].join(' ')}
      >
        {short}
      </span>
      {badge && (
        <span
          title={badge.title}
          className={`absolute right-0.5 top-0.5 px-1 rounded-full text-[9px] leading-[13px] font-semibold tabular-nums ${BADGE_TONE[badge.tone]}`}
        >
          {badge.text}
        </span>
      )}
    </button>
  );
}

/**
 * Stand-in for the strip while the data loads: the same six 16:9 cells, so the
 * panes below do not move when the photos arrive (F3: no layout jump).
 */
export function CameraStripPlaceholder({ pulse, count = 6 }: { pulse: boolean; count?: number }) {
  return (
    <div aria-hidden="true" className="flex gap-1 px-0.5">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={`flex-1 min-w-0 aspect-video rounded bg-zinc-900 ring-1 ring-zinc-800 ${pulse ? 'animate-pulse' : ''}`}
        />
      ))}
    </div>
  );
}

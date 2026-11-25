'use client';

import { useState } from 'react';
import type { PlantedError, PracticeErrorKind, PracticeScore } from '@/lib/review';
import { displayId } from '@/lib/ui/display-id';
import { SECTION_TITLE_CLASS } from '@/components/workspace';

const KIND_LABELS: Record<PracticeErrorKind, string> = {
  position: 'position',
  size: 'size',
  heading: 'heading',
  class: 'class',
};

type Props = {
  /** Score of the current frame. */
  frameScore: PracticeScore;
  /** Score across every frame. */
  overallScore: PracticeScore;
  /** The answer key for the current frame (shown only after "Reveal"). */
  plantedInFrame: PlantedError[];
  onSelect: (objectId: string) => void;
};

/**
 * Practice-mode score (F4-F): how many of the deliberately planted errors the
 * reviewer has caught. Shown only while the practice set is loaded, in the
 * amber tone used everywhere for "this is not the real annotation data".
 *
 * The answer key stays hidden until the reviewer asks for it — revealing it is
 * a local, temporary view state and is reset when the frame changes (the card
 * is keyed on the frame by the page).
 */
export function PracticeScoreCard({ frameScore, overallScore, plantedInFrame, onSelect }: Props) {
  const [revealed, setRevealed] = useState(false);

  return (
    <section className="px-3 py-2.5 border-b border-zinc-800 bg-amber-500/[0.06]">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <h3 className={`${SECTION_TITLE_CLASS} !text-amber-300`}>Practice score</h3>
        <button
          type="button"
          aria-pressed={revealed}
          onClick={(e) => {
            setRevealed((r) => !r);
            if (e.detail > 0) e.currentTarget.blur();
          }}
          className="rounded px-1.5 py-0.5 text-[11px] text-zinc-300 ring-1 ring-inset ring-zinc-700 hover:ring-zinc-500"
        >
          {revealed ? 'Hide answers' : 'Reveal answers'}
        </button>
      </div>
      <dl className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-zinc-400 tabular-nums">
        <Stat label="Found" title="Planted errors you rejected">
          {frameScore.found} / {frameScore.planted}
        </Stat>
        <Stat label="Missed" title="Planted errors you approved">
          {frameScore.missed}
        </Stat>
        <Stat label="False alarms" title="Boxes you rejected that were not planted errors">
          {frameScore.falseAlarms}
        </Stat>
      </dl>
      <p className="mt-1 text-[11px] text-zinc-500 tabular-nums">
        This frame · all frames {overallScore.found} / {overallScore.planted} found
        {overallScore.found > 0 && ` (${overallScore.foundWithReason} with the matching reason)`}
      </p>
      <p className="mt-0.5 text-[11px] text-zinc-600">
        LiDAR and visibility values still describe the original labels.
      </p>
      {revealed && (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {plantedInFrame.length === 0 && (
            <li className="text-[11px] text-zinc-500">No planted errors in this frame.</li>
          )}
          {plantedInFrame.map((error) => (
            <li key={error.objectId}>
              <button
                type="button"
                title={`${error.detail} — click to select`}
                onClick={(e) => {
                  onSelect(error.objectId);
                  if (e.detail > 0) e.currentTarget.blur();
                }}
                className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] text-amber-200 bg-amber-500/10 ring-1 ring-inset ring-amber-500/30 hover:bg-amber-500/20"
              >
                <span className="font-mono">{displayId(error.objectId)}</span>
                {KIND_LABELS[error.kind]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Stat({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-1.5" title={title}>
      <dt>{label}</dt>
      <dd className="font-semibold text-zinc-100">{children}</dd>
    </div>
  );
}

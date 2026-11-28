'use client';

import { useState } from 'react';
import type { EditCloseness, PlantedError, PracticeErrorKind, PracticeScore } from '@/lib/review';
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
  /**
   * (F8) The edited boxes of the current frame, measured against the REAL
   * label. Part of the answer key: shown only after "Reveal" — while a box is
   * being edited these numbers would say which way to drag it.
   */
  closeness?: EditCloseness[];
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
export function PracticeScoreCard({
  frameScore,
  overallScore,
  plantedInFrame,
  closeness = [],
  onSelect,
}: Props) {
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
      {revealed && (
        <div data-part="closeness" className="mt-2">
          <h4
            className="text-[10px] font-semibold uppercase tracking-wider text-amber-300/90"
            title="How far each box you edited is from the nuScenes label it was made from: as the practice set showed it → with your edit. 0 = the same as the nuScenes label."
          >
            Your edits · distance to the real label
          </h4>
          {closeness.length === 0 ? (
            <p className="mt-0.5 text-[11px] text-zinc-500">
              No box of this frame has been edited. Select one and press E.
            </p>
          ) : (
            <table className="mt-0.5 w-full text-[11px] tabular-nums">
              <thead>
                <tr className="text-zinc-500">
                  <th className="text-left font-normal">shown → edited</th>
                  <th className="text-right font-normal">centre m</th>
                  <th className="text-right font-normal">size m</th>
                  <th className="text-right font-normal">heading °</th>
                </tr>
              </thead>
              <tbody>
                {closeness.map((row) => (
                  <tr key={row.objectId} data-closeness={row.objectId}>
                    <td className="py-0.5 pr-1 whitespace-nowrap">
                      <button
                        type="button"
                        title="Click to select"
                        onClick={(e) => {
                          onSelect(row.objectId);
                          if (e.detail > 0) e.currentTarget.blur();
                        }}
                        className="font-mono text-amber-200 hover:underline"
                      >
                        {displayId(row.objectId)}
                      </button>{' '}
                      <span className="text-zinc-500">
                        {row.planted ? KIND_LABELS[row.planted] : 'not planted'}
                      </span>
                    </td>
                    <Distance before={row.before.centre} after={row.after.centre} digits={2} />
                    <Distance before={row.before.size} after={row.after.size} digits={2} />
                    <Distance before={row.before.heading} after={row.after.heading} digits={1} />
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * One measure of a row: the distance as the practice set showed the box, an
 * arrow, and the distance with the edit — green when the edit came closer to
 * the real label, rose when it went further away. Compared as the numbers
 * are printed, so "0.12 → 0.12" is never coloured.
 */
function Distance({ before, after, digits }: { before: number; after: number; digits: number }) {
  const from = before.toFixed(digits);
  const to = after.toFixed(digits);
  const tone =
    Number(to) < Number(from)
      ? 'text-emerald-300'
      : Number(to) > Number(from)
        ? 'text-rose-300'
        : 'text-zinc-300';
  return (
    <td className="py-0.5 pl-1 text-right whitespace-nowrap text-zinc-500">
      {from} → <span className={tone}>{to}</span>
    </td>
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

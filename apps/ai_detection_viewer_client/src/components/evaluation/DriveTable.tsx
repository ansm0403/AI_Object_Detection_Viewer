'use client';

import { ratio, type DriveScore, type GroupScore } from '@/lib/evaluation';
import { SECTION_TITLE_CLASS } from '@/components/workspace';

const number = (n: number) => n.toLocaleString('en-US');
const pct1 = (value: number | null) => (value === null ? '—' : `${(value * 100).toFixed(1)}%`);

type Props = {
  drives: readonly DriveScore[];
  day: GroupScore;
  night: GroupScore;
};

/**
 * (F7.5) Recall per DRIVE — the independent units of the data. One row per
 * drive: when and where, how many scenes were cut from it, how many distinct
 * objects its recall rests on, and the recall itself. The night drive is one
 * row, in another colour: next to seven day rows that is the whole caveat of
 * the day / night comparison, visible as a shape.
 *
 * Pure presentation: every number comes from `summarizeDrives` / `evaluateScenes`.
 */
export function DriveTable({ drives, day, night }: Props) {
  return (
    <section aria-label="Recall by drive" className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <h3 className={SECTION_TITLE_CLASS}>Recall by drive</h3>
        <span className="text-[10px] text-zinc-500 whitespace-nowrap">
          {drives.length} drive{drives.length === 1 ? '' : 's'} · the independent units
        </span>
      </div>
      {/* On a phone the table keeps its width and scrolls sideways inside this
          block, rather than squeezing the date / place column until it is cut. */}
      <div className="overflow-x-auto">
      <table className="w-full min-w-[26.5rem] table-fixed border-collapse text-xs tabular-nums">
        <colgroup>
          <col />
          <col className="w-10" />
          <col className="w-12" />
          <col className="w-16" />
          <col className="w-12" />
          <col className="w-[5.25rem]" />
        </colgroup>
        <thead>
          <tr className="text-[10px] text-zinc-500">
            <th scope="col" className="pb-1 text-left font-normal">date · place</th>
            <th scope="col" className="pb-1 text-right font-normal">scenes</th>
            <th
              scope="col"
              className="pb-1 text-right font-normal"
              title="Distinct objects with at least one scored label in the drive's photos"
            >
              objects
            </th>
            <th scope="col" className="pb-1" aria-hidden="true" />
            <th scope="col" className="pb-1 text-right font-normal">recall</th>
            <th scope="col" className="pb-1 text-right font-normal">found / labels</th>
          </tr>
        </thead>
        <tbody>
          {drives.map((drive) => {
            const labels = drive.counts.found + drive.counts.missed;
            const value = ratio(drive.counts.found, labels);
            const tone = drive.night ? 'text-amber-300' : 'text-zinc-200';
            return (
              <tr
                key={drive.drive ?? drive.scenes.join('+')}
                className="border-t border-zinc-800/70"
                title={`${drive.scenes.join(', ')}${drive.drive ? ` · drive ${drive.drive}` : ''}`}
              >
                {/* Two lines, never cut: the place names are long
                    ("singapore-hollandvillage") and the column is narrow. */}
                <th scope="row" className={`py-1 pr-2 text-left font-normal leading-4 ${tone}`}>
                  <span className="block whitespace-nowrap">
                    {drive.date || 'date unknown'}
                    {drive.night && ' · night'}
                  </span>
                  <span
                    className={`block whitespace-nowrap text-[11px] leading-[14px] ${drive.night ? 'text-amber-300/80' : 'text-zinc-500'}`}
                  >
                    {drive.location || 'place unknown'}
                  </span>
                </th>
                <td className={`text-right ${drive.night ? 'text-amber-300' : 'text-zinc-400'}`}>
                  {drive.scenes.length}
                </td>
                <td className="text-right text-zinc-400">{number(drive.scoredObjects)}</td>
                <td className="px-2">
                  <span className="block h-1.5 rounded bg-zinc-800 overflow-hidden">
                    <span
                      className={`block h-full rounded ${drive.night ? 'bg-amber-400' : 'bg-sky-400'}`}
                      style={{ width: `${Math.round((value ?? 0) * 100)}%` }}
                    />
                  </span>
                </td>
                <td className="text-right text-zinc-100">{pct1(value)}</td>
                <td className="text-right text-[11px] text-zinc-500">
                  {number(drive.counts.found)}/{number(labels)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <p className="mt-2 text-[10px] leading-snug text-zinc-500">
        Day: {day.drives} drive{day.drives === 1 ? '' : 's'}, {pct1(day.recall)} (
        {number(day.counts.found)} / {number(day.counts.found + day.counts.missed)}).{' '}
        {night.scenes > 0 && (
          <span className={night.drives === 1 ? 'text-amber-300' : undefined}>
            Night: {night.drives} drive{night.drives === 1 ? '' : 's'} ({night.scenes} scene
            {night.scenes === 1 ? '' : 's'}), {pct1(night.recall)} ({number(night.counts.found)} /{' '}
            {number(night.counts.found + night.counts.missed)})
            {night.drives === 1 && ' — one evening in one place'}.
          </span>
        )}
      </p>
    </section>
  );
}

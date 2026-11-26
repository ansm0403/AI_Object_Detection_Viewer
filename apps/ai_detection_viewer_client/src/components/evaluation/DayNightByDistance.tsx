'use client';

import {
  distanceGap,
  ratio,
  type BandCount,
  type DistanceComparison,
  type GroupScore,
} from '@/lib/evaluation';
import { SECTION_TITLE_CLASS } from '@/components/workspace';

const number = (n: number) => n.toLocaleString('en-US');
const pct0 = (band: BandCount) => {
  const value = ratio(band.found, band.total);
  return value === null ? '—' : `${Math.round(value * 100)}%`;
};
const pct1 = (value: number | null) => (value === null ? '—' : `${(value * 100).toFixed(1)}%`);
const points = (value: number) => `${(value * 100).toFixed(1)}`;

type Props = {
  /** Day (A) against night (B), band by band — `compareByDistance(day, night)`. */
  comparison: DistanceComparison;
  day: GroupScore;
  night: GroupScore;
};

/**
 * (F7.5) Day against night AT THE SAME DISTANCE.
 *
 * The plain day / night recalls could differ simply because the night scenes'
 * objects are farther away. This table compares inside each 10 m band, with
 * the label counts next to every pair, and states how much of the difference
 * the distance mix accounts for.
 *
 * What it must not suggest (design doc F7 §9): that the rest is "because it is
 * night". In nuScenes-mini night is ONE drive, so the table carries that fact
 * and says the cause is not established — a table of two colours would
 * otherwise look like more evidence than one drive is.
 *
 * Pure presentation: the rows and the re-weighted recall come from
 * `compareByDistance`, the split of the gap from `distanceGap`.
 */
export function DayNightByDistance({ comparison, day, night }: Props) {
  // The three percentages are printed with one decimal; the points between
  // them are computed from those printed values, so a reader who subtracts what
  // is on screen gets the number that is on screen.
  const printed = (value: number | null) => (value === null ? null : Math.round(value * 1000) / 1000);
  const gap = distanceGap(printed(day.recall), printed(night.recall), printed(comparison.bAtMixOfA));
  const oneNightDrive = night.scenes > 0 && night.drives === 1;
  return (
    <section aria-label="Day and night at the same distance" className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <h3 className={SECTION_TITLE_CLASS}>Day vs night at the same distance</h3>
        {oneNightDrive && (
          <span className="text-[10px] text-amber-300 whitespace-nowrap">night = 1 drive</span>
        )}
      </div>
      {comparison.rows.length === 0 || night.scenes === 0 || day.scenes === 0 ? (
        <p className="text-xs text-zinc-500">
          Needs scored labels in both day and night scenes — nothing to compare yet.
        </p>
      ) : (
        <>
          <table className="w-full table-fixed border-collapse text-xs tabular-nums">
            <colgroup>
              <col className="w-[4.25rem]" />
              <col />
              <col className="w-10" />
              <col className="w-10" />
              <col className="w-[6.25rem]" />
            </colgroup>
            <thead>
              <tr className="text-[10px] text-zinc-500">
                <th scope="col" className="pb-1 text-left font-normal">from the car</th>
                <th scope="col" className="pb-1" aria-hidden="true" />
                <th scope="col" className="pb-1 text-right font-normal text-sky-300">day</th>
                <th scope="col" className="pb-1 text-right font-normal text-amber-300">night</th>
                <th scope="col" className="pb-1 text-right font-normal">labels day / night</th>
              </tr>
            </thead>
            <tbody>
              {comparison.rows.map((row) => {
                const dayValue = ratio(row.a.found, row.a.total) ?? 0;
                const nightValue = ratio(row.b.found, row.b.total) ?? 0;
                const label = row.to === null ? `${row.from} m +` : `${row.from}–${row.to} m`;
                return (
                  <tr
                    key={row.from}
                    className={`border-t border-zinc-800/70 ${row.comparable ? '' : 'opacity-50'}`}
                    title={
                      row.comparable
                        ? `${label}: day ${row.a.found} of ${row.a.total} labels found, night ${row.b.found} of ${row.b.total}`
                        : `${label}: fewer than ${comparison.minLabels} labels in one of the groups — too few to compare`
                    }
                  >
                    <th scope="row" className="py-[5px] text-left font-normal text-zinc-200 whitespace-nowrap">
                      {label}
                    </th>
                    <td className="px-2">
                      <span className="flex flex-col gap-0.5" aria-hidden="true">
                        <span className="block h-1 rounded bg-sky-400" style={{ width: `${dayValue * 100}%` }} />
                        <span className="block h-1 rounded bg-amber-400" style={{ width: `${nightValue * 100}%` }} />
                      </span>
                    </td>
                    <td className="text-right text-zinc-100">{pct0(row.a)}</td>
                    <td className="text-right text-amber-300">{pct0(row.b)}</td>
                    <td className="text-right text-[11px] text-zinc-500">
                      {number(row.a.total)} / {number(row.b.total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] leading-snug text-zinc-500">
            {gap && comparison.bAtMixOfA !== null && (
              <>
                Re-weighted to the day scenes&apos; distance mix, night recall is{' '}
                <span className="text-zinc-300">{pct1(comparison.bAtMixOfA)}</span> instead of{' '}
                {pct1(night.recall)} (day: {pct1(day.recall)}): the distance mix accounts for{' '}
                <span className="text-zinc-300">{points(gap.fromDistance)}</span> of the {points(gap.gap)} points
                between them.{' '}
              </>
            )}
            Faded rows have fewer than {comparison.minLabels} labels in one group.{' '}
            <span className="text-zinc-400">
              What the rest is due to is not established by this
              {oneNightDrive && `: all ${night.scenes} night scenes are one drive`}.
            </span>
          </p>
        </>
      )}
    </section>
  );
}

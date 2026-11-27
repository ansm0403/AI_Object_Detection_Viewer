'use client';

type Props = {
  /** Size of the set the sample is drawn from; `null` while it is not known yet. */
  population: number | null;
  size: number;
  /** The sizes on offer (already limited to what the population allows). */
  sizes: readonly number[];
  onChangeSize: (size: number) => void;
  /** Minimum score the population was computed with (the fixed default). */
  minScore: number;
  onExport: () => void;
  /** Export needs the sample; disabled until it exists. */
  canExport: boolean;
  onExit: () => void;
};

const number = (n: number) => n.toLocaleString('en-US');

/**
 * (F7.5) The filter-bar slot during the sample check. It says what is being
 * looked at — a random sample of the false alarms with no label nearby — and
 * that the sample is fixed: the score slider and the IoU choice of evaluate
 * mode are not shown here because they do not change it.
 */
export function SampleBar({
  population,
  size,
  sizes,
  onChangeSize,
  minScore,
  onExport,
  canExport,
  onExit,
}: Props) {
  const fixedNote = `The same boxes every time: all false alarms with no label nearby at score ≥ ${minScore.toFixed(2)}, shuffled once with a fixed seed. Moving the score slider or choosing another IoU in evaluate mode does not change this set.`;
  return (
    <div className="flex items-center flex-wrap lg:flex-nowrap gap-x-4 gap-y-2 h-full bg-zinc-900/60 border-b border-zinc-800 px-4 py-1.5">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-amber-300">
        Sample check
      </span>
      <span className="shrink-0 text-xs text-zinc-300">False alarms with no label nearby</span>
      <span aria-hidden="true" className="hidden lg:block w-px h-5 bg-zinc-800 shrink-0" />
      <span className="shrink-0 text-xs text-zinc-400 tabular-nums" title={fixedNote}>
        {population === null ? (
          'drawing the sample…'
        ) : (
          <>
            random <span className="font-semibold text-zinc-100">{Math.min(size, population)}</span> of{' '}
            {number(population)}
          </>
        )}
      </span>
      {sizes.length > 1 && (
        <div className="shrink-0 flex items-center gap-1.5">
          <span className="hidden xl:inline text-[11px] text-zinc-500">Sample size</span>
          <div role="group" aria-label="Sample size" className="flex items-center rounded-md bg-zinc-800 p-0.5">
            {sizes.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={option === size}
                onClick={() => onChangeSize(option)}
                title={
                  option === size
                    ? `The sample is the first ${option} boxes of the drawn order`
                    : `Use the first ${option} boxes of the same drawn order — verdicts already given are kept`
                }
                className={[
                  'px-2 py-0.5 text-xs rounded tabular-nums transition-colors',
                  option === size
                    ? 'bg-sky-500/20 text-sky-200 ring-1 ring-inset ring-sky-400/40'
                    : 'text-zinc-400 hover:text-zinc-200',
                ].join(' ')}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )}
      {/* Only where the whole sentence fits: a cut-off sentence is worse than
          none (the same facts are in the tooltip of the count). */}
      <span className="hidden min-[1440px]:inline shrink-0 text-[11px] text-zinc-500" title={fixedNote}>
        same boxes every time · fixed rules: score ≥ {minScore.toFixed(2)}
      </span>
      <div className="flex items-center gap-2 ml-auto shrink-0">
        <button
          type="button"
          onClick={onExport}
          disabled={!canExport}
          title="Download the sample and its verdicts as a JSON file"
          className="text-xs px-2 py-0.5 rounded border border-zinc-800 text-zinc-300 hover:border-sky-400/40 hover:text-zinc-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Export
        </button>
        <button
          type="button"
          onClick={onExit}
          className="text-xs px-2 py-0.5 rounded border border-zinc-800 text-zinc-300 hover:border-sky-400/40 hover:text-zinc-100 transition-colors"
        >
          Exit sample check
        </button>
      </div>
    </div>
  );
}

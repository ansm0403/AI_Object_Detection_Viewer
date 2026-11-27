'use client';

import { IOU_CHOICES, describeIouChoice } from '@/lib/evaluation';
import { SECTION_TITLE_CLASS } from '@/components/workspace';

type Props = {
  value: number;
  onChange: (value: number) => void;
};

/**
 * (F7.5) The overlap threshold of evaluate mode: this tool's default (0.3) or
 * the usual benchmark value (0.5). Two buttons — see `lib/evaluation/iou-choices`
 * for why not a slider. Pure presentation.
 */
export function IouChoice({ value, onChange }: Props) {
  const { note, isDefault } = describeIouChoice(value);
  return (
    <div
      className="flex items-center gap-2"
      title="IoU = how much a model box and a label overlap (0 = not at all, 1 = identical). A model box counts as having found a label when their IoU reaches this value. 0.3 is this tool’s default: the labels are projected 3D boxes, looser than the object. 0.5 is the usual benchmark value and is strict for such labels."
    >
      <span className={SECTION_TITLE_CLASS}>
        <span className="hidden xl:inline">Min overlap (</span>IoU<span className="hidden xl:inline">)</span>
      </span>
      <div role="group" aria-label="Minimum overlap (IoU)" className="flex items-center rounded-md bg-zinc-800 p-0.5">
        {IOU_CHOICES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={option === value}
            onClick={() => onChange(option)}
            className={[
              'px-2 py-0.5 text-xs rounded tabular-nums transition-colors',
              option === value
                ? 'bg-sky-500/20 text-sky-200 ring-1 ring-inset ring-sky-400/40'
                : 'text-zinc-400 hover:text-zinc-200',
            ].join(' ')}
          >
            {option}
          </button>
        ))}
      </div>
      {/* Only where the whole note fits next to the class chips. */}
      {note && (
        <span className={`hidden min-[1440px]:inline text-[11px] whitespace-nowrap ${isDefault ? 'text-zinc-500' : 'text-amber-300'}`}>
          {note}
        </span>
      )}
    </div>
  );
}

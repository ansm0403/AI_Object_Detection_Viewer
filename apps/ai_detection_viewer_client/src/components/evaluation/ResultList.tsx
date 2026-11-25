'use client';

import {
  EVAL_KINDS,
  OUTCOME_LABEL,
  countOf,
  passesClassFilter,
  passesKindFilter,
  selectionIdOf,
  type EvalCounts,
  type EvalKind,
  type EvalResult,
  type ResultFilter,
} from '@/lib/evaluation';
import { getClassColor } from '@/lib/ui/class-colors';
import { displayId } from '@/lib/ui/display-id';
import { PANEL_CLASS, PanelHeader, useScrollSelectedIntoView } from '@/components/workspace';
import { OutcomeIcon } from './icons';

type Props = {
  /** The frame's results in list order (`orderResults`). */
  results: EvalResult[];
  /** Outcome counts of the frame, for the chips. `null` → no chips (nothing was evaluated). */
  counts: EvalCounts | null;
  filter: ResultFilter;
  onToggleKind: (kind: EvalKind) => void;
  /**
   * The selection id of the selected RESULT (`selectionIdOf`), or null. The
   * page resolves `selectedObjectId` to it, so a matched model box and its
   * label highlight the same row.
   */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** 3D boxes of the frame that take no part in the evaluation. */
  notEvaluated: number;
  /** Shown instead of the list when the frame has no evaluation (and why). */
  unavailable?: string;
};

/**
 * The list in evaluate mode (F5): one row per result of the current frame —
 * what the model missed first, then its false alarms, then what it found.
 *
 * It replaces the object list, with the same two behaviours: a click selects
 * (through the single `selectedObjectId`), and a row hidden by the class chips
 * is dimmed but stays clickable. The outcome chips are this list's own filter
 * and REMOVE rows.
 *
 * Boxes outside the camera image are not listed — there is nothing to compare
 * them with — and are accounted for in the footer line.
 */
export function ResultList({
  results,
  counts,
  filter,
  onToggleKind,
  selectedId,
  onSelect,
  notEvaluated,
  unavailable,
}: Props) {
  const rows = results.filter((result) => passesKindFilter(result, filter.kinds));
  // Keep the selected row in view — also when it MOVES without the selection
  // changing: the score slider can turn a found label into a missed one (the row
  // jumps to another group) and add or remove rows above it. Its position in
  // the list is the "order key" (Edge_F#5 Case 3).
  const selectedIndex = rows.findIndex((result) => selectionIdOf(result) === selectedId);
  const selectedRef = useScrollSelectedIntoView(selectedId, String(selectedIndex));
  const allKinds = filter.kinds.size === 0;

  return (
    <div className={`flex flex-col h-full ${PANEL_CLASS}`} onClick={() => onSelect(null)}>
      <div onClick={(e) => e.stopPropagation()}>
        <PanelHeader title="Results" count={unavailable ? undefined : results.length}>
          <span className="text-[11px] text-zinc-500">distance · score</span>
        </PanelHeader>
        {counts && (
          <div
            role="group"
            aria-label="Outcomes to show"
            className="shrink-0 flex items-center gap-1.5 h-7 px-3 border-b border-zinc-800 text-[11px] text-zinc-500"
          >
            Show
            {EVAL_KINDS.map((kind) => {
              const active = allKinds || filter.kinds.has(kind);
              return (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={active}
                  aria-label={`${OUTCOME_LABEL[kind]}: ${countOf(counts, kind)}`}
                  onClick={(e) => {
                    onToggleKind(kind);
                    if (e.detail > 0) e.currentTarget.blur();
                  }}
                  className={[
                    'inline-flex items-center gap-1 h-5 px-1.5 rounded-full ring-1 ring-inset tabular-nums transition-colors',
                    active
                      ? 'text-zinc-200 ring-zinc-600 hover:ring-zinc-400'
                      : 'text-zinc-600 ring-zinc-800 opacity-60 hover:opacity-100',
                  ].join(' ')}
                >
                  <OutcomeIcon kind={kind} size={12} />
                  {countOf(counts, kind)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {unavailable ? (
        <div className="flex-1 flex items-center justify-center px-4 text-center">
          <p className="text-sm text-zinc-500">{unavailable}</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-4 text-center">
          <p className="text-sm text-zinc-500">
            {results.length === 0 ? 'Nothing to evaluate in this frame.' : 'No result of the chosen kind.'}
          </p>
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto divide-y divide-zinc-800/70">
          {rows.map((result) => {
            const id = selectionIdOf(result);
            const isSelected = id === selectedId;
            const isHidden = !passesClassFilter(result, filter.classes);
            const isModelBox = result.kind === 'false-alarm';
            const score =
              result.kind === 'found' || result.kind === 'false-alarm' ? result.score : null;
            return (
              <li
                key={id}
                ref={isSelected ? selectedRef : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(id);
                }}
                className={[
                  'flex items-center gap-1.5 min-[1400px]:gap-2 px-3 h-8 cursor-pointer select-none',
                  'transition-colors duration-100',
                  isSelected
                    ? 'bg-sky-400/10 ring-1 ring-inset ring-sky-400/60'
                    : 'hover:bg-zinc-800/60',
                  isHidden ? 'opacity-40' : '',
                ].join(' ')}
              >
                <OutcomeIcon kind={result.kind} />
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: getClassColor(result.class) }}
                />
                <span
                  title={isModelBox ? `Model box: ${result.class}` : result.class}
                  className="flex-1 min-w-0 text-sm text-zinc-100 truncate"
                >
                  {result.class}
                </span>
                {isModelBox ? (
                  // A model box is 2D only: it has no measured position, and
                  // none is made up for it (Immutable Rule #6).
                  <span
                    title="A model box is 2D only — it has no 3D position"
                    className="text-[11px] text-zinc-600 tabular-nums w-9 text-right shrink-0"
                  >
                    —
                  </span>
                ) : (
                  <span
                    title="Measured distance from the ego vehicle"
                    className="text-[11px] text-zinc-500 tabular-nums w-9 text-right shrink-0"
                  >
                    {Math.round(result.distance)} m
                  </span>
                )}
                <span
                  title={score === null ? 'No model box matched this label' : 'Score of the model box'}
                  className={`text-[11px] tabular-nums w-7 text-right shrink-0 ${score === null ? 'text-zinc-600' : 'text-zinc-300'}`}
                >
                  {score === null ? '—' : score.toFixed(2)}
                </span>
                {/* Short id — dropped below 1400px, where the column is 240px
                    and the class name needs the room. Full id in the tooltip. */}
                <span
                  title={id}
                  className="hidden min-[1400px]:inline shrink-0 w-12 text-right font-mono text-[11px] text-zinc-500"
                >
                  {isModelBox ? 'model' : displayId(result.objectId)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {!unavailable && notEvaluated > 0 && (
        <p
          className="shrink-0 px-3 py-1.5 border-t border-zinc-800 text-[11px] text-zinc-500"
          title="3D boxes outside the camera image, or of a class the model cannot name. They are still in the 3D view and in Review mode."
          onClick={(e) => e.stopPropagation()}
        >
          + {notEvaluated} box{notEvaluated === 1 ? '' : 'es'} not evaluated
        </p>
      )}
    </div>
  );
}

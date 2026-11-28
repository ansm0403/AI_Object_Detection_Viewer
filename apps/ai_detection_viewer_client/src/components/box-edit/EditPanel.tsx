'use client';

import { useRef, useState } from 'react';
import { BOX_FIELDS, readBoxField, type BevProjector, type BoxField } from '@/lib/editing';
import type { ReviewRecord } from '@/lib/review';
import { REJECT_REASON_LABELS, VERDICT_LABELS } from '@/components/review/labels';
import { displayId } from '@/lib/ui/display-id';
import { classLabel } from '@/lib/ui/class-label';
import { PANEL_CLASS, PanelHeader } from '@/components/workspace';
import { labelNameOf } from './labels';
import type { EditTarget } from './useBoxEditor';

type Props = {
  target: EditTarget | null;
  projector: BevProjector | null;
  frameIndex: number;
  /** What the points are doing — the count "in view" can only be shown when they are there. */
  pointsStatus: 'inline' | 'loading' | 'ready' | 'failed';
  /** The review of this box, if it has one. An edit never changes it. */
  record: ReviewRecord | undefined;
  /** Shown instead of the numbers when there is no box to edit. */
  emptyMessage: string;
  /** Why the box cannot be changed right now; the number fields are then read-only. */
  locked: string | null;
  /** A number was entered for one of the fields. */
  onSetField: (field: BoxField, value: number) => void;
  /** The browser is not storing the edits. */
  notSaved?: boolean;
  /** The boxes are the practice set's (deliberately modified), not the dataset's. */
  practice?: boolean;
};

const FIELD_LABELS: Record<BoxField, string> = {
  length: 'Length',
  width: 'Width',
  height: 'Height',
  heading: 'Heading',
  lift: 'Up/down',
};
const FIELD_UNITS: Record<BoxField, string> = {
  length: 'm',
  width: 'm',
  height: 'm',
  heading: '°',
  lift: 'm',
};
const FIELD_TITLES: Record<BoxField, string> = {
  length: 'Length of the box, metres. Typing a number keeps the centre where it is.',
  width: 'Width of the box, metres. Typing a number keeps the centre where it is.',
  height: 'Height of the box, metres. Changing it keeps the bottom of the box where it is.',
  heading:
    'Where the front of the box points, in degrees from the front of the car (0° = the same way as the car, +90° = to its left)',
  lift: 'How far the bottom of the box is above (+) or below (−) the bottom of the label it was made from, metres',
};

const format = (field: BoxField, value: number) => {
  const digits = field === 'heading' ? 1 : 2;
  const text = value.toFixed(digits);
  // "-0.00" reads as a change; it is not one.
  return Number(text) === 0 ? (0).toFixed(digits) : text;
};

/**
 * (F8) The details slot while a box is being edited: the numbers of the box,
 * what was changed from the dataset's label, and the facts a reviewer checks
 * the box against.
 *
 * The top view changes position, length, width and heading by dragging; the
 * HEIGHT and how high the box sits can only be set here, by number — a view
 * from above cannot show them. Every field can be typed into.
 *
 * Wording (Rule #6): the dataset's box is "the label", the box on screen is
 * "edited". Nothing here calls an edit correct — it is one reviewer's judgement.
 */
export function EditPanel({
  target,
  projector,
  frameIndex,
  pointsStatus,
  record,
  emptyMessage,
  locked,
  onSetField,
  notSaved = false,
  practice = false,
}: Props) {
  const verdictText = record
    ? [VERDICT_LABELS[record.verdict], ...record.reasons.map((r) => REJECT_REASON_LABELS[r].toLowerCase())].join(' · ')
    : null;
  return (
    <aside aria-label="Edit box" className={`flex flex-col h-full ${PANEL_CLASS}`}>
      <PanelHeader title="Edit box">
        <span className="text-[11px] text-zinc-500 tabular-nums whitespace-nowrap">
          Frame {frameIndex}
          {target && (
            <>
              {' '}
              · {classLabel(target.className)}{' '}
              <span className="font-mono" title={target.objectId}>
                {displayId(target.objectId)}
              </span>
            </>
          )}
        </span>
      </PanelHeader>

      {!target || !projector ? (
        <p className="px-3 py-3 text-xs text-zinc-400">{emptyMessage}</p>
      ) : (
        <>
          {/* What the box is checked against. Two different counts, named differently:
              the dataset's (original sweep, original box) and this view's (the
              thinned points this app carries, the box as it is now). */}
          <div className="shrink-0 flex items-center justify-between gap-3 h-7 px-3 border-b border-zinc-800 text-[11px] text-zinc-400 tabular-nums whitespace-nowrap">
            <span title="LiDAR points nuScenes counted inside ITS box, on the original sweep. It does not change when the box is edited.">
              <span className="text-zinc-500">LiDAR</span>{' '}
              <span className="text-zinc-200">
                {target.labelLidarPoints === undefined ? '—' : `${target.labelLidarPoints} pts`}
              </span>{' '}
              {/* Practice: the count is of the box nuScenes annotated, not of the
                  (possibly modified) practice box the edit started from. */}
              <span className="text-zinc-600">{practice ? 'in the original' : 'in the label'}</span>
            </span>
            <span title="Of the points drawn in the top view (a thinned copy of the sweep), how many are inside the box as it is now.">
              <span className="text-zinc-500">In view</span>{' '}
              {target.pointsInView === null ? (
                <span className="text-amber-300">
                  {pointsStatus === 'failed' ? 'points unavailable' : 'loading…'}
                </span>
              ) : (
                <>
                  <span data-part="points-in-view" className="text-yellow-300">
                    {target.pointsInView} pts
                  </span>{' '}
                  <span className="text-zinc-600">inside the box</span>
                </>
              )}
            </span>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {/* Two columns: in three, the 360 px panel (windows below 1400 px) left
                43 px for a value and cut "171.5". The whole block still fits the
                shortest panel (232 px at 1536×700) without scrolling. */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 px-3 pt-2 pb-1.5">
              {BOX_FIELDS.map((field) => {
                const context = { projector, label: target.label };
                const value = readBoxField(target.values, field, context);
                const original = readBoxField(target.label, field, context);
                return (
                  <NumberField
                    key={field}
                    field={field}
                    text={format(field, value)}
                    changed={format(field, value) !== format(field, original)}
                    disabled={locked !== null}
                    onCommit={(next) => onSetField(field, next)}
                  />
                );
              })}
            </div>
            <p data-part="change" className="px-3 pb-2 text-[11px] leading-4">
              <span className="text-zinc-500">Changed from the label: </span>
              {target.changeText.length > 0 ? (
                <span className="text-amber-200">{target.changeText.join(' · ')}</span>
              ) : (
                <span className="text-zinc-500">nothing — the box is the {labelNameOf(practice)}</span>
              )}
            </p>
            <p
              data-part="verdict"
              className="px-3 py-1.5 border-t border-zinc-800 text-[11px] leading-4 text-zinc-500"
            >
              {verdictText ? (
                <>
                  The verdict stays <span className="text-zinc-300">{verdictText}</span>
                </>
              ) : (
                'Not reviewed yet — an edit does not set a verdict'
              )}
              {notSaved && (
                <span className="block text-amber-300">
                  Not saved: this browser is not storing the edits. They will be lost on reload.
                </span>
              )}
            </p>
          </div>
        </>
      )}
    </aside>
  );
}

/**
 * One number of the box. It shows the box's value; while it is being typed
 * into, it shows the text. Enter or leaving the field takes the number; Escape
 * puts the value back.
 *
 * A text that is not a number, or one that reads the same as what is shown, is
 * not taken — so clicking into "4.27" and leaving does not round a box that
 * really is 4.268 m long.
 */
function NumberField({
  field,
  text,
  changed,
  disabled,
  onCommit,
}: {
  field: BoxField;
  /** The box's value, formatted. */
  text: string;
  /** The value differs from the label's. */
  changed: boolean;
  disabled: boolean;
  onCommit: (value: number) => void;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  // Escape leaves the field too (blur) — and that leave must not take the text.
  const discard = useRef(false);

  const finish = () => {
    const entered = typed;
    setTyped(null);
    if (discard.current) {
      discard.current = false;
      return;
    }
    if (entered === null || entered.trim() === '') return;
    const value = Number(entered.trim().replace(',', '.'));
    if (!Number.isFinite(value)) return;
    if (format(field, value) === text) return;
    onCommit(value);
  };

  return (
    <label className="flex items-center gap-1.5 min-w-0" title={FIELD_TITLES[field]}>
      <span className="shrink-0 w-12 text-[11px] text-zinc-500">{FIELD_LABELS[field]}</span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        aria-label={FIELD_LABELS[field]}
        data-field={field}
        data-changed={changed ? 'true' : undefined}
        disabled={disabled}
        value={typed ?? text}
        onChange={(event) => setTyped(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={finish}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            discard.current = true;
            event.currentTarget.blur();
            // The editor's own Escape (close) must not also act on this press.
            event.stopPropagation();
          }
        }}
        className={[
          'flex-1 min-w-0 h-6 rounded bg-zinc-950 px-1.5 text-right font-mono text-xs tabular-nums',
          'ring-1 ring-inset focus:outline-none focus:ring-sky-400/60 disabled:opacity-50',
          changed ? 'text-amber-200 ring-amber-400/60' : 'text-zinc-200 ring-zinc-800',
        ].join(' ')}
      />
      <span className="shrink-0 w-2 text-[11px] text-zinc-600">{FIELD_UNITS[field]}</span>
    </label>
  );
}

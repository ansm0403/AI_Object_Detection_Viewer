'use client';

import type { MouseEvent, ReactNode } from 'react';
import { getClassColor } from '@/lib/ui/class-colors';
import { classLabel } from '@/lib/ui/class-label';
import { displayId } from '@/lib/ui/display-id';
import { labelNameOf } from './labels';
import type { EditView } from './useBoxEditor';

/** Keys shown on the buttons. The handling is in `useEditShortcuts`. */
export const EDIT_KEYS = { done: 'Esc', view: 'V', undo: 'Ctrl Z', next: 'N', prev: 'P' } as const;

type Props = {
  /** The box being edited; `null` when none is selected. */
  box: { className: string; objectId: string } | null;
  /** 1-based position of the frame in its scene. */
  frameIndex: number;
  view: EditView;
  onToggleView: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  /** Back to the dataset's box. Absent when the box has no edit. */
  onRevert?: () => void;
  onDone: () => void;
  /** The browser is not storing the edits (storage blocked or full). */
  notSaved?: boolean;
  /** The boxes are the practice set's (deliberately modified), not the dataset's. */
  practice?: boolean;
  /**
   * The walk through the rejected boxes (all scenes): how many there are,
   * where the box on screen is among them (`null` = it is not one of them),
   * and the way to the next / previous one. Nothing is shown when no box is
   * rejected.
   */
  rejected?: { count: number; index: number | null; onNext?: () => void; onPrev?: () => void };
};

/**
 * (F8) The filter-bar slot while a box is being edited: what is being edited,
 * how the editor shares the room with the 3D view, undo / redo / revert, Done.
 *
 * The class filter and the distance slider are not shown here — they decide
 * which boxes are listed, and during editing there is one box.
 */
export function EditBar({
  box,
  frameIndex,
  view,
  onToggleView,
  onUndo,
  onRedo,
  onRevert,
  onDone,
  notSaved = false,
  practice = false,
  rejected,
}: Props) {
  const labelName = labelNameOf(practice);
  // The sentence is shown only where ALL of it fits next to everything else
  // (measured: from 1400px; with the "Not saved" warning and the "Rejected"
  // group in the bar it ran out of the bar at 1400–1440px, so then from 1536px).
  const sentenceFrom = notSaved
    ? { block: 'min-[1536px]:block', inline: 'min-[1536px]:inline' }
    : { block: 'min-[1400px]:block', inline: 'min-[1400px]:inline' };
  return (
    <div className="flex items-center flex-wrap lg:flex-nowrap gap-x-3 gap-y-2 h-full bg-zinc-900/60 border-b border-zinc-800 px-4 py-1.5">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-amber-300">
        Edit box
      </span>
      <span className="shrink-0 text-xs text-zinc-200 whitespace-nowrap tabular-nums">
        {box ? (
          <>
            <span
              aria-hidden="true"
              className="inline-block w-2 h-2 rounded-full mr-1.5"
              style={{ backgroundColor: getClassColor(box.className) }}
            />
            {classLabel(box.className)}{' '}
            <span title={box.objectId} className="font-mono text-zinc-400">
              {displayId(box.objectId)}
            </span>{' '}
            · frame {frameIndex}
          </>
        ) : (
          <span className="text-zinc-400">no box selected · frame {frameIndex}</span>
        )}
      </span>
      {/* Only where the whole sentence fits (a cut-off sentence is worse than none). */}
      <span
        aria-hidden="true"
        className={`hidden ${sentenceFrom.block} w-px h-5 bg-zinc-800 shrink-0`}
      />
      <span
        data-part="edit-sentence"
        className={`hidden ${sentenceFrom.inline} shrink-0 text-[11px] text-zinc-500 whitespace-nowrap`}
      >
        Saved as an edit on top of the {labelName} — the label itself is not changed
      </span>
      {notSaved && (
        <span
          role="status"
          title="This browser is not storing the edits (storage is blocked or full). They will be lost when the page is reloaded."
          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/40"
        >
          Not saved
        </span>
      )}
      {/* Below the fixed layout (lg) the bar may be much narrower than its
          buttons (measured at 390px: they ran 125px out of the window and the
          whole page scrolled sideways), so there the group wraps too. */}
      <div className="flex items-center flex-wrap justify-end gap-1.5 ml-auto lg:flex-nowrap lg:shrink-0">
        {rejected && rejected.count > 0 && (
          <>
            <span
              data-part="rejected-walk"
              title="Rejected boxes of all scenes, in scene, frame and list order. Boxes hidden by the filters are not counted."
              className="text-[11px] text-zinc-400 tabular-nums whitespace-nowrap"
            >
              <span className="text-rose-300">Rejected</span>{' '}
              {rejected.index === null ? '–' : rejected.index + 1} / {rejected.count}
            </span>
            <BarButton
              onClick={rejected.onPrev}
              disabled={!rejected.onPrev}
              title="Go to the previous rejected box (P)"
              ariaLabel="Previous rejected box"
            >
              <span aria-hidden="true">‹</span>
              <span className="hidden xl:inline-flex">
                <Kbd>{EDIT_KEYS.prev}</Kbd>
              </span>
            </BarButton>
            <BarButton
              onClick={rejected.onNext}
              disabled={!rejected.onNext}
              title="Go to the next rejected box (N)"
              ariaLabel="Next rejected box"
            >
              <span aria-hidden="true">›</span>
              <span className="hidden xl:inline-flex">
                <Kbd>{EDIT_KEYS.next}</Kbd>
              </span>
            </BarButton>
            <span aria-hidden="true" className="w-px h-5 bg-zinc-800 mx-0.5" />
          </>
        )}
        <BarButton
          onClick={onToggleView}
          pressed={view === 'split'}
          title={
            view === 'split'
              ? 'The 3D view is next to the top view. Press to give the top view all the room.'
              : 'Show the 3D view next to the top view.'
          }
          ariaLabel="3D view next to the top view"
        >
          3D view <Kbd>{EDIT_KEYS.view}</Kbd>
        </BarButton>
        <span aria-hidden="true" className="w-px h-5 bg-zinc-800 mx-0.5" />
        <BarButton onClick={onUndo} disabled={!onUndo} title="Undo the last change to this box" ariaLabel="Undo">
          <span aria-hidden="true">↶</span>
          <span className="hidden xl:inline">Undo</span> <Kbd>{EDIT_KEYS.undo}</Kbd>
        </BarButton>
        <BarButton onClick={onRedo} disabled={!onRedo} title="Redo (Ctrl+Shift+Z or Ctrl+Y)" ariaLabel="Redo">
          <span aria-hidden="true">↷</span>
          <span className="hidden xl:inline">Redo</span>
        </BarButton>
        <BarButton
          onClick={onRevert}
          disabled={!onRevert}
          tone="amber"
          title={`Remove the edit: the box is the ${labelName} again`}
          ariaLabel="Revert to label"
        >
          Revert<span className="hidden xl:inline"> to label</span>
        </BarButton>
        <BarButton onClick={onDone} tone="sky" title="Close the editor and go back to the review" ariaLabel="Done">
          Done <Kbd>{EDIT_KEYS.done}</Kbd>
        </BarButton>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-[3px] border border-current font-mono text-[10px] font-semibold leading-none opacity-70">
      {children}
    </kbd>
  );
}

const TONES = {
  plain: 'border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100',
  amber: 'border-amber-400/35 text-amber-200 hover:border-amber-300/60 hover:text-amber-100',
  sky: 'border-sky-400/50 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25',
} as const;

function BarButton({
  onClick,
  disabled = false,
  pressed,
  tone = 'plain',
  title,
  ariaLabel,
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  pressed?: boolean;
  tone?: keyof typeof TONES;
  title: string;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={pressed}
      disabled={disabled}
      title={title}
      // A mouse click must not leave the focus on the button: Space / Enter
      // would press it again while the user is working in the top view.
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        onClick?.();
        if (event.detail > 0) event.currentTarget.blur();
      }}
      className={[
        'inline-flex items-center gap-1.5 h-6 px-2 rounded border text-xs whitespace-nowrap transition-colors',
        'disabled:opacity-35 disabled:cursor-not-allowed',
        pressed ? 'border-sky-400/50 bg-sky-500/15 text-sky-200' : TONES[tone],
      ].join(' ')}
    >
      {children}
    </button>
  );
}

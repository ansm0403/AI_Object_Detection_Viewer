'use client';

/**
 * What the workspace is used for (F5).
 *  - `review`   — judge the dataset's 3D labels (F4).
 *  - `evaluate` — score a camera detector's predictions against those labels.
 *
 * A VIEW setting, like the camera mode: the same frames and the same selected
 * object, shown for a different job. It is not a second selection
 * (Immutable Rule #2).
 */
export type WorkMode = 'review' | 'evaluate';

const MODES: { id: WorkMode; label: string; hint: string }[] = [
  { id: 'review', label: 'Review', hint: 'Review the 3D labels' },
  {
    id: 'evaluate',
    label: 'Evaluate',
    hint: 'Score the camera detector against the labels',
  },
];

type Props = {
  mode: WorkMode;
  onSelect: (mode: WorkMode) => void;
  /**
   * Why evaluate mode cannot be entered right now (shown as the tooltip of the
   * disabled button). Omitted → it can.
   */
  evaluateBlocked?: string;
};

/** Segmented control in the top bar, styled like the dataset switcher. */
export function ModeSwitch({ mode, onSelect, evaluateBlocked }: Props) {
  return (
    <div role="group" aria-label="Mode" className="flex items-center rounded-md bg-zinc-800 p-0.5">
      {MODES.map((m) => {
        const active = m.id === mode;
        const blocked = m.id === 'evaluate' && !active ? evaluateBlocked : undefined;
        return (
          <button
            key={m.id}
            type="button"
            aria-pressed={active}
            // aria-disabled, not `disabled`: a disabled button swallows hover in
            // some browsers and the tooltip that explains WHY would never show.
            aria-disabled={blocked ? true : undefined}
            title={blocked ?? m.hint}
            onClick={(e) => {
              if (blocked) return;
              onSelect(m.id);
              // Mouse click: give the keyboard back to the page shortcuts.
              if (e.detail > 0) e.currentTarget.blur();
            }}
            className={[
              'px-2.5 py-1 text-xs rounded transition-colors',
              active
                ? 'bg-sky-500/20 text-sky-200 ring-1 ring-inset ring-sky-400/40'
                : blocked
                  ? 'text-zinc-600 cursor-not-allowed'
                  : 'text-zinc-400 hover:text-zinc-200',
            ].join(' ')}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

import type { BevPoint } from './bev';

/**
 * Keys of the top-view editor (F8), as data — which key press means what.
 * Like the review shortcuts (`lib/review/shortcuts`), this touches no DOM and
 * no store, so the whole key map is unit-tested; a small hook listens for
 * `keydown` and hands the action on.
 *
 * These keys are only read while the editor is open. The verdict keys of the
 * review are switched off then, so the two maps never compete.
 */
export type EditKeyAction =
  /** Close the editor. */
  | { type: 'done' }
  /** Focus view ↔ the 3D view next to the top view. */
  | { type: 'toggle-view' }
  | { type: 'undo' }
  | { type: 'redo' }
  /** Move the box by this much AS THE TOP VIEW SHOWS IT (metres; x right, y down). */
  | { type: 'nudge'; delta: BevPoint };

/** The parts of a `KeyboardEvent` the resolver reads (kept minimal for tests). */
export type EditKeyEvent = {
  key: string;
  /** Physical key, e.g. "KeyZ" — independent of the input language. */
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  /** True while a key is held down and auto-repeating. */
  repeat?: boolean;
  /** Whether the press is headed for a text field (see `isTypingTarget`). */
  typing?: boolean;
};

/** One arrow press moves the box this far (metres). */
export const NUDGE_STEP = 0.05;
/** With Shift: ten times as far. */
export const NUDGE_STEP_LARGE = 0.5;

/** Which letter a press stands for, also under a non-Latin input method (the physical key decides then). */
function letterOf(event: EditKeyEvent): string {
  if (/^[a-z]$/i.test(event.key)) return event.key.toLowerCase();
  const fromCode = /^Key([A-Z])$/.exec(event.code ?? '');
  return fromCode ? fromCode[1].toLowerCase() : '';
}

const ARROWS: Record<string, readonly [number, number]> = {
  ArrowUp: [0, -1], // up on screen = the way the car faces
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

/**
 * The editor action for a key press, or `null` when the press is not one.
 *
 *  - While typing in a field nothing fires — the field owns its keys,
 *    including its own Ctrl+Z and the arrows that move the caret.
 *  - Undo is Ctrl+Z (⌘Z on a Mac); redo is Ctrl+Shift+Z or Ctrl+Y.
 *  - Arrows move the box by 5 cm, with Shift by 50 cm. A HELD arrow repeats
 *    (the caller merges a run of presses into one undo step); the other keys
 *    act once per press.
 *  - Alt combinations are left to the browser.
 */
export function resolveEditKey(event: EditKeyEvent): EditKeyAction | null {
  if (event.typing || event.altKey) return null;
  const letter = letterOf(event);

  if (event.ctrlKey || event.metaKey) {
    if (letter === 'z') return event.shiftKey ? { type: 'redo' } : { type: 'undo' };
    if (letter === 'y' && !event.shiftKey) return { type: 'redo' };
    return null;
  }

  const arrow = ARROWS[event.key];
  if (arrow) {
    const step = event.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP;
    // `|| 0`: -0 would be a different number to an equality test, not to a box.
    return { type: 'nudge', delta: [arrow[0] * step || 0, arrow[1] * step || 0] };
  }

  if (event.repeat) return null;
  if (event.key === 'Escape') return { type: 'done' };
  if (letter === 'v' && !event.shiftKey) return { type: 'toggle-view' };
  return null;
}

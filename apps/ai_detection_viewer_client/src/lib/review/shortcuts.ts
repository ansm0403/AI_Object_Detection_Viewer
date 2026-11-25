import { REJECT_REASONS, type RejectReason, type Verdict } from './types';

/**
 * Keyboard shortcuts of the review flow (F4), as data.
 *
 * `resolveShortcut` only answers "which action does this key press mean" — it
 * touches no DOM and no store, so the whole key map is unit-tested. A small
 * hook listens for `keydown` and hands the returned action to the page.
 */

export type ReviewAction =
  | { type: 'verdict'; verdict: Verdict }
  /** Back to "not reviewed". */
  | { type: 'clear' }
  /** Move in the queue: +1 = next box, −1 = previous. */
  | { type: 'step'; direction: 1 | -1 }
  /** Toggle one reject reason (number keys 1–6, in `REJECT_REASONS` order). */
  | { type: 'reason'; reason: RejectReason }
  /** Jump to the next frame that still has unreviewed boxes. */
  | { type: 'next-frame' }
  /** Camera image: full view ↔ zoom on the selected box. */
  | { type: 'toggle-zoom' };

/** The parts of a `KeyboardEvent` the resolver reads (kept minimal for tests). */
export type ShortcutEvent = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  /** True while a key is held down and auto-repeating. */
  repeat?: boolean;
  target?: unknown;
};

/** Key → what it does, for hints in the UI. Keys are shown upper-case. */
export const SHORTCUT_KEYS = {
  approve: 'A',
  reject: 'R',
  unsure: 'U',
  clear: 'C',
  next: 'J',
  previous: 'K',
  nextFrame: 'N',
  zoom: 'Z',
} as const;

// <input> types that take typed text. A range slider or a checkbox is an
// <input> too, but pressing "A" there is not typing — shortcuts stay active.
const TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'url',
  'tel',
  'email',
  'password',
  'number',
  'date',
  'time',
  'datetime-local',
  'month',
  'week',
]);

/**
 * True when the key press is headed for a control that consumes typed
 * characters: a text field, a textarea, a dropdown (type-ahead), or editable
 * content. Shortcuts must not fire there — typing "a" in the note field must
 * not approve the box.
 */
export function isTypingTarget(target: unknown): boolean {
  if (target === null || typeof target !== 'object') return false;
  const el = target as { tagName?: unknown; type?: unknown; isContentEditable?: unknown };
  if (el.isContentEditable === true) return true;
  const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    // A missing / unknown type means the browser treats it as a text field.
    const type = typeof el.type === 'string' && el.type !== '' ? el.type.toLowerCase() : 'text';
    return TEXT_INPUT_TYPES.has(type);
  }
  return false;
}

/**
 * The review action for a key press, or `null` when the press is not a
 * shortcut.
 *
 *  - Combinations with Ctrl / Meta / Alt are never shortcuts (Ctrl+R must
 *    reload the page, not reject a box).
 *  - Nothing fires while typing (see `isTypingTarget`).
 *  - A HELD key repeats only for moving through the queue. Verdicts, clearing,
 *    reasons and frame jumps act once per press — holding "A" must not approve
 *    a run of boxes nobody looked at.
 */
export function resolveShortcut(event: ShortcutEvent): ReviewAction | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (isTypingTarget(event.target)) return null;

  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

  if (key === 'j') return { type: 'step', direction: 1 };
  if (key === 'k') return { type: 'step', direction: -1 };
  if (event.repeat) return null;

  switch (key) {
    case 'a':
      return { type: 'verdict', verdict: 'approved' };
    case 'r':
      return { type: 'verdict', verdict: 'rejected' };
    case 'u':
      return { type: 'verdict', verdict: 'unsure' };
    case 'c':
      return { type: 'clear' };
    case 'n':
      return { type: 'next-frame' };
    case 'z':
      return { type: 'toggle-zoom' };
    default:
      break;
  }

  // "1".."6" → the reason at that position.
  if (/^[1-9]$/.test(key)) {
    const reason = REJECT_REASONS[Number(key) - 1];
    if (reason) return { type: 'reason', reason };
  }
  return null;
}

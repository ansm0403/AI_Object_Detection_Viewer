'use client';

import { useEffect, useRef } from 'react';
import { resolveEditKey, type BevPoint } from '@/lib/editing';
import { isTypingTarget } from '@/lib/review';

type Handlers = {
  onDone: () => void;
  onToggleView: () => void;
  /** Absent when there is nothing to undo / redo. */
  onUndo?: () => void;
  onRedo?: () => void;
  /** Move the box by a step as the top view shows it (metres). */
  onNudge: (delta: BevPoint) => void;
  /** Go to the next (1) / previous (-1) rejected box. */
  onStepRejected?: (direction: 1 | -1) => void;
};

/**
 * (F8) Keys of the top-view editor, active only while it is open: `Esc` closes
 * it, `V` switches the view, the arrows move the box, Ctrl+Z / Ctrl+Shift+Z /
 * Ctrl+Y undo and redo, `N` / `P` go to the next / previous rejected box.
 *
 * Separate from the review shortcuts on purpose: while a box is being edited
 * the verdict keys are switched off by the page (a stray "A" must not approve
 * the box under the pointer), and these keys mean nothing outside the editor.
 *
 * WHICH key means WHAT is the pure `resolveEditKey` (unit-tested); this hook
 * only connects it to the handlers. The latest handlers are read through a
 * ref, so the listener is attached once per `enabled` change.
 */
export function useEditShortcuts(handlers: Handlers, enabled: boolean) {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const action = resolveEditKey({
        key: event.key,
        code: event.code,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        repeat: event.repeat,
        typing: isTypingTarget(event.target),
      });
      if (!action) return;
      // The key is the editor's: the page must not scroll on an arrow, and the
      // browser must not run its own undo.
      event.preventDefault();
      const h = ref.current;
      switch (action.type) {
        case 'done':
          h.onDone();
          break;
        case 'toggle-view':
          h.onToggleView();
          break;
        case 'undo':
          h.onUndo?.();
          break;
        case 'redo':
          h.onRedo?.();
          break;
        case 'nudge':
          h.onNudge(action.delta);
          break;
        case 'step-rejected':
          h.onStepRejected?.(action.direction);
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}

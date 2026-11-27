'use client';

import { useEffect, useRef } from 'react';
import { isTypingTarget } from '@/lib/review';

type Handlers = {
  onDone: () => void;
  onToggleView: () => void;
};

/**
 * (F8) Keys of the top-view editor, active only while it is open:
 * `Esc` closes it, `V` switches between the focus view and the 3D view next to
 * it.
 *
 * Separate from the review shortcuts on purpose: while a box is being edited
 * the verdict keys are switched off by the page (a stray "A" must not approve
 * the box under the pointer), and these keys mean nothing outside the editor.
 *
 * Nothing fires while typing in a field, and with a non-Latin input method the
 * physical key decides (`event.code`), as for the review shortcuts.
 */
export function useEditShortcuts(handlers: Handlers, enabled: boolean) {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      if (event.key === 'Escape') {
        // In a field, Esc first gives the keyboard back (the field blurs itself).
        if (isTypingTarget(event.target)) return;
        event.preventDefault();
        ref.current.onDone();
        return;
      }
      if (isTypingTarget(event.target)) return;
      if (event.key.toLowerCase() === 'v' || event.code === 'KeyV') {
        event.preventDefault();
        ref.current.onToggleView();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}

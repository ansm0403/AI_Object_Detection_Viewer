'use client';

import { useEffect, useRef } from 'react';
import { resolveShortcut, type ReviewAction } from '@/lib/review';

/**
 * Listen for review shortcuts on the window (F4).
 *
 * The hook is deliberately thin: WHICH key means WHAT is decided by the pure
 * `resolveShortcut` (unit-tested), and what an action DOES is decided by the
 * page's `onAction`. This only connects the two.
 *
 * The listener is attached once per `enabled` change; the latest `onAction` is
 * read through a ref, so the page can pass a fresh callback every render
 * without the listener being removed and re-added each time.
 */
export function useReviewShortcuts(onAction: (action: ReviewAction) => void, enabled: boolean) {
  const handlerRef = useRef(onAction);
  useEffect(() => {
    handlerRef.current = onAction;
  }, [onAction]);

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const action = resolveShortcut(event);
      if (!action) return;
      // The key is ours: stop the browser from also acting on it.
      event.preventDefault();
      handlerRef.current(action);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}

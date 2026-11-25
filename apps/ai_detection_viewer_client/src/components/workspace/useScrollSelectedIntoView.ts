'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Keep the selected row of a scrolling list in view.
 *
 * Returns a ref to put on the SELECTED row (`<li>`). Whenever `selectedKey` or
 * `orderKey` changes — the selection moved from outside the list (3D / camera
 * click, J / K, auto-advance) or the list was re-ordered — the row's parent
 * (the scrolling `<ul>`) is scrolled just far enough to show it.
 *
 * Two details that were each a bug once:
 *  - It adjusts the list's own `scrollTop` instead of calling `scrollIntoView`,
 *    which chains up to every scrollable ancestor (including <body>) and can
 *    scroll the whole page on short viewports (Edge_#9.5 Case C).
 *  - The row is measured against the list with `getBoundingClientRect`.
 *    `li.offsetTop` is relative to the nearest POSITIONED ancestor — <body>
 *    here, not the list — and was off by the list's distance from the page top
 *    (Edge_F#4 Case 1).
 */
export function useScrollSelectedIntoView(
  selectedKey: string | null | undefined,
  orderKey?: string,
): RefObject<HTMLLIElement | null> {
  const selectedRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (!selectedKey) return;
    const li = selectedRef.current;
    const ul = li?.parentElement;
    if (!li || !ul) return;
    const view = ul.getBoundingClientRect();
    const row = li.getBoundingClientRect();
    if (row.top < view.top) {
      ul.scrollTop -= view.top - row.top;
    } else if (row.bottom > view.bottom) {
      ul.scrollTop += row.bottom - view.bottom;
    }
  }, [selectedKey, orderKey]);
  return selectedRef;
}

'use client';

import { useMemo, useState } from 'react';
import { replaceBoxes, type BoxValues } from '@/lib/editing';
import type { Frame } from '@/lib/types';

/**
 * (F8) The box as it is WHILE it is being dragged: not stored yet, not an undo
 * step yet — just what the pointer has made of it so far. It becomes a stored
 * edit when the pointer is released (`useBoxEditor`), and is gone if the drag
 * is cancelled.
 */
export type BoxDraft = { frameId: string; objectId: string; values: BoxValues };

/**
 * The draft lives in its own tiny hook because the page needs it EARLY — to
 * build the frame everything on screen is drawn from — while the editor that
 * writes it (`useBoxEditor`) needs things the page only knows later.
 */
export function useBoxDraft() {
  const [draft, setDraft] = useState<BoxDraft | null>(null);
  return { draft, setDraft };
}

/**
 * The frame with the dragged box laid over it. This is what makes the 3D view
 * and the six photos follow a drag: they are drawn from this frame like from
 * any other. Only this ONE frame is rebuilt per pointer move — not the scene.
 * The same frame object when there is no draft for it.
 */
export function useDraftFrame(frame: Frame | null, draft: BoxDraft | null): Frame | null {
  return useMemo(() => {
    if (!frame || !draft || draft.frameId !== frame.id) return frame;
    return replaceBoxes(frame, new Map([[draft.objectId, draft.values]]));
  }, [frame, draft]);
}

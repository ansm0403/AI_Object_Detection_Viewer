import { create } from 'zustand';

type ViewerState = {
  selectedFrameId: string | null;
  selectedObjectId: string | null;
  confidenceThreshold: number;
  visibleClasses: Set<string>;
};

type ViewerActions = {
  setSelectedFrame: (id: string) => void;
  setSelectedObject: (id: string | null) => void;
  setConfidenceThreshold: (v: number) => void;
  toggleClass: (className: string) => void;
};

export type ViewerStore = ViewerState & ViewerActions;

// Factory, not a frozen singleton: each call returns a fresh visibleClasses Set
// so that callers (tests, future store-reset paths) cannot accidentally share
// a mutable Set across instances. See docs/edgecases/Edge_#3.md Case 2.
export const createInitialState = (): ViewerState => ({
  selectedFrameId: null,
  selectedObjectId: null,
  confidenceThreshold: 0,
  visibleClasses: new Set<string>(),
});

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export const useViewerStore = create<ViewerStore>((set) => ({
  ...createInitialState(),
  setSelectedFrame: (id) => set({ selectedFrameId: id }),
  setSelectedObject: (id) => set({ selectedObjectId: id }),
  setConfidenceThreshold: (v) => {
    if (!Number.isFinite(v)) {
      // NaN / ±Infinity would poison `confidence >= threshold` comparisons in
      // the Step 7 filter selector — every detection would vanish. Ignore the
      // call and keep the previous value. See Edge_#3.md Case 1.
      console.warn(
        `[viewer-store] setConfidenceThreshold ignored non-finite value: ${v}`
      );
      return;
    }
    set({ confidenceThreshold: clamp01(v) });
  },
  toggleClass: (className) =>
    set((state) => {
      const next = new Set(state.visibleClasses);
      if (next.has(className)) {
        next.delete(className);
      } else {
        next.add(className);
      }
      return { visibleClasses: next };
    }),
}));

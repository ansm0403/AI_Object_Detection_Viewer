import { describe, it, expect, beforeEach } from 'vitest';
import { useViewerStore, createInitialState } from '@/store';

beforeEach(() => {
  useViewerStore.setState(createInitialState());
});

// Mirrors `handleSelectFrame` in app/page.tsx. Step 8 keeps the
// frame-switch + object-clear orchestration in the page (not in the store)
// so store actions remain single-purpose. See Edge_#5.md Case 6.
const handleSelectFrame = (id: string) => {
  const { selectedFrameId, setSelectedFrame, setSelectedObject } =
    useViewerStore.getState();
  if (id === selectedFrameId) return;
  setSelectedFrame(id);
  setSelectedObject(null);
};

describe('frame switch', () => {
  it('clears selectedObjectId when switching to a different frame', () => {
    useViewerStore.getState().setSelectedFrame('frame-A');
    useViewerStore.getState().setSelectedObject('A-1');
    expect(useViewerStore.getState().selectedObjectId).toBe('A-1');

    handleSelectFrame('frame-B');

    expect(useViewerStore.getState().selectedFrameId).toBe('frame-B');
    expect(useViewerStore.getState().selectedObjectId).toBeNull();
  });

  it('preserves the object selection when re-selecting the active frame', () => {
    useViewerStore.getState().setSelectedFrame('frame-A');
    useViewerStore.getState().setSelectedObject('A-1');

    handleSelectFrame('frame-A');

    expect(useViewerStore.getState().selectedFrameId).toBe('frame-A');
    // No-op switch must not wipe the user's current pick.
    expect(useViewerStore.getState().selectedObjectId).toBe('A-1');
  });

  it('does not throw when switching with no prior object selection', () => {
    useViewerStore.getState().setSelectedFrame('frame-A');
    expect(() => handleSelectFrame('frame-B')).not.toThrow();
    expect(useViewerStore.getState().selectedObjectId).toBeNull();
  });
});

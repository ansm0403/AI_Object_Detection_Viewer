import { describe, it, expect, beforeEach } from 'vitest';
import { useViewerStore, createInitialState } from '@/store';

beforeEach(() => {
  useViewerStore.setState(createInitialState());
});

// Mirrors `handleSelectFrame` in app/page.tsx. The frame-switch + object-clear
// orchestration lives in the page (not the store) so store actions stay
// single-purpose. The object-selection policy is DATASET-AWARE (F2-C):
//  - COCO (`tracksAcrossFrames = false`): clear the selection — COCO ids are
//    `imageId-annId`, unstable across frames, so a kept id could ghost-highlight
//    or accidentally match a different object. Edge_#5 Case 6.
//  - nuScenes (`tracksAcrossFrames = true`): KEEP the selection — the id is an
//    `instance` token, stable for the same object across frames, so keeping it
//    tracks that object. Edge_F#2 Case 5.
const handleSelectFrame = (id: string, tracksAcrossFrames: boolean) => {
  const { selectedFrameId, setSelectedFrame, setSelectedObject } =
    useViewerStore.getState();
  if (id === selectedFrameId) return;
  setSelectedFrame(id);
  if (!tracksAcrossFrames) setSelectedObject(null);
};

describe('frame switch — COCO (independent frames, unstable ids)', () => {
  it('clears selectedObjectId when switching to a different frame', () => {
    useViewerStore.getState().setSelectedFrame('frame-A');
    useViewerStore.getState().setSelectedObject('A-1');
    expect(useViewerStore.getState().selectedObjectId).toBe('A-1');

    handleSelectFrame('frame-B', false);

    expect(useViewerStore.getState().selectedFrameId).toBe('frame-B');
    expect(useViewerStore.getState().selectedObjectId).toBeNull();
  });

  it('preserves the object selection when re-selecting the active frame', () => {
    useViewerStore.getState().setSelectedFrame('frame-A');
    useViewerStore.getState().setSelectedObject('A-1');

    handleSelectFrame('frame-A', false);

    expect(useViewerStore.getState().selectedFrameId).toBe('frame-A');
    // No-op switch must not wipe the user's current pick.
    expect(useViewerStore.getState().selectedObjectId).toBe('A-1');
  });

  it('does not throw when switching with no prior object selection', () => {
    useViewerStore.getState().setSelectedFrame('frame-A');
    expect(() => handleSelectFrame('frame-B', false)).not.toThrow();
    expect(useViewerStore.getState().selectedObjectId).toBeNull();
  });
});

describe('frame switch — nuScenes (tracked sequence, stable instance ids)', () => {
  it('KEEPS selectedObjectId when switching frames (tracking)', () => {
    useViewerStore.getState().setSelectedFrame('frame-A');
    // The id is an instance token — the SAME object exists in the next frame.
    useViewerStore.getState().setSelectedObject('instance-xyz');

    handleSelectFrame('frame-B', true);

    expect(useViewerStore.getState().selectedFrameId).toBe('frame-B');
    // Selection survives the switch so the same object stays highlighted.
    expect(useViewerStore.getState().selectedObjectId).toBe('instance-xyz');
  });

  it('keeps the selection across a multi-frame walk (re-appearance is correct)', () => {
    useViewerStore.getState().setSelectedFrame('frame-A');
    useViewerStore.getState().setSelectedObject('instance-xyz');

    // Object leaves view in B then returns in C — the stored id is unchanged the
    // whole time, so the highlight simply re-appears when the object does (the
    // component id-match drives the highlight; absence just draws nothing).
    handleSelectFrame('frame-B', true);
    handleSelectFrame('frame-C', true);

    expect(useViewerStore.getState().selectedObjectId).toBe('instance-xyz');
  });

  it('still no-ops on a same-frame re-select', () => {
    useViewerStore.getState().setSelectedFrame('frame-A');
    useViewerStore.getState().setSelectedObject('instance-xyz');

    handleSelectFrame('frame-A', true);

    expect(useViewerStore.getState().selectedFrameId).toBe('frame-A');
    expect(useViewerStore.getState().selectedObjectId).toBe('instance-xyz');
  });
});

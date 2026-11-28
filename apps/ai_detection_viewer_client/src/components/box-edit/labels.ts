import type { ReviewBlock } from '@/lib/review';

/**
 * (F8) Why the box cannot be edited right now, in words. The conditions are the
 * ones that block a verdict (`getReviewBlock`): what cannot be judged cannot be
 * edited either.
 */
export const EDIT_BLOCK_MESSAGES: Record<ReviewBlock, string> = {
  playing: 'Pause playback to edit the box',
  'no-selection': 'No box is selected. Click a box in the 3D view or in the photo to edit it.',
  'not-in-frame': 'The selected object has no box in this frame.',
  hidden: 'This box is hidden by the filters. Close the editor and reset the filters to edit it.',
};

/**
 * (F8) What the box an edit starts from is called on screen. On the practice
 * set that box is NOT the nuScenes label — it may be one of the deliberately
 * wrong ones — so the editor must not call it that (the spirit of Rule #6).
 */
export const labelNameOf = (practice: boolean): string =>
  practice ? 'practice label' : 'nuScenes label';

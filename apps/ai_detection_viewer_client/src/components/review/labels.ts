import type { RejectReason, ReviewBlock, Verdict } from '@/lib/review';

// UI wording for the review data. The stored / exported values stay the stable
// codes (`wrong_size`); only what the reviewer reads lives here.

export const REJECT_REASON_LABELS: Record<RejectReason, string> = {
  wrong_class: 'Wrong class',
  wrong_size: 'Wrong size',
  wrong_position: 'Wrong position',
  wrong_heading: 'Wrong heading',
  not_an_object: 'Not an object',
  other: 'Other',
};

export const VERDICT_LABELS: Record<Verdict, string> = {
  approved: 'Approved',
  rejected: 'Rejected',
  unsure: 'Unsure',
};

/** Shown in place of the status line while a verdict cannot be given. */
export const REVIEW_BLOCK_MESSAGES: Record<ReviewBlock, string> = {
  playing: 'Pause playback to review',
  'no-selection': 'Select a box to review',
  'not-in-frame': 'Selected object is not in this frame',
  hidden: 'Hidden by filters · reset filters to review',
};

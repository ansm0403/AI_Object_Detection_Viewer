'use client';

import { cameraShortName } from '@/lib/cameras';
import { isWeakEvidence } from '@/lib/review';
import type { BoxAnnotationInfo } from '@/lib/types';
import { EvidenceBars } from './icons';

/** What the data says about the selected box, beyond its geometry. */
export type BoxEvidence = {
  /** LiDAR points the dataset counted inside the box (absent in older files). */
  lidarPoints?: number;
  visibility?: BoxAnnotationInfo['visibility'];
  /**
   * (F6) The cameras whose photo shows the box, best view first (camera
   * channel names). Empty = no camera sees it; it can only be checked in 3D.
   */
  seenBy: string[];
  /**
   * (F8) The box on screen is the reviewer's edit. The LiDAR count and the
   * visibility are still the DATASET's records of ITS box — the strip says so.
   */
  edited?: boolean;
};

const VISIBILITY_LABELS: Record<NonNullable<BoxAnnotationInfo['visibility']>, string> = {
  'v0-40': '0–40%',
  'v40-60': '40–60%',
  'v60-80': '60–80%',
  'v80-100': '80–100%',
};

/**
 * One line of evidence for the selected box, shown right above the verdict
 * buttons (F4) — the facts a reviewer weighs before deciding, kept in view at
 * every window size instead of further down the scrolling details.
 *
 * Every value is the DATASET's own record, and the tooltips say so: the LiDAR
 * count is nuScenes' count on the original sweep (not the thinned cloud drawn in
 * the 3D view), and visibility is nuScenes' figure for the object as a whole,
 * across all six cameras — not a statement about the one photo shown (an object
 * that is 80% visible overall can still be cut off at the edge of this photo).
 */
export function EvidenceStrip({ evidence }: { evidence: BoxEvidence | null }) {
  if (!evidence) {
    return <div className="h-4 text-[11px] leading-4 text-zinc-600">No box selected</div>;
  }
  const { lidarPoints, visibility, seenBy, edited = false } = evidence;
  const inCamera = seenBy.length > 0;
  const weak = lidarPoints !== undefined && isWeakEvidence(lidarPoints);

  return (
    <div className="flex items-center justify-between gap-x-3 h-4 text-[11px] leading-4 text-zinc-400 tabular-nums whitespace-nowrap">
      <span
        className="inline-flex items-center gap-1.5"
        title={`LiDAR points inside this box, as counted by nuScenes on the original sweep (the cloud drawn in the 3D view is thinned)${edited ? '. This box has been edited: the count is of the nuScenes label, not of the edited box.' : ''}`}
      >
        <span className="text-zinc-500">LiDAR</span>
        {lidarPoints === undefined ? (
          <span className="text-zinc-600">—</span>
        ) : (
          <>
            <EvidenceBars points={lidarPoints} />
            <span className={weak ? 'text-amber-300' : 'text-zinc-200'}>
              {lidarPoints} pt{lidarPoints === 1 ? '' : 's'}
              {weak && ' · weak'}
            </span>
            {edited && (
              <span data-part="label-count" className="text-[10px] text-zinc-500">
                in label
              </span>
            )}
          </>
        )}
      </span>
      <span
        className="inline-flex items-center gap-1.5"
        title="nuScenes visibility: how much of the object is visible, over all 6 camera images together — not how much of it this one photo shows"
      >
        <span className="text-zinc-500">Visible</span>
        <span className={visibility ? 'text-zinc-200' : 'text-zinc-600'}>
          {visibility ? VISIBILITY_LABELS[visibility] : '—'}
        </span>
      </span>
      <span
        className={inCamera ? 'text-zinc-200' : 'text-amber-300/90'}
        title={
          inCamera
            ? `This box projects into the photo of ${seenBy.join(' and ')}${seenBy.length > 1 ? ' (best view first)' : ''}`
            : 'No camera sees this box — it cannot be checked against a photo, only in the 3D view'
        }
      >
        {inCamera ? (
          <>
            <span className="text-zinc-500">Seen by </span>
            {seenBy.map(cameraShortName).join(' · ')}
          </>
        ) : (
          'No camera sees it'
        )}
      </span>
    </div>
  );
}

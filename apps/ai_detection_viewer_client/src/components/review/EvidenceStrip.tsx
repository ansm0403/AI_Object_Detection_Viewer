'use client';

import { isWeakEvidence } from '@/lib/review';
import type { BoxAnnotationInfo } from '@/lib/types';
import { EvidenceBars } from './icons';

/** What the data says about the selected box, beyond its geometry. */
export type BoxEvidence = {
  /** LiDAR points the dataset counted inside the box (absent in older files). */
  lidarPoints?: number;
  visibility?: BoxAnnotationInfo['visibility'];
  /** Whether the box has a projection in the camera image shown. */
  inCamera: boolean;
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
 * the 3D view), and visibility is nuScenes' figure across all six cameras — not
 * a statement about the one camera image shown here.
 */
export function EvidenceStrip({ evidence }: { evidence: BoxEvidence | null }) {
  if (!evidence) {
    return <div className="h-4 text-[11px] leading-4 text-zinc-600">No box selected</div>;
  }
  const { lidarPoints, visibility, inCamera } = evidence;
  const weak = lidarPoints !== undefined && isWeakEvidence(lidarPoints);

  return (
    <div className="flex items-center justify-between gap-x-3 h-4 text-[11px] leading-4 text-zinc-400 tabular-nums whitespace-nowrap">
      <span
        className="inline-flex items-center gap-1.5"
        title="LiDAR points inside this box, as counted by nuScenes on the original sweep (the cloud drawn in the 3D view is thinned)"
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
          </>
        )}
      </span>
      <span
        className="inline-flex items-center gap-1.5"
        title="nuScenes visibility: how much of the object is visible across all 6 camera images (not only the camera shown here)"
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
            ? 'This box projects into the camera image shown'
            : 'This box is beside or behind the camera shown — it cannot be checked against the photo'
        }
      >
        {inCamera ? 'In camera' : 'Not in camera'}
      </span>
    </div>
  );
}

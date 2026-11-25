/**
 * How much LiDAR evidence a box has, from the number of LiDAR points the
 * dataset counted inside it.
 *
 * The count is the DATASET's own figure for the original sweep (nuScenes
 * `num_lidar_pts`), not a count over the decimated cloud drawn on screen.
 * A low count does not mean the box is wrong — annotators carry a box through
 * frames where the sensor barely saw the object — it means the box cannot be
 * confirmed from the points, so it deserves a look first.
 */

/** Boxes with this many points or fewer are flagged as weak evidence. */
export const WEAK_EVIDENCE_MAX_POINTS = 4;

/** 0 = no points, 1 = a few (weak), 2 = some, 3 = many. Drives the row icon. */
export type EvidenceLevel = 0 | 1 | 2 | 3;

export function evidenceLevel(lidarPoints: number): EvidenceLevel {
  if (lidarPoints <= 0) return 0;
  if (lidarPoints <= WEAK_EVIDENCE_MAX_POINTS) return 1;
  if (lidarPoints < 20) return 2;
  return 3;
}

export function isWeakEvidence(lidarPoints: number): boolean {
  return lidarPoints <= WEAK_EVIDENCE_MAX_POINTS;
}

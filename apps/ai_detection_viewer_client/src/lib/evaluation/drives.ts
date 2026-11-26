import { combineScores, type SceneScore, type Score } from './scenes';

/**
 * (F7.5) The evaluation per DRIVE.
 *
 * nuScenes cuts several ~20 s scenes out of one drive (one `log`): the same
 * car, day, streets, weather and light. Scenes of one drive are therefore not
 * independent samples of "how the model does" — the drive is. nuScenes-mini's
 * ten scenes are eight drives, and its three night scenes are ONE of them; a
 * table with one row per drive makes that visible where ten scene rows hide it.
 *
 * Pure regrouping of `evaluateScenes`' per-scene scores: nothing is re-scored
 * and no rule changes here.
 */
export type DriveScore = Score & {
  /** nuScenes log name; `null` when the scene's drive is unknown. */
  drive: string | null;
  /** "YYYY-MM-DD" and place of the drive; '' when the catalog does not say. */
  date: string;
  location: string;
  /** True when every scene of the drive is described as a night scene. */
  night: boolean;
  /** The scenes cut from this drive, in the given order. */
  scenes: string[];
};

/**
 * One row per drive, oldest first (rows without a date keep their place at the
 * end, in the given order). A scene whose drive is unknown is its own row — it
 * cannot be shown to share a drive with another.
 */
export function summarizeDrives(scores: readonly SceneScore[]): DriveScore[] {
  const groups = new Map<string, SceneScore[]>();
  for (const score of scores) {
    const key = score.drive === null ? `scene:${score.scene}` : `drive:${score.drive}`;
    const group = groups.get(key);
    if (group) group.push(score);
    else groups.set(key, [score]);
  }

  const rows = [...groups.values()].map((group, index) => {
    const combined = combineScores(group);
    const first = group[0];
    const row: DriveScore = {
      counts: combined.counts,
      precision: combined.precision,
      recall: combined.recall,
      photos: combined.photos,
      frames: combined.frames,
      byDistance: combined.byDistance,
      scoredObjects: combined.scoredObjects,
      drive: first.drive,
      date: first.driveDate,
      location: first.driveLocation,
      night: group.every((score) => score.night),
      scenes: group.map((score) => score.scene),
    };
    return { row, index };
  });

  rows.sort((a, b) => {
    if (a.row.date !== b.row.date) {
      if (a.row.date === '') return 1;
      if (b.row.date === '') return -1;
      return a.row.date < b.row.date ? -1 : 1;
    }
    return a.index - b.index;
  });
  return rows.map(({ row }) => row);
}

import type { Frame } from '@/lib/types';
import type { ImageBox, ImageOverlay, ImageRect } from '@/lib/ui/image-overlay';
import { isResultVisible, type ResultFilter } from './list';
import { findResult, selectionIdOf } from './match';
import { CONTEXT_COLOR, NOT_EVALUATED_COLOR, OUTCOME_COLOR } from './outcomes';
import type { EvalResult, FrameEvaluation, Prediction2D } from './types';

/**
 * What the camera image shows in evaluate mode (F5), as plain rectangles.
 *
 * Two line styles, one colour code:
 *  - a LABEL (the dataset's box, projected from 3D — approximate) is DASHED;
 *  - a MODEL box (a prediction) is SOLID;
 *  - the colour is the outcome: found / missed / false alarm / not scored.
 *
 * So a found object shows as a dashed and a solid rectangle of the same colour
 * on top of each other, a miss as a lone dashed one, a false alarm as a lone
 * solid one. The viewer draws the result without knowing any of this.
 */

const labelKey = (objectId: string) => `label:${objectId}`;
const modelKey = (predictionId: string) => `model:${predictionId}`;

const isDrawable = (b: ImageBox): boolean =>
  [b.x, b.y, b.width, b.height].every(Number.isFinite) && b.width > 0 && b.height > 0;

/** The smallest rectangle containing all of `boxes`, or `null` for none. */
export function unionBox(boxes: readonly ImageBox[]): ImageBox | null {
  if (boxes.length === 0) return null;
  const left = Math.min(...boxes.map((b) => b.x));
  const top = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export type OverlayOptions = {
  /** The app's `selectedObjectId`: a label's object id or a prediction id. */
  selectedId: string | null;
  /** Which results are shown (outcome chips + class chips). */
  filter: ResultFilter;
};

/**
 * Build the overlay for one frame.
 *
 * With nothing selected every visible result is drawn at normal strength.
 * With a result selected, its rectangles are emphasised and captioned, the box
 * that explains it is kept readable (see `companion` below), and everything
 * else is dimmed. `focus` is the area the zoom should show: the selected
 * result's boxes together, so a label and the model box next to it are both in
 * view.
 */
export function buildOverlay(
  frame: Frame,
  predictions: readonly Prediction2D[],
  evaluation: FrameEvaluation,
  { selectedId, filter }: OverlayOptions,
): ImageOverlay {
  const labelBox = new Map(frame.detections2D.map((d) => [d.id, d]));
  const prediction = new Map(predictions.map((p) => [p.id, p]));

  const found = findResult(evaluation, selectedId);
  const selected = found && isResultVisible(found, filter) ? found : undefined;
  // A box of the camera image that is selected but not part of the evaluation
  // (a class the model cannot name): still shown, so the selection is visible.
  const looseLabel =
    !found && selectedId !== null ? (labelBox.get(selectedId) ?? null) : null;
  const looseVisible =
    looseLabel !== null && (filter.classes.size === 0 || filter.classes.has(looseLabel.class));
  const somethingSelected = selected !== undefined || looseVisible;

  const rects = new Map<string, ImageRect>();
  const add = (rect: ImageRect) => {
    if (isDrawable(rect.bbox)) rects.set(rect.key, rect);
  };

  for (const result of evaluation.results) {
    if (!isResultVisible(result, filter)) continue;
    const emphasis = result === selected ? 'selected' : somethingSelected ? 'dim' : 'normal';
    const color = OUTCOME_COLOR[result.kind];
    const selectId = selectionIdOf(result);

    if (result.kind === 'false-alarm') {
      const p = prediction.get(result.predictionId);
      if (p) {
        add({
          key: modelKey(p.id),
          bbox: p.bbox,
          color,
          dashed: false,
          emphasis,
          selectId,
          ...(emphasis === 'selected' ? { caption: modelCaption(p) } : {}),
        });
      }
      continue;
    }

    const label = labelBox.get(result.objectId);
    if (label) {
      add({
        key: labelKey(label.id),
        bbox: label.bbox,
        color,
        dashed: true,
        emphasis,
        selectId,
        ...(emphasis === 'selected' ? { caption: `label · ${label.class}` } : {}),
      });
    }
    // Model boxes that belong to this label: the one that found it, or the
    // ones that landed on a label that is not scored.
    const ownPredictions =
      result.kind === 'found'
        ? [result.predictionId]
        : result.kind === 'not-scored'
          ? result.predictionIds
          : [];
    for (const id of ownPredictions) {
      const p = prediction.get(id);
      if (!p) continue;
      add({
        key: modelKey(p.id),
        bbox: p.bbox,
        color,
        dashed: false,
        emphasis,
        selectId,
        ...(emphasis === 'selected' ? { caption: modelCaption(p) } : {}),
      });
    }
  }

  if (looseVisible && looseLabel) {
    add({
      key: labelKey(looseLabel.id),
      bbox: looseLabel.bbox,
      color: NOT_EVALUATED_COLOR,
      dashed: true,
      emphasis: 'selected',
      selectId: looseLabel.id,
      caption: `label · ${looseLabel.class} · not evaluated`,
    });
  }

  // The COMPANION of the selected result — the box its explanation refers to:
  // for a miss, the model box that overlaps the label most (it may be of
  // another class, or below the minimum score and therefore not drawn at all);
  // for a false alarm, the label under it. It is lifted out of the dimmed
  // background, or added if it is not drawn yet.
  const focusKeys: string[] = [];
  if (selected) {
    for (const rect of rects.values()) if (rect.emphasis === 'selected') focusKeys.push(rect.key);
    const companion = companionOf(selected, labelBox, prediction, evaluation, filter);
    if (companion) {
      const existing = rects.get(companion.key);
      if (existing) {
        rects.set(companion.key, { ...existing, emphasis: 'normal', caption: companion.caption });
      } else {
        add(companion);
      }
      if (rects.has(companion.key)) focusKeys.push(companion.key);
    }
  } else if (looseVisible && looseLabel) {
    focusKeys.push(labelKey(looseLabel.id));
  }

  const focus = unionBox(
    focusKeys.map((key) => rects.get(key)?.bbox).filter((b): b is ImageBox => b !== undefined),
  );

  // Largest first, so a small box inside a big one is painted — and clicked —
  // on top. (Sorting is stable: equal areas keep their insertion order.)
  const ordered = [...rects.values()].sort(
    (a, b) => b.bbox.width * b.bbox.height - a.bbox.width * a.bbox.height,
  );
  return { rects: ordered, focus };
}

const modelCaption = (p: Prediction2D): string => `model · ${p.class} ${p.score.toFixed(2)}`;

function companionOf(
  selected: EvalResult,
  labelBox: ReadonlyMap<string, { id: string; class: string; bbox: ImageBox }>,
  prediction: ReadonlyMap<string, Prediction2D>,
  evaluation: FrameEvaluation,
  filter: ResultFilter,
): ImageRect | null {
  if (selected.kind === 'missed' && selected.nearest) {
    const p = prediction.get(selected.nearest.predictionId);
    if (!p) return null;
    // Clickable only if the model box is itself a visible result (e.g. a false
    // alarm); a box below the minimum score is context and selects nothing.
    const own = findResult(evaluation, p.id);
    return {
      key: modelKey(p.id),
      bbox: p.bbox,
      color: CONTEXT_COLOR,
      dashed: false,
      emphasis: 'normal',
      caption: modelCaption(p),
      ...(own && isResultVisible(own, filter) ? { selectId: selectionIdOf(own) } : {}),
    };
  }
  if (selected.kind === 'false-alarm' && selected.nearest) {
    const label = labelBox.get(selected.nearest.objectId);
    if (!label) return null;
    return {
      key: labelKey(label.id),
      bbox: label.bbox,
      color: CONTEXT_COLOR,
      dashed: true,
      emphasis: 'normal',
      caption: `label · ${label.class}`,
      // A label is a real 3D box: selecting it is always meaningful.
      selectId: label.id,
    };
  }
  return null;
}

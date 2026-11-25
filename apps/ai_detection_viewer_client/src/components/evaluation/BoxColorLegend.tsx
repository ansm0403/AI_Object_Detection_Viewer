import { NOT_EVALUATED_COLOR, OUTCOME_COLOR } from '@/lib/evaluation';

const ITEMS: { label: string; color: string }[] = [
  { label: 'found', color: OUTCOME_COLOR.found },
  { label: 'missed', color: OUTCOME_COLOR.missed },
  // Grey covers both "not scored" and "outside the camera": neither says
  // anything about the model.
  { label: 'not evaluated', color: NOT_EVALUATED_COLOR },
];

/**
 * Legend of the 3D view in evaluate mode (F5): what the box colours mean
 * (`boxOutcomeColors`). There is no entry for false alarms on purpose — a model
 * box is 2D only and is not drawn in the 3D view.
 */
export function BoxColorLegend() {
  return (
    <>
      {ITEMS.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1">
          <span
            className="w-2.5 h-2.5 rounded-[2px] border"
            style={{ borderColor: item.color }}
          />
          {item.label}
        </span>
      ))}
    </>
  );
}

const CLASS_COLORS: Record<string, string> = {
  // COCO palette (person / bicycle / car).
  person: '#86efac',
  bicycle: '#fde047',
  car: '#fca5a5',
  // nuScenes driving classes mapped in lib/nuscenes/parser CATEGORY_MAP. Hues
  // chosen distinct from the three above and from each other; unmapped nuScenes
  // categories still fall back to DEFAULT_COLOR.
  truck: '#fdba74', // orange
  bus: '#c4b5fd', // violet
  motorcycle: '#f9a8d4', // pink
};

export const DEFAULT_COLOR = '#38bdf8';
export const SELECTED_COLOR = '#ffffff';

export function getClassColor(className: string): string {
  return CLASS_COLORS[className] ?? DEFAULT_COLOR;
}

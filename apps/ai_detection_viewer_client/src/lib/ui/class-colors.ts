const CLASS_COLORS: Record<string, string> = {
  person: '#4ade80',
  bicycle: '#facc15',
  car: '#f87171',
};

export const DEFAULT_COLOR = '#60a5fa';
export const SELECTED_COLOR = '#ffffff';

export function getClassColor(className: string): string {
  return CLASS_COLORS[className] ?? DEFAULT_COLOR;
}

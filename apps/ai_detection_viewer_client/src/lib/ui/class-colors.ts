const CLASS_COLORS: Record<string, string> = {
  person: '#86efac',
  bicycle: '#fde047',
  car: '#fca5a5',
};

export const DEFAULT_COLOR = '#38bdf8';
export const SELECTED_COLOR = '#ffffff';

export function getClassColor(className: string): string {
  return CLASS_COLORS[className] ?? DEFAULT_COLOR;
}

/**
 * Short display name of a class, for places too narrow for the full name.
 *
 * Most classes are mapped to short names when the data is parsed ("car",
 * "person"). The ones that are not keep the dataset's own name, which carries a
 * namespace: nuScenes' "static_object.bicycle_rack". In the filter bar that one
 * chip was 166 px wide and pushed the last chip out of view at 1024 px.
 *
 * Only the text shown changes — the class itself (filtering, colours, the
 * evaluation's rack rule) is still the full name, and the full name stays
 * available as a tooltip wherever this is used.
 *
 * "static_object.bicycle_rack" → "bicycle_rack"; a name without a dot, or one
 * that ends in a dot, is returned unchanged.
 */
export function classLabel(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 && dot < name.length - 1 ? name.slice(dot + 1) : name;
}

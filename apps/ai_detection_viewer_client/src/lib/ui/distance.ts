// Shared distance-filter constants (UI layer — no React/Zustand/Three.js).
//
// The distance filter only applies to measured (nuScenes) frames, where
// `|bbox3D.center|` is a real distance in metres from the ego vehicle. The
// sample scene's farthest box is ~80.8 m, so a 90 m ceiling keeps every box
// visible at the slider's max (the filter is "off" there) while giving a
// useful sweep down through the ~10–40 m band where most boxes sit.
export const DISTANCE_MAX = 90; // metres; slider max == "show all"
export const DISTANCE_STEP = 5; // metres per slider tick

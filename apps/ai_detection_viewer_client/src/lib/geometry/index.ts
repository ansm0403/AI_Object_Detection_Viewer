export { estimateDetection3D, estimateDetections3D } from './bbox-estimator';
export { generatePointCloud, makeRng, type Rng } from './pointcloud-generator';
export { enrichFrame } from './frame-enricher';
export { depthToColor, depthRange } from './depth-color';
export {
  quatNuToThree,
  globalToEgo,
  globalQuatToEgo,
  egoToThree,
  egoQuatToThree,
  nuSizeToLocal,
  type Vec3,
  type QuatXYZW,
  type QuatWXYZ,
  type Pose,
} from './transforms';
export {
  egoToCamera,
  cameraToPixel,
  boxCornersEgo,
  projectCornersToBbox,
  type Intrinsic,
  type PixelProjection,
} from './projection';
// (Vec3 is already exported from ./transforms — re-export only the function +
// its result type to avoid a duplicate Vec3 export.)
export { frameBoxesForCamera, type CameraFraming } from './camera-framing';

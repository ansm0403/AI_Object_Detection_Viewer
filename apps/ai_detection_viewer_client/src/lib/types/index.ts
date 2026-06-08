export type Frame = {
  id: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  detections2D: Detection2D[];
  detections3D: Detection3D[];
  pointCloud: Point3D[];
  // (F2) Provenance of the 3D data, driving the UI "Estimated" vs "Measured"
  // badge so depth source is never misrepresented (Immutable Rule #6 honored
  // across datasets, not dropped). COCO frames = 'coco-estimated'; nuScenes
  // frames = 'nuscenes-measured'. Optional: absent on existing COCO frames.
  source?: 'coco-estimated' | 'nuscenes-measured';
};

export type Detection2D = {
  id: string;
  class: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
};

export type Detection3D = {
  id: string;
  class: string;
  confidence: number;
  bbox3D: {
    center: [number, number, number];
    size: [number, number, number];
    // (F2) Orientation as a quaternion [x, y, z, w] (Three.js order). Absent =
    // no rotation (identity), so COCO estimated boxes and existing F1 tests stay
    // valid. nuScenes boxes carry a real measured orientation here.
    rotation?: [number, number, number, number];
  };
};

export type Point3D = {
  x: number;
  y: number;
  z: number;
  // Source detection id — required so the 3D viewer can filter the point cloud
  // by the same visibility rules as the bboxes (Edge_#4 Case 5). Always set
  // by `generatePointCloud` from the owning detection's id.
  detectionId: string;
  intensity?: number;
};

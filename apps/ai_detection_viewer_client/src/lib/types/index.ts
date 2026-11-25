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
  // (F4) Facts the dataset records about this box's ANNOTATION — what a
  // reviewer needs besides the geometry. Present on nuScenes boxes only (COCO
  // has no such record, Rule #7), and each field is optional because sample
  // files prepped before F4 do not carry them.
  annotation?: BoxAnnotationInfo;
};

export type BoxAnnotationInfo = {
  // Unique id of this box in this frame (nuScenes `sample_annotation.token`).
  // `Detection3D.id` is the OBJECT id and repeats across frames.
  token?: string;
  // LiDAR points the dataset counted inside the box on the original sweep.
  // 0 = no sensor evidence in this frame.
  lidarPoints?: number;
  // How much of the object is visible, as nuScenes' four bins.
  visibility?: 'v0-40' | 'v40-60' | 'v60-80' | 'v80-100';
};

export type Point3D = {
  x: number;
  y: number;
  z: number;
  // Source detection id. For COCO's estimated point cloud this is always set by
  // `generatePointCloud` (the point belongs to one estimated bbox), so the 3D
  // viewer can filter points by the same visibility rules as the bboxes
  // (Edge_#4 Case 5). For F2-B's real LiDAR points it is ABSENT — a measured
  // point is part of the environment, not any single detection — and such points
  // are always shown, independent of the box filters (see `selectVisiblePoints`).
  detectionId?: string;
  intensity?: number;
};

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
  // (F6) Every camera that photographed this frame, default camera first.
  // nuScenes only (six cameras; one for sample files prepped before F6); absent
  // on COCO frames, which have exactly one image and keep working unchanged.
  //
  // INVARIANT: when present, `cameras[0]` IS the view in the top-level fields —
  // `imageUrl` / `imageWidth` / `imageHeight` / `detections2D` above are the
  // default camera's (the same array, not a copy). So on a nuScenes frame
  // `frame.detections2D` means "the boxes in the DEFAULT camera", never "the
  // boxes in any camera": use `lib/cameras` (`camerasSeeing`, `frameAsCamera`)
  // for anything that is about another camera or about all of them.
  cameras?: CameraView[];
  // (F7) The frame's point cloud lives in its own file and is fetched when the
  // frame is opened (points are ~85% of the data, so they are not shipped with
  // the boxes). When this is set, `pointCloud` above is EMPTY until the caller
  // has loaded the file — "no points yet", not "this frame has no points".
  // Absent on COCO frames and on single-file nuScenes data (points inline).
  pointCloudSource?: PointCloudSource;
  // (F7) A small preview of the frame (its default camera's photo), for the
  // timeline and result lists. Absent → there is no preview.
  thumbnailUrl?: string;
};

// (F7) Where a frame's point cloud is fetched from.
export type PointCloudSource = {
  url: string;
  // How many points the file holds, when the data says so (for display before
  // the file has arrived).
  count?: number;
};

// (F6) One camera's photo of a frame, with the frame's 3D boxes projected into
// THAT photo. A box seen by two cameras has a `Detection2D` in both views, and
// both carry the object's one id (Immutable Rule #1: same object ⇒ same id).
export type CameraView = {
  // Camera channel as the dataset names it, e.g. "CAM_FRONT_LEFT".
  name: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  detections2D: Detection2D[];
};

export type Detection2D = {
  id: string;
  class: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
  // (F4) Pixel positions of the 3D box's eight corners in this image, in the
  // corner order of `boxCornersEgo` (corners 4-7 = the front face). Present only
  // when the 2D box is the PROJECTION of a 3D box (nuScenes); `bbox` is then the
  // rectangle around these points. Lets the camera view draw the projected 3D
  // box itself. Not clamped to the image.
  corners?: [number, number][];
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

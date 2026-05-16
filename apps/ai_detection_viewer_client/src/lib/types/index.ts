export type Frame = {
  id: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  detections2D: Detection2D[];
  detections3D: Detection3D[];
  pointCloud: Point3D[];
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
  bbox3D: { center: [number, number, number]; size: [number, number, number] };
};

export type Point3D = {
  x: number;
  y: number;
  z: number;
  intensity?: number;
};

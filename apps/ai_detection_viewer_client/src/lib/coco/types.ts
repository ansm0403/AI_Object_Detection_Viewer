export type CocoDataset = {
  images: CocoImage[];
  annotations: CocoAnnotation[];
  categories: CocoCategory[];
};

export type CocoImage = {
  id: number;
  file_name: string;
  width: number;
  height: number;
};

export type CocoAnnotation = {
  id: number;
  image_id: number;
  category_id: number;
  bbox: [number, number, number, number];
  score?: number;
};

export type CocoCategory = {
  id: number;
  name: string;
  supercategory?: string;
};

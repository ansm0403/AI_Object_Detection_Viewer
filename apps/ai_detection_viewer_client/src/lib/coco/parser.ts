import type { Detection2D, Frame } from '@/lib/types';
import type {
  CocoAnnotation,
  CocoCategory,
  CocoDataset,
  CocoImage,
} from './types';

export function parseCoco(raw: unknown): Frame[] {
  if (!isCocoDataset(raw)) {
    console.warn(
      '[parseCoco] Invalid COCO root. Expected { images, annotations, categories } arrays.',
    );
    return [];
  }

  const categoryMap = buildCategoryMap(raw.categories);
  const annotationsByImage = groupAnnotationsByImage(raw.annotations);

  const frames: Frame[] = [];
  const seenImageIds = new Set<number>();

  for (const image of raw.images) {
    if (seenImageIds.has(image.id)) {
      console.warn(
        `[parseCoco] Duplicate image id ${image.id}. Skipping.`,
      );
      continue;
    }
    seenImageIds.add(image.id);
    frames.push(buildFrame(image, annotationsByImage, categoryMap));
  }

  return frames;
}

function isCocoDataset(raw: unknown): raw is CocoDataset {
  if (raw === null || typeof raw !== 'object') return false;
  const obj = raw as Record<string, unknown>;
  return (
    Array.isArray(obj.images) &&
    Array.isArray(obj.annotations) &&
    Array.isArray(obj.categories)
  );
}

function buildCategoryMap(categories: CocoCategory[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const cat of categories) {
    map.set(cat.id, cat.name);
  }
  return map;
}

function groupAnnotationsByImage(
  annotations: CocoAnnotation[],
): Map<number, CocoAnnotation[]> {
  const map = new Map<number, CocoAnnotation[]>();
  for (const ann of annotations) {
    const list = map.get(ann.image_id) ?? [];
    list.push(ann);
    map.set(ann.image_id, list);
  }
  return map;
}

function buildFrame(
  image: CocoImage,
  annotationsByImage: Map<number, CocoAnnotation[]>,
  categoryMap: Map<number, string>,
): Frame {
  const annotations = annotationsByImage.get(image.id) ?? [];
  const detections2D: Detection2D[] = [];
  const seenIds = new Set<string>();

  for (const ann of annotations) {
    const detection = toDetection2D(ann, image.id, categoryMap);
    if (!detection) continue;

    if (seenIds.has(detection.id)) {
      console.warn(
        `[parseCoco] Duplicate detection id "${detection.id}" in frame ${image.id}. Skipping.`,
      );
      continue;
    }
    seenIds.add(detection.id);
    detections2D.push(detection);
  }

  return {
    id: String(image.id),
    imageUrl: `/sample-data/${image.file_name}`,
    imageWidth: image.width,
    imageHeight: image.height,
    detections2D,
    detections3D: [],
    pointCloud: [],
  };
}

function toDetection2D(
  ann: CocoAnnotation,
  imageId: number,
  categoryMap: Map<number, string>,
): Detection2D | null {
  const className = categoryMap.get(ann.category_id);
  if (!className) {
    console.warn(
      `[parseCoco] Annotation ${ann.id} has unknown category_id ${ann.category_id}. Skipping.`,
    );
    return null;
  }
  if (
    !Array.isArray(ann.bbox) ||
    ann.bbox.length !== 4 ||
    !ann.bbox.every((n) => Number.isFinite(n))
  ) {
    console.warn(
      `[parseCoco] Annotation ${ann.id} has invalid bbox. Skipping.`,
    );
    return null;
  }

  const [x, y, width, height] = ann.bbox;
  const confidence = Number.isFinite(ann.score) ? (ann.score as number) : 1.0;

  return {
    id: `${imageId}-${ann.id}`,
    class: className,
    confidence,
    bbox: { x, y, width, height },
  };
}

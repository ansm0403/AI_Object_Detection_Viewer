"""
Step 11 — YOLOv8n 추론으로 sample.json 교체
person / bicycle / car 3개 클래스만 유지 (기존 카테고리 배열과 동일)
"""

import json
import os
from pathlib import Path

from ultralytics import YOLO

REPO_ROOT = Path(__file__).parent.parent
DATA_DIR = REPO_ROOT / "apps" / "ai_detection_viewer_client" / "public" / "sample-data"
OUTPUT_PATH = DATA_DIR / "sample.json"
BACKUP_PATH = DATA_DIR / "sample.gt_backup.json"

# YOLOv8 COCO 80-class index → 기존 sample.json category_id
YOLO_TO_COCO = {
    0: 1,  # person  → person(1)
    1: 2,  # bicycle → bicycle(2)
    2: 3,  # car     → car(3)
}

CATEGORIES = [
    {"id": 1, "name": "person",  "supercategory": "person"},
    {"id": 2, "name": "bicycle", "supercategory": "vehicle"},
    {"id": 3, "name": "car",     "supercategory": "vehicle"},
]

# 신뢰도 임계값: 이 값 이상인 detection만 포함 (너무 낮으면 노이즈 과다)
CONFIDENCE_THRESHOLD = 0.25


def main():
    # 1. 기존 sample.json에서 images 배열 읽기
    with open(OUTPUT_PATH, "r") as f:
        original = json.load(f)
    images = original["images"]  # id, file_name, width, height 유지

    # 2. 원본 백업 (아직 없을 때만)
    if not BACKUP_PATH.exists():
        with open(BACKUP_PATH, "w") as f:
            json.dump(original, f)
        print(f"[backup] {BACKUP_PATH}")

    # 3. YOLOv8n 모델 로드 (첫 실행 시 ~6MB 자동 다운로드)
    model = YOLO("yolov8n.pt")

    annotations = []
    ann_id = 1

    for img_meta in images:
        img_path = DATA_DIR / img_meta["file_name"]
        if not img_path.exists():
            print(f"[skip] {img_path} not found")
            continue

        results = model.predict(
            str(img_path),
            conf=CONFIDENCE_THRESHOLD,
            verbose=False,
        )
        result = results[0]
        boxes = result.boxes

        count = 0
        for i in range(len(boxes)):
            yolo_cls = int(boxes.cls[i].item())
            if yolo_cls not in YOLO_TO_COCO:
                continue  # person/bicycle/car 외 클래스 제외

            x1, y1, x2, y2 = boxes.xyxy[i].tolist()
            w = x2 - x1
            h = y2 - y1
            conf = float(boxes.conf[i].item())

            annotations.append({
                "id": ann_id,
                "image_id": img_meta["id"],
                "category_id": YOLO_TO_COCO[yolo_cls],
                "bbox": [round(x1, 2), round(y1, 2), round(w, 2), round(h, 2)],
                "area": round(w * h, 2),
                "iscrowd": 0,
                "score": round(conf, 4),
            })
            ann_id += 1
            count += 1

        print(f"  {img_meta['file_name']}: {count} detections")

    # 4. 새 sample.json 작성
    output = {
        "images": images,
        "categories": CATEGORIES,
        "annotations": annotations,
    }
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\n[done] {len(annotations)} total annotations → {OUTPUT_PATH}")
    score_values = [a["score"] for a in annotations]
    if score_values:
        print(f"[score range] min={min(score_values):.3f}  max={max(score_values):.3f}  "
              f"mean={sum(score_values)/len(score_values):.3f}")


if __name__ == "__main__":
    main()

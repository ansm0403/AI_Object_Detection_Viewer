"""
F5 / F6 — nuScenes 카메라 사진에 2D 탐지 모델(YOLO)을 돌려 예측 파일을 만든다.
(F6: 프레임마다 카메라 6대의 사진을 모두 돌린다 — 사진 60장.)

Step 11의 generate_predictions.py, F2의 prep_nuscenes.py와 같은 "오프라인 1회 도구"다.
배포되는 웹앱의 일부가 아니다(런타임 백엔드 없음 — 정적 배포 유지).

입력: public/sample-data/nuscenes/nuscenes.json 에 적힌 프레임과 카메라별 사진
      (앱이 실제로 보여주는 프레임·카메라 목록을 그대로 따라가므로 둘이 어긋날 수 없다)
출력: public/sample-data/nuscenes/predictions.json

⚠️ 이 스크립트는 모델의 출력을 그대로 적기만 한다(Immutable Rule #3).
   - 클래스를 걸러내지 않는다(신호등, 가방 등도 그대로 적는다).
   - 정답과 비교하지 않는다. IoU, 짝짓기, Precision/Recall 계산은 전부
     apps/.../src/lib/evaluation 이 브라우저에서 하고 Vitest로 검증한다.
   - 점수가 MIN_SCORE 미만인 예측만 버린다(모델이 내는 수천 개의 0에 가까운 후보를
     파일에 싣지 않기 위한 하한). 화면의 "Min score" 슬라이더가 이 값 위에서 움직인다.

출력 형식은 apps/.../src/lib/evaluation/types.ts 의 RawPredictionFile 과 1:1 대응한다.
  - bbox는 [x, y, width, height] (사진 픽셀, 왼쪽 위 기준), 소수 1자리
  - score는 소수 4자리
  - 파일에 실행 시각을 적지 않는다: 다시 돌려도 같은 파일이 나와야 git diff로
    "모델 출력이 바뀌었는지"를 확인할 수 있다.

실행 (저장소 루트에서):
  python scripts/predict_nuscenes.py
"""

import argparse
import json
from pathlib import Path

import ultralytics
from ultralytics import YOLO

REPO_ROOT = Path(__file__).parent.parent
PUBLIC_DIR = REPO_ROOT / "apps" / "ai_detection_viewer_client" / "public"
NUSCENES_DIR = PUBLIC_DIR / "sample-data" / "nuscenes"
PREPPED_PATH = NUSCENES_DIR / "nuscenes.json"
OUTPUT_PATH = NUSCENES_DIR / "predictions.json"

# 우리가 정의한 예측 파일 형식의 이름과 버전. 형식이 바뀌면 숫자를 올린다.
#   @1 (F5): 파일 전체에 camera 하나, 프레임마다 predictions 목록 하나.
#   @2 (F6): 프레임마다 cameras: { "CAM_FRONT": [예측...], ... }. 사진 한 장이 채점 단위다.
#            앱의 파서(lib/evaluation/parse.ts)는 @1 파일도 계속 읽는다.
PREDICTIONS_FORMAT = "ai-detection-viewer/predictions@2"

# cameras 목록이 없는 옛 nuscenes.json(형식 1.0, 1.1)의 유일한 카메라.
# 그 파일들은 prep_nuscenes.py 가 CAM_FRONT 만 내보내던 때의 것이다.
LEGACY_CAMERA = "CAM_FRONT"

DEFAULT_WEIGHTS = "yolov8n.pt"  # 저장소 루트에 있는 파일 (가장 작은 YOLOv8)
# 입력 크기. YOLO 기본값 640으로는 1600x900 사진의 먼 사람이 몇 픽셀로 줄어든다.
# 2026-11-25 실측: 640 → Recall 43%, 1280 → Recall 52% (docs/plan-feature/F5 2.3절).
DEFAULT_IMAGE_SIZE = 1280
# 파일에 싣는 점수 하한. 화면 슬라이더의 기본값(0.25)보다 낮게 두어야 슬라이더를
# 내렸을 때 "헛짚음이 늘고 놓침이 주는" 모습을 볼 수 있다.
DEFAULT_MIN_SCORE = 0.05
# 겹친 후보를 하나로 줄이는 단계(NMS)의 기준. ultralytics 기본값을 명시해 기록한다.
NMS_IOU = 0.7

BBOX_DECIMALS = 1
SCORE_DECIMALS = 4


def predict_frame(model: YOLO, image_path: Path, image_size: int, min_score: float) -> list:
    """사진 한 장의 예측을 점수 높은 순으로 돌려준다."""
    result = model.predict(
        str(image_path),
        conf=min_score,
        imgsz=image_size,
        iou=NMS_IOU,
        device="cpu",  # 어느 컴퓨터에서 돌려도 같은 경로를 타도록 고정
        verbose=False,
        save=False,
    )[0]
    names = result.names
    predictions = []
    for i in range(len(result.boxes)):
        x0, y0, x1, y1 = result.boxes.xyxy[i].tolist()
        predictions.append(
            {
                "class": names[int(result.boxes.cls[i].item())],
                "score": round(float(result.boxes.conf[i].item()), SCORE_DECIMALS),
                "bbox": [
                    round(x0, BBOX_DECIMALS),
                    round(y0, BBOX_DECIMALS),
                    round(x1 - x0, BBOX_DECIMALS),
                    round(y1 - y0, BBOX_DECIMALS),
                ],
            }
        )
    # 모델이 이미 점수순으로 주지만, 파일의 순서가 곧 예측의 번호(id)가 되므로 명시한다.
    predictions.sort(key=lambda p: -p["score"])
    return predictions


def frame_cameras(frame: dict) -> list[tuple[str, str]]:
    """프레임의 (카메라 이름, 사진의 public 경로) 목록. nuscenes.json 에 적힌 순서 그대로.

    cameras 가 없는 옛 형식(1.0, 1.1)은 최상위 image 하나가 유일한 카메라다.
    """
    cameras = frame.get("cameras")
    if not cameras:
        return [(LEGACY_CAMERA, frame["image"]["path"])]
    return [(camera["channel"], camera["image"]["path"]) for camera in cameras]


def dump(document: dict) -> str:
    """예측 하나를 한 줄에 쓴다: 파일은 작게, git diff는 예측 단위로 읽히게."""
    lines = ["{"]
    lines.append(f'  "format": {json.dumps(document["format"])},')
    lines.append(f'  "cameras": {json.dumps(document["cameras"])},')
    lines.append(f'  "model": {json.dumps(document["model"])},')
    lines.append('  "frames": [')
    frames = document["frames"]
    for fi, frame in enumerate(frames):
        lines.append(f'    {{"token": {json.dumps(frame["token"])}, "cameras": {{')
        cameras = list(frame["cameras"].items())
        for ci, (channel, preds) in enumerate(cameras):
            lines.append(f'      {json.dumps(channel)}: [')
            for pi, pred in enumerate(preds):
                comma = "," if pi < len(preds) - 1 else ""
                lines.append(f"        {json.dumps(pred, separators=(',', ':'))}{comma}")
            lines.append("      ]" + ("," if ci < len(cameras) - 1 else ""))
        lines.append("    }}" + ("," if fi < len(frames) - 1 else ""))
    lines.append("  ]")
    lines.append("}")
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description="nuScenes camera images → YOLO predictions JSON")
    parser.add_argument("--weights", default=DEFAULT_WEIGHTS, help="모델 파일 (저장소 루트 기준)")
    parser.add_argument("--image-size", type=int, default=DEFAULT_IMAGE_SIZE, help="모델 입력 크기")
    parser.add_argument("--min-score", type=float, default=DEFAULT_MIN_SCORE, help="파일에 싣는 점수 하한")
    parser.add_argument("--output", default=str(OUTPUT_PATH), help="출력 파일 경로")
    args = parser.parse_args()

    weights_path = REPO_ROOT / args.weights
    if not weights_path.is_file():
        # 파일이 없으면 ultralytics가 말없이 내려받는다. 어떤 모델을 썼는지가
        # 흐려지므로 여기서 멈춘다.
        raise SystemExit(f"모델 파일을 찾을 수 없음: {weights_path}")
    if not PREPPED_PATH.is_file():
        raise SystemExit(f"prepped 파일을 찾을 수 없음: {PREPPED_PATH} (prep_nuscenes.py를 먼저 실행)")

    with open(PREPPED_PATH, encoding="utf-8") as f:
        prepped = json.load(f)

    model = YOLO(str(weights_path))

    frames = []
    total = 0
    photos = 0
    channels: list[str] = []  # 파일에 나온 카메라 이름, 처음 나온 순서대로
    for frame in prepped["frames"]:
        by_camera = {}
        for channel, public_path in frame_cameras(frame):
            # image.path 는 브라우저가 보는 경로("/sample-data/...")다 → public/ 아래 실제 파일.
            image_path = PUBLIC_DIR / public_path.lstrip("/")
            if not image_path.is_file():
                raise SystemExit(f"사진을 찾을 수 없음: {image_path}")
            predictions = predict_frame(model, image_path, args.image_size, args.min_score)
            by_camera[channel] = predictions
            if channel not in channels:
                channels.append(channel)
            total += len(predictions)
            photos += 1
            print(f"  {image_path.parent.name}/{image_path.name}: {len(predictions)} predictions")
        frames.append({"token": frame["token"], "cameras": by_camera})

    document = {
        "format": PREDICTIONS_FORMAT,
        "cameras": channels,
        "model": {
            "name": weights_path.stem,
            "weights": weights_path.name,
            "library": f"ultralytics {ultralytics.__version__}",
            "imageSize": args.image_size,
            "minScore": args.min_score,
            "nmsIou": NMS_IOU,
        },
        "frames": frames,
    }
    output_path = Path(args.output)
    output_path.write_text(dump(document), encoding="utf-8", newline="\n")
    print(f"\n[done] frames={len(frames)} photos={photos} predictions={total} → {output_path}")


if __name__ == "__main__":
    main()

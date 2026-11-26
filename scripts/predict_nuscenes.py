"""
F5 / F6 / F7 — nuScenes 카메라 사진에 2D 탐지 모델(YOLO)을 돌려 예측 파일을 만든다.
(F6: 프레임마다 카메라 6대의 사진을 모두 돌린다. F7: 장면마다 파일 하나.)

Step 11의 generate_predictions.py, F2의 prep_nuscenes.py와 같은 "오프라인 1회 도구"다.
배포되는 웹앱의 일부가 아니다(런타임 백엔드 없음 — 정적 배포 유지).

입력: prep_nuscenes.py 가 만든 목차 scenes.json 과 장면별 frames.json
      (앱이 실제로 보여주는 프레임·카메라 목록을 그대로 따라가므로 둘이 어긋날 수 없다)
      + nuScenes 원본 폴더의 사진
출력: 장면마다 <data>/scenes/<장면>/predictions.json

⚠️ 모델은 **원본 사진(1600x900 JPEG)**을 본다. 앱이 화면에 보여 주는 사진은 용량을 줄인
   사본(960x540 WebP)이고, 그것으로 돌리면 결과가 달라진다. frames.json 의 image.source 가
   원본의 위치(nuScenes dataroot 기준 상대 경로)다. 박스 좌표는 원본 픽셀 기준이며, 정답
   박스(3D 박스를 투영한 것)도 같은 기준이다.

⚠️ 이 스크립트는 모델의 출력을 그대로 적기만 한다(Immutable Rule #3).
   - 클래스를 걸러내지 않는다(신호등, 가방 등도 그대로 적는다).
   - 정답과 비교하지 않는다. IoU, 짝짓기, Precision/Recall 계산은 전부
     apps/.../src/lib/evaluation 이 브라우저에서 하고 Vitest로 검증한다.
   - 점수가 MIN_SCORE 미만인 예측만 버린다(모델이 내는 수천 개의 0에 가까운 후보를
     파일에 싣지 않기 위한 하한). 화면의 "Min score" 슬라이더가 이 값 위에서 움직인다.

출력 형식은 apps/.../src/lib/evaluation/types.ts 의 RawPredictionFile 과 1:1 대응한다.
  - bbox는 [x, y, width, height] (원본 사진 픽셀, 왼쪽 위 기준), 소수 1자리
  - score는 소수 4자리
  - 파일에 실행 시각을 적지 않는다: 다시 돌려도 같은 파일이 나와야 git diff로
    "모델 출력이 바뀌었는지"를 확인할 수 있다.

실행 (저장소 루트에서):
  python scripts/predict_nuscenes.py                      # 장면 전부 (사진 2,424장, CPU로 약 5분)
  python scripts/predict_nuscenes.py --scenes scene-0916  # 장면 하나만
"""

import argparse
import json
from pathlib import Path

import ultralytics
from ultralytics import YOLO

REPO_ROOT = Path(__file__).parent.parent
PUBLIC_DIR = REPO_ROOT / "apps" / "ai_detection_viewer_client" / "public"
NUSCENES_DIR = PUBLIC_DIR / "sample-data" / "nuscenes"
# 브라우저가 보는 경로의 접두사. scenes.json 의 framesPath 등이 이것으로 시작한다.
PUBLIC_PATH_ROOT = "/sample-data/nuscenes"
DEFAULT_DATAROOT = r"C:\data\sets\nuscenes"

# 우리가 정의한 예측 파일 형식의 이름과 버전. 형식이 바뀌면 숫자를 올린다.
#   @1 (F5): 파일 전체에 camera 하나, 프레임마다 predictions 목록 하나.
#   @2 (F6): 프레임마다 cameras: { "CAM_FRONT": [예측...], ... }. 사진 한 장이 채점 단위다.
#            앱의 파서(lib/evaluation/parse.ts)는 @1 파일도 계속 읽는다.
# F7은 형식을 바꾸지 않는다. 파일이 장면마다 하나가 되고, model 에 어떤 사진을 봤는지
# (photos) 가 추가될 뿐이다(파서는 모르는 필드를 무시한다).
PREDICTIONS_FORMAT = "ai-detection-viewer/predictions@2"

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


def frame_cameras(frame: dict) -> list[tuple[str, dict]]:
    """프레임의 (카메라 이름, image 레코드) 목록. frames.json 에 적힌 순서 그대로."""
    return [(camera["channel"], camera["image"]) for camera in frame["cameras"]]


def public_to_file(data_dir: Path, public_path: str) -> Path:
    """브라우저 경로("/sample-data/nuscenes/scenes/…") → data_dir 아래의 실제 파일."""
    if not public_path.startswith(PUBLIC_PATH_ROOT + "/"):
        raise SystemExit(f"예상하지 못한 경로: {public_path}")
    return data_dir / public_path[len(PUBLIC_PATH_ROOT) + 1:]


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
    parser = argparse.ArgumentParser(description="nuScenes camera images → YOLO predictions JSON (per scene)")
    parser.add_argument("--weights", default=DEFAULT_WEIGHTS, help="모델 파일 (저장소 루트 기준)")
    parser.add_argument("--image-size", type=int, default=DEFAULT_IMAGE_SIZE, help="모델 입력 크기")
    parser.add_argument("--min-score", type=float, default=DEFAULT_MIN_SCORE, help="파일에 싣는 점수 하한")
    parser.add_argument("--dataroot", default=DEFAULT_DATAROOT, help="nuScenes dataroot 경로 (원본 사진)")
    parser.add_argument(
        "--data", default=str(NUSCENES_DIR),
        help="prep_nuscenes.py 의 출력 폴더 (scenes.json 이 있는 곳). 예측 파일도 여기에 쓴다",
    )
    parser.add_argument(
        "--scenes", default="all",
        help="돌릴 장면. 'all' 또는 쉼표로 나눈 이름(예: scene-0916,scene-1094)",
    )
    args = parser.parse_args()

    weights_path = REPO_ROOT / args.weights
    if not weights_path.is_file():
        # 파일이 없으면 ultralytics가 말없이 내려받는다. 어떤 모델을 썼는지가
        # 흐려지므로 여기서 멈춘다.
        raise SystemExit(f"모델 파일을 찾을 수 없음: {weights_path}")
    data_dir = Path(args.data)
    catalog_path = data_dir / "scenes.json"
    if not catalog_path.is_file():
        raise SystemExit(f"목차 파일을 찾을 수 없음: {catalog_path} (prep_nuscenes.py를 먼저 실행)")
    dataroot = Path(args.dataroot)

    with open(catalog_path, encoding="utf-8") as f:
        catalog = json.load(f)
    names = [scene["name"] for scene in catalog["scenes"]]
    if args.scenes == "all":
        wanted = names
    else:
        wanted = [name.strip() for name in args.scenes.split(",") if name.strip()]
        unknown = sorted(set(wanted) - set(names))
        if unknown:
            raise SystemExit(f"없는 장면: {unknown} (있는 장면: {names})")

    model = YOLO(str(weights_path))

    grand_total = 0
    grand_photos = 0
    for scene in catalog["scenes"]:
        if scene["name"] not in wanted:
            continue
        frames_path = public_to_file(data_dir, scene["framesPath"])
        if not frames_path.is_file():
            raise SystemExit(f"장면 파일을 찾을 수 없음: {frames_path}")
        with open(frames_path, encoding="utf-8") as f:
            prepped = json.load(f)

        frames = []
        total = 0
        photos = 0
        channels: list[str] = []  # 파일에 나온 카메라 이름, 처음 나온 순서대로
        photo_size = None  # 모델이 본 사진의 (가로, 세로)
        for frame in prepped["frames"]:
            by_camera = {}
            for channel, image in frame_cameras(frame):
                # image.source 는 원본 사진의 nuScenes 상대 경로다(image.path 는 줄인 사본).
                image_path = dataroot / image["source"]
                if not image_path.is_file():
                    raise SystemExit(f"원본 사진을 찾을 수 없음: {image_path}")
                predictions = predict_frame(model, image_path, args.image_size, args.min_score)
                by_camera[channel] = predictions
                if channel not in channels:
                    channels.append(channel)
                if photo_size is None:
                    photo_size = (image["width"], image["height"])
                total += len(predictions)
                photos += 1
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
                # 모델이 본 사진: 원본. 화면의 사진(줄인 사본)과 해상도가 다르다.
                "photos": {
                    "source": "original",
                    "width": photo_size[0] if photo_size else None,
                    "height": photo_size[1] if photo_size else None,
                },
            },
            "frames": frames,
        }
        output_path = public_to_file(data_dir, scene["predictionsPath"])
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(dump(document), encoding="utf-8", newline="\n")
        grand_total += total
        grand_photos += photos
        print(
            f"[scene] {scene['name']}: frames={len(frames)} photos={photos} predictions={total} "
            f"→ {output_path.name} ({output_path.stat().st_size / 1024:.0f} KB)",
            flush=True,
        )

    print(f"\n[done] scenes={len(wanted)} photos={grand_photos} predictions={grand_total} → {data_dir}")


if __name__ == "__main__":
    main()

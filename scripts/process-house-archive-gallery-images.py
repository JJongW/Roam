#!/usr/bin/env python3
"""
House Archive 갤러리 이미지 일괄 처리 스크립트.

용도: tmp/house-archive-raw-images/ 에 모아둔 원본 스크린샷(각 부스별
{CODE}-{n}-설명.jpg, 최대 3장, REJECTED 포함 파일명은 자동 제외)을
- 여백(letterbox) 트림
- 정중앙 정사각 크롭
- 480x480 리사이즈
- webp(quality=78) 저장
해서 public/booths/house-archive/{CODE}-{1,2,3}.webp 로 출력한다.

사용법:
  python3 scripts/process-house-archive-gallery-images.py            # 전체 처리
  python3 scripts/process-house-archive-gallery-images.py C02 C03    # 특정 부스만

주의:
- REJECTED 가 파일명에 포함된 원본은 건너뛴다 (품질 미달로 반려된 후보).
- 같은 CODE에 원본이 N장 있으면 파일명 순서(1,2,3...)대로 {CODE}-1.webp ~ {CODE}-N.webp 로 번호를 다시 매긴다.
- 출력 후 각 부스의 이미지 배열은 이 스크립트가 자동으로 반영하지 않는다.
  gen_migration.py (또는 수동)로 enrichment JSON의 "images" 필드와
  supabase/migrations/00XX_house_archive_gallery_full.sql 을 별도로 작성해야 한다.
"""
import sys
import re
from pathlib import Path
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = REPO_ROOT / "tmp" / "house-archive-raw-images"
OUT_DIR = REPO_ROOT / "public" / "booths" / "house-archive"
TARGET_SIZE = 480
WEBP_QUALITY = 78
# 가장자리 여백(레터박스) 판정 임계값 — 이 밝기/단색 비율을 넘는 행/열은 배경으로 간주하고 트림
LETTERBOX_STD_THRESHOLD = 6.0


def trim_letterbox(im: Image.Image) -> Image.Image:
    """가장자리의 단색(레터박스) 여백을 제거한다."""
    gray = im.convert("L")
    px = gray.load()
    w, h = gray.size

    def row_is_blank(y):
        vals = [px[x, y] for x in range(0, w, max(1, w // 50))]
        return (max(vals) - min(vals)) < LETTERBOX_STD_THRESHOLD

    def col_is_blank(x):
        vals = [px[x, y] for y in range(0, h, max(1, h // 50))]
        return (max(vals) - min(vals)) < LETTERBOX_STD_THRESHOLD

    top = 0
    while top < h - 1 and row_is_blank(top):
        top += 1
    bottom = h - 1
    while bottom > top and row_is_blank(bottom):
        bottom -= 1
    left = 0
    while left < w - 1 and col_is_blank(left):
        left += 1
    right = w - 1
    while right > left and col_is_blank(right):
        right -= 1

    if right - left < w * 0.3 or bottom - top < h * 0.3:
        # 트림이 과도하면(이미지 대부분이 단색으로 오판) 원본 유지
        return im
    return im.crop((left, top, right + 1, bottom + 1))


def center_square_crop(im: Image.Image) -> Image.Image:
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    return im.crop((left, top, left + side, top + side))


def process_one(src: Path, dst: Path):
    im = Image.open(src).convert("RGB")
    im = trim_letterbox(im)
    im = center_square_crop(im)
    im = im.resize((TARGET_SIZE, TARGET_SIZE), Image.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, "WEBP", quality=WEBP_QUALITY)
    print(f"  {src.name}  ->  {dst.relative_to(REPO_ROOT)}  ({dst.stat().st_size // 1024}KB)")


def main():
    only_codes = set(a.upper() for a in sys.argv[1:]) or None

    if not RAW_DIR.exists():
        print(f"원본 폴더가 없습니다: {RAW_DIR}")
        sys.exit(1)

    files = sorted(RAW_DIR.glob("*.jpg")) + sorted(RAW_DIR.glob("*.jpeg")) + sorted(RAW_DIR.glob("*.png"))
    files = [f for f in files if "REJECTED" not in f.name]

    by_code: dict[str, list[Path]] = {}
    for f in files:
        m = re.match(r"^([A-Z]+\d+)-", f.name)
        if not m:
            print(f"  건너뜀(파일명 패턴 불일치): {f.name}")
            continue
        code = m.group(1)
        if only_codes and code not in only_codes:
            continue
        by_code.setdefault(code, []).append(f)

    if not by_code:
        print("처리할 원본이 없습니다.")
        return

    for code in sorted(by_code):
        srcs = by_code[code][:3]  # 최대 3장
        print(f"{code}: 원본 {len(srcs)}장")
        for i, src in enumerate(srcs, start=1):
            dst = OUT_DIR / f"{code}-{i}.webp"
            process_one(src, dst)

    print(f"\n완료: {len(by_code)}개 부스 처리됨.")


if __name__ == "__main__":
    main()

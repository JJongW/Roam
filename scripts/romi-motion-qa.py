#!/usr/bin/env python3
"""
로미 모션 QA — 생성된 클립이 로미인지 프레임 단위로 검사한다.

왜 필요한가:
  기존 모션 3종을 뜯어보니 AI 생성 과정에서 캐릭터가 중간에 무너져 있었다.
    · headbunting 0.6s   머리 점이 3D 음영 구체가 되고 O에 그라디언트가 생김
    · headbunting 3.6~4.8s  O의 구멍이 눈 둘 + 웃는 입으로 변함 (로미에 얼굴은 없다)
    · head_spinning 3.0~4.2s  머리 점이 사라지고 O 안에 없던 고리가 생김
  6초짜리 클립을 눈으로 다 넘겨보지 않으면 이런 걸 놓친다. 이 스크립트가 대신 본다.

로미의 불변식 (자세가 바뀌어도 지켜져야 하는 것):
  1. 머리  — 몸통과 떨어진 점 하나. 몸통 위에 있고 지름은 몸통 폭의 12~30%
  2. 구멍  — O의 안쪽 하나. 정확히 1개 (얼굴이 생기면 3개, 고리가 끼면 2개가 된다)
  3. 평면  — 단색 실루엣. 음영·그라디언트가 생기면 스타일이 깨진 것
  4. 다리  — 몸통 아래가 둘로 갈라진다 (팔 노릇을 하느라 하나로 붙을 때가 있어 경고만)
  5. 바닥  — 발이 땅에 붙어 있다. 바닥선이 튀면 캐릭터가 뜬 것
  6. 연속  — 프레임 사이에 실루엣 넓이가 급변하면 팝핑

사용법:
  python3 scripts/romi-motion-qa.py public/headbunting.webm
  python3 scripts/romi-motion-qa.py <프레임_디렉터리>
  python3 scripts/romi-motion-qa.py clip.webm --out /tmp/qa --fps 24 --strict

종료 코드: ERROR가 하나라도 있으면 1 (CI 게이트로 쓸 수 있다)
"""

import argparse
import math
import os
import shutil
import subprocess
import sys
import tempfile

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit("PIL이 필요하다:  python3 -m pip install pillow")

# ─────────────────────────── 임계값 ───────────────────────────
# 전부 비율이다 — 클립마다 해상도가 달라서(478x620 / 592x554 / 554x592) 절대 픽셀은 못 쓴다.
DOT_MIN_RATIO = 0.10   # 머리 지름 / 몸통 폭
DOT_MAX_RATIO = 0.34
DOT_MIN_AREA = 0.004   # 머리 넓이 / 전체 잉크 넓이 — 노이즈 덩어리를 머리로 오인하지 않게
SHADE_STD_MAX = 26.0   # 실루엣 안 밝기 표준편차. 단색이면 0에 가깝다
MIDTONE_MAX = 0.06     # 중간 밝기 픽셀 비율. 음영·그라디언트가 끼면 올라간다
SEMI_JUMP = 0.05       # 반투명 비율이 클립 중앙값보다 이만큼 높으면 흐려진 것
BOTTOM_JUMP = 0.035    # 바닥선 허용 흔들림 / 프레임 높이
AREA_JUMP = 0.28       # 프레임 간 잉크 넓이 변화 허용치
ANALYZE_W = 200        # 분석 해상도 (속도)


def extract_frames(src, workdir, fps=None):
    """webm(VP9 알파) / mp4 / 디렉터리를 프레임 PNG 목록으로."""
    if os.path.isdir(src):
        fs = sorted(
            os.path.join(src, f) for f in os.listdir(src)
            if f.lower().endswith(".png")
        )
        if not fs:
            sys.exit(f"{src} 안에 PNG가 없다")
        return fs

    if not shutil.which("ffmpeg"):
        sys.exit("ffmpeg이 필요하다 (brew install ffmpeg)")

    outdir = os.path.join(workdir, "frames")
    os.makedirs(outdir, exist_ok=True)
    cmd = ["ffmpeg", "-v", "error", "-y"]
    # VP9 알파는 디코더를 명시해야 알파 평면이 살아온다. 이걸 빼면 전부 불투명으로 읽힌다.
    if src.lower().endswith(".webm"):
        cmd += ["-c:v", "libvpx-vp9"]
    cmd += ["-i", src]
    vf = [f"scale={ANALYZE_W}:-1"]
    if fps:
        vf.insert(0, f"fps={fps}")
    cmd += ["-vf", ",".join(vf), os.path.join(outdir, "%04d.png")]
    subprocess.run(cmd, check=True)
    fs = sorted(os.path.join(outdir, f) for f in os.listdir(outdir))
    if not fs:
        sys.exit(f"{src} 에서 프레임을 못 뽑았다")
    return fs


def components(flags, w, h):
    """4-이웃 연결성분. flags[y][x] 가 True인 픽셀들을 묶는다."""
    seen = [[False] * w for _ in range(h)]
    out = []
    for sy in range(h):
        for sx in range(w):
            if seen[sy][sx] or not flags[sy][sx]:
                continue
            stack = [(sx, sy)]
            seen[sy][sx] = True
            pts = []
            border = False
            while stack:
                x, y = stack.pop()
                pts.append((x, y))
                if x == 0 or y == 0 or x == w - 1 or y == h - 1:
                    border = True
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and flags[ny][nx]:
                        seen[ny][nx] = True
                        stack.append((nx, ny))
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            out.append({
                "n": len(pts),
                "box": (min(xs), min(ys), max(xs), max(ys)),
                "border": border,
            })
    out.sort(key=lambda c: -c["n"])
    return out


def inspect(path):
    """프레임 하나에서 로미의 구조를 뽑아낸다."""
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    alpha = im.getchannel("A").load()
    ink = [[alpha[x, y] > 128 for x in range(w)] for y in range(h)]
    total = sum(r.count(True) for r in ink)
    if total < 40:
        return {"empty": True, "size": (w, h)}

    comps = [c for c in components(ink, w, h) if c["n"] >= max(8, total * 0.002)]
    body = comps[0]
    bx0, by0, bx1, by1 = body["box"]
    body_w = bx1 - bx0 + 1

    # 구멍: 테두리에 닿지 않는 배경 덩어리 (머리 판정보다 먼저 구해야 한다 — 아래 참조)
    bg = [[not ink[y][x] for x in range(w)] for y in range(h)]
    holes = [c for c in components(bg, w, h)
             if not c["border"] and c["n"] >= max(6, total * 0.004)]

    def inside(inner, outer, pad=2):
        ix0, iy0, ix1, iy1 = inner
        ox0, oy0, ox1, oy1 = outer
        return (ox0 - pad <= ix0 and ix1 <= ox1 + pad
                and oy0 - pad <= iy0 and iy1 <= oy1 + pad)

    # 머리: 몸통에서 떨어진 점 하나. 위쪽 절반에 있고 크기가 맞아야 한다.
    # ★ 구멍 안에 있는 덩어리는 머리가 아니다 — 모델이 그려 넣은 눈이다.
    #   이 조건이 없으면 눈을 머리로 오인해 "머리 있음"으로 통과시킨다(실제로 그랬다).
    dot = None
    for c in comps[1:]:
        cx0, cy0, cx1, cy1 = c["box"]
        d = max(cx1 - cx0 + 1, cy1 - cy0 + 1)
        if any(inside(c["box"], hb["box"]) for hb in holes):
            continue
        if (c["n"] / total >= DOT_MIN_AREA
                and DOT_MIN_RATIO <= d / body_w <= DOT_MAX_RATIO
                and cy0 <= by0 + (by1 - by0) * 0.5):
            dot = c
            break

    # O의 구멍 = 몸통 위쪽 절반에 중심이 있는 가장 큰 내부 구멍.
    # 책·돋보기·노트북 같은 소품도 구멍을 만들기 때문에 "구멍 1개"로는 판정할 수 없다.
    # (이 구분을 안 하면 map·read·search 자세가 전부 오탐으로 걸린다. 실제로 걸렸다.)
    o_hole = None
    for hb in holes:
        hx0, hy0, hx1, hy1 = hb["box"]
        cy = (hy0 + hy1) / 2
        if cy <= by0 + (by1 - by0) * 0.6:
            if o_hole is None or hb["n"] > o_hole["n"]:
                o_hole = hb

    # 내부 섬: O의 구멍 *안에* 떠 있는 잉크 덩어리.
    # 로미에는 눈이 없다 — 구멍 안에 검은 점이 생기면 모델이 얼굴을 그려 넣은 것이다.
    # 소품은 O 바깥에 있으므로 여기 걸리지 않는다.
    islands = 0
    if o_hole:
        for c in comps[1:]:
            if c is dot:
                continue
            if inside(c["box"], o_hole["box"], pad=1):
                islands += 1

    # 평면성: 음영이 생기면 실루엣 안에 중간 밝기가 나타난다.
    # 알파가 함께 떨어지는 경우가 있어 불투명 기준을 느슨하게(>120) 잡는다.
    gray = im.convert("L").load()
    vals = [gray[x, y] for y in range(0, h, 2) for x in range(0, w, 2)
            if alpha[x, y] > 120]
    if len(vals) > 20:
        mean = sum(vals) / len(vals)
        std = math.sqrt(sum((v - mean) ** 2 for v in vals) / len(vals))
        midtone = sum(1 for v in vals if 70 <= v <= 190) / len(vals)
    else:
        std, midtone = 0.0, 0.0

    # 반투명 비율: 깨끗한 매트는 가장자리만 반투명하다.
    # 캐릭터 일부가 통째로 흐려지면 이 값이 자기 클립 중앙값보다 크게 뛴다.
    ah = im.getchannel("A").histogram()
    sil = sum(ah[40:256]) or 1
    semi = sum(ah[40:200]) / sil

    # 다리: 몸통 아래쪽을 가로로 잘라 덩어리 수를 센다
    legs = []
    for frac in (0.72, 0.88):
        y = min(h - 1, by0 + int((by1 - by0) * frac))
        runs, run = 0, 0
        for x in range(bx0, bx1 + 1):
            if ink[y][x]:
                run += 1
            elif run:
                runs += 1
                run = 0
        if run:
            runs += 1
        legs.append(runs)

    return {
        "empty": False, "size": (w, h), "ink": total,
        "body_box": body["box"], "dot": dot is not None,
        "holes": len(holes), "o_hole": o_hole is not None, "islands": islands,
        "shade_std": std, "midtone": midtone, "semi": semi,
        "legs": legs, "bottom": by1,
    }


def main():
    ap = argparse.ArgumentParser(description="로미 모션 QA")
    ap.add_argument("src", help="영상 파일(.webm/.mp4) 또는 프레임 PNG 디렉터리")
    ap.add_argument("--out", help="플래그된 프레임 컨택트시트를 저장할 디렉터리")
    ap.add_argument("--fps", type=int, help="영상에서 뽑을 fps (기본: 원본 전체)")
    ap.add_argument("--strict", action="store_true", help="WARN도 실패로 친다")
    ap.add_argument("--poses", action="store_true",
                    help="연속 프레임이 아닌 자세 모음을 검사할 때 (바닥선·팝핑 검사를 끈다)")
    args = ap.parse_args()

    work = tempfile.mkdtemp(prefix="romi-qa-")
    try:
        frames = extract_frames(args.src, work, args.fps)
        print(f"{os.path.basename(args.src)} — 프레임 {len(frames)}개\n")

        data = [inspect(f) for f in frames]
        live = [d for d in data if not d["empty"]]
        if not live:
            sys.exit("전 프레임이 비어 있다 — 알파가 제대로 디코드됐는지 확인할 것")

        # 바닥선·반투명 기준은 클립 자신의 중앙값으로 — 클립마다 크롭과 매트 품질이 달라서
        # 고정값을 못 쓴다. "이 클립 안에서 튀는 프레임"을 찾는 게 목적이다.
        def med(key):
            v = sorted(d[key] for d in live)
            return v[len(v) // 2]
        med_bottom = med("bottom")
        med_semi = med("semi")
        H = live[0]["size"][1]

        issues = []
        prev_ink = None
        for i, d in enumerate(data):
            errs, warns = [], []
            if d["empty"]:
                errs.append("프레임이 비었다")
            else:
                if not d["dot"]:
                    errs.append("머리 점 없음")
                if not d["o_hole"]:
                    errs.append("O의 구멍이 없다 — 몸통이 메워졌다")
                elif d["holes"] > 1:
                    warns.append(f"구멍 {d['holes']}개 (소품이면 정상, 아니면 고리가 낀 것)")
                if d["islands"]:
                    errs.append(f"몸통 안에 떠 있는 덩어리 {d['islands']}개 — 눈/얼굴이 생겼다")
                if d["midtone"] > MIDTONE_MAX or d["shade_std"] > SHADE_STD_MAX:
                    errs.append(f"음영 발생 (중간밝기 {d['midtone']*100:.0f}%, "
                                f"표준편차 {d['shade_std']:.0f})")
                if d["semi"] > med_semi + SEMI_JUMP:
                    errs.append(f"반투명해짐 (반투명 {d['semi']*100:.0f}%, "
                                f"이 클립 기준 {med_semi*100:.0f}%)")
                if 2 not in d["legs"]:
                    warns.append(f"다리 분기 안 보임 {d['legs']}")
                if not args.poses and abs(d["bottom"] - med_bottom) > H * BOTTOM_JUMP:
                    warns.append(f"바닥선 이탈 {d['bottom']}(기준 {med_bottom})")
                if (not args.poses and prev_ink
                        and abs(d["ink"] - prev_ink) / max(prev_ink, 1) > AREA_JUMP):
                    warns.append(f"실루엣 급변 {prev_ink}→{d['ink']}")
                prev_ink = d["ink"]
            if errs or warns:
                issues.append((i, errs, warns))

        n_err = sum(1 for _, e, _ in issues if e)
        n_warn = sum(1 for _, e, w in issues if w and not e)

        if not issues:
            print("이상 없음 — 전 프레임이 로미다.")
        else:
            for i, errs, warns in issues:
                tag = "ERROR" if errs else "WARN "
                t = f"{i}f"
                print(f"  [{tag}] {t:>6}  " + " · ".join(errs + warns))

        print(f"\n프레임 {len(frames)} · ERROR {n_err} · WARN {n_warn}")

        # 문제 프레임만 모아 컨택트시트로 — 눈으로 확인할 수 있게
        if args.out and issues:
            os.makedirs(args.out, exist_ok=True)
            picks = [i for i, e, _ in issues if e][:20] or [i for i, _, _ in issues][:20]
            ims = [Image.open(frames[i]).convert("RGBA") for i in picks]
            tw, th = 150, int(150 * ims[0].size[1] / ims[0].size[0])
            cols = min(5, len(ims))
            rows = (len(ims) + cols - 1) // cols
            sheet = Image.new("RGB", (tw * cols, (th + 16) * rows), (255, 255, 255))
            d = ImageDraw.Draw(sheet)
            for k, (idx, im) in enumerate(zip(picks, ims)):
                t = im.resize((tw, th), Image.LANCZOS)
                bg = Image.new("RGB", (tw, th), (255, 255, 255))
                bg.paste(t, (0, 0), t)
                c, r = k % cols, k // cols
                sheet.paste(bg, (c * tw, r * (th + 16) + 16))
                d.text((c * tw + 4, r * (th + 16) + 3), f"{idx}f", fill=(180, 40, 40))
            p = os.path.join(args.out, "flagged.png")
            sheet.save(p)
            print(f"문제 프레임 시트: {p}")

        sys.exit(1 if (n_err or (args.strict and n_warn)) else 0)
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()

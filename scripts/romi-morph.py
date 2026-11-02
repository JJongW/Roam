#!/usr/bin/env python3
"""
로미 모프 — 자세 사이의 중간 프레임을 계산으로 만든다.

왜 이 방식인가:
  두 자세를 투명도로 겹치면(크로스페이드) 중간에 로미가 둘로 비친다. 그건 움직임이 아니다.
  로미는 단색 실루엣이라 거리장(signed distance field)을 보간하면 중간 '모양'이 나온다.
  O가 눌리고 다리가 늘어나는 식으로 형태가 실제로 변한다.

왜 부위별로 나누는가:
  통짜로 거리장을 섞으면 떨어져 있던 머리가 몸통에 달라붙고 O의 구멍이 메워진다.
  (실제로 그랬고, romi-motion-qa.py 가 바로 잡아냈다.)
  그래서 셋을 따로 다룬다 —
    · 머리  자세가 바뀌어도 지름 39의 원 그대로다 → 중심만 보간한다
    · 구멍  O의 안쪽 → 따로 보간해서 몸통에서 파낸다
    · 몸통+다리  유일하게 형태가 변하는 부분 → 거리장 보간

전제:
  입력 자세들이 같은 캔버스·같은 배율·같은 바닥선이어야 한다.

사용법:
  python3 scripts/romi-morph.py --poses <자세_디렉터리> --out /tmp/nod --fps 24 \\
      --key idle 0.00 --key bow 0.18 --key idle 0.52 --hold 0.12
  # 영상까지: --encode nod_keep   (알파 webm + HEVC mp4 쌍)
"""

import argparse
import math
import os
import shutil
import subprocess
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("PIL이 필요하다:  python3 -m pip install pillow")

INF = 1e9


# ───────────────────────── 거리장 ─────────────────────────
def dt(flags, w, h):
    """flags=True 인 곳까지의 거리. 챔퍼 2패스 — 모프에는 충분하고 빠르다."""
    d = [[0.0 if flags[y][x] else INF for x in range(w)] for y in range(h)]
    for y in range(h):
        row = d[y]
        prev = d[y - 1] if y else None
        for x in range(w):
            if row[x] == 0.0:
                continue
            b = row[x]
            if x:
                b = min(b, row[x - 1] + 1.0)
            if prev:
                b = min(b, prev[x] + 1.0)
                if x:
                    b = min(b, prev[x - 1] + 1.41421)
                if x + 1 < w:
                    b = min(b, prev[x + 1] + 1.41421)
            row[x] = b
    for y in range(h - 1, -1, -1):
        row = d[y]
        nxt = d[y + 1] if y + 1 < h else None
        for x in range(w - 1, -1, -1):
            b = row[x]
            if x + 1 < w:
                b = min(b, row[x + 1] + 1.0)
            if nxt:
                b = min(b, nxt[x] + 1.0)
                if x + 1 < w:
                    b = min(b, nxt[x + 1] + 1.41421)
                if x:
                    b = min(b, nxt[x - 1] + 1.41421)
            row[x] = b
    return d


def sdf(mask, w, h):
    """밖은 양수, 안은 음수. 비어 있으면 None."""
    if not any(any(r) for r in mask):
        return None
    out = dt(mask, w, h)
    inv = [[not mask[y][x] for x in range(w)] for y in range(h)]
    ins = dt(inv, w, h)
    return [[out[y][x] - ins[y][x] for x in range(w)] for y in range(h)]


# ───────────────────────── 부위 분해 ─────────────────────────
def comps(flags, w, h, minpx):
    seen = [[False] * w for _ in range(h)]
    out = []
    for sy in range(h):
        for sx in range(w):
            if seen[sy][sx] or not flags[sy][sx]:
                continue
            st = [(sx, sy)]
            seen[sy][sx] = True
            pts = []
            border = False
            while st:
                x, y = st.pop()
                pts.append((x, y))
                if x == 0 or y == 0 or x == w - 1 or y == h - 1:
                    border = True
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and flags[ny][nx]:
                        seen[ny][nx] = True
                        st.append((nx, ny))
            if len(pts) >= minpx:
                xs = [p[0] for p in pts]
                ys = [p[1] for p in pts]
                out.append({"pts": pts, "n": len(pts), "border": border,
                            "box": (min(xs), min(ys), max(xs), max(ys))})
    out.sort(key=lambda c: -c["n"])
    return out


def decompose(path):
    """자세 PNG → 머리(원) · O의 구멍 · 나머지(몸통+다리+소품)"""
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    a = im.getchannel("A").load()
    ink = [[a[x, y] > 128 for x in range(w)] for y in range(h)]
    total = sum(r.count(True) for r in ink)
    cs = comps(ink, w, h, max(8, int(total * 0.002)))
    body = cs[0]
    bx0, by0, bx1, by1 = body["box"]
    bw = bx1 - bx0 + 1

    bg = [[not ink[y][x] for x in range(w)] for y in range(h)]
    holes = [c for c in comps(bg, w, h, max(6, int(total * 0.004))) if not c["border"]]
    o_hole = None
    for hb in holes:
        hy0, hy1 = hb["box"][1], hb["box"][3]
        if (hy0 + hy1) / 2 <= by0 + (by1 - by0) * 0.6:
            if o_hole is None or hb["n"] > o_hole["n"]:
                o_hole = hb

    def in_box(inner, outer, pad=1):
        return (outer[0] - pad <= inner[0] and inner[2] <= outer[2] + pad
                and outer[1] - pad <= inner[1] and inner[3] <= outer[3] + pad)

    dot = None
    for c in cs[1:]:
        if o_hole and in_box(c["box"], o_hole["box"]):
            continue
        cx0, cy0, cx1, cy1 = c["box"]
        d = max(cx1 - cx0 + 1, cy1 - cy0 + 1)
        if 0.10 <= d / bw <= 0.34 and cy0 <= by0 + (by1 - by0) * 0.5:
            dot = c
            break
    if dot is None:
        sys.exit(f"{os.path.basename(path)}: 머리를 못 찾았다 — 자세 추출이 잘못됐다")

    dx0, dy0, dx1, dy1 = dot["box"]
    dot_c = ((dx0 + dx1) / 2, (dy0 + dy1) / 2, (dx1 - dx0 + dy1 - dy0 + 2) / 4)

    rest = [[ink[y][x] for x in range(w)] for y in range(h)]
    for x, y in dot["pts"]:
        rest[y][x] = False
    # 구멍은 자세가 바뀌어도 크기가 거의 같다(측정: 42x42). 거리장으로 섞으면 전환 중
    # 소멸해버리므로(실제로 그랬다) 타원 파라미터로 보간한다.
    if o_hole:
        hx0, hy0, hx1, hy1 = o_hole["box"]
        hole_e = ((hx0 + hx1) / 2, (hy0 + hy1) / 2, (hx1 - hx0 + 1) / 2, (hy1 - hy0 + 1) / 2)
    else:
        hole_e = None

    # 앵커 = O의 중심. 모프는 이 점을 맞춘 상태에서 '모양'만 섞고,
    # 위치 이동은 앵커를 따로 보간해 처리한다. 정렬 없이 섞으면 중간에서 몸통이 찢어진다.
    # 앵커는 O의 중심. 바닥선에 맞추면 O가 어긋나 중간 프레임에서 몸통이 찢어진다(실제로 찢어졌다).
    # 발이 뜨는 문제는 렌더 뒤에 바닥선을 맞춰 따로 해결한다(ground_lock).
    anchor = (hole_e[0], hole_e[1]) if hole_e else ((bx0 + bx1) / 2, (by0 + by1) / 2)
    ground = by1

    return {"rest": sdf(rest, w, h), "hole": hole_e, "dot": dot_c,
            "anchor": anchor, "ground": ground, "size": (w, h)}


# ───────────────────────── 렌더 ─────────────────────────
def clamp01(v):
    return 0.0 if v < 0 else (1.0 if v > 1 else v)


def upscale(field, w, h, scale):
    """거리장을 이중선형으로 확대한다. 거리장은 연속이라 확대해도 윤곽이 뭉개지지 않는다 —
    픽셀을 늘리는 것과 다르다. 거리값도 함께 배율만큼 커져야 두께가 유지된다."""
    if scale == 1:
        return field, w, h
    im = Image.new("F", (w, h))
    im.putdata([v for row in field for v in row])
    W, H = int(round(w * scale)), int(round(h * scale))
    im = im.resize((W, H), Image.BILINEAR)
    d = list(im.getdata())
    return [[d[y * W + x] * scale for x in range(W)] for y in range(H)], W, H


def render(rest, hole, dot, w, h, rgb=(17, 17, 20)):
    im = Image.new("RGBA", (w, h))
    px = im.load()
    r, g, b = rgb
    cx, cy, rad = dot
    if hole:
        hx, hy, hrx, hry = hole
        hrx = max(1.0, hrx); hry = max(1.0, hry)
    for y in range(h):
        rr = rest[y]
        dy = y - cy
        for x in range(w):
            a = clamp01(0.5 - rr[x])
            if hole and a > 0:
                # 타원 내부면 판다. 가장자리 한 픽셀은 부드럽게.
                nx = (x - hx) / hrx
                ny = (y - hy) / hry
                d = math.hypot(nx, ny)
                scale = min(hrx, hry)
                a *= clamp01((d - 1.0) * scale + 0.5)
            if a < 1.0:                                   # 머리는 항상 그린다
                ad = clamp01(rad + 0.5 - math.hypot(x - cx, dy))
                if ad > a:
                    a = ad
            if a > 0.002:
                px[x, y] = (r, g, b, 255 if a >= 1 else int(a * 255))
    return im


def ease(t):
    return t * t * (3 - 2 * t)


def main():
    ap = argparse.ArgumentParser(description="로미 자세 모프")
    ap.add_argument("--poses", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--key", nargs=2, action="append", metavar=("POSE", "TIME"), required=True)
    ap.add_argument("--hold", type=float, default=0.0,
                    help="마지막 전환 직전에 멈추는 시간(초)")
    ap.add_argument("--fps", type=int, default=24)
    ap.add_argument("--breathe", type=float, default=1.0, metavar="SY",
                    help="세로로 부풀었다 돌아온다 (예: 1.045). 발은 땅에 붙은 채 위로만 "
                         "커진다. 숨쉬기는 자세를 오가는 게 아니라 몸이 부푸는 것이라 "
                         "자세 혼합으로는 표현되지 않는다")
    ap.add_argument("--scale", type=float, default=2.5,
                    help="출력 배율. 거리장을 확대해 렌더하므로 선이 뭉개지지 않는다 (기본 2.5)")
    ap.add_argument("--encode", metavar="NAME")
    args = ap.parse_args()

    # 키는 "자세" 또는 "자세:정도". 정도는 기준 자세(첫 키)에서 그 자세로 가는 비율이다.
    # 약한 반응(nod_soft 는 nod_keep 의 절반)을 따로 그리지 않고 만들 수 있다.
    keys = []
    for p_, t in args.key:
        name, _, amt = p_.partition(":")
        keys.append((name, float(amt) if amt else 1.0, float(t)))
    base = keys[0][0]
    # 기준 자세는 기준에서 0만큼 떨어져 있다 — 정도를 1.0으로 두면 세그먼트 해석이 깨진다
    keys = [(n, 0.0 if n == base else a, t) for n, a, t in keys]
    if len(keys) < 2:
        sys.exit("--key 는 최소 둘")
    if any(keys[i][2] >= keys[i + 1][2] for i in range(len(keys) - 1)):
        sys.exit("--key 시각은 오름차순")

    poses, size = {}, None
    for name, _a, _t in keys:
        if name in poses:
            continue
        p = os.path.join(args.poses, f"romi-{name}.png")
        if not os.path.exists(p):
            sys.exit(f"자세 파일이 없다: {p}")
        print(f"  분해 {name}")
        poses[name] = decompose(p)
        if size and poses[name]["size"] != size:
            sys.exit(f"캔버스가 다르다: {name}")
        size = poses[name]["size"]
    w, h = size

    os.makedirs(args.out, exist_ok=True)
    for f in os.listdir(args.out):
        if f.endswith(".png"):
            os.remove(os.path.join(args.out, f))

    total = keys[-1][2] + args.hold
    n = max(2, int(round(total * args.fps)))
    target_ground = max(poses[k]["ground"] for k in poses)
    outw = int(round(w * args.scale)); outh = int(round(h * args.scale))
    print(f"  프레임 {n}개 · {total:.2f}초 @ {args.fps}fps · {outw}x{outh}")

    for i in range(n):
        t = i / args.fps
        if args.hold and keys[-2][2] <= t < keys[-2][2] + args.hold:
            tt = keys[-2][2]
        elif args.hold and t >= keys[-2][2] + args.hold:
            tt = t - args.hold
        else:
            tt = t
        tt = min(tt, keys[-1][2])

        seg = 0
        while seg < len(keys) - 2 and tt >= keys[seg + 1][2]:
            seg += 1
        an, aa, at = keys[seg]
        bn, ba, bt = keys[seg + 1]
        raw = 0.0 if bt <= at else ease(clamp01((tt - at) / (bt - at)))

        # 세그먼트를 (기준 자세 → 목표 자세, 섞는 정도)로 환원한다.
        if an == bn:
            tgt, u = an, aa + (ba - aa) * raw
        elif aa == 0.0:
            tgt, u = bn, ba * raw
        elif ba == 0.0:
            tgt, u = an, aa * (1 - raw)
        else:
            sys.exit(f"{an}:{aa} → {bn}:{ba} — 서로 다른 자세를 둘 다 부분 혼합할 수는 없다")
        A, B = poses[base], poses[tgt]
        if tgt == base:
            u = 0.0

        # 앵커(O 중심)를 맞춰 섞는다. 정수로 반올림하면 발이 두 겹으로 갈라진다 —
        # 소수 오프셋 + 이중선형 샘플링으로 처리한다.
        ax, ay = A["anchor"]; bxa, bya = B["anchor"]
        tx = ax * (1 - u) + bxa * u
        ty = ay * (1 - u) + bya * u
        # 바닥선 보정: 섞인 모양의 바닥은 두 바닥의 보간값이다. 그 값이 목표 바닥에
        # 오도록 앵커를 미리 옮겨 둔다 — 렌더 뒤에 밀면 잘린 자국이 남는다.
        ga = A["ground"] - ay; gb = B["ground"] - bya
        ty = target_ground - (ga * (1 - u) + gb * u)
        oax, oay = tx - ax, ty - ay
        obx, oby = tx - bxa, ty - bya

        # 숨: 바닥선을 고정한 채 세로로만 늘렸다 줄인다. 한 주기가 클립 전체다.
        if args.breathe != 1.0:
            ph = math.sin(math.pi * (i / max(1, n - 1)) * 2 - math.pi / 2) * 0.5 + 0.5
            sy = 1.0 + (args.breathe - 1.0) * ph
        else:
            sy = 1.0

        def samp(f, x, y):
            """소수 좌표에서 거리장을 이중선형으로 읽는다. 바깥은 '한참 밖'."""
            if x < 0 or y < 0 or x >= w - 1 or y >= h - 1:
                return 60.0
            x0, y0 = int(x), int(y)
            fx, fy = x - x0, y - y0
            r0, r1 = f[y0], f[y0 + 1]
            return ((r0[x0] * (1 - fx) + r0[x0 + 1] * fx) * (1 - fy)
                    + (r1[x0] * (1 - fx) + r1[x0 + 1] * fx) * fy)

        def blend(k):
            fa, fb = A[k], B[k]
            if fa is None or fb is None:
                return fa or fb
            out = []
            for y in range(h):
                row = []
                # 세로 스케일은 바닥선을 중심으로 — 발이 뜨지 않는다
                ys = target_ground + (y - target_ground) / sy if sy != 1.0 else y
                ya, yb = ys - oay, ys - oby
                for x in range(w):
                    sa = samp(fa, x - oax, ya)
                    sb = samp(fb, x - obx, yb)
                    v = sa * (1 - u) + sb * u
                    # 단순 보간은 한쪽에만 있는 얇은 부분(발끝)을 깎아 조각낸다.
                    # 지배적인 자세보다 더 깎이지 않게 막는다 — 중간이 약간 통통해지지만
                    # 그건 squash로 읽히고, 조각나는 것보다 낫다.
                    dom = sa if u < 0.5 else sb
                    row.append(v if v <= dom else dom)
                out.append(row)
            return out

        dot = tuple(A["dot"][j] * (1 - u) + B["dot"][j] * u for j in range(3))
        ha, hb = A["hole"], B["hole"]
        if ha and hb:
            hole = tuple(ha[j] * (1 - u) + hb[j] * u for j in range(4))
        else:
            hole = ha or hb
        # 머리와 구멍도 같이 올라가야 한다. 몸만 늘리면 전체 높이가 그대로라
        # 숨 쉬는 게 아니라 몸통만 부푸는 걸로 보인다(실제로 그랬다).
        if sy != 1.0:
            dot = (dot[0], target_ground + (dot[1] - target_ground) * sy, dot[2])
            if hole:
                hole = (hole[0], target_ground + (hole[1] - target_ground) * sy,
                        hole[2], hole[3] * sy)
        fld, W, H = upscale(blend("rest"), w, h, args.scale)
        hole_s = tuple(v * args.scale for v in hole) if hole else None
        dot_s = tuple(v * args.scale for v in dot)
        render(fld, hole_s, dot_s, W, H).save(os.path.join(args.out, f"{i:04d}.png"))
    print(f"  → {args.out}")

    if args.encode:
        if not shutil.which("ffmpeg"):
            sys.exit("ffmpeg이 없다")
        src = os.path.join(args.out, "%04d.png")
        webm = os.path.join(args.out, f"{args.encode}.webm")
        mp4 = os.path.join(args.out, f"{args.encode}.mp4")
        # 레포 규약: 알파 webm + 알파 HEVC mp4 쌍. 쌍이 빠지면 테스트가 빌드를 막는다.
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(args.fps),
                        "-i", src, "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p",
                        "-b:v", "0", "-crf", "18", "-row-mt", "1", webm], check=True)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(args.fps),
                        "-i", src, "-c:v", "hevc_videotoolbox", "-alpha_quality", "1.0", "-q:v", "70",
                        "-tag:v", "hvc1", "-pix_fmt", "bgra", mp4], check=True)
        for p in (webm, mp4):
            print(f"  → {p}  ({os.path.getsize(p)//1024}KB)")


if __name__ == "__main__":
    main()

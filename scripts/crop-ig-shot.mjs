// 확장 스크린샷에서 인스타 격자를 **여러 칸** 잘라 부스 게시물 이미지로 만든다.
//
//   node scripts/crop-ig-shot.mjs <slug> <CODE> <shotPath> <x> <y> <size> <viewportWidth> [count]
//
// 결과: public/booths/<slug>/<CODE>_1.webp, _2.webp, ...
//
// 왜 스크린샷인가: 인스타 CDN URL은 서명 토큰이 붙어 있어 브라우저 밖으로 못
// 내보내고(확장이 막는다) 몇 시간이면 만료된다. 페이지에서 localhost로 직접
// 보내는 길도 막혔다(https 페이지 → http localhost는 믹스드 콘텐츠).
// 화면에 보이는 것을 찍어 자르는 건 토큰을 건드리지 않으면서 같은 그림을 얻는다.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const [slug, code, shot, x, y, size, vw, count = "6"] = process.argv.slice(2);
if (!vw) { console.error("인자 부족"); process.exit(1); }

const meta = await sharp(shot).metadata();
const k = meta.width / Number(vw);          // CSS 픽셀 → 스크린샷 픽셀
const cell = Number(size);
// 격자는 칸 사이에 얇은 간격이 있다. 첫 칸 크기로 보폭을 잡는다.
const step = cell + 1.7;
const dir = `public/booths/${slug}`;
mkdirSync(dir, { recursive: true });

// 격자는 5열이다. count가 5를 넘으면 아랫줄로 넘어간다.
const COLS = 5;
let n = 0;
for (let i = 0; i < Number(count); i++) {
  const col = i % COLS, row = Math.floor(i / COLS);
  const left = Math.round((Number(x) + step * col) * k);
  const top = Math.round((Number(y) + step * row) * k);
  const w = Math.min(Math.round(cell * k), meta.width - left);
  const h = Math.min(Math.round(cell * k), meta.height - top);
  if (left < 0 || top < 0 || w < 100 || h < 100) break;
  await sharp(shot)
    .extract({ left, top, width: w, height: h })
    .resize(640, 640, { fit: "cover" })
    .webp({ quality: 78 })
    .toFile(`${dir}/${code}_${i + 1}.webp`);
  n++;
}
console.log(`${code} ✓ ${n}장 → ${dir}/${code}_1..${n}.webp`);

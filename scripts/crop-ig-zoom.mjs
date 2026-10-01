// 인스타 프로필 격자 첫 줄을 크롬 확장 zoom(scale 1, save_to_disk)으로 찍은 이미지에서
// 게시물 칸을 잘라 부스 사진으로 만든다. crop-ig-shot.mjs(정사각 격자)의 세로형(3:4) 판.
//   node scripts/crop-ig-zoom.mjs <CODE> <zoomPath> [게시물수] [쓸 칸 번호,쉼표]
// 캡처 조건: 1920px 뷰포트, 첫 게시물을 화면 위로 스크롤, zoom 영역 (190,10)-(1320,320).
// 브랜드 사진이 아닌 칸(다른 행사 포스터·합성 이미지·인물 광고)은 칸 번호로 뺀다.
import sharp from "sharp";
const SLUG = process.env.SLUG ?? "siwse-magok-2026";
const [code, shot, countArg = "5", pick = ""] = process.argv.slice(2);
// pick: 쓸 칸 번호(1부터, 쉼표). 브랜드 사진이 아닌 칸(합성·밈·무관한 그림)을 뺀다.
const only = pick ? pick.split(",").map(Number) : null;
const VW = 1920, FRAME_W = 1513, REGION = { x: 190, y: 10, w: 1130, h: 310 };
const meta = await sharp(shot).metadata();
const f = FRAME_W / VW, z = meta.width / REGION.w;
const px = (cssX) => (cssX * f - REGION.x) * z, py = (cssY) => (cssY * f - REGION.y) * z;
const out = [];
for (let i = 0; i < Math.min(5, Number(countArg)); i++) {
  const left = Math.round(px(250 + 284 * i)) + 2, top = Math.round(py(20)) + 2;
  const width = Math.round(283 * f * z) - 4, height = Math.min(Math.round(378 * f * z) - 4, meta.height - top);
  if (left + width > meta.width || height < 150) break;
  if (only && !only.includes(i + 1)) continue;
  const k2 = out.length + 1;
  const file = `public/booths/${SLUG}/${code}_${k2}.webp`;
  await sharp(shot).extract({ left, top, width, height }).resize({ width: 640 }).webp({ quality: 82 }).toFile(file);
  out.push(`/booths/${SLUG}/${code}_${k2}.webp`);
}
console.log(JSON.stringify({ code, images: out }));

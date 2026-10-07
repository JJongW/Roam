// 주최 배치도 "그림"(좌표 데이터 없음)에서 부스 칸을 색으로 검출한다 — 손으로 따지 않는다.
//
//   node scripts/floorplan-from-image.mjs <image> <out-rects.json> [overlay.png]
//
// 서울가구쇼 2026(casanew.kr 배치도 JPG)에서 처음 썼다: 부스 면이 순색 주황(255,127,0)·
// 노랑(255,255,0)이고 경계선은 반투명 선이라, 순색만 남기고 1px 침식한 뒤 연결 성분을
// 사각형으로 뽑는다. 번호·이름은 이 스크립트가 아니라 사람이 그림 글자를 옮겨 적는다
// (OCR이 작은 한글을 망가뜨렸다 — "금성침대"→"긍성친다"). 결과 사각형은 원본 픽셀 좌표.
import sharp from "sharp"; import fs from "node:fs";
const [img, out, ov = out.replace(/\.json$/, "-overlay.png")] = process.argv.slice(2);
const {data,info}=await sharp(img).raw().toBuffer({resolveWithObject:true});
const W=info.width,H=info.height,C=info.channels;
const kind=new Uint8Array(W*H);
for(let p=0,i=0;p<W*H;p++,i+=C){const r=data[i],g=data[i+1],b=data[i+2];
  if(r>=248&&b<=20){ if(g>=118&&g<=136)kind[p]=1; else if(g>=248)kind[p]=2; }}
// 1px 침식 — 경계선이 반투명이라 한 화소 다리가 남는다.
const er=new Uint8Array(W*H);
for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const p=y*W+x,k=kind[p];if(k&&kind[p-1]===k&&kind[p+1]===k&&kind[p-W]===k&&kind[p+W]===k)er[p]=k;}
const seen=new Uint8Array(W*H);const rects=[];const st=new Int32Array(W*H);
for(let p=0;p<W*H;p++){if(!er[p]||seen[p])continue;const k=er[p];let sp=0;st[sp++]=p;seen[p]=1;let n=0,x0=W,y0=H,x1=0,y1=0;
 while(sp){const q=st[--sp];n++;const x=q%W,y=(q/W)|0;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
  for(const r of [q-1,q+1,q-W,q+W]){if(seen[r]||er[r]!==k)continue;if((r===q-1||r===q+1)&&((r/W)|0)!==y)continue;seen[r]=1;st[sp++]=r;}}
 const w=x1-x0+1,h=y1-y0+1;if(n>2500&&w>40&&h>40&&n/(w*h)>0.5)rects.push({k,x0,y0,w,h,fill:+(n/(w*h)).toFixed(2)});}
fs.writeFileSync(out,JSON.stringify(rects));
console.log("rects",rects.length,"orange",rects.filter(r=>r.k===1).length,"yellow",rects.filter(r=>r.k===2).length);
const svg=rects.map((r)=>`<rect x="${r.x0}" y="${r.y0}" width="${r.w}" height="${r.h}" fill="none" stroke="${r.k===1?"blue":"red"}" stroke-width="10"/>`).join("");
const big=await sharp(img).composite([{input:Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`)}]).png().toBuffer();
await sharp(big).resize(1600).png().toFile(ov);

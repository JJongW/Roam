# 서울디자인페스티벌 2026 올리기 (배치도 나온 날)

_2026-11-19 준비. 행사 2026-11-26(목)~29(일), 코엑스 1층 A홀, slug `sdf-2026`, 주최 디자인하우스._
_Ted 결정(11-17, 11-19): 배치도가 나오면 행사, 브랜드, 부스를 한 번에 올린다. 브랜드 대조는 미리 해 둔다._

운영 DB 쓰기(4, 5, 8단계)는 Ted가 한다. 나머지는 읽기만 하거나 레포 PR이다.
모든 명령은 Roam 레포 루트에서 돌린다. `.env`는 스크립트가 알아서 읽고 값은 찍지 않는다.

## 미리 준비된 것

| 파일 | 내용 | 상태 |
|---|---|---|
| `data/brands/sdf-2026.json` | brands.v1 151곳(11-24 다시 받음, 공개 사진 147곳 727장, 11-22 146곳에서 5곳 늘어남: 나인파이브, 다숲 × 도도리, 이승재, 이우연, 아름다운가게). 11-22 146곳(11-22 다시 받음, 11-19보다 6곳 늘어남: 토마스스튜디오, 코발트사회적협동조합, 모비오, 스튜디오 오그루, 유림 / 데일웍스, 다정한 유리). 부스 없음 | 운영 대조 끝(11-22) |
| `data/exhibitions/sdf-2026.json` | 행사 행 파일(`/admin/intake`에 올림) | 형식 통과, 운영에 없음 |
| `scripts/sdf-floorplan-watch.mjs` | 배치도 올라왔는지 공식 사이트만 본다 | |
| `scripts/intake-dry-run.ts` | 세 파일 모두 운영 미리보기(읽기만) | |
| `scripts/intake-backup.ts` | 적용 전 운영 값 백업(읽기만) | |

브랜드 대조 결과(11-22, 읽기만): 새 브랜드 130, 기존 브랜드에 이음 15, 파일 안 묶음 1(윤경식ㆍ진민지 → 오늑, 같은 인스타와 사이트),
이름만 같아 **Ted 확인 대기 3: 도깨비 화방, 더트프로젝트(둘 다 sif-2026 출전 브랜드), 다정한 유리(11-22 새로 생김)**. 같다고 하면 그 항목에 `"exhibitorId"`를 적는다.
결정 기록: `docs/decisions/2026-11-19_서울디자인페스티벌-참가브랜드-먼저-인입.md`.

## 11-22 바뀐 순서 (Ted: "어쨋든 코엑스 1층 Hall A라니까 준비해놓고")

장소는 코엑스 1층 A홀로 정해져 있어요. 배치도를 기다리지 않고 **행사 행과 브랜드 참가를 먼저 올려요**(4, 5, 6단계를 지금).
- 브랜드 → 참가 → 부스(나중) 모델(`docs/decisions/2026-11-20_브랜드-대조는-참가-단위.md`)과 같아요.
- 부스가 없는 동안 앱과 웹 목록에는 흐린 "진행 예정"으로 보이고 지도는 열리지 않아요(11-20 결정, UI 20).
- 배치도가 나오면 1, 3, 7, 8단계만 하면 돼요.
- 6단계 기대값(11-22 명단): 참가 사실 새로 145(146곳 중 오늑 묶음 1), 기존에 이음 15, 이름만 같음 3(도깨비 화방, 더트프로젝트, 다정한 유리, 새 브랜드로 만들고 연결 확인 후보로 올라가요), 오류 0.
- 행사 소개와 안내 문구는 `roam-brand-review` 통과(11-22). 주차 문장 하나는 추측을 덜어 고쳤어요.

## 0. 배치도 올라왔는지 보기

```bash
npm run sdf:watch            # 찾으면 주소와 종료 코드 0, 없으면 "아직 없음"과 2
```

- 2025는 개막 5일 전(11-07) 소식 글 "[SDF2025] 서울디자인페스티벌 부스배치도"로 올라왔다. 올해는 11-21 무렵일 거라는 가설.
- 배치도를 받아 외장 디스크 `작업 폴더/Roam/`의 이 행사 폴더에 둔다. 홀이 A홀 하나인지 먼저 본다.
- 같은 날 명단도 다시 받는다(참가 브랜드가 늘었을 수 있다). 2단계 참고.
- 참고용 2025 배치도(C홀이라 좌표로 쓰지 않는다): 가로 `https://seoul.designfestival.co.kr/wp-content/uploads/sdf-editorial/3655e9bb46cace59c3ba8e31.jpg`

## 1. Figma 부스 예시 (박람회 부스 지도 표준, 11-16)

Figma 파일 `npAUFE6TgSXJsH7zc5K4Hu` "지도" 페이지, 코엑스 섹션의 "지도 모양" A홀을 복제해 **"부스 예시: 서울디자인페스티벌 2026"** 섹션을 만든다.
본보기는 코엑스 C홀 서울일러스트레이션페어 `3082:3145`(4px=1m `3082:3146`, 16px=1m `3082:4142`).

- 공식 배치도를 40%로 겹쳐 맞춘다. 레이어 이름 "확인용, 서비스 제외: SDF2026 배치도", 잠금. 서비스에는 넣지 않는다.
- 벽 쪽 부스 줄은 벽에 붙인다(틈 0.5m 이하). 가로세로 축척은 따로 맞춘다. 표준부스가 3x3m로 떨어지는지 본다.
- 겹치는 칸 0개. 부스 수와 번호가 원본과 같은지 센다.
- **4px=1m 위치용, 16px=1m 크게 보기** 두 벌.
- "출입구" 표기, 화장실은 아이콘만, A홀에 바로 이어진 것만. 계단 등은 배치도에 있을 때만.
- 부스 칸, 번호, 표식이 지도 위 버튼과 겹치지 않는지 확인한다.
- Ted 확인을 받는다. 이 판의 칸이 그대로 개발로 간다.

## 2. 명단 다시 받기와 대조 (읽기만)

```bash
npm run brands:sdf -- 37 --slug sdf-2026 --out data/brands/sdf-2026.json
git diff --stat data/brands/sdf-2026.json        # 늘거나 바뀐 곳만 본다
npm run intake:dry-run -- data/brands/sdf-2026.json --brands-only-if-missing
```

- 새 "이름만 같음"이 생기면 Ted에게 한 번에 묻는다. 서울디자인스팟이 생기면 생성기가 알아서 뺀다.
- **공개 사진도 같이 받는다**(11-24 Ted). 대표 사진과 작품 사진을 한 브랜드 최대 6장, `public/booths/sdf-2026/<key>_<해시>.webp`로 받고
  `photos` 칸(scope "주최 측 사이트 공개 사진(서울디자인페스티벌 2026)")을 채운다. 있는 파일은 다시 받지 않고, 사이트에서 빠진 사진 파일은 지운다.
  사진을 빼고 명단만 볼 때는 `--no-photos`. 근거 `docs/decisions/2026-11-24_서울디자인페스티벌-공개-사진.md`.
- 사진 파일은 `public/`에 있어 **PR 머지와 배포가 곧 올리기**다. 운영 Storage에 따로 올리지 않는다.
  배포 전에 6단계를 적용해도 칸에는 경로만 들어가고, 배포가 끝나면 사진이 열린다. 순서는 배포 먼저가 깔끔하다.

## 3. 도면 JSON과 FLOORPLANS 등록 (레포 PR, 브랜치 `data/sdf-2026-floorplan`)

1. Figma 4px=1m 판의 부스 칸, 번호, 표식 좌표를 `src/lib/floorplan-sdf-2026.json`으로 옮긴다.
   `"venue": "coex-hall-a"`, `unitsPerMeter` 20(A홀 규약), 모양은 `floorplan-sif.json`과 같다(`hallOrigin`, `width`, `height`, `booths[{code,x,y,w,h}]`).
   그림에서 칸을 뽑을 때는 `node scripts/floorplan-from-image.mjs <배치도> <out.json>`(번호와 이름은 사람이 옮겨 적는다), 겹침은 `scripts/deoverlap-floorplan.ts`.
2. A홀 출입구와 화장실이 배치도로 확인되면 `src/lib/venues/coex-hall-a.json`의 `gates`, `decor`에 넣는다(다음 A홀 행사가 물려받는다). 모르면 비운다.
3. `src/lib/floorplans.ts`: `import sdf2026 from "@/lib/floorplan-sdf-2026.json";`, `VENUE_OF`에 `"sdf-2026": VENUES[(sdf2026 as { venue: string }).venue]`, `FLOORPLANS`에 `"sdf-2026": compose(sdf2026)`.
4. `src/lib/floorplan-sdf-2026.test.ts`: 부스 수가 배치도와 같다, 인입 파일의 모든 번호가 도면에 있다(`floorplan-ddp-designfair.test.ts` 모양).
5. `data/exhibitions/sdf-2026.json`의 `mapWidth`, `mapHeight`를 도면 `width`, `height`로 맞춘다(지금 2880x1440은 A홀 실측 임시값).
6. 확인: `npx tsc --noEmit`, `npx vitest run`(map-markers 겹침 0 포함), `npx eslint <바꾼 파일>`. PR을 머지하고 **배포가 끝난 뒤** 8단계로 간다.
   운영 `/api/admin/intake`는 배포된 코드의 FLOORPLANS로 좌표를 댄다. 배포 전에 부스를 올리면 전부 0,0에 놓인다.

## 4. 백업 (읽기만, Ted)

```bash
npm run intake:backup -- sdf-2026 --label before-upload
```

`data/intake/_backup/sdf-2026-before-upload-<시각>.json`(gitignore)에 행사 행, 그 행사 부스, 브랜드 그래프 전체, 프로필 칸 전체가 남는다.
11-19 시험: 행사 없음, 부스 0, 프로필 칸 597, 브랜드 2513, 참가 2595, 부스 연결 2391, 후보 33.

## 5. 행사 행 만들기 (운영 쓰기, Ted)

```bash
npm run intake:dry-run -- data/exhibitions/sdf-2026.json   # "형식 통과, 새로 만들어요"를 본다
```

`/admin/intake`에 `data/exhibitions/sdf-2026.json`을 올린다. 미리보기에 "새로 만들어요"와 slug `sdf-2026`, 이름, 장소,
날짜, 안내 문구가 파일대로 나오는지 보고 "적용"을 누른다. 형식이 틀리면 틀린 칸이 뜨고 아무것도 보내지 않는다.
같은 slug가 이미 있으면 "이미 있어요(<id>)"가 뜨고 적용 버튼이 막힌다(덮어쓰지 않는다).
개발자 도구 콘솔에 `fetch`를 붙여 넣는 방법은 쓰지 않는다(2026-11-22).

같은 dry-run을 다시 돌려 "이미 있어요(<id>)"가 나오는지 본다.

## 6. 브랜드 미리보기와 적용 (운영 쓰기, Ted)

```bash
npm run intake:dry-run -- data/brands/sdf-2026.json --json /tmp/sdf-2026-brands-plan.json
```

- **11-24 사진 받은 뒤(지금 할 차례)**: 참가 사실 145곳은 이미 올라가 있어 이번에 채울 칸은 거의 `photos`다. 사진 칸이 비어 있는 브랜드만 채우고,
  사진 칸이 이미 있는 브랜드(레드이어스클럽)는 "이미 있어 둠"으로 덮지 않는다. 기존 소개(intro)도 덮지 않는다.
  11-24 드라이런(읽기만): 151곳 → 새 브랜드 5(나인파이브, 다숲 × 도도리, 이승재, 이우연, 아름다운가게), 이음 145, 파일 안 묶음 1(오늑),
  참가 사실 새로 5, 채울 칸 153(사진 145곳, 소개 5, 링크 3), 이름만 같음 0, 오류 0, 경고 0.
- 순서: ① 이 PR 머지 → ② Vercel 배포 끝남 확인(`curl -sI https://roam.ai.kr/booths/sdf-2026/sdf-20153_2b19ceec.webp`가 200인지)
  → ③ `npm run intake:backup -- sdf-2026 --label before-photos` → ④ 위 드라이런 → ⑤ `/admin/intake`에 파일을 올려 미리보기를 보고 적용
  → ⑥ 같은 드라이런을 다시 돌려 채울 칸 0을 확인.

- 기대값: 참가 사실 새로 139(140곳 중 오늑 묶음 1), 이음 15, 이름만 같음 2(Ted 답에 따라 0), 오류 0.
- 맞으면 `/admin/intake`에 `data/brands/sdf-2026.json`을 올려 미리보기를 한 번 더 보고 적용한다.

## 7. 부스 인입 파일 만들기 (레포, 3단계 PR에 같이)

`data/intake/sdf-2026.json`(intake.v1). 부스마다:

- `code`: 배치도 부스 번호. `name`: **brands.v1의 `name`과 같은 글자**로 적는다. 같은 행사의 부스 없는 참가 사실과 이름이 같으면 그 브랜드에 이어진다(`docs/decisions/2026-11-10_브랜드-먼저-인입.md`). 인스타가 있으면 `instagramUrl`도 같은 값으로.
- `category`, `categorySlug`(`sdf-` 앞붙임, 명시), `categoryColor`(배치도 구역 색). 분류는 brands.v1의 구역(디자인&크래프트 무브먼트 등)을 쓴다.
- 배치도에만 있고 명단에 없는 부스는 이름을 배치도대로 적는다(새 브랜드가 된다). 라운지, 무대 등은 `kind: "facility"`.
- 소개(`description`, `longDescription`)는 넣지 않는다. 소개는 브랜드 프로필 칸이 원천이다.
- `images`: brands.v1 같은 브랜드의 `photos[].path`를 순서대로 넣는다. 부스 상세는 부스 사진(`booth.images`)을 읽기 때문이다(새해 준비상점 인입 파일과 같은 방식).

## 8. 부스 미리보기와 적용 (운영 쓰기, Ted, 3단계 배포 뒤)

```bash
npm run intake:dry-run -- data/intake/sdf-2026.json --json /tmp/sdf-2026-booths-plan.json
```

- 기대값: 새로 = 배치도 부스 수, 충돌 0, 오류 0, **도면에 없는 번호 0**.
- `/admin/intake`에 올려 미리보기(creates, conflicts, warnings 0)를 보고 적용한다. 결과의 `exhibitors.linked`가 brands.v1 참가 사실에 이어진 수다.
- 이어지지 않은 부스는 `/admin/verify/brands`, `/admin/brands/links`에서 사람이 본다.

## 9. 확인

- 웹: `https://roam.ai.kr/exhibitions/sdf-2026`(홈), `/exhibitions/sdf-2026/map`(처음 열면 전체, 부스 칸, 출입구, 화장실 겹침 없음), 부스 몇 곳의 상세.
- API: `curl -s https://roam.ai.kr/api/exhibitions/sdf-2026/floorplan | head -c 300`(부스 좌표가 0,0이 아닌지).
- iOS: 박람회 목록에 "제25회 서울디자인페스티벌"이 보이고, 지도가 열리고, 부스를 누르면 상세가 뜨는지(iOS는 같은 API를 원격으로 쓴다).
- 브랜드: `/admin/brands`에서 sdf-2026 출전이 140곳 근처로 잡히는지, 영 디자이너 프로모션은 참가 사실 `metadata.participationType`으로 갈리는지.
- 행사 소개와 안내 문구가 앱에 보이니 올리기 전에 `roam-brand-review`를 거친다(Roam-design 헤더).

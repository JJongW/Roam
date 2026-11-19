# 문구전 2026 겨울 — 행사, 브랜드 242곳, 허락 사진 올리기 (Ted가 돌린다)

_2026-11-19 준비. 행사 2026-12-19(토)~20(일), 킨텍스 제2전시장 6홀, slug `moongu-2026-winter`, 주최 코믹월드._
_Ted 결정(11-19): 아티클 사진은 카드뉴스용으로 허락받은 사진을 쓴다, 겨울 문구전부터. 새해준비상점과 같이 "배치도가 곧 나오겠지. 우선 브랜드부터 저장해 놓는 거잖아" → 행사 행과 브랜드를 지금 올리고, 부스는 배치도가 나오면 붙인다._
_점검 기록: `docs/decisions/2026-11-19_문구전-2026-겨울-데이터-점검과-허락사진.md`._

**자동으로 돌지 않는다.** 워커, cron, launchd에 넣지 않는다. 운영 쓰기(2, 3, 5단계)는 Ted가 한다.
모든 명령은 Roam 레포 루트에서 돌린다. `.env`는 스크립트가 읽고 값은 찍지 않는다. 5단계는 외장 디스크 One Touch가 꽂혀 있어야 한다.

**지도 상태**: 부스가 없으니 지도는 비어 있다. 새해준비상점(운영 브랜드 235곳, 지도 없음)과 같은 상태다.

## 미리 준비된 것

| 파일 | 내용 |
|---|---|
| `data/exhibitions/moongu-2026-winter.json` | 행사 행 본문. 형식 통과, 브랜드 규칙 검토 통과(11-19) |
| `data/brands/moongu-2026-winter.json` | brands.v1 242곳(공식 확정 부스번호 목록). 허락 7곳은 `exhibitorId`로 운영 브랜드에 고정 |
| `data/booths/moongu-2026-winter.json` | 브랜드별 공식 부스 번호, 요일(부스컷 있는 152팀만), 부스컷 주소, 같은 번호를 나눠 쓰는 이름. 배치도가 나오면 intake.v1에 쓴다 |
| `data/brand-photos/moongu-2026-winter.json` | 허락 7팀 사진 35장의 경로, sha256, 고른 사진 28장, 허락 근거 |
| `data/brands/moongu-artists-2026-winter.json` | 11-10의 7곳 파일(이미 운영에 들어감). 이번엔 쓰지 않는다 |

명단 다시 받기(공개 페이지 두 장, 1초 간격): 
```bash
npm run brands:comicw -- 36 --slug moongu-2026-winter --out data/brands/moongu-2026-winter.json --booths data/booths/moongu-2026-winter.json \
  --instagram-csv ../Roam-design/docs/content/engine/runs/moongu-2026-winter/permissions.csv --photos data/brand-photos/moongu-2026-winter.json
git diff --stat data/brands/moongu-2026-winter.json data/booths/moongu-2026-winter.json
```

## 0. 이름만 같은 8곳 정하기 (레포, Ted 확인)

11-19 대조(`npm run intake:dry-run -- data/brands/moongu-2026-winter.json --brands-only-if-missing`): 새 브랜드 235, 이음 7, 파일 안 묶음 0, **이름만 같음 8**.
같은 브랜드라고 하면 그 항목에 `"exhibitorId"`를 적는다. 아니면 그대로 두면 새 브랜드가 된다.

| 파일 열쇠 | 이름 | 운영 브랜드 | 그 브랜드가 나온 행사, 인스타 |
|---|---|---|---|
| moongu-2026-winter-ca07-54f555 | 스튜디오 니모 | exr_1vweopymmupq9q25 | sif-2026, @illust_nimo |
| moongu-2026-winter-cd09-c65eca | 아리웍스 | exr_zu7as4k2mupq9q24 | sif-2026, @_ariworks |
| moongu-2026-winter-ce03-af2cea | 흰종이에달이스치운다 | exr_v4nzrhasmupq9q24 | sif-2026, @fullmoon_9515 |
| moongu-2026-winter-cf13-66b651 | 숲 공방 | exr_w4dnybl6mwa3huon | newyear-store-2026, 없음 |
| moongu-2026-winter-g3877 | 숨숨랜드 | exr_uis2qm3nmwa3huom | newyear-store-2026, 없음 |
| moongu-2026-winter-g3632 | 리본냥 | exr_zkqkzurzmwa3huom | newyear-store-2026, 없음 |
| moongu-2026-winter-g3756 | 카페피피차차 | exr_ichyzvwgmupq9q24 | sif-2026, 인스타 주소가 계정 없이 `instagram.com/` |
| moongu-2026-winter-ct03-ff0532 | 말랑앤뚠뚠 | exr_96vo3v7lmupq9q25 | sif-2026, @mallangxttunttun |

## 1. 백업 (읽기만)

```bash
npm run intake:backup -- moongu-2026-winter --label before-fair
```

## 2. 행사 행 만들기 (운영 쓰기, Ted)

```bash
npm run intake:dry-run -- data/exhibitions/moongu-2026-winter.json   # "형식 통과, 운영에 아직 없어요"
```

어드민 행사 만들기 화면은 한글 이름에서 slug를 만들어 `moongu-2026-winter`가 안 된다. 로그인된 `https://roam.ai.kr/admin` 탭 개발자 도구 콘솔에서:

```js
await fetch("/api/exhibitions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(/* data/exhibitions/moongu-2026-winter.json 내용 */) }).then((r) => r.json());
```

같은 dry-run을 다시 돌려 "이미 있어요(<id>)"를 본다. `mapWidth`, `mapHeight` 1214x1806은 6홀 CAD(60.7x90.3m)를 1m=20으로 환산한 임시값이다.

## 3. 브랜드 242곳과 참가 사실 (운영 쓰기, Ted)

```bash
npm run intake:dry-run -- data/brands/moongu-2026-winter.json --json /tmp/moongu-brands-plan.json
```

- 기대값: 참가 사실 새로 242, 이음 7(0단계에서 적은 만큼 더), 이름만 같음 8(0단계 뒤 0), 오류 0.
- 맞으면 `/admin/intake`에 `data/brands/moongu-2026-winter.json`을 올려 미리보기를 한 번 더 보고 적용한다.

## 4. 확인 (읽기만)

```bash
npm run fair:audit -- --match moongu --brands data/brands/moongu-2026-winter.json
```

기대값: 행사 1개, 참가 242, 브랜드 242, 부스 0, 도면 없음, 파일 브랜드 242곳 모두 있음.

## 5. 허락 7팀 사진과 허락 기록 (운영 쓰기, Ted)

사진을 바꾸려면 먼저 `data/brand-photos/moongu-2026-winter.json`의 `use`를 고친다. 기본값:
- 안 씀: 트윙클타임 3장(휴대폰 화면 캡처), 짧은 변 600px 아래 4장(별빛다움 3, 슈미 1)
- 첫 장이 대표 사진이다. 사진 칸은 20장까지
- 8,000,000바이트를 넘는 원본(고토 PNG 2장)은 올릴 때 긴 변 2400px, JPEG 품질 85로 줄인다(macOS `sips`, 임시 폴더). 디스크 원본은 건드리지 않는다

```bash
npm run brand-photos -- --manifest data/brand-photos/moongu-2026-winter.json            # 드라이런: 사진 칸 fill 6, 허락 write 7, 오류 0
npm run brand-photos -- --manifest data/brand-photos/moongu-2026-winter.json --apply    # "moongu-2026-winter"를 입력해야 진행
npm run brand-photos -- --manifest data/brand-photos/moongu-2026-winter.json            # 다시: 전부 same
```

- 드라이런도 그 브랜드들의 프로필 칸과 허락 행을 `data/intake/_backup/brand-photos-…json`에 뜬다.
- 처음 돌 때 공개 버킷 `brand-photos`를 만든다. 열쇠 `moongu-2026-winter/<브랜드 id>/<원본 sha256 앞 16자>.<확장자>`, 덮지 않는다.
- 사진 칸은 비어 있을 때만 `reviewed`로 쓴다. 허락은 행이 없거나 not-sent일 때만 granted, sent-photo, 2026-11-03으로 쓰고 VOC 한 줄을 남긴다. 다르면 conflict로 건너뛴다.
- 아티클이 사진을 쓰려면 사진 필수 커밋 `7b9d01c`가 main에 들어가고 운영 `article.hero` 칸이 생겨야 한다(점검 기록 "주의").

## 6. 배치도가 나오면 (부스)

```bash
npm run floorplan:watch -- moongu      # 찾으면 0, 아직이면 2. newyear, sdf도 같은 명령으로 본다
```

1. 공식 배치도 그림을 외장 디스크 `작업 폴더/Roam/reference/fairs/moongu-2026-winter/`에 둔다. 명단도 다시 받는다(위 `brands:comicw`).
2. Figma `npAUFE6TgSXJsH7zc5K4Hu` "지도" 페이지 킨텍스 섹션 `2519:622`의 "지도 모양: 6홀"을 복제해 "부스 예시: 문구전 2026 겨울"을 4px=1m, 16px=1m 두 벌로 그린다(박람회 부스 지도 표준). 문구C는 90x75cm 테이블, 문구B는 2x2m.
3. 레포: `src/lib/venues/kintex-2-hall-6.json`, `src/lib/floorplan-moongu-2026-winter.json`, FLOORPLANS 등록, 부스 수 테스트. 배포가 끝난 뒤 부스를 올린다.
4. `data/intake/moongu-2026-winter.json`(intake.v1)을 `data/booths/moongu-2026-winter.json`의 번호로 만든다. 부스 `name`은 brands.v1 `name`과 같은 글자로 적어 참가 사실에 잇는다.
5. `npm run intake:backup -- moongu-2026-winter --label before-booths`, `npm run intake:dry-run -- data/intake/moongu-2026-winter.json`, `/admin/intake`.

## 되돌리기

- 사진 칸: 백업 파일의 그 브랜드 `photos` 값으로 `/admin/brands`에서 되돌리거나 칸을 지운다.
- 허락: 백업에 행이 없었으면 연락 보드에서 상태를 되돌린다. VOC 줄은 쌓기만 하므로 지우지 않는다.
- Storage: `brand-photos/moongu-2026-winter/` 아래를 대시보드에서 지운다. 칸이 그 주소를 가리키는 동안은 지우지 않는다.
- 브랜드와 참가: 되돌리기 버튼이 없다. 1단계 백업과 `intake:backup` 파일을 근거로 손으로 지운다.

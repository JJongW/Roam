# House Archive 갤러리 이미지 수집 — 진행 현황 및 인계 (2026-08-11)

> 세션이 끊겨도 이 문서 하나로 재개할 수 있도록 정리. 작업 재개 시 이 파일부터 읽을 것.

## 지금 하는 일이 정확히 뭔지

부스 상세페이지의 **표지 이미지(`image`, 단수)는 99곳 전부 이미 있음** (기존 완료 작업,
`public/booths/house-archive/{CODE}.webp`). **지금 수집 중인 건 별도의 갤러리
(`images`, 배열, 부스당 최대 3장)** — 상세페이지에서 표지 외에 추가로 넘겨볼 수 있는 사진들.

파일럿 8곳만 완료된 상태:
`C01, E09, H01, H02, M01, T01, T05, T10` → `booth.images` (jsonb) 컬럼,
migration `supabase/migrations/0034_house_archive_gallery_pilot.sql`.

나머지 **91곳**이 이번 확장 대상. 그중 텍스트(요약/로미 해석) 보강은 거의 다 끝났고
(`src/lib/booth/enrichment-house-archive-2026.json` 직접 수정, 아직 migration 미작성 —
아래 "남은 일 ②" 참고), **이미지만 수집 중**.

## 파일 위치 (전부 이번에 챙겨 넣음)

- **원본 스크린샷(가공 전)**: `tmp/house-archive-raw-images/{CODE}-{n}-설명.jpg`
  - 지금까지 수집된 것: C02(3장), C03(3장), C04(2장 사용 + 1장 REJECTED), C05(2장)
  - 파일명에 `REJECTED`가 들어간 건 품질 미달로 버린 후보 — 처리 스크립트가 자동으로 건너뜀
- **가공 스크립트(신규 작성, 이번에 처음 파일로 저장함)**:
  `scripts/process-house-archive-gallery-images.py`
  - 여백 트림 → 정중앙 정사각 크롭 → 480×480 리사이즈 → webp(q=78) 저장
  - `public/booths/house-archive/{CODE}-{1,2,3}.webp` 로 출력
  - 사용법: `python3 scripts/process-house-archive-gallery-images.py` (전체) 또는
    `python3 scripts/process-house-archive-gallery-images.py C02 C03` (일부만)
  - ⚠️ Pillow 필요: `pip install Pillow --break-system-packages`
  - ⚠️ 이 스크립트는 웹피 변환까지만 함. JSON `images` 필드 갱신, migration 작성은 별도(수동 or 후속 스크립트).

## 수집 방식 (인스타그램에서 이미지 뽑는 법)

Chrome MCP(`mcp__claude-in-chrome__*`)로 진행. 브랜드 계정 프로필 → 게시물 중 제품/부스 사진
느낌 나는 것 최대 3개 선정 → 각 게시물에서:

1. `https://www.instagram.com/p/{shortcode}/embed/captioned/` 로 이동
2. `javascript_tool`로 `window.location.href = document.querySelector('img.EmbeddedMediaImage').src; 'ok'`
   실행 (원본 CDN URL을 텍스트로 직접 반환하면 쿠키/쿼리스트링 차단에 걸림 → 리다이렉트로 우회)
3. **반드시 단독 호출**(browser_batch에 넣지 말 것)로 `computer` 스크린샷,
   `save_to_disk: true` — 배치 안에 넣으면 저장이 씹히는 경우가 있었음
4. `navigate`+`javascript_tool` 두 액션은 `browser_batch`로 묶어도 됨 (왕복 절약)

프로필의 게시물 링크 목록이 필요하면:
`Array.from(document.querySelectorAll('a[href*="/p/"]')).map(a=>a.getAttribute('href'))` —
결과를 `JSON.stringify(...)`로 감싸서 반환할 것 (안 감싸면 일부 shortcode가
`[BLOCKED: Base64 encoded data]` 오탐에 걸림).

## 진행 상황 (부스별)

### C존 (14곳) — task #128, in_progress
| 코드 | 상태 |
|---|---|
| C02 | ✅ 원본 3장 확보 (mockup, 하프오일, mockup 재촬영) |
| C03 | ✅ 원본 3장 확보 (teapot, acrylic shelf, flower vase) |
| C04 | ✅ 원본 2장 확보 (product collage, felt recipe book) — 3번째 후보(달력)는 반려 |
| C05 | 🟡 원본 2장 확보 (donut box, open-toe socks) — 3번째 추가 여지 있으나 2장으로도 충분 |
| C06~C15 | ⬜ 미착수 (계정 핸들은 아래 목록 참고) |

### 나머지 존 — 전부 미착수 (계정 핸들만 확보됨)
- E존 (12곳, task #129)
- G존 (14곳, task #130)
- H03~H05, M02~M13 (15곳, task #131)
- R존 (13곳, task #132)
- T존 T02~T26 중 T01/T05/T10 제외 23곳 (task #133)

## 인스타그램 계정 핸들 (전체, 이미 조사 완료 — 재조사 불필요)

### C존 (C02~C15)
```
C02 thepublisher_official   C03 lifeandcollect        C04 flopy.seoul
C05 donutvinylshop          C06 othcomma               C07 sooparklinglemonade
C08 soobong_moonbang9       C09 ofcoh.official         C10 sayoo.kr
C11 questioners.official    C12 moonybunny.official    C13 beond_kr
C14 nuthanks                C15 turtleneck_press
```

### E존 (E01~E13)
```
E01 sundayplanet47   E02 damcho_o          E03 namuisland_official
E04 pleinegarden     E05 staylost.kr       E06 mcraft1987
E07 asobne           E08 lg_tiiun_official E09 4t___official (완료)
E10 lowlit.co         E11 hacedora_studio   E12 revapor.official
E13 coco_locker
```

### G존 (G01~G14)
```
G01 lifezip_store    G02 soroishop         G03 commons.apt
G04 oopartsgirls     G05 make.a.pottery    G06 bommaum_official
G07 yalla_kr          G08 memelt_dessert    G09 keedle.official
G10 momo__sotbat      G11 farm_nevertheless G12 smitstainless
G13 mwm_seoul         G14 mangrove.city
```

### H+M존 (H03~H05, M02~M13)
```
H03 azikazinmagicworld   H04 motif.1            H05 sharon_loves_bigmac
M02 shunyoon             M03 libere_nuage        M04 azikazinmagicworld
M05 day_off_project      M06 coverseoul.official M07 nelna.shop
M08 pack_n_fold          M09 pebble_on           M10 dandanlife_
M11 heedagarden          M12 fefehaus            M13 kkayomi.studio
```

### R존 (R01~R13)
```
R01 bokbokbok_seoul      R02 nicetomeetme.kr     R03 kindofsummer_official
R04 ngt_kr               R05 oksan.100           R06 reje.official
R07 moolsoo.official     R08 bubuti_official     R09 habitus.kr
R10 sansae_kr            R11 soopui_basewear     R12 talo.ryyppy
R13 beaurit_official
```

### T존 (T02~T26, T01/T05/T10 제외)
```
T02 ourhourourhour   T03 naroe.official    T04 a_0.zip
T06 ctrl_a_visual    T07 e1e_studio        T08 karangkarang__
T09 t4hm.turf         T11 bysoonsim         T12 mmungjju
T13 godongsang        T14 cong_cafe         T15 hey.lazysoo
T16 sewing._.us       T17 pil.hwa           T18 nijiboku
T19 kiwoomaru          T20 studio_padonamu   T21 ssub.official
T22 likid_design       T23 ppi_kan           T24 hamsoosee_note
T25 billybeanmillim    T26 mal_in.ko
```

## 남은 일 (순서대로)

1. **① 이미지 수집 계속** (task #128~#133) — C06부터 순서대로, 부스당 최대 3장
   (2장이어도 무방, 억지로 3장 채우지 않기). 원본은 매번
   `tmp/house-archive-raw-images/{CODE}-{n}-설명.jpg` 로 저장.
2. **② 텍스트 보강분 migration 작성** (task #127) — 이번 세션 전에 이미 끝난 작업.
   `enrichment-house-archive-2026.json`의 summary/roamInterpretation 등을 갱신했지만
   Supabase `booth_enrichment` 테이블에는 아직 반영 안 됨 → 신규 migration 필요.
3. **③ 전체 이미지 일괄 처리** (task #126/#134) — 수집이 끝나면
   `python3 scripts/process-house-archive-gallery-images.py` 실행 →
   `public/booths/house-archive/{CODE}-{1,2,3}.webp` 생성.
4. **④ JSON `images` 필드 갱신** — 처리된 파일 기준으로 91개 부스 각각의
   `images` 배열을 enrichment JSON에 추가 (파일럿 8곳과 동일한 패턴).
5. **⑤ migration 작성** — `0034` 패턴 그대로, `booth.images` 컬럼에
   91개 부스 UPDATE (VALUES 리스트, **마지막 행 콤마 금지** — 0034에서 한번 겪은 버그).
6. **⑥ 검증** — `npx tsc --noEmit`, JSON 유효성, 이미지 파일 존재 여부,
   migration 문법(괄호 짝, 따옴표 짝) 확인.

## 참고

- Task 목록은 Claude 세션 내 TaskList로 추적 중 (#126~#134). 새 세션에서도 TaskList 호출하면
  그대로 이어받을 수 있음.
- `git status`가 lock 경고를 내는 경우가 있었음(다른 프로세스가 동시에 git 사용 중으로 추정) —
  이 작업 중엔 git 쓰기 명령은 실행하지 않음, 커밋은 사용자가 직접.

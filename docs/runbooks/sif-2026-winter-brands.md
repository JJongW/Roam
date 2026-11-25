# 서울일러스트레이션페어V.22 브랜드 먼저 올리기

_2026-11-20 준비. 행사 2026-12-24(목)~27(일) 10:00~18:00, 코엑스 C홀, 주최 오씨메이커스, slug `sif-2026-winter`._
_Ted 결정(11-20): "브랜드 먼저 넣어". 부스와 배치도는 공개되면 그때 넣는다(서울디자인페스티벌, 문구전, 새해준비상점과 같은 방식)._

운영 DB 쓰기(3, 5단계)는 Ted가 한다. 나머지는 읽기만 한다. 명령은 Roam 레포 루트(main, 이 PR 머지 뒤)에서 돌린다.
`.env`는 스크립트가 알아서 읽고 값은 찍지 않는다.

## 미리 준비된 것

| 파일 | 내용 |
|---|---|
| `data/exhibitions/sif-2026-winter.json` | 행사 행 본문(`POST /api/exhibitions`). `mapWidth`, `mapHeight`는 V.21 C홀 도면 값(임시) |
| `data/brands/sif-2026-winter.json` | brands.v1 882곳. 새 참가 561, V.21과 같은 작가 318(인스타, 웹, 소개를 이어 적음), 같은 이름이지만 다른 작가 3 |
| `data/brands/_sif-2026-winter-held.tsv` | 링크 모음 주소 때문에 뺀 82곳과 이유 |
| `data/brands/_sif-2026-winter-dropped-intros.tsv` | V.21 소개 중 지난 회차 부스 번호, 날짜, 회차 표기가 있어 비운 101곳(원문과 걸린 표기) |
| `scripts/brands-from-sif.ts` | 명단 TSV + 프로필 대조 → brands.v1 (`npm run brands:sif`) |

명단 964줄 = 파일 882 + 보류 82.

- V.21에서 잇는 소개 중 "서일페 D40", "7/30~8/2", "7월", "V.21"처럼 지난 회차 부스 번호, 날짜, 회차 표기가 있는 101곳은 비웠다(11-20 Ted).
  작가 원문이라 고쳐 쓰지 않고(가운뎃점 포함) 통째로 뺀다. 남은 소개는 181곳. 생성할 때 `--dropped-intros`로 비운 목록을 뽑아 눈으로 훑는다.

- 오크레오 프로필 대조(`profile-check-2026-11-20.tsv`, 11-20): 같은 작가 102, 다른 작가 3. 이 판정을 반영했다.
- **같은 이름 카드 둘**: "결", "이륙"은 오크레오에 같은 이름 작가가 둘이라 명단에 두 번 나온다. 한 줄은 V.21 작가, 한 줄은 다른 작가라
  두 브랜드로 따로 넣었다. 파일 키는 `sif22-<이름>-<오크레오 프로필 id>`. 이름만 같은 단독 이름은 `sif22-<이름>`.
- "이니룸"은 V.21 리틀타이니룸과 다른 작가라 새 브랜드다.
- 보류 82곳은 V.21 링크가 링크 모음 서비스(link.inpock.co.kr, instabio.cc, grafolio, marpple, threads 등)라 신원 키가 다른 작가와 뭉치는 곳이다
  (같은 이름 56, 프로필 대조로 같은 작가 26). `lib/exhibitor/identity.ts`가 이 서비스들을 계정 단위로 나누지 못해 V.21 백필이 서로 다른 작가를
  브랜드 하나로 묶는다(mock 재현: "러브미모어" 아래 V.21 부스 27곳). 이으면 V.22 작가도 남의 브랜드에 붙는다.
  Roam #208(identity.ts 계정 단위 판정)이 머지되고 운영 브랜드를 가른 뒤 넣는다(아래 "#208 뒤").

### 확인 대상: 같은 작가인데 인스타가 바뀐 3곳

페어 이력(V.21 같은 부스 코드)으로 같은 작가로 두었다. 인스타는 V.22 프로필 쪽이 최신이라 그걸 적었다(V.21 인스타로 덮지 않음).
V.21 브랜드에는 V.21 웹 주소로 이어진다(mock에서 이음 확인). 기존 브랜드의 링크 칸이 이미 차 있으면 V.22 인스타는 칸에 들어가지 않으니,
적용 뒤 `/admin/brands`에서 그 브랜드 링크를 사람이 고친다.

| V.22 | V.22 프로필 인스타 | V.21 인스타 | V.21 부스 | 잇는 키 |
|---|---|---|---|---|
| 브르 | @13u12u | @baksaesama_ | K53 | linktr.ee/babybrr |
| 서로 | @seoro__d | @seoro_illust | L20 | V.21 웹(구글 드라이브 주소) |
| 히밍 | @heemingraphics | @heemingraphic | P15 | linktr.ee/heemingraphic |

## 1. 백업 (읽기만)

```bash
npm run intake:backup -- sif-2026-winter --label before-brands
```

`data/intake/_backup/sif-2026-winter-before-brands-<시각>.json`(gitignore)에 브랜드 그래프 전체와 프로필 칸 전체가 남는다.

## 2. 미리보기 (읽기만)

```bash
npm run intake:dry-run -- data/exhibitions/sif-2026-winter.json
npm run intake:dry-run -- data/brands/sif-2026-winter.json --brands-only-if-missing --json /tmp/sif-2026-winter-brands-plan.json
```

- 행사 행: "형식 통과, 운영에 아직 없어요".
- 브랜드: 오류 0, 파일 안 묶음 0. mock 기대값은 새 브랜드 569, 기존에 이음 313, 이름만 같음 10.
- **"이음 … → <기존 이름>" 줄에서 기존 이름이 V.22 이름과 다른 곳이 있으면 멈춘다**(운영 V.21 브랜드가 다른 작가와 뭉쳐 있다는 뜻).
- 이름만 같음 중 V.21과 같은 이름으로 본 곳(링크가 없거나 운영 부스에 링크가 없는 곳)은 기존 브랜드가 하나뿐이면 id를 적을 수 있다.

```bash
npm run brands:sif -- --dir ../Roam-design/docs/content/engine/runs/sif-2026-v22 --slug sif-2026-winter --out data/brands/sif-2026-winter.json --held data/brands/_sif-2026-winter-held.tsv --name-matches /tmp/sif-2026-winter-brands-plan.json
npm run intake:dry-run -- data/brands/sif-2026-winter.json --brands-only-if-missing
```

## 3. 행사 행 만들기 (운영 쓰기, Ted)

어드민 행사 만들기 화면은 한글 이름에서 slug를 만들어 `sif-2026-winter`가 안 된다. 로그인된 `https://roam.ai.kr/admin` 탭의 개발자 도구 콘솔에서:

```js
await fetch("/api/exhibitions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(/* data/exhibitions/sif-2026-winter.json 내용 */) }).then((r) => r.json());
```

`npm run intake:dry-run -- data/exhibitions/sif-2026-winter.json`이 "이미 있어요(exh_sif_2026_winter)"로 바뀌는지 본다.

## 4. 브랜드 미리보기 다시 (읽기만)

```bash
npm run intake:dry-run -- data/brands/sif-2026-winter.json --json /tmp/sif-2026-winter-brands-plan.json
```

참가 사실 새로 882(이미 0), 오류 0.

## 5. 적용 (운영 쓰기, Ted)

`/admin/intake`에 `data/brands/sif-2026-winter.json`을 올려 미리보기를 보고 적용한다.

## 6. 확인

```bash
curl -s "https://roam.ai.kr/api/exhibitions?limit=200" | jq '.data.data[] | select(.slug=="sif-2026-winter") | {name, openable, availability}'
npm run intake:dry-run -- data/brands/sif-2026-winter.json   # 다시 돌려 새 브랜드 0, 참가 사실 새로 0
```

- `openable: false`, `availability: "upcoming_no_map"`. 웹 홈과 iOS 목록에 흐린 "진행 예정" 줄로 보인다.
- `/admin/brands/links`에 이름만 같은 참가 후보가 올라온다. 사람이 본다.

## #208 뒤 (보류 82곳 넣기)

#208이 머지되고 운영에서 뭉친 브랜드를 가른 뒤(`docs/runbooks/brand-identity-split.md`, #208), 같은 명령으로 다시 만든다.
생성기의 보류 판정(`v21MergedCodes`)도 identity.ts를 쓰므로 판정이 고쳐지면 82곳이 저절로 파일에 들어간다.

```bash
npm run brands:sif -- --dir ../Roam-design/docs/content/engine/runs/sif-2026-v22 --slug sif-2026-winter --out data/brands/sif-2026-winter.json --held data/brands/_sif-2026-winter-held.tsv --dropped-intros data/brands/_sif-2026-winter-dropped-intros.tsv
npm run intake:dry-run -- data/brands/sif-2026-winter.json --json /tmp/sif-2026-winter-brands-plan.json
```

#208 브랜치 위 mock 미리 계산(11-20): 파일 964곳, 보류 0. 추가분 82곳은 81묶음이 되어 **81곳 모두 V.21 브랜드에 이음, 새 브랜드 0**,
이름이 다른 브랜드에 이어진 곳 0. 1곳은 파일 안에서 묶인다: "융"과 "요즘강아지 덕구"는 같은 작가(@22yyung, V.21 J53과 J26 두 부스)라 한 브랜드다.
전체로는 새 브랜드 569, 이음 394, 참가 963. 이미 올린 882곳은 파일 키로 찾아 다시 만들지 않으니 `/admin/intake`에 같은 파일을 한 번 더 올리면 된다.

## 되돌리기 (운영 쓰기, Ted, Supabase SQL Editor)

되돌리기 버튼은 없다. 먼저 `select`로 수를 보고, 맞으면 같은 조건으로 지운다. 지우기 전에 1단계 백업이 있어야 한다.

```sql
-- 이 인입이 새로 만든 브랜드(파일 키가 남아 있다)
with new_ex as (
  select id from exhibitor
  where exists (select 1 from jsonb_array_elements_text(coalesce(metadata->'brandKeys', '[]'::jsonb)) k where k like 'brands.v1:sif-2026-winter#%')
)
select
  (select count(*) from new_ex) as new_brands,
  (select count(*) from exhibition_participant where exhibition_id = 'exh_sif_2026_winter') as participants,
  (select count(*) from brand_profile_field f where f.exhibitor_id not in (select id from new_ex)
     and (f.sources @> '["https://www.ocreo.kr/fair/sif22"]'::jsonb
          or exists (select 1 from jsonb_array_elements_text(f.sources) s where s like '오크레오 V.21 참가자 프로필%'))) as filled_on_existing;

begin;
-- 기존(V.21) 브랜드에 이 인입이 채운 칸. 빈 칸만 채웠으니 지우면 전과 같다.
delete from brand_profile_field f
where f.exhibitor_id not in (
    select id from exhibitor
    where exists (select 1 from jsonb_array_elements_text(coalesce(metadata->'brandKeys', '[]'::jsonb)) k where k like 'brands.v1:sif-2026-winter#%'))
  and (f.sources @> '["https://www.ocreo.kr/fair/sif22"]'::jsonb
       or exists (select 1 from jsonb_array_elements_text(f.sources) s where s like '오크레오 V.21 참가자 프로필%'));
-- 이 행사 참가 사실(연결 후보와 출전 칸은 cascade로 같이 지워진다)
delete from exhibition_participant where exhibition_id = 'exh_sif_2026_winter';
-- 새로 만든 브랜드(칸은 cascade)
delete from exhibitor
where exists (select 1 from jsonb_array_elements_text(coalesce(metadata->'brandKeys', '[]'::jsonb)) k where k like 'brands.v1:sif-2026-winter#%');
-- 행사 행까지 지우려면
delete from exhibition where id = 'exh_sif_2026_winter';
commit;
```

- 적용 뒤 V.21 브랜드 칸 일부가 stale로 바뀌고 초안 잡이 생긴다(새 출전 뒤처리, `lib/brands/jobs.ts`). 위 SQL은 그걸 되돌리지 않는다.
  필요하면 백업 파일의 `profileFields`에서 그 칸의 `status`를 되살린다.
- 참가 사실에 허락 기록(`participant_permission`)이 붙은 뒤에는 `on delete restrict`로 지우기가 막힌다. 그때는 허락 기록부터 본다.

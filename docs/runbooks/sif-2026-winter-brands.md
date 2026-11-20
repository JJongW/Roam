# 서울일러스트레이션페어V.22 브랜드 먼저 올리기

_2026-11-20 준비. 행사 2026-12-24(목)~27(일) 10:00~18:00, 코엑스 C홀, 주최 오씨메이커스, slug `sif-2026-winter`._
_Ted 결정(11-20): "브랜드 먼저 넣어". 부스와 배치도는 공개되면 그때 넣는다(서울디자인페스티벌, 문구전, 새해준비상점과 같은 방식)._

운영 DB 쓰기(3, 5단계)는 Ted가 한다. 나머지는 읽기만 한다. 명령은 Roam 레포 루트(main, 이 PR 머지 뒤)에서 돌린다.
`.env`는 스크립트가 알아서 읽고 값은 찍지 않는다.

## 미리 준비된 것

| 파일 | 내용 |
|---|---|
| `data/exhibitions/sif-2026-winter.json` | 행사 행 본문(`POST /api/exhibitions`). `mapWidth`, `mapHeight`는 V.21 C홀 도면 값(임시) |
| `data/brands/sif-2026-winter.json` | brands.v1 803곳. 새 참가 561, V.21과 같은 이름 242(인스타, 웹, 소개를 이어 적음) |
| `data/brands/_sif-2026-winter-held.tsv` | 판정을 기다려 뺀 159곳과 이유 |
| `scripts/brands-from-sif.ts` | 명단 TSV → brands.v1 (`npm run brands:sif`) |

명단 964줄 = 파일 803 + 보류 159 + 명단 중복 줄 2(결, 이륙. 오크레오 목록에 같은 분류와 이름으로 두 번 나옴. 하나만 넣었다).

보류 159곳:
- 이름이 두 글자 이하라 확인 필요 96, 비슷한 이름 7: 오크레오 프로필 대조(`profile-check-2026-11-20.tsv`)가 오면 다시 만든다(아래 "대조 결과가 오면").
- V.21 링크가 링크 모음 서비스(link.inpock.co.kr, instabio.cc, grafolio, marpple, threads 등)라 신원 키가 다른 작가와 뭉치는 56곳.
  `lib/exhibitor/identity.ts`가 이 서비스들을 계정 단위로 나누지 못해 V.21 백필이 서로 다른 작가를 브랜드 하나로 묶는다
  (mock 재현: "러브미모어" 아래 V.21 부스 27곳). 이으면 V.22 작가도 남의 브랜드에 붙는다. 신원 판정을 고치고 운영 브랜드를 가른 뒤 넣는다.

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
- 브랜드: 오류 0, 파일 안 묶음 0. mock 기대값은 새 브랜드 566, 기존에 이음 237, 이름만 같음 9.
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

참가 사실 새로 803(이미 0), 오류 0.

## 5. 적용 (운영 쓰기, Ted)

`/admin/intake`에 `data/brands/sif-2026-winter.json`을 올려 미리보기를 보고 적용한다.

## 6. 확인

```bash
curl -s "https://roam.ai.kr/api/exhibitions?limit=200" | jq '.data.data[] | select(.slug=="sif-2026-winter") | {name, openable, availability}'
npm run intake:dry-run -- data/brands/sif-2026-winter.json   # 다시 돌려 새 브랜드 0, 참가 사실 새로 0
```

- `openable: false`, `availability: "upcoming_no_map"`. 웹 홈과 iOS 목록에 흐린 "진행 예정" 줄로 보인다.
- `/admin/brands/links`에 이름만 같은 참가 후보가 올라온다. 사람이 본다.

## 대조 결과가 오면

`profile-check-2026-11-20.tsv`(머리줄 `V22이름`, `판정`. 판정은 같은 작가, 다른 작가, 모름)가 Roam-design 같은 폴더에 생기면:

```bash
npm run brands:sif -- --dir ../Roam-design/docs/content/engine/runs/sif-2026-v22 --slug sif-2026-winter --out data/brands/sif-2026-winter.json --held data/brands/_sif-2026-winter-held.tsv
npm run intake:dry-run -- data/brands/sif-2026-winter.json --json /tmp/sif-2026-winter-brands-plan.json
```

같은 작가는 V.21 링크와 소개를 잇고, 다른 작가는 새 브랜드, 모름은 계속 뺀다. 이미 올린 곳은 파일 키(`sif22-<이름>`)로 찾아 다시 만들지 않으니
같은 파일을 `/admin/intake`에 한 번 더 올리면 새로 들어온 곳만 더해진다.

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

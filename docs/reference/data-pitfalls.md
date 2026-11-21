# 데이터 함정 — "없음"과 "비어 있음", mock과 운영

_CLAUDE.md에서 옮겨 옴(2026-11-21). 규칙 한 줄씩은 CLAUDE.md "데이터 함정"에 남아 있다._

## ⚠️ "없음"과 "비어 있음"을 구별하지 않는 경로들
이 뿌리로 운영 데이터를 실제로 지운 적이 있다.

| 경로 | 거짓말 | 막는 법 |
|---|---|---|
| 좁힌 컬럼 조회 | 안 가져온 컬럼이 **빈 값**으로 채워져 옴 | 목록 조회는 `BoothListItem`(images·longDescription 없음). 전 필드는 `listBoothsFull`·`getBoothDetail` |
| Zod `.partial()` | **`default()`를 안 막는다** — 안 보낸 키가 빈 값으로 생김 | 부분 수정엔 `boothEnrichmentPatchSchema`. `authorInputSchema.partial()` 금지 |
| PostgREST 실패 | 예외가 아니라 `data: null` → `?? []`가 "0건"으로 위장 | 읽기는 `inChunks`(에러 시 throw), 쓰기는 `wrote()`/`loggedWrite()` |
| `head:true` 카운트 | **없는 테이블에도 에러를 안 낸다** | 존재 확인은 `select().limit(1)` |

**규칙**: 저장소가 준 값을 "비었다"로 해석하기 전에, 그 읽기가 그 필드를 정말 가져오는지 구현에서 확인한다.
이름과 타입은 근거가 아니다. `undefined` 필드를 페이로드에서 빼는 건 저장소가 한다(호출부가 아니라).

## ⚠️ mock 통과 ≠ 검증
`MockRepository`는 인터페이스를 흉내내지 **행동**을 흉내내지 않는다.

| | mock | supabase |
|---|---|---|
| 컬럼 좁힘 | supabase처럼 뺀다 | `BOOTH_LIST_COLS`가 `images`·`long_description` 제외 |
| 실패 | throw | `data: null` — `?? []`가 "0건"으로 위장 |
| `.in()` 길이 상한 | 없음 | 있음(914부스 ≈ 7.3KB, 상한 근처) |
| jsonb vs text[] | 구분 없음 | 구분함 |

- **저장소 변경은 운영 dry-run까지 해야 "됐다"**: `.env`(운영 자격증명)로 `npx next dev`를 띄우고 읽기 전용 경로를 태운다.
  mock 강제: `NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= SUPABASE_SERVICE_ROLE_KEY= npx next dev`
- mock의 역할은 테스트 픽스처(라우트 통합 테스트)까지다.

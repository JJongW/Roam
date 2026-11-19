# 문구전 2026 겨울 — 허락 사진과 허락 기록 올리기 (Ted가 돌린다)

_2026-11-19 준비. 행사 2026-12-19(토)~20(일), 킨텍스 제2전시장 6홀, slug `moongu-2026-winter`, 주최 코믹월드._
_Ted 결정(11-19): 아티클 사진은 카드뉴스용으로 허락받은 사진을 쓴다. 겨울 문구전부터. 점검 기록: `docs/decisions/2026-11-19_문구전-2026-겨울-데이터-점검과-허락사진.md`._

**자동으로 돌지 않는다.** 워커, cron, launchd에 넣지 않는다. 운영 쓰기(3, 5, 6단계)는 Ted가 한다.
모든 명령은 Roam 레포 루트에서 돌린다. `.env`는 스크립트가 읽고 값은 찍지 않는다. 외장 디스크 One Touch가 꽂혀 있어야 한다.

## 미리 준비된 것

| 파일 | 내용 |
|---|---|
| `data/brand-photos/moongu-2026-winter.json` | 7팀 사진 35장의 경로, sha256, 크기, `use`(고른 사진), 허락 근거(permissions.csv에서 옮김). 고른 사진 28장 |
| `data/brands/moongu-artists-2026-winter.json` | brands.v1 7곳, `exhibitionSlug: moongu-2026-winter`. 운영 브랜드 7곳에 인스타로 이어짐 |
| `data/exhibitions/moongu-2026-winter.json` | 행사 행 본문. 형식 통과, 운영에 없음 |
| `scripts/brand-photos.ts` | `npm run brand-photos`. 디스크 재기 → 백업 → (적용 때만) 올리기, 사진 칸, 허락 |
| `scripts/fair-audit.ts` | `npm run fair:audit`. 행사, 참가, 부스, 도면, 파일 브랜드 상태(읽기만) |

## 1. 사진 고르기 (레포)

`data/brand-photos/moongu-2026-winter.json`에서 사진마다 `use`를 바꾼다. 기본값:
- 쓰지 않음: 짧은 변이 600px 아래(별빛다움 3, 슈미 1), 트윙클타임 3장(휴대폰 화면 캡처, 상태 표시줄 포함)
- 쓴다: 나머지 28장. 첫 장이 대표 사진(아티클 맨 위)이 된다. 순서를 바꾸려면 배열 순서를 바꾼다
- 잘라 쓰려면 디스크에 잘라 낸 새 파일을 두고 manifest에 그 파일과 해시를 더한다(`shasum -a 256 <파일>`). 원본은 그대로 둔다
- 사진 칸은 20장까지

## 2. 지금 상태 보기 (읽기만)

```bash
npm run fair:audit -- --match moongu --match 문구 --brands data/brands/moongu-artists-2026-winter.json
npm run brand-photos -- --manifest data/brand-photos/moongu-2026-winter.json
```

- 드라이런도 `data/intake/_backup/brand-photos-moongu-2026-winter-dry-run-<시각>.json`에 그 브랜드들의 프로필 칸과 허락 행을 뜬다.
- 기대값(11-19): 6팀 `사진 칸 fill`, 트윙클타임 `none`, 허락 전부 `no-exhibition`, 오류 0.
- 오류가 "해시나 크기가 manifest와 달라요"면 디스크 사진이 바뀐 것이다. 일부러 바꿨다면 manifest를 고친다.

## 3. 사진 칸만 먼저 올리기 (운영 쓰기, Ted, 선택)

행사 행이 없어도 브랜드 사진 칸은 쓸 수 있다. 아티클은 아직 못 쓴다(참가 허락이 없어서).

```bash
npm run brand-photos -- --manifest data/brand-photos/moongu-2026-winter.json --apply
# "moongu-2026-winter"를 그대로 입력해야 진행된다
```

- 처음 돌 때 공개 버킷 `brand-photos`를 만든다(이미 있으면 그대로).
- 열쇠는 `moongu-2026-winter/<브랜드 id>/<sha256 앞 16자>.<확장자>`. 덮지 않는다.
- 사진 칸은 비어 있을 때만 `reviewed`로 쓴다. 다른 값이 있으면 `conflict`로 건너뛴다.

## 4. 행사 행과 참가 사실 (운영 쓰기, Ted, 시점 미정)

언제 할지는 Ted가 정한다(점검 기록 "Ted가 정할 것" 첫 줄). 서울디자인페스티벌처럼 배치도와 함께 하면 4~5단계를 그날 한다.

```bash
npm run intake:dry-run -- data/exhibitions/moongu-2026-winter.json   # "형식 통과, 운영에 아직 없어요"
```

로그인된 `https://roam.ai.kr/admin` 탭 개발자 도구 콘솔에서:

```js
await fetch("/api/exhibitions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(/* data/exhibitions/moongu-2026-winter.json 내용 */) }).then((r) => r.json());
```

그다음 참가 사실:

```bash
npm run intake:backup -- moongu-2026-winter --label before-brands
npm run intake:dry-run -- data/brands/moongu-artists-2026-winter.json   # 기대값: 이음 7, 참가 사실 새로 7, 오류 0
```

맞으면 `/admin/intake`에 같은 파일을 올려 미리보기를 보고 적용한다.

## 5. 허락 기록 (운영 쓰기, Ted, 4단계 뒤)

```bash
npm run brand-photos -- --manifest data/brand-photos/moongu-2026-winter.json            # 허락 write 7, 사진 칸 same 6
npm run brand-photos -- --manifest data/brand-photos/moongu-2026-winter.json --apply
```

- `participant_permission`에 status `granted`, allowedUse `sent-photo`, sentAt `2026-11-03`, 답장 요약, 사진 위치를 쓴다(permissions.csv에서 옮김). 이미 다른 상태가 있으면 `conflict`로 건너뛴다.
- `brand_outreach_log`에 허락 한 줄(inbound, permission)을 남긴다.
- 3단계를 건너뛰었다면 이번에 사진도 같이 올라간다.

## 6. 확인

```bash
npm run brand-photos -- --manifest data/brand-photos/moongu-2026-winter.json   # 전부 same, "아티클에 쓸 수 있게 됨" 표시
npm run fair:audit -- --match moongu --brands data/brands/moongu-artists-2026-winter.json
```

- 아티클이 사진을 쓰려면 PR #182 뒤 커밋 `7b9d01c`(사진 필수)가 main에 들어가고 운영에 `article.hero` 칸이 있어야 한다(지금 둘 다 없음, 점검 기록 "주의").
- 목 저장소 기대값(11-19 드라이런): 브랜드 소개 5편(별빛다움, Odd Tail, MUNIL, 구산, 방랑민족) + 모음 1편. 슈미는 소개 원문이 없어, 트윙클타임은 고른 사진이 없어 빠진다.

## 되돌리기

- 사진 칸: 백업 파일의 그 브랜드 `photos` 값으로 `/admin/brands`에서 되돌리거나 칸을 지운다.
- 허락: 백업에 행이 없었으면 `/admin/brands` 연락 보드에서 상태를 되돌린다. VOC 줄은 쌓기만 하므로 지우지 않는다.
- Storage: `brand-photos/moongu-2026-winter/` 아래를 대시보드에서 지운다. 칸이 그 주소를 가리키는 동안은 지우지 않는다.

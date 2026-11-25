# 뭉친 브랜드 가르기 (운영)

2026-11-20까지 `src/lib/exhibitor/identity.ts`는 링크 모음, SNS, 마켓 주소 상당수를 도메인으로 맞댔다.
그래서 같은 서비스(link.inpock.co.kr, instabio.cc, grafolio 등)를 쓰는 서로 다른 작가가 한 브랜드로 묶였을 수 있다.
mock에서 V.21(sif-2026)을 백필하면 25곳에 부스 142곳이 뭉쳤다("러브미모어" 27곳, "무운" 17곳, "달콤한 일러스트" 13곳).
운영에도 같은 판정으로 백필과 인입을 했으니 같은 뭉침이 있을 수 있다. **운영은 아직 보지 않았다.**

판정을 고친 이유와 고친 서비스 목록: `docs/decisions/2026-11-20_공용-서비스-주소는-계정으로-가른다.md`.

이 런북은 Ted가 돌린다. 에이전트는 실행하지 않았다.

## 파일

| 파일 | 하는 일 |
|---|---|
| `docs/runbooks/brand-identity-split-check.sql` | 점검. select만 쓴다. Q1 요약, Q2 부스별 표, Q3 붙은 기록, Q4 부스 없는 브랜드 |
| `docs/runbooks/brand-identity-split-draft.sql` | 가르기 쓰기 초안. 기본이 드라이런이다(숫자만 보여 주고 되돌린다) |

## 순서

### 0. 고친 코드가 먼저 배포돼 있어야 한다

가르기는 잘못 붙은 부스를 떼기만 하고, 다시 잇는 건 `/admin` 백필이 한다. 옛 코드로 백필하면 그대로 다시 뭉친다.
이 PR이 main에 머지되고 Vercel 배포가 끝난 뒤에 1단계부터 한다.

V.22 브랜드 먼저 인입(PR #207)도 같은 판정(`identityKeys`)으로 V.21 브랜드를 찾는다. 운영 인입은 이 PR 배포 뒤에 한다.

### 1. 백업

```bash
npm run intake:backup -- sif-2026 --label before-identity-split
```

브랜드 그래프 전체(exhibitor, exhibition_participant, booth_participant, 후보)와 프로필 칸이 `data/intake/_backup/`에 남는다.
브랜드 하트와 알림 기록은 이 백업에 없다. 3단계 Q3에서 0이 아닌 브랜드가 있으면 SQL Editor에서 그 줄을 CSV로 내려받아 둔다.

```sql
select * from brand_heart where exhibitor_id in (<Q3의 exhibitor_id들>);
```

### 2. 점검 (읽기 전용)

Supabase SQL Editor에서 `brand-identity-split-check.sql`의 Q1부터 Q4까지 하나씩 돌린다. SQL Editor는 마지막 결과만 보여 주니 블록마다 따로 돌린다.

- **Q1**: `ig_accounts`가 2 이상인 브랜드가 뭉친 곳이다. 0행이면 부스 쪽 뭉침은 없다. 4단계부터는 Q4만 보면 된다.
- **Q2**: 뭉친 브랜드의 부스 한 줄씩. `keeper = true`인 부스가 브랜드에 남고 나머지를 뗀다.
  keeper는 브랜드 대표 인스타(`exhibitor.instagram_url`)와 같은 계정이다. 대표 인스타가 없으면 가장 먼저 붙은 부스의 계정이다.
  남길 쪽이 틀렸으면 그 브랜드는 초안을 돌리기 전에 `exhibitor.instagram_url`을 남길 부스의 인스타로 고친다.
- **Q3**: 뭉친 브랜드에 붙은 하트, 알림, 연락, 허락, 프로필 칸 수. 4단계에서 본다.
- **Q4**: 부스 없는 브랜드(브랜드 먼저 인입). (a) 파일 열쇠가 둘 이상 묶인 참가, (b) 링크 칸에 인스타가 둘 이상인 브랜드, (c) 공용 서비스 웹 주소에 이름이 여럿인 브랜드(참고).
  이쪽은 초안 SQL이 다루지 않는다. 행이 있으면 5단계를 본다.

### 3. 가르기 드라이런

`brand-identity-split-draft.sql`을 그대로 돌린다. 마지막 블록이 일부러 오류를 내며 숫자를 보여 주고 전부 되돌린다.

```
드라이런(아무것도 바뀌지 않았어요): 건드린 참가 사실 N, 뗄 부스 N, 뭉친 브랜드 N, 부스 없이 남는 브랜드 먼저 참가 N, 아직 뭉친 브랜드 0, 지울 참가 사실 N
```

- `뭉친 브랜드`는 Q1 행 수, `뗄 부스`는 Q2에서 `keeper = false`인 행 수와 같아야 한다.
- `아직 뭉친 브랜드`는 0이어야 한다.
- `부스 없이 남는 브랜드 먼저 참가`가 0이 아니면 5단계를 먼저 본다.
- "허락, 프로필 칸, 연락 기록이 있어요" 오류가 나면 4단계를 먼저 본다.

초안이 하는 일:

1. keeper와 인스타 계정이 다른 부스(인스타 없는 부스 포함)의 대표 배정을 뗀다.
2. 부스가 하나도 안 남은 참가 사실 중 부스 인입이 만든 것(`intake_key` 없음)을 지운다. 남겨 두면 다음 백필이 표기 이름으로 다시 붙일 수 있다. 그 참가의 연결 후보는 같이 지워진다.
3. 남은 브랜드의 이름(`canonical_name`, `display_name`)과 대표 웹 주소를 남은 부스에 맞춘다. 대표 웹 주소가 뗀 작가의 링크 모음 주소면 다음 백필이 그 작가를 다시 붙이기 때문이다.

### 4. 붙은 기록 보기 (Q3이 0이 아닐 때)

초안은 브랜드 단위 기록을 keeper 브랜드에 그대로 둔다. 어느 작가 것인지 데이터로는 모른다.

- **브랜드 하트, 알림**: 사용자가 뭉친 브랜드의 어느 부스에서 눌렀는지 남지 않는다. keeper에 둔다. 사용자에게 다시 묻지 않는다.
- **연락(brand_outreach, brand_outreach_log), 허락(participant_permission)**: Ted가 기록 내용을 보고 어느 작가와 나눈 것인지 판단한다. 다른 작가 것이면 6단계 뒤에 그 작가의 새 브랜드와 참가로 옮긴다.
- **프로필 칸**: 링크 칸에 남의 링크가 섞였으면 `/admin/brands/[id]`에서 고친다.

### 5. 부스 없는 브랜드 (Q4에 행이 있을 때)

브랜드 먼저 인입은 파일 안의 여러 줄을 링크로 한 브랜드에 합친다(`brandKeys`가 둘 이상). 같은 원인으로 다른 작가가 합쳐졌을 수 있다.
SQL로 가르지 않는다. 그 파일(`data/brands/<slug>.json`)을 고친 코드로 `/admin/intake` 미리보기에 다시 올려 몇 곳이 나뉘는지 보고, Ted가 정한다.
나뉘어야 하는 곳이 있으면 별도 작업으로 맡긴다.

### 6. 가르기 적용과 백필

1. 드라이런 숫자가 맞으면 초안의 `-- [드라이런]` 블록(마지막 `do $$ ... end $$;`)만 지우고 다시 돌린다. 맨 끝 `commit`이 적용한다.
2. `/admin`에 로그인한 브라우저 탭의 개발자 도구 콘솔에서 백필 미리보기를 본다(쓰지 않는다).

   ```js
   await (await fetch("/api/admin/exhibitors/backfill", { method: "POST", headers: { "content-type": "application/json" }, body: '{"apply":false}' })).json()
   ```

   `assignments`가 3단계의 `뗄 부스` 이상이어야 한다(아직 백필하지 않은 다른 행사 부스가 있으면 그만큼 더 나온다). `summary.multiExhibition`과 `sampleCandidates`에 이상한 묶음이 없는지 본다.
3. 맞으면 `/admin/brands/links`의 다시 찾기 버튼으로 적용한다(같은 API의 `apply: true`).
4. 점검 Q1을 다시 돌린다. 0행이어야 한다.

### 되돌리기

1단계 백업 파일이 기준이다. 되돌리기 버튼은 없다. 문제가 생기면 백업의 booth_participant, exhibition_participant, exhibitor 줄로 복원 SQL을 따로 만든다.

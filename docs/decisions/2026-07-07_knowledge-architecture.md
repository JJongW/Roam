# 지식 구조 재설계 — LLM 메모리 & 지식 아키텍처

> 상태: **선행 정리 / 방향 설정** (구현 아님). 동행자 재정의를 떠받칠 지식 골격을 미리 잡는다.
> 작성: 2026-07-07
> 관련: `2026-07-07_companion-reframe.md`(왜 필요한지), `onboarding-redesign-2026-06`

---

## 1. 왜 지금

`companion-reframe`의 세 축 — **근거 제공 · 관심 피드 · 종단 프로필** — 은 전부 지금 없는 지식 구조를 요구한다.

- **동행자는 "너를 기억"해야 성립.** 매번 리셋되는 stateless 추천은 정보 전달기지 동행자가 아니다.
- 현재 구조는 **관람 1회성**: 서버가 진실이나 사용자 지식은 휘발(zustand) + per-visit localStorage. 크로스-전시 기억 없음.
- **로그인 게이트가 여기서 회수된다.** 익명 세션(`roam_session`)으로는 종단 기억이 불가능했다. 로그인 필수(`roam_user`, `app_user`) 전환으로 **비로소 크로스-전시 사용자 모델이 가능**해졌다 — 이 재설계의 전제이자 로그인 작업의 사후 정당화.

**두 종류의 "지식"을 분리해야 한다** (자주 뒤섞임):
- **세계에 대한 사실** = 부스·전시 지식 → 외부 RAG(grounding 대상).
- **사람에 대한 사실** = 사용자 모델 → 메모리(개인화 연료).
- LLM은 이 둘을 *결합*해 근거를 만든다. 지금은 전자만 있고 후자가 없다.

---

## 2. 지식의 4계층 (수명·범위로 분류)

| 계층 | 내용 | 수명 | 범위 | 현재 상태 |
|---|---|---|---|---|
| **L1 정적 도메인** | 부스·전시·테마·근거 사실 | 느림(큐레이션) | 전시별 | `booth_enrichment`(0013) — **79/256(31%) 채워짐** |
| **L2 휘발 상황** | 실시간 혼잡·이벤트·대기 | TTL(시간축) | 전시별·시각별 | waiting/event 일부, 미체계 |
| **L3 에피소드 기억** | 관람 1회: 약속(목표)·비트·순간 | 관람 세션 | 사용자×전시 1회 | 휘발(zustand)·per-visit local |
| **L4 종단 사용자 모델** | 관심·안목(학습도)·목표 이력·전시 이력 | **영속·성장** | 사용자(크로스-전시) | **없음** ← 신규 핵심 |

### L1 정적 도메인 지식 — 근거의 원천
- 근거 카드(§5-c)·RAG rerank·온보딩 추론이 전부 여기서 인용.
- 구조화 필요: 무엇을 하는 곳 / 왜-맞음 사유 / 테마 slug / grounding 가능한 팩트.
- **상태**: 79/256(31%) 채워짐(빈 상태 아님). 근거카드/confidence용 필드 충분성 + 나머지 커버리지가 실제 과제.

### L2 휘발 상황 지식 — 실시간 큐
- "이 시간대 붐빔", "굿즈 이벤트 때문", "00시 이벤트 예정" (§5-d).
- L1과 **수명이 다름**: 시간 인덱스 + TTL. 정적 지식과 저장·질의 분리.
- 명령이 아니라 *판단 큐*로 노출 — 지식 레이어는 사실만, 해석은 UI가.

### L3 에피소드 기억 — 관람 아크의 재료
- 1막 약속(개인 목표) + 2막 비트(방문·체류) + 순간(자발 메모·사진 **+** 자동 캡처).
- `companion-reframe §5-B`의 회고 리캡이 소비.
- **핵심**: 관람 종료 회고 = 이 에피소드를 **L4로 증류(consolidation)하는 쓰기 시점.**

### L4 종단 사용자 모델 — 동행자의 척추
- 관심 누적(피드 클릭) → 관심 그래프/벡터. **안목(학습도)** 지표.
- 목표 설정·달성 이력. 전시 방문 이력. 크로스-전시.
- 다음 온보딩·피드·추천 프롬프트에 **주입** → "쓸수록 좋아짐"(§5-f)의 실체.
- 초보→고관여 성장 경로(§6)가 여기 기록된다.

---

## 2-B. 저장소가 아니라 장기메모리 — 증류 루프

> 명제: **"LLM 위키는 저장소가 아니라 장기메모리다. RAG는 찾고, 위키는 미리 이해해둔다."**
> **"AI 생산성 차이는 프롬프트가 아니라 지식 구조에서 난다."**
> §2의 4계층은 *데이터*였다. 여기선 *프로세스* — 계층을 살아있게 만드는 증류 루프.

### 진단 — 지금은 에이전트가 아니라 챗봇
- LLM을 **기능적으로만** 호출: 요청마다 RAG → 생성 → 버림. 상호작용 간 기억 0.
- **축적만**: `ai_query_log`에 계속 append = "더 넣을수록 복잡·찾기 어려움·맥락 붕괴".
- 결과: 대화하는 챗봇이지, *너를 기억하고 계속 나아지는* 에이전트가 아니다.

### 전환 — 저장(retrieval) → 이해(pre-understanding)
- **L4는 로그가 아니라 증류된 이해.** "이 사용자는 X를 좋아함"을 *미리 정리*해 매 상호작용에 즉시 주입 — RAG처럼 매번 찾지 않는다.
- **쌓기 → 증류.** 계층 전이는 append가 아니라 능동 큐레이션: **정제 → 압축 → 승격 판단 → 아카이브**.
- **재증류(memory health).** 주기적으로 되돌아 정리: 낡은 관심 가지치기, 반복 관심 승격, 지난 관람 아카이브. 이래야 §5-f "쓸수록 좋아짐"이 실제로 성립.

### 판별선 — 챗봇 vs 에이전트
| | 챗봇 (현재) | 에이전트 (지향) |
|---|---|---|
| 기억 | 요청 단위 휘발 | 증류된 장기메모리 상시 |
| 지식 | RAG로 매번 찾기 | 미리 이해해 주입 + 필요 시 RAG |
| 시간축 | 매번 리셋 | 재증류로 계속 개선 |
| 신원 | 익명 세션 | `app_user` 귀속 브레인 |

### 구체화 — 사용자별 브레인 문서
- 이미지의 `CLAUDE.md`/wiki = *에이전트가 매번 읽는 실행 컨텍스트*.
- 제품 유비 = **per-user 증류 프로필**(구조화 요약): 관심·안목·목표·이력. 컴패니언이 매 상호작용에 로드하는 실행 컨텍스트.
- **L3 에피소드(관람)가 이걸 갱신** = 회고 = 증류 쓰기. 원장(raw log)은 뒤에 두고, 앞단엔 증류본만 주입.
- 틀리면 raw에서 **재증류**로 복구 (이미지의 `다시 raw → 재증류` 루프).

---

## 3. 계층 간 흐름

```
L1 정적 ─────┐
L2 휘발 ─────┤→ [LLM: RAG + grounding] ─→ 근거·추천·피드
L4 종단 사용자 ┘         ↑ 주입(사용자 맥락)
                        │
L3 에피소드 ─[관람 종료 회고 = 증류]→ L4 종단   (읽기: 다음 관람에 주입)
```

- **회고 = 메모리 쓰기.** 3막 후(회고)는 UX인 동시에 L3→L4 consolidation 파이프라인. 이 이중성이 두 문서를 잇는 매듭.
- **주입 루프**: L4가 다음 온보딩/피드로 흘러 개인화 심화. 현재 단발 → 순환으로.

---

## 4. LLM이 읽는 법

- **부스 지식**(L1) = 외부 RAG 코퍼스. `booth-recommender` grounding 유지.
- **사용자 모델**(L4) = 프롬프트 컨텍스트 주입 (RAG 아님 — 검색 대상 아니라 항상 주입되는 신원).
- **속도 규칙 불변**(CLAUDE.md): 탭엔 LLM 금지, 동선/추천 액션에만. `thinkingBudget=0`.
- L4 주입이 프롬프트를 키움 → **요약된 사용자 모델**(원장 아님)만 주입. 안목·핵심 관심 top-N.

---

## 5. 현재 자산 매핑

| 기존 | 계층 | 조치 |
|---|---|---|
| `booth_enrichment`(0013) | L1 | **채우기**(선행). 근거 필드 구조화 |
| `ai_query_log`(0014) + `topQueryKeywords` | L4 씨앗 | 전역 트렌딩 → **사용자별 관심 모델**로 승격. 지금은 익명 집계, 이제 `app_user` 귀속 가능 |
| 개인 메모장(visited/skip/메모/사진) | L3 | 에피소드 재료로 정식화 + 자동 캡처 추가 |
| onboarding-inference | L1 어휘 소비 | L4 주입 추가 |
| engine RAG(`rankBooths`) | L1 소비 | 유지. 동선은 부산물로 강등(reframe §7) |
| `app_user` / `roam_user` | L4 소유자 | 종단 모델의 **키**. 로그인 게이트가 이걸 보장 |

---

## 6. 오픈 퀘스천

1. **표현 방식**: 관심을 벡터 임베딩 vs 태그 그래프 vs 둘 다? 안목(학습도)을 어떤 척도로?
2. **증류 규칙**: L3→L4 무엇을 남기고 무엇을 버리나. 회고 시점 자동? 명시 확인?
3. **프라이버시·보존**: 종단 기억 = 개인정보 누적. 보존기간·삭제·투명성. 로그인 필수라 더 무거워짐.
4. **콜드 스타트**: L4 빈 신규 사용자. 첫 관람은 L1만으로, 이후 L4 축적 — 부트스트랩 UX.
5. **크로스-전시 스키마**: 전시 A의 관심이 전시 B로 어떻게 이전되나 (테마 slug 공통축?).
6. **안목 지표 노출**: 사용자에게 보일지. 게임화 함정 경계(reframe §8-4) — 내적 성장감으로.

---

## 7. L4 브레인 스키마 초안

> per-user 종단 모델. **증류본**(원장 아님). `User.nickname`(공개키) 귀속. 이전축 = **category slug**(`booth.tags`/`themeTags` 공통 — 전시 A 관심이 B로 이전되는 축).
> 기존 `UserPreference`(sessionId 기반, 1회성)와 구분: 이건 크로스-전시·영속·성장.

### 형태 (TS 초안)

```ts
interface UserBrain {
  userId: string;              // User.nickname (공개키)
  version: number;
  updatedAt: string;           // ISO

  // 안목 — 성장 지표 (초보→고관여 UX 구동, reframe §6)
  literacy: {
    overall: number;                    // 0..1 종합
    byTheme: Record<string, number>;    // slug → 0..1 테마별 숙련
    visitsCount: number;
    boothsSeenCount: number;
  };

  // 관심 — confidence 있는 노드. top-N만 유지(증류), 나머지 원장에
  interests: InterestNode[];

  // 안정적 선호 — 온보딩 + 추론 누적 (UserPreference의 종단판)
  preferences: {
    pace?: MovementPreference;
    crowdTolerance?: number;     // 0..1 (낮을수록 회피)
    waitTolerance?: number;      // 0..1
    depthVsBreadth?: number;     // 0=깊게 1=넓게
    companion?: CompanionType;
  };

  goals: GoalRecord[];           // 약속 이력 (1막)
  visits: VisitDigest[];         // 에피소드 증류본 (L3→L4)

  health: {                      // memory health
    lastDistilledAt: string;
    decayHalfLifeDays: number;   // 관심 시간감쇠 반감기 (예: 90)
  };
}

interface InterestNode {
  key: string;                   // category slug (이전축)
  label: string;
  confidence: number;            // 0..1 (수학, 아래 공식)
  signals: { explicit: number; implicit: number; negative: number };
  firstSeenAt: string;
  lastSeenAt: string;
  trend: "up" | "flat" | "down";
}

interface GoalRecord {
  exhibitionId: string;
  visitId: string;
  statement: string;             // "SF 신간 훑기"
  themes: string[];              // slug[]
  timeBudgetMin: number;
  status: "set" | "met" | "partial" | "missed";
  metRatio: number;              // 분모 프레이밍: 관련집합 대비 (reframe §5-B)
  createdAt: string;
  closedAt?: string;
}

interface VisitDigest {          // L3 에피소드 → 증류
  exhibitionId: string;
  visitId: string;
  date: string;
  boothsVisited: string[];       // code[] (많으면 top + count)
  themesEngaged: string[];       // slug[]
  highlights: string[];          // 자발(메모·사진) + 자동(순간) 합성
  satisfaction?: number;         // 0..1 회고 신호 (peak-end)
  summary: string;               // 1~2줄, Companion이 다음 관람에 참조
}
```

### confidence 공식 (결정론 — Memory Agent)
```
raw = Σ(explicit·We) + Σ(implicit·Wi) − Σ(negative·Wn)     // 시간감쇠 적용
      · decay(Δt) = 0.5 ^ (Δt / halfLife)
confidence = clamp01(raw / (raw + K))                        // 포화 정규화, K=완만화 상수
```
- 신호 가중(예): 부스 선택·메모·사진 = explicit 강 / 피드클릭·긴 체류 = explicit·implicit / skip·빠른 이탈 = negative / **다른 전시서 같은 slug 재등장 = 크로스전시 부스트**.
- 순수 수학. LLM 없음(§1 판단은 결정론).

### 증류 규칙 (memory health, §2-B)
- **승격**: confidence ≥ θ_hi → 안정 관심. `literacy.byTheme` 가산.
- **가지치기**: confidence < θ_lo AND lastSeen 오래됨 → interests top-N에서 제거(원장엔 잔존, 재증류 가능).
- **아카이브**: 오래된 VisitDigest는 요약만 남기고 상세 축소.
- **재증류**: 브레인 손상·규칙 변경 시 원장(raw signal log)에서 재생성.

### 저장 (2-테이블 분리)
- `user_signal_log` (신규, **append 원장**): 모든 원시 신호. `ai_query_log`(0014)가 첫 소스 → 확장·`app_user` 귀속.
- `user_brain` (신규, **증류 curated**): 위 UserBrain. jsonb 컬럼 or 정규화. `User` FK.
- mock repo 미러 필수(패리티).

### LLM 주입 (§4)
- 전체 브레인 아님 → **압축 컨텍스트**: top-K 관심 + literacy 요약 + 활성 goal + 최근 VisitDigest.summary. Companion/Recommendation 프롬프트에 신원으로 주입.

### 콜드 스타트
- 빈 브레인 신규자: 첫 관람 = L1만. 온보딩이 preferences + 첫 goal 시드. 관람 종료 회고가 첫 VisitDigest 씀 → 다음부터 L4 작동.

---

## 8. 다음 스텝

1. **L1 필드 점검 + 커버리지 확대** — 79/256 기반. 근거카드/confidence에 필요한 필드 정의 후 나머지 채움.
2. ~~L4 최소 스키마 초안~~ → §7 완료. 다음: signal 가중치·θ 임계값·halfLife 실측 튜닝.
3. `ai_query_log` → 사용자 귀속 경로 확인 (익명→로그인 전환의 실익 검증).
4. L3→L4 증류(회고 쓰기) 흐름을 `companion-reframe §5-B`와 함께 프로토타입.
5. **증류 규칙 + memory health 정의** (§2-B) — 정제/압축/승격/아카이브 기준 + 재증류 주기. 사용자별 브레인 문서 스키마.

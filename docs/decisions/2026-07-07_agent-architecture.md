# 에이전트 아키텍처 — 서비스가 판단, LLM은 말만

> 상태: **선행 정리 / 방향 설정** (구현 아님).
> 작성: 2026-07-07
> 관련: `2026-07-07_companion-reframe.md`(왜), `2026-07-07_knowledge-architecture.md`(기억), CLAUDE.md 속도 규칙

---

## 1. 핵심 원칙 — 판단은 결정론, LLM은 언어 표면

> 사용자 **행동 / 위치 / 시간 / 취향 / 방문기록** → **서비스가 판단** → **LLM은 자연스럽게 말만**.

이건 CLAUDE.md 기존 규칙("엔진은 순수·결정론, LLM은 rerank·말")의 **일반화**다. 재작성이 아니라 재조직 + 확장.

- **판단**(목표·순서·피로·재계획·추천)은 전부 결정론 서비스가 한다. 검증 가능·빠름·무료.
- **LLM은 이미 결정된 것을 사람 말로 옮길 뿐.** 무엇을 할지 정하지 않는다.
- 예외: 애매한 자연어 해석(의도 추출·부스 rerank grounding)에만 LLM이 실제로 *일*한다. 그 외엔 표면.

## 2. 안티패턴 — 7개 LLM 에이전트 ≠ 목표

- 7개를 전부 LLM 호출로 만들면 = 느리고 비싼 **챗봇 7개**. 방금 탈출하려던 그것.
- 무거운 오케스트레이터 프레임워크 조기 도입 금지. 에이전트 = **공유 상태 위 모듈**, LangGraph류 아님.
- **탭(대화 턴)엔 LLM 금지**(CLAUDE.md). Companion도 빠른 턴은 로컬 템플릿.
- Memory를 append 로그로 두면 증류 실패(knowledge §2-B). confidence는 수학.

## 3. 공유 substrate = Memory Engine (블랙보드)

- 파이프라인의 화살표는 함수 호출이 아니라 **공유 지식 store를 경유**한다.
- **Memory Engine = L1~L4 store**(knowledge-architecture). 모든 에이전트가 여기서 읽고 쓴다.
- Reasoner가 신호를 해석해 쓰면 → Planner가 읽어 재계획 → Recommendation이 읽어 추천 → Companion이 읽어 말한다. 블랙보드 패턴.
- per-user **브레인 문서**(증류본)가 매 상호작용 로드되는 실행 컨텍스트.

## 4. 에이전트별 정체

| 에이전트 | 하는 일 | LLM? | 코드 위치 | 기존/신규 |
|---|---|---|---|---|
| **Onboarding** | 목적 추출·질문 생성 | 경량 LLM + 템플릿 | `onboarding-flow.ts`+`onboarding-inference` | 기존 확장(목표 스텝 추가) |
| **Memory** | 기억 저장/업데이트, **관심도 confidence 계산** | **결정론(수학)** | `lib/memory`(신규) | **신규** = 증류 엔진(§2-B) |
| **Planner** | 오늘의 목표 생성, **남은 시간 기준 재계획** | **결정론** | `engine/route.ts` 확장 + 목표생성 신규 | 확장 |
| **Reasoner** | 행동 해석, **피로도/관심도/의도 추론** | **주로 결정론**(의도만 선택적 LLM) | `lib/reason`(신규) | 신규 |
| **Recommendation** | 부스/세미나/동선 추천 | 하이브리드 | `engine/` + `booth-recommender` | 기존 유지 |
| **Companion** | 사용자에게 자연스럽게 말하기 | **LLM(표면)** | `gemini.generateText` | 기존 재배선. **"LLM은 말만"의 자리** |
| **Reflection** | 방문 후 리포트, 후속 액션 제안 | 결정론 증류 + LLM 서술 | `lib/reflection`(신규) | **신규** = 회고(§5-B)=L3→L4 쓰기 |

### 결정론 판단의 구체 예 (LLM 없이)
- **관심도 confidence**(Memory): 명시 신호(피드 클릭·부스 선택·메모) + 암묵 신호(체류·재방문·skip) 가중·시간감쇠. 확신도 = 추천 가중 + 안목 지표.
- **피로도**(Reasoner): 경과시간·이동거리·방문수·페이스 → 피곤하면 Planner가 코스 축소.
- **재계획**(Planner): 남은 시간 − 예상 체류 → 목표 재산정. 좌표·시간 계산은 LLM 불가(CLAUDE.md), 무조건 엔진.

## 5. 실행 루프 3개 (라이프사이클)

**루프 A · 온보딩 (1회)**
Onboarding → 목적/목표 추출 → Memory에 약속(목표) 씀 → Planner 초안 → Companion이 말.

**루프 B · 라이브 컴패니언 (관람 중 연속)**
```
신호(행동·위치·시간) → Reasoner(해석) → Memory(confidence 갱신)
   → Planner(시간 기준 재계획) → Recommendation(무엇 보일지) → Companion(LLM: 말) → 사용자 → 반복
```
- 니가 그린 `사용자→Memory→Planner→Reasoner→Reco→LLM→사용자`를 정정: **Reasoner(해석)가 Memory·Planner보다 앞**. 행동을 먼저 읽어야 기억·계획이 갱신됨.

**루프 C · 리플렉션 (관람 종료)**
Reflection → L3 에피소드 증류 → L4 브레인 갱신(증류 쓰기) → Companion이 회고 서술 → 후속 액션 제안. = companion-reframe 3막 후.

## 6. 빌드 순서 (의존성)

1. **Memory Engine 스키마 + Memory Agent** — 모든 것의 substrate. L4 per-user 브레인 + confidence 수학.
2. **Reasoner + Planner (결정론)** — "서비스가 판단"의 코어. 피로/관심 해석 + 목표·재계획.
3. **Recommendation 재배선** — 기존 engine 재사용 + Memory 주입.
4. **Companion 재배선** — 결정된 사실만 verbalize. 탭 템플릿 / 무거운 순간만 LLM.
5. **Reflection** — 증류 쓰기 + 서술. 루프 C 닫기.
6. **Onboarding 정리** — 목표 스텝 추가(companion-reframe §5-B 1막).

## 7. 오픈 퀘스천

1. Reasoner 의도 추론 — 어디까지 휴리스틱, 어디부터 LLM? 경계.
2. 위치 신호 소스 — 실내 측위 없음. 부스 체크인·수동 vs 추정?
3. 에이전트 간 계약(스키마) — 블랙보드 store의 읽기/쓰기 인터페이스 정의.
4. Companion 발화 트리거 — 언제 말 걸고 언제 침묵? (나그지 않기, reframe 원칙3)
5. 결정론 vs LLM 비용/지연 예산 — 루프 B는 실시간, LLM 개입은 최소.

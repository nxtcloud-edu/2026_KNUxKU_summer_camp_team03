# Quill 챗봇 아키텍처 — Supervisor + 2 검색 에이전트 + 해설 2종 (실구현 기준)

```
Supervisor (supervisor.py — 질문 판단·호출·조립, 코드)
  ├─ 🤖 report_retriever  — 크로마/Supabase/시드에서 리포트 근거
  ├─ 🤖 evidence_finder   — NewsAPI(해외)·네이버(국내)에서 외부 지식
  ├─ 💬 chat_agent         — 일반 해설 (LLM 1회, market/evidence형)
  └─ 💬 decision_agent     — 의사결정형 해설 (팀원 구현 예정 — 지금은
                              chat_agent로 임시 대체된 스텁)
문장 생성만 LLM이 담당 — 검색 에이전트(report_retriever/evidence_finder)는 전부 코드다.
```

아래 다이어그램은 상상도가 아니라 **현재 코드에 실제로 존재하는 것만** 그린 것.
GitHub·Notion·mermaid.ai에 그대로 붙여넣으면 렌더링된다.

```mermaid
flowchart TB

  classDef fn fill:#E4EFEA,stroke:#1F6F5C,color:#134A3D,stroke-width:1.5px
  classDef llm fill:#FBEEDA,stroke:#E8A33D,color:#8A5A16,stroke-width:1.5px
  classDef code fill:#EFECE2,stroke:#8D948A,color:#5B6459,stroke-width:1.5px
  classDef db fill:#FFFFFF,stroke:#134A3D,color:#1F2A22,stroke-width:1.5px
  classDef guard fill:#F9ECE8,stroke:#C0503A,color:#C0503A,stroke-width:1.5px
  classDef ui fill:#134A3D,stroke:#134A3D,color:#FFFFFF,stroke-width:1.5px
  classDef stub fill:#F3EAF7,stroke:#7A4E96,color:#4B2E5E,stroke-width:1.5px,stroke-dasharray: 4 3

  U["Chat.tsx — 버튼 5종 + 자유 입력<br/>api.ts: 서버 우선 → 실패 시 로컬 chatEngine 폴백<br/>트레이스 배지: ✅서버 응답 / ⚠목업 폴백"]:::ui

  U -->|"POST /api/chat {message, session_id, profile}"| GUARD

  subgraph SVC["supervisor.py — Supervisor 계층 (전부 코드, LLM 아님)"]
    direction TB
    GUARD["guardrails.py check_input — 매 턴 첫 관문<br/>범위 밖(코인 등)→차단 · 매수요구('뭐 사'·'살까')→해설 모드 안내<br/>예측요구('오를까')→해설 모드 안내"]:::guard
    GUARD -->|"차단이면 여기서 종료"| OUT
    GUARD --> STM["session_store.py — STM<br/>session_id 발급/조회 · 최근 4턴 로드 · 만료 24h<br/>기억: 직전 태그 · 직전 유형 · 기출 리포트(seen)"]:::fn
    STM --> TRI["triage.py — 규칙 분류, LLM 0회<br/>concept·portfolio·schedule·market·evidence·<b>decision</b><br/>'살까·말까·어떤 게 나아'→decision (DECISION_PAT)<br/>후속 감지 → 질문 재구성 + 태그 병합 + 직전 유형 상속(decision 포함)"]:::fn
    TRI --> GATE["관련성 게이트 — 금융 어휘·태그 0건이면 차단<br/>FINANCE_VOCAB에 이슈·동향·소식 포함(2026-08 추가)<br/>'점심 뭐 먹지?' → 안내 후 종료 · 후속 질문은 예외"]:::guard
    GATE -->|"범위 밖이면 종료"| OUT
    GATE --> SUP["🧭 <b>Supervisor</b> — 판단·호출·조립 (supervisor.handle)<br/>유형별로 어느 에이전트를 부를지 결정<br/>근거 수집(🤖×2)은 항상 이 계층이 하고, LLM 에이전트는<br/>완성된 근거만 받는다 — decision_agent도 예외 아님"]:::ui

    SUP -->|"개념형: '회사채가 뭐야?'"| GLO["glossary.py — LLM 0회<br/>용어 8종 × 수준 3벌(beginner/mid/advanced)<br/>literacy_level로 선택 + 관련 리포트 2건 연결"]:::fn
    SUP -->|"포트폴리오형: '내 비중은?'"| PORT["quant.py 재계산 — LLM 0회<br/>baseline_weights + explain_baseline 재사용<br/>프로필 없으면 온보딩 유도"]:::fn
    SUP -->|"일정형: '금통위 언제?'"| SCH["준비 중 안내 — LLM 0회<br/>(경로 C 캘린더는 데모 후)"]:::code
    SUP -->|"시장정세형·근거형·의사결정형 → 🤖 호출"| SRCH["🤖 report_retriever — 리포트 검색 에이전트 (코드)<br/>Chroma 의미검색 → Supabase → 시드 폴백<br/>market: 3보드 교차 최신순 (태그 무관, 항상 근거 있음)<br/>evidence: 태그+키워드 스코어 검색<br/>decision: 태그 있으면 evidence식 · 태그 0건('나 뭐사')이면<br/>market식으로 확장 — 근거 0건을 피한다"]:::fn

    SRCH -->|"리포트<2건 or '뉴스/이슈' 요청 or decision(항상 강제)"| NEWS["🤖 evidence_finder — 외부 지식 에이전트 (코드)<br/>검색어 = triage 태그→키워드 변환(예: 채권-장기-국채→'장기 국채')<br/>사용자 원문을 그대로 넘기지 않는다(2026-08 수정 — 전엔 0건만 나옴)<br/>해외(연준·글로벌) → NewsAPI · domains=reuters,bloomberg<br/>국내(금통위·국고채) → 네이버뉴스 → originallink 화이트리스트<br/>30분 캐시 · 키 없거나 실패하면 조용히 생략"]:::fn
    SRCH -->|"0건"| FB["NO_EVIDENCE_FALLBACK<br/>고정 문구 — 생성 금지"]:::guard
    NEWS --> ANA
    NEWS --> DEC
    SRCH -->|"market / evidence"| ANA["💬 chat_agent.answer — LLM 1회<br/>시스템 프롬프트 고정(캐시 친화)<br/>컨텍스트: 리포트 발췌(700자 절단)+프로필 점수+최근 4턴<br/>thinkingBudget=0 (2026-08 수정 — 전엔 사고 토큰이<br/>예산을 다 먹어 답이 MAX_TOKENS로 잘림)<br/>실패 시 리포트 요약 템플릿 폴백"]:::llm
    SRCH -->|"decision"| DEC["💬 decision_agent.answer_decision — 팀원 구현 예정<br/>📈 낙관론 / 🛡️ 보수론 두 페르소나 병렬 해설(우열 없음)<br/><b>지금은 스텁</b> — chat_agent로 임시 대체해 라우팅만 살아있음<br/>시그니처: (question, reports, news, profile_ctx) → (text, used_llm)<br/>reports/news는 이미 Supervisor가 모아서 넘김 — 검색 재호출 불필요"]:::stub

    GLO --> SAN
    PORT --> SAN
    SCH --> SAN
    FB --> SAN
    ANA --> SAN
    DEC --> SAN
    SAN["sanitize_output + DISCLAIMER<br/>'추천'→'해설' 치환 — 마지막 관문"]:::guard
    SAN --> APP["STM 기록<br/>턴 append · 태그/유형/기출 리포트 갱신"]:::fn
  end

  APP --> OUT["ChatResponse<br/>text · evidence[] · notice · trace[] · session_id · turn_type · used_llm"]:::code
  OUT -->|"근거 카드 = reportById(id) · 트레이스 위젯"| U
  APP -.->|"다음 턴 로드"| STM

  subgraph DATA["데이터 — 소스 우선순위: Chroma → Supabase → 시드 · 뉴스는 보조"]
    direction LR
    CHR[("Chroma 벡터 컬렉션<br/>DB 담당 적재 · 의미 검색<br/>CHROMA_HOST 또는 CHROMA_PATH")]:::db
    SUPA[("Supabase reports<br/>env 설정 시 조회")]:::db
    SEED[("data/reports.json<br/>실크롤링 124건 · FE mock과 동일<br/>= 최후의 폴백, 근거 카드 ID 일치")]:::db
    NAPI[("NewsAPI<br/>Reuters·Bloomberg 한정 · 하루 100요청·영문<br/>✅ 정상 (2026-08 키 검증 완료)")]:::db
    NNEWS[("네이버 뉴스 검색<br/>한경·매경·서경·연합·이데일리 화이트리스트<br/>⚠️ 현재 401 인증 실패 — 개발자센터 앱 상태 확인 필요")]:::db
  end
  CHR -.->|"evidence·decision 의미 검색 우선"| SRCH
  SUPA -.-> SRCH
  SEED -.-> SRCH
  NAPI -.->|"해외 이슈"| NEWS
  NNEWS -.->|"국내 이슈"| NEWS

  subgraph LEG["범례 · LLM 예산: 턴당 최대 1회 (decision은 팀원 구현체가 붙으면 2회로 늘 수 있음)"]
    direction LR
    L1["순수 함수/코드"]:::fn
    L2["LLM 호출"]:::llm
    L3["가드레일"]:::guard
    L4[("데이터")]:::db
    L5["팀원 구현 예정 (스텁)"]:::stub
    L1 ~~~ L2 ~~~ L3 ~~~ L4 ~~~ L5
  end
```

## 파일 ↔ 노드 대응

| 노드 | 파일 | LLM |
|------|------|-----|
| 가드레일 | `guardrails.py` (check_input / sanitize_output / is_finance_related) | 0 |
| STM | `session_store.py` | 0 |
| triage | `triage.py` (decision 라우팅 포함) | 0 |
| 용어 사전 | `glossary.py` | 0 |
| 포트폴리오 조회 | `quant.py` 재사용 | 0 |
| 리포트 검색 에이전트 | `report_retriever.py` (Chroma→Supabase→시드) | 0 |
| 일반 해설 | `chat_agent.answer` | 1 |
| 의사결정형 해설 | `decision_agent.answer_decision` (스텁 — 팀원 구현 예정) | 0~1 (현재 chat_agent 위임) |
| 외부 지식 에이전트 | `evidence_finder.py` (NewsAPI/네이버+화이트리스트+캐시, 태그→키워드 변환) | 0 |
| 관련성 게이트 | `guardrails.is_finance_related` | 0 |
| Supervisor | `supervisor.py` (판단·호출·조립, decision 근거 수집 포함) | 0 |

## 팀원이 `decision_agent.py`에 꽂을 때

- `answer_decision(question, reports, news, profile_ctx) -> (text, used_llm)` 시그니처만 유지하면 내부 구현은 자유.
- `reports`(report_retriever가 모은 근거)·`news`(evidence_finder가 모은 보조 근거)는 이미 Supervisor가 검색해서 넘겨준다 — 이 함수 안에서 검색 API를 다시 부를 필요 없음.
- 반환 텍스트는 `sanitize_output`+`DISCLAIMER`까지 붙은 완성본이어야 한다 (`chat_agent.answer`와 동일 계약) — Supervisor는 그대로 화면에 낸다.
- 절대 규칙(근거 밖 내용 금지·매수/매도 지시 금지·리포트 우열 안 가림)은 두 페르소나 모두 공통 적용.

## 발표 포인트 3줄

1. LLM은 문장을 만드는 마지막 한 칸에만 있다 — 분류·검색·계산·검증은 전부 코드.
2. 어떤 실패에도 답은 나간다 — LLM 죽으면 템플릿, 근거 없으면 고정 폴백, 서버 죽으면 FE 목업.
3. 매수 고민("뭐 사?", "살까 말까?")도 막지 않는다 — 종목을 찍어주는 대신 시장 정세와 리포트 근거를 해설하고, 판단은 사용자에게. 의사결정형은 낙관/보수 두 관점 병렬 해설로 확장 예정(현재 라우팅·근거 수집은 완료, 두 페르소나 로직은 팀원 구현 중).

## 관련 문서

- `docs/backend-handoff.md` — 환경변수(`.env`) 전체 구조 + 트러블슈팅 모음 (Gemini 모델 문제로 답이 깨지는 경우, 조용히 실패하는 지점들 등)
- `docs/decision-agent-handoff.md` — 의사결정형 담당 팀원용 인터페이스 계약

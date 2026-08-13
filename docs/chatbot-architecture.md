# Quill 챗봇 아키텍처 — Supervisor + 2 검색 에이전트 (실구현 기준)

```
Supervisor (supervisor.py — 질문 판단·호출·조립, 코드)
  ├─ 🤖 report_retriever  — 크로마/Supabase/시드에서 리포트 근거
  └─ 🤖 evidence_finder   — NewsAPI(해외)·네이버(국내)에서 외부 지식
문장 생성만 chat_agent(LLM)가 담당 — 검색 에이전트들은 전부 코드다.
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

  U["Chat.tsx — 버튼 5종 + 자유 입력<br/>api.ts: 서버 우선 → 실패 시 로컬 chatEngine 폴백<br/>트레이스 배지: ✅서버 응답 / ⚠목업 폴백"]:::ui

  U -->|"POST /api/chat {message, session_id, profile}"| GUARD

  subgraph SVC["supervisor.py — Supervisor 계층 (전부 코드, LLM 아님)"]
    direction TB
    GUARD["guardrails.py check_input — 매 턴 첫 관문<br/>범위 밖(코인 등)→차단 · 매수요구('뭐 사'·'살까')→해설 모드 안내<br/>예측요구('오를까')→해설 모드 안내"]:::guard
    GUARD -->|"차단이면 여기서 종료"| OUT
    GUARD --> STM["session_store.py — STM<br/>session_id 발급/조회 · 최근 4턴 로드 · 만료 24h<br/>기억: 직전 태그 · 직전 유형 · 기출 리포트(seen)"]:::fn
    STM --> TRI["triage.py — 규칙 분류, LLM 0회<br/>후속 감지(그럼/그러면/아까/다시…) → 질문 재구성 + 태그 병합<br/>유형 신호 없는 후속은 직전 유형 상속<br/>버튼 5종은 정확 매칭 = 오분류 0"]:::fn
    TRI --> GATE["관련성 게이트 — 금융 어휘·태그 0건이면 차단<br/>'점심 뭐 먹지?' → 안내 후 종료 (검색·LLM 미실행)<br/>후속 질문은 예외(세션 맥락 있음)"]:::guard
    GATE -->|"범위 밖이면 종료"| OUT
    GATE --> SUP["🧭 <b>Supervisor</b> — 판단·호출·조립 (supervisor.handle)<br/>질문 유형에 따라 어느 에이전트를 부를지 결정:<br/>용어사전? 계산? 🤖report_retriever? 🤖evidence_finder까지?<br/>결과를 모아 chat_agent(LLM)에 전달 → 최종 답 조립"]:::ui

    SUP -->|"개념형: '회사채가 뭐야?'"| GLO["glossary.py — LLM 0회<br/>용어 8종 × 수준 3벌(beginner/mid/advanced)<br/>literacy_level로 선택 + 관련 리포트 2건 연결"]:::fn
    SUP -->|"포트폴리오형: '내 비중은?'"| PORT["quant.py 재계산 — LLM 0회<br/>baseline_weights + explain_baseline 재사용<br/>프로필 없으면 온보딩 유도"]:::fn
    SUP -->|"일정형: '금통위 언제?'"| SCH["준비 중 안내 — LLM 0회<br/>(경로 C 캘린더는 데모 후)"]:::code
    SUP -->|"시장정세형 / 근거형 → 🤖 호출"| SRCH["🤖 report_retriever — 리포트 검색 에이전트 (코드)<br/>Chroma 의미검색 → Supabase → 시드 폴백<br/>market: 3보드 교차 최신순 · 세션 기출 리포트 후순위"]:::fn

    SRCH -->|"리포트 부족? Supervisor(🧭)가 판단"| NEWS["🤖 evidence_finder — 외부 지식 에이전트 (코드)<br/>해외(연준·글로벌) → NewsAPI · domains=reuters,bloomberg<br/>국내(금통위·국고채) → 네이버뉴스 → originallink 화이트리스트<br/>30분 캐시 · 키 없으면 조용히 생략"]:::fn
    NEWS --> ANA
    SRCH -->|"0건"| FB["NO_EVIDENCE_FALLBACK<br/>고정 문구 — 생성 금지"]:::guard
    SRCH -->|"일반 질문"| ANA["chat_agent.answer — LLM 1회<br/>시스템 프롬프트 고정(캐시 친화)<br/>컨텍스트: 리포트 발췌(700자 절단)+프로필 점수+최근 4턴<br/>실패 시 리포트 요약 템플릿 폴백"]:::llm

    GLO --> SAN
    PORT --> SAN
    SCH --> SAN
    FB --> SAN
    ANA --> SAN
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
    NAPI[("NewsAPI<br/>Reuters·Bloomberg 한정<br/>하루 100요청·영문")]:::db
    NNEWS[("네이버 뉴스 검색<br/>한경·매경·서경·연합·이데일리<br/>화이트리스트만 통과")]:::db
  end
  CHR -.->|"evidence·decision 의미 검색 우선"| SRCH
  SUPA -.-> SRCH
  SEED -.-> SRCH
  NAPI -.->|"해외 이슈"| NEWS
  NNEWS -.->|"국내 이슈"| NEWS

  subgraph LEG["범례 · LLM 예산: 턴당 최대 1회 · 나머지 전부 0회 (두 전문가 토론은 별도 탭 — 타 담당)"]
    direction LR
    L1["순수 함수/코드"]:::fn
    L2["LLM 호출"]:::llm
    L3["가드레일"]:::guard
    L4[("데이터")]:::db
    L1 ~~~ L2 ~~~ L3 ~~~ L4
  end
```

## 파일 ↔ 노드 대응

| 노드 | 파일 | LLM |
|------|------|-----|
| 가드레일 | `guardrails.py` (check_input / sanitize_output) | 0 |
| STM | `session_store.py` | 0 |
| triage | `triage.py` | 0 |
| 용어 사전 | `glossary.py` | 0 |
| 포트폴리오 조회 | `quant.py` 재사용 | 0 |
| 리포트 검색 에이전트 | `report_retriever.py` (Chroma→Supabase→시드) | 0 |
| 해설 | `chat_agent.answer` | 1 |
| 외부 지식 에이전트 | `evidence_finder.py` (NewsAPI/네이버+화이트리스트+캐시) | 0 |
| 관련성 게이트 | `guardrails.is_finance_related` | 0 |
| Supervisor | `supervisor.py` (판단·호출·조립) | 0 |

## 발표 포인트 3줄

1. LLM은 문장을 만드는 마지막 한 칸에만 있다 — 분류·검색·계산·검증은 전부 코드.
2. 어떤 실패에도 답은 나간다 — LLM 죽으면 템플릿, 근거 없으면 고정 폴백, 서버 죽으면 FE 목업.
3. 매수 고민("뭐 사?")도 막지 않는다 — 종목을 찍어주는 대신 시장 정세와 리포트 근거를 해설하고, 판단은 사용자에게. (두 전문가 토론 뷰는 별도 탭에서 제공 예정)

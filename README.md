# macmiri · 리포트를 읽어주는 금융 과외

> 증권사 리서치 리포트를 근거로, 사회초년생과 바쁜 직장인을 위한
> 채권·ETF 중심 자산배분을 눈높이에 맞춰 해설하는 AI 금융 어시스턴트.
> **리서치 탭**(1:1 해설) + **훈수 탭**(3인 페르소나 병렬 의견) + **캘린더 탭**(금융 일정).

---

## ⚡ 빠른 실행 — 5분 안에

> 사전 요구사항: **Node.js 18+** · **Python 3.12+** · **pip** · **git**

```bash
# 1) 클론 + 진입
git clone <repo-url> macmiri && cd macmiri

# 2) 백엔드 설치 + 실행
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # Gemini API 키 설정 필수
uvicorn app.main:app --reload --port 8000

# 3) 프론트 설치 + 실행 (새 터미널)
cd frontend
npm install
npm run dev            # → http://localhost:5174
```

→ 브라우저에서 `http://localhost:5174` 접속. 질문 입력 → AI 답변 + 근거 리포트 확인.

---

## 1. 서비스 핵심 — 어떤 문제를 푸는가

| 문제 | macmiri의 해결 |
|------|----------------|
| 증권사 리포트가 너무 어렵다 | **눈높이 해설** — 전문용어를 괄호로 풀어주고, 비유로 설명 |
| 근거 없는 AI 답변은 믿을 수 없다 | **리포트 기반 답변** — 모든 답에 근거 리포트를 함께 제시 |
| 사도 될까? 에 대한 답이 없다 | **3인 페르소나** — 가치/매크로/성장 관점에서 병렬 의견 제공 |
| 성향에 맞는 비중을 모르겠다 | **퀀트 3단계** — 6문항 진단 → 기준 비중 → AI 근거 조정 |
| 어떤 상품을 고르는지 | **32개 큐레이션** — 6버킷 × 검증된 ETF/채권 상품 매핑 |

---

## 2. 시스템 아키텍처

```
┌──────────────────────┐         ┌──────────────────────────────────┐
│     Frontend         │         │           Backend                │
│   (React + Vite)     │  HTTP   │        (FastAPI + Gemini)        │
│                      │ ◄─────► │                                  │
│  · 리서치 탭 (Chat)   │         │  · Supervisor (라우팅)            │
│  · 훈수 탭 (Persona)  │         │  · Triage (질문 분류)             │
│  · 캘린더 탭          │         │  · Chat Agent (LLM 해설)         │
│  · 포트폴리오         │         │  · Persona Agent (3인 의견)       │
│  · 리포트 서재        │         │  · Report Retriever (검색)        │
│  · 성향 진단          │         │  · Evidence Finder (뉴스)         │
└──────────────────────┘         │  · Guardrails (안전장치)          │
                                 │  · Quant Engine (배분 계산)       │
                                 └───────────┬──────────────────────┘
                                             │
                              ┌──────────────┼──────────────┐
                         ┌────▼────┐    ┌────▼────┐    ┌────▼────┐
                         │ Chroma  │    │ Gemini  │    │NewsAPI/ │
                         │(벡터DB) │    │  API    │    │ 네이버  │
                         └─────────┘    └─────────┘    └─────────┘
```

---

## 3. 핵심 기능 흐름

### 3.1 리서치 탭 — 1:1 해설 (Autonomous Agent)

```
사용자 질문
  → Guardrails (범위 밖 차단 / 매수 지시 검출)
  → Triage Agent (질문 유형 자율 분류: concept / portfolio / market / evidence / decision)
  → Report Retriever Agent (Chroma 의미검색 → 키워드 폴백 → 3단 소스 자동 전환)
  → Evidence Finder Agent (뉴스 보조 — 지역 자동 판별 → NewsAPI/네이버 양방향 폴백)
  → Chat Agent (Gemini 해설 생성 — 근거 기반, 상품명 안내, 무관 정보 자동 필터링)
  → 응답: { text, evidence[], trace[] }
```

### 3.2 훈수 탭 — Multi-Agent 병렬 의견

```
사용자 질문
  → 동일 검색 파이프라인 (에이전트 재사용)
  → Persona Agent × 3 (각각 독립 LLM 호출, 서로 다른 투자 철학):
      📐 워런 버핏 (가치투자 — 내재가치·안전마진)
      🔄 레이 달리오 (매크로 — 경제 사이클·자산 상관관계)
      🚀 캐시 우드 (성장/테마 — 파괴적 혁신·기회비용)
  → 부분 실패 허용 (1개 실패해도 나머지 2개 정상 반환)
  → 후속 대화: target_persona 지정 시 1:1 멀티턴 가능
  → 응답: { personas: [{persona, label, emoji, message, evidence}×N] }
```

### 3.3 퀀트 3단계 추천 (Code + LLM 협업)

```
1단계: 성향 진단 6문항 → capacity(객관) + tolerance(주관) → risk 점수 [순수 코드]
2단계: risk 점수 → 6버킷 기준 비중 (현금/패시브ETF/액티브ETF/단기채/장기채/회사채) [순수 코드]
3단계: Gemini Agent가 오늘 리포트를 읽고 ±10%p 델타 제안 [LLM]
       → Quant Engine이 검증·클램프·정규화 [코드가 LLM 출력을 통제]
       → 근거 없는 제안은 자동 폐기 (코드 레벨 안전장치)
```

### 3.4 캘린더 탭 — 금융 소식 알림 (실시간 API Agent)

```
페이지 로드
  → Calendar Data Agent:
      · FOMC 2026 일정 (하드코딩 기본 데이터)
      · 한국은행 금통위 일정
      · 지수 리밸런싱 (KOSPI 200, MSCI 등)
  → Calendar Sources Agent (실시간 API 3종 자동 수집):
      · 실적발표 일정 API
      · 경제지표 발표 API
      · 국채입찰 일정 API
  → 날짜·카테고리별 자동 그룹핑 + UI 렌더링
  → 사용자가 일정 클릭 → 관련 리포트/뉴스 연결 가능
```

---

## 4. Agentic AI 아키텍처 — 에이전트 워크플로우

### 4.1 Supervisor 패턴 (자율 라우팅)

macmiri는 **Supervisor/Specialist 패턴**을 채택합니다. 하나의 Supervisor가
사용자 의도를 자율적으로 판단하고, 적합한 Specialist Agent를 호출합니다.

```
                         ┌─────────────────┐
                         │   Supervisor    │  ← 모든 요청의 진입점
                         │  (자율 라우팅)   │
                         └────────┬────────┘
                ┌─────────────────┼─────────────────────┐
                │                 │                     │
         ┌──────▼──────┐   ┌─────▼─────┐   ┌──────────▼──────────┐
         │   Triage    │   │ Guardrails│   │  LLM Topic Check    │
         │ (규칙 분류)  │   │ (안전장치) │   │ (자율 관련성 판정)   │
         └──────┬──────┘   └───────────┘   └─────────────────────┘
                │
    ┌───────────┼───────────┬──────────────┬──────────────┐
    │           │           │              │              │
┌───▼───┐ ┌────▼────┐ ┌────▼────┐  ┌─────▼─────┐ ┌─────▼─────┐
│Concept│ │Portfolio│ │ Market/ │  │ Decision  │ │ Persona   │
│Agent  │ │ Engine  │ │Evidence │  │  Agent    │ │ Agent ×3  │
│(용어) │ │(퀀트)   │ │ Agent   │  │(의사결정) │ │(병렬 의견) │
└───────┘ └─────────┘ └────┬────┘  └───────────┘ └───────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
        ┌─────▼─────┐ ┌────▼────┐  ┌─────▼─────┐
        │  Report   │ │Evidence │  │  Product  │
        │ Retriever │ │ Finder  │  │  Store    │
        │(벡터검색) │ │(뉴스API)│  │(상품매칭) │
        └───────────┘ └─────────┘  └───────────┘
```

### 4.2 에이전트 자율성 — 어디서 "스스로 판단"하는가

| 에이전트 | 자율 판단 내용 | 실패 시 행동 |
|----------|---------------|-------------|
| **Supervisor** | 질문 유형 분류, 검색 필요 여부, 페르소나 호출 여부 | — |
| **Triage** | 규칙 기반 분류 + 후속 질문 자동 재구성 | 기본값(market)으로 폴백 |
| **LLM Topic Check** | 금융 관련성을 대화 맥락까지 고려해 자율 판정 | 안전하게 off_topic 처리 |
| **Report Retriever** | 3단 소스(Chroma→Supabase→시드) 자동 전환 | 하위 소스로 폴백 |
| **Evidence Finder** | 지역 판별(해외/국내) + 양방향 키 폴백 | 빈 리스트 (서비스 안 죽음) |
| **Chat Agent** | 무관한 리포트 자동 필터링, 상품 감지 시 목록 주입 | 템플릿 폴백 (LLM 0회) |
| **Persona Agent** | 부분 실패 허용, 프롬프트 잔재 자동 제거 | 실패 자리만 안내 메시지 |
| **Gemini Delta Agent** | 리포트를 읽고 자산 조정 제안 (±10%p) | 빈 배열 (조정 없음 = 안전) |
| **Concept Agent** | glossary miss 시 LLM 직접 설명으로 자동 전환 | 고정 안내 문구 |
| **Calendar Agent** | 3종 실시간 API 수집 + 날짜 그룹핑 | 기본 일정만 표시 |

### 4.3 핵심 설계 원칙 — "AI가 죽어도 서비스는 안 죽는다"

```
모든 LLM 호출 지점:
  try → LLM 정상 응답
  except → 템플릿/폴백/빈 배열 (서비스는 계속 동작)

모든 외부 API 호출:
  성공 → 정상 처리
  실패 → 대체 소스로 자동 전환 또는 조용히 빈 리스트
```

| 장애 시나리오 | 서비스 동작 |
|--------------|-----------|
| Gemini API 다운 | 템플릿 폴백 (리포트 요약 조립, LLM 0회) |
| Chroma 벡터DB 다운 | 키워드 스코어 검색으로 자동 전환 |
| NewsAPI 쿼터 초과 | 조용히 빈 리스트 (리포트만으로 답변) |
| 네이버 뉴스 키 없음 | NewsAPI(global)로 자동 폴백 |
| 페르소나 1개 타임아웃 | 나머지 2개는 정상 반환 |
| Supabase 인증 미설정 | 비로그인 모드로 전체 기능 동작 |

### 4.4 에이전트 간 협업 흐름 (종합)

```
[사용자] "국고채 사도 될까?"

 ① Guardrails Agent
    → "살까" 감지 → explain 모드 (차단 아닌 안내 표시)

 ② Triage Agent  
    → "사도 될까" → DECISION_PAT 매칭 → decision 유형
    → 태그 추출: ['채권-장기-국채']

 ③ Supervisor 자율 판단
    → decision이므로 report_retriever + evidence_finder 모두 호출 결정

 ④ Report Retriever Agent
    → Chroma 의미검색 "국고채 사도 될까?" → 관련 리포트 4건

 ⑤ Evidence Finder Agent  
    → pick_region("국고채") → domestic
    → 네이버 키 없음 → 자동으로 NewsAPI 폴백 → 영문 검색 → 3건

 ⑥ Chat Agent (LLM)
    → 시스템 프롬프트 + 리포트 4건 + 뉴스 3건 + 프로필
    → 무관한 뉴스 자동 필터링 (프롬프트 규칙)
    → 상품 목록 감지 → PRODUCT_HALLUCINATION_GUARD 주입
    → Gemini 생성 → sanitize_output → PII 제거

 ⑦ 응답 조립
    → { text, evidence[4], trace[5], turn_type: "decision" }
```

---

## 5. 가드레일 (안전장치)

| 계층 | 역할 |
|------|------|
| **OUT_OF_SCOPE** | 코인/선물/옵션/레버리지 → 즉시 차단 (deny) |
| **ASK_FOR_ORDER** | 매수/매도 직접 지시 → explain 모드 전환 (답은 하되 안내 표시) |
| **ASK_FOR_PREDICTION** | 확정적 예측 요구 → explain 모드 전환 |
| **관련성 게이트** | FINANCE_VOCAB + triage 태그 + LLM 판정 (3중 체크, 대화 맥락 참조) |
| **sanitize_output** | "추천합니다"→"해설해 드립니다" 등 표현 치환 |
| **PII 제거** | 애널리스트 이메일/전화번호 자동 제거 |
| **상품 환각 차단** | PRODUCT_HALLUCINATION_GUARD — 목록에 없는 상품명 생성 금지 |

---

## 5. 데이터

### 5.1 리포트

| 소스 | 수량 | 갱신 |
|------|------|------|
| 네이버 리서치 (채권분석/경제분석/투자정보) | 124건 (JSON 시드) | `collector/collect.py` |
| Chroma 벡터 인덱싱 (의미검색용) | 9건 202청크 | `scripts/index_reports.py` |

### 5.2 상품

| 버킷 | 상품 수 | 예시 |
|------|:---:|------|
| 현금성 | 3 | TIGER CD금리투자KIS, KODEX 머니마켓액티브 |
| 단기채 | 3 | RISE 국고채3년, KIWOOM 통안채1년 |
| 장기채 | 3 | KIWOOM 국고채10년, KODEX 국고채30년액티브 |
| 회사채 | 3 | RISE 중기우량회사채, TIGER 우량회사채액티브 |
| 패시브 ETF | 3 | KODEX 200, TIGER 미국S&P500, TIGER 미국나스닥100 |
| 액티브 테마 ETF | 17 | AI, 반도체, 2차전지, 로봇, 바이오, 우주항공 등 |

---

## 6. API

### 6.1 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| `POST` | `/api/chat` | 챗 (리서치/훈수 통합) |
| `POST` | `/api/risk-profile` | 1~2단계 성향 계산 |
| `POST` | `/api/portfolio/recommend` | 3단계 추천 |
| `GET`  | `/api/calendar/events` | 금융 일정 |
| `GET`  | `/health` | 헬스 체크 |

### 6.2 POST /api/chat — 요청/응답

```json
// 요청
{
  "message": "국고채 사도 될까?",
  "mode": "chat",           // "chat" | "persona"
  "session_id": "abc123",   // null이면 서버 발급
  "profile": { "capacity": 55, "tolerance": 70, "risk": 64, "literacy_level": "beginner" },
  "target_persona": null,   // 훈수 탭 후속 대화 시 특정 페르소나 지정
  "persona_history": null   // 이전 대화 맥락
}

// 응답 (리서치 탭)
{
  "text": "장기 금리 상승 속도가 둔화될 것으로 예상됩니다...",
  "evidence": ["20260810_debenture_560384000", ...],
  "turn_type": "decision",
  "session_id": "abc123",
  "used_llm": true,
  "trace": [...]
}

// 응답 (훈수 탭)
{
  "text": "",
  "personas": [
    { "persona": "워런 버핏", "label": "가치투자", "emoji": "📐", "message": "...", "evidence": [...] },
    { "persona": "레이 달리오", "label": "매크로", "emoji": "🔄", "message": "...", "evidence": [...] },
    { "persona": "캐시 우드", "label": "성장/테마", "emoji": "🚀", "message": "...", "evidence": [...] }
  ],
  "disclaimer": "표시된 비중은 예시이며 투자 권유가 아닙니다...",
  "turn_type": "persona"
}
```

---

## 7. 기술 스택

| 계층 | 기술 |
|------|------|
| Frontend | React 18, TypeScript, Vite, React Router |
| Backend | Python 3.12+, FastAPI, Pydantic |
| LLM | Google Gemini 2.5 Flash (REST API 직접 호출) |
| 벡터 DB | ChromaDB + SentenceTransformers (paraphrase-multilingual-mpnet) |
| 뉴스 | NewsAPI (해외) + 네이버 뉴스 검색 (국내, 폴백) |
| 인증 | Supabase Auth (선택 — 키 없으면 비로그인 모드) |
| 배포 | 로컬 uvicorn + Vite dev server |

---

## 8. 디렉토리 구조

```
.
├── README.md
├── backend/
│   ├── app/
│   │   ├── main.py              FastAPI 앱 + 라우트
│   │   ├── supervisor.py        Supervisor (질문 라우팅)
│   │   ├── triage.py            Triage (규칙 기반 분류)
│   │   ├── chat_agent.py        리서치 탭 LLM 해설
│   │   ├── persona_agent.py     훈수 탭 페르소나 호출
│   │   ├── personas.py          3인 페르소나 프롬프트
│   │   ├── decision_agent.py    의사결정형 (chat_agent 임시 대체)
│   │   ├── report_retriever.py  리포트 검색 (Chroma → Supabase → 시드)
│   │   ├── evidence_finder.py   뉴스 검색 (NewsAPI / 네이버)
│   │   ├── guardrails.py        가드레일 + 관련성 게이트
│   │   ├── product_store.py     상품 검색 + 환각 방지
│   │   ├── quant.py             퀀트 3단계 계산
│   │   ├── gemini_agent.py      3단계 델타 제안
│   │   ├── glossary.py          용어 사전
│   │   ├── session_store.py     STM (인메모리 세션)
│   │   ├── chat_schemas.py      요청/응답 스키마
│   │   ├── schemas.py           퀀트 스키마
│   │   └── calendar_data.py     캘린더 일정 데이터
│   ├── data/
│   │   ├── reports.json         리포트 시드 (124건)
│   │   ├── products.json        상품 데이터 (32건)
│   │   └── reports/             리포트 원문 txt (Chroma 인덱싱용)
│   ├── scripts/
│   │   └── index_reports.py     Chroma 벡터 인덱싱
│   ├── tests/                   pytest (105+개)
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── pages/               Chat, Portfolio, Library, Calendar, ...
│   │   ├── components/          AppSidebar, EvidencePanel, ChatWidget, ...
│   │   ├── lib/                 api.ts, chatEngine.ts, quant.ts, ...
│   │   ├── styles/              CSS (토큰, 셸, 챗, 온보딩)
│   │   └── data/reports.json    프론트 리포트 데이터
│   ├── public/logo.svg
│   ├── index.html
│   └── package.json
├── collector/
│   ├── collect.py               네이버 리서치 수집기 (SQLite → JSON)
│   └── viewer.py                수집 DB 뷰어
├── supabase/
│   ├── schema.sql               Supabase 스키마 (선택)
│   └── rls.sql                  RLS 정책
└── docs/
    ├── chatbot-architecture.md
    ├── backend-handoff.md
    └── decision-agent-handoff.md
```

---

## 9. 환경 변수

```env
# 필수
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash

# 프론트 허용 origin
ALLOWED_ORIGIN=http://localhost:5174

# 선택 — Chroma 벡터 검색 (없으면 키워드 스코어 폴백)
CHROMA_PATH=./db/chroma
CHROMA_COLLECTION=reports

# 선택 — 뉴스 보조 근거 (없으면 리포트만으로 동작)
NEWSAPI_KEY=your_newsapi_key
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=

# 선택 — Supabase 인증 (없으면 비로그인 모드)
SUPABASE_URL=
SUPABASE_ANON_KEY=
```

---

## 10. 테스트

```bash
cd backend
source .venv/bin/activate
python -m pytest tests/ -v
# → 105+ passed
```

| 테스트 파일 | 범위 |
|------------|------|
| `test_chat.py` | 전체 흐름 (23개 시나리오) |
| `test_guardrails.py` | 가드레일 + 어간 변형 (30개) |
| `test_persona.py` | 훈수 탭 (11개) |
| `test_quant.py` | 퀀트 계산 (12개) |
| `test_pii_strip.py` | PII 제거 (8개) |
| `test_evidence_finder.py` | 뉴스 폴백 (5개) |
| `test_products.py` | 상품 검색 (10개) |
| `test_calendar.py` | 캘린더 (6개) |

---

## 11. 팀

| 역할 | 담당 |
|------|------|
| 백엔드 아키텍처 + AI 파이프라인 | sunwhopark |
| 프론트엔드 디자인 + UI | yuju-yn |
| Chroma 인덱싱 + Agent-as-Tool | kminbo |
| 챗봇 백엔드 + 인수인계 문서 | yeono1220 |

---

## 12. 알려진 제약

| 제약 | 이유 | 실서비스 권장 |
|------|------|-------------|
| STM 인메모리 (서버 재시작 시 소실) | 데모용 단일 프로세스 | Supabase conversation_turns 영속화 |
| Chroma 단일 인스턴스 | 로컬 개발 환경 | 클라우드 벡터 DB (Pinecone 등) |
| 뉴스 검색어가 영어 고정 폴백 | 태그→영어 매핑 미완성 | 태그별 영어 매핑 테이블 확장 |
| Gemini 응답 비결정성 | LLM 특성 | temperature 조절 + 후처리 강화 |
| 회원 인증 선택 사항 | 데모 편의 | Supabase Auth 필수 활성화 |
| 상품 데이터 정적 JSON | 수동 큐레이션 | 실시간 API 연동 (KRX, 운용사) |

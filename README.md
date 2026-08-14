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

### 3.1 리서치 탭 — 1:1 해설

```
사용자 질문
  → Guardrails (범위 밖 차단 / 매수 지시 검출)
  → Triage (질문 유형 분류: concept / portfolio / market / evidence / decision)
  → Report Retriever (Chroma 의미검색 → 키워드 폴백)
  → Evidence Finder (뉴스 보조 — NewsAPI 폴백)
  → Chat Agent (Gemini 해설 생성 — 근거 기반, 상품명 안내)
  → 응답: { text, evidence[], trace[] }
```

### 3.2 훈수 탭 — 3인 페르소나 병렬 의견

```
사용자 질문
  → 동일 검색 파이프라인
  → Persona Agent: 워런 버핏(가치) / 레이 달리오(매크로) / 캐시 우드(성장)
    각각 Gemini 1회 호출 (3문장, 150자 이내, 인용 없이 의견만)
  → 응답: { personas: [{persona, label, emoji, message, evidence}×3] }
```

### 3.3 퀀트 3단계 추천

```
1단계: 성향 진단 6문항 → capacity(객관) + tolerance(주관) → risk 점수
2단계: risk 점수 → 6버킷 기준 비중 (현금/패시브ETF/액티브ETF/단기채/장기채/회사채)
3단계: Gemini가 오늘 리포트를 읽고 ±10%p 델타 제안 → 코드가 검증·클램프·정규화
```

---

## 4. 가드레일 (안전장치)

| 계층 | 역할 |
|------|------|
| **OUT_OF_SCOPE** | 코인/선물/옵션/레버리지 → 즉시 차단 (deny) |
| **ASK_FOR_ORDER** | 매수/매도 직접 지시 → explain 모드 전환 (답은 하되 안내 표시) |
| **ASK_FOR_PREDICTION** | 확정적 예측 요구 → explain 모드 전환 |
| **관련성 게이트** | FINANCE_VOCAB + triage 태그 + LLM 판정 (3중 체크) |
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

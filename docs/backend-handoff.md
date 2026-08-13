# 백엔드 인수인계 — 환경설정 & 트러블슈팅

작성일 2026-08-13 · 브랜치 `feature/chat-backend` (커밋 `5817d56` 기준)

이 문서는 "왜 안 되지?"를 겪을 때 제일 먼저 볼 문서다. 오늘 하루 동안 실제로
막혔던 것들 위주로 적었다 — 전부 재현/원인 확인까지 끝난 것들이다.

---

## 1. `.env` 전체 구조

`backend/.env.example`을 복사해서 `backend/.env`를 만든다. **`.env`는 git에
안 올라간다** (`.gitignore`에 등록됨) — 새 팀원은 반드시 직접 값을 채워야 한다.

| 키 | 필수? | 없으면 어떻게 되나 | 어디서 발급 |
|---|---|---|---|
| `GEMINI_API_KEY` | 사실상 필수 | 없으면 LLM 해설 전부 템플릿 폴백 (서비스는 안 죽음, 문장만 덜 매끄러움) | Google AI Studio |
| `GEMINI_MODEL` | 필수 (기본값 있음) | `.env.example` 기본값이 `gemini-2.5-flash` — **`gemini-2.0-flash`로 바꾸면 안 됨(은퇴됨, 아래 2-A 참고)** | - |
| `ALLOWED_ORIGIN` | 필수 (기본값 있음) | CORS. FE 개발 서버 주소(`http://localhost:5174`) | - |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | 선택 | 비어 있으면 `backend/data/reports.json` 로컬 시드(124건)로 동작 | Supabase 프로젝트 설정 |
| `CHROMA_HOST`+`CHROMA_PORT` **또는** `CHROMA_PATH` | 선택 | 둘 다 비어 있으면 Chroma를 아예 안 씀 → Supabase/시드로 폴백 (검색 품질만 낮아짐, 안 죽음) | DB 담당에게 요청 |
| `CHROMA_COLLECTION` | Chroma 쓸 때만 | 컬렉션 이름이 안 맞으면 조회 자체가 실패 → 자동으로 키워드 검색 폴백 (조용히 실패해서 원인 찾기 어려움, 4번 참고) | DB 담당과 이름 합의 |
| `NEWSAPI_KEY` | 선택 | 없으면 해외(연준·글로벌) 뉴스 보완이 조용히 생략 | newsapi.org/register |
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | 선택 | 없거나 잘못되면 국내 뉴스 보완이 조용히 생략 | 네이버 개발자센터 → "검색" API 등록 |

**중요 — "선택" 항목들은 전부 "없으면 그냥 생략"이지 에러가 안 난다.** 리포트/뉴스
검색 코드는 전부 `try/except`로 감싸져 있고, 실패하면 콘솔에 로그만 찍고 다음
소스로 폴백한다 (`report_retriever.py`, `evidence_finder.py` 주석 참고). 그래서
"근거가 왜 이렇게 부실하지?" 싶으면 원인은 대부분 여기 표(어떤 선택 항목이
비어 있거나 실패 중인지)에 있다.

---

## 2. Gemini 관련 — 오늘 실제로 겪은 3가지 증상

`backend/scripts/test_gemini.py`를 돌리면 이 3가지를 자동으로 구분해서 알려준다.
PowerShell에서:
```powershell
cd backend
.venv\Scripts\python.exe scripts\test_gemini.py
```

### 2-A. HTTP 404 — "모델이 없음"
**증상:** 챗 응답이 항상 `used_llm: false`, 서버 콘솔에
`[chat_agent] LLM 실패, 템플릿 폴백: ...404...`
**원인:** `GEMINI_MODEL`에 은퇴된 모델명을 넣음 (`gemini-2.0-flash`가 대표적 — 이미
서비스 종료됨). **`gemini-2.5-flash`를 써야 한다.**
**고치는 법:** `.env`의 `GEMINI_MODEL` 수정 → **uvicorn 완전 재시작** (`.env`는
`--reload`가 감지 못 함, 창 닫고 새로 켜야 함).

### 2-B. HTTP 200인데 답이 중간에 뚝 끊김 (오늘 발견한 진짜 원인)
**증상:** `used_llm: true`인데 답변이 "~에 대해 흥미로운" 같은 데서 문장이
끊기고 바로 면책 문구로 넘어감. 이게 "챗봇 답이 이상하다"의 정체였다.
**원인:** `gemini-2.5-flash`는 "생각(thinking)"을 하는 모델이라, 답변에 쓸
토큰 예산(`maxOutputTokens`)을 내부 사고에 다 써버릴 수 있다. 실측: 700토큰
예산 중 669토큰이 thinking에, 실제 답변은 27토큰만 남아서 `finishReason:
MAX_TOKENS`로 잘림.
**고치는 법:** 이미 고쳐놨다 (`chat_agent.py`의 Gemini 호출에
`thinkingConfig: {"thinkingBudget": 0}` 추가됨, 커밋 `a898f39`). **BE를 다시
손대는 사람이 이 설정을 실수로 지우면 똑같은 증상이 재발한다** — 답이 자꾸
끊긴다 싶으면 이 줄이 살아있는지부터 확인.

### 2-C. HTTP 429 — 쿼터 초과
**증상:** 위 2-B와 겉보기 증상이 다름 — `used_llm: false`, 서버 콘솔에
`[chat_agent] LLM 실패, 템플릿 폴백: ...429...`. 갑자기 잘 되던 게 안 될 때 이거일
확률이 높다.
**원인:** Gemini 무료 티어는 분당/일일 호출 제한이 있다. 진단 스크립트·테스트를
반복 실행하면 금방 찬다 (오늘 실제로 겪음).
**고치는 법:** 시간이 지나면(보통 분 단위) 자동 리셋된다. 급하면 Google AI
Studio에서 키 쿼터 확인. **코드 문제가 아니니 디버깅 시간 낭비하지 말 것.**

### 판단 순서 정리
```
used_llm: false 뜨면
  → 서버 콘솔의 "[chat_agent] LLM 실패, 템플릿 폴백: XXX" 줄을 본다
    404 포함 → GEMINI_MODEL 오타/은퇴 모델
    429 포함 → 쿼터 초과, 기다리면 해결
    그 외(타임아웃 등) → TIMEOUT_SEC(12초) 안에 응답이 안 왔거나 네트워크 문제

used_llm: true인데 답이 이상하면
  → 문장이 중간에 끊겼는지 본다 → thinkingConfig 설정 확인 (2-B)
```

---

## 3. 네이버 뉴스 API — 현재 401 (미해결, BE 코드 문제 아님)

`backend/.env`에 있는 `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET`으로 직접 호출하면:
```
HTTP 401 — {"errorMessage":"NID AUTH Result Invalid (1000)", "errorCode":"024"}
```
파이썬 코드를 거치지 않고 `curl`로 직접 호출해도 동일하게 실패 — **코드 문제가
아니라 네이버 쪽에서 이 키 조합 자체를 거부하는 것**. `.env` 파일도 앞뒤 공백·
따옴표 등 인코딩 문제 없음을 바이트 단위로 확인함.

의심되는 점: 지금 `NAVER_CLIENT_SECRET`이 40자인데, 네이버 검색 API 시크릿은
보통 10~16자다. 재발급 시 확인할 것:
- 네이버 개발자센터에서 해당 애플리케이션에 **"검색" API가 실제로 추가**돼 있는지
- Client ID/Secret이 그 앱의 것이 맞는지 (다른 상품용 키가 섞였을 가능성)

NewsAPI(해외, Reuters/Bloomberg)는 정상 작동 확인됨 — 이건 국내 소스만의 문제.

키 없거나 실패해도 `evidence_finder.py`가 조용히 빈 리스트를 반환하도록 짜여
있어서, 챗봇 자체는 죽지 않는다 — 국내 뉴스 보완만 안 붙을 뿐이다.

---

## 4. "조용한 실패"들 — 에러가 안 나서 더 헷갈리는 것들

이 프로젝트의 원칙("어떤 실패에도 답은 나간다")이 만드는 부작용: **뭔가 잘못
설정돼 있어도 에러 화면이 안 뜨고 그냥 품질이 낮은 답이 나온다.** 디버깅할 때
아래를 의심할 것.

- **Chroma 컬렉션 이름이 안 맞음** → `report_retriever._search_chroma()`가
  예외를 잡아서 `None`을 반환하고 조용히 키워드 검색으로 폴백. 콘솔에
  `[report_store] Chroma 검색 실패, 키워드 검색으로 폴백: ...` 로그만 찍힘 —
  이 줄을 놓치면 "왜 크로마 연결했는데 검색 품질이 그대로지?"에서 못 벗어남.
- **뉴스가 하나도 안 붙음** → 키 미설정/401/쿼터초과 셋 다 증상이 똑같이
  "뉴스 0건"으로 보인다. `evidence_finder.py`의 `except` 블록 로그
  (`[news_store] ... 실패(무시): ...`)를 봐야 구분 가능.
- **정상적인 금융 질문이 "범위 밖"으로 차단됨** → `guardrails.FINANCE_VOCAB`
  어휘 목록에 그 단어가 없어서다. 오늘도 "증시", "변동성", "이슈" 같은 흔한
  단어가 빠져 있어서 겪었다. 이런 게이트 오탐을 발견하면: 그 문장에 있는
  단어가 `guardrails.py`의 `FINANCE_VOCAB`에 있는지 먼저 확인.
- **의사결정형("살까 말까")인데 근거가 하나도 안 붙음** → `decision_agent.py`는
  스텁이라 `chat_agent`로 위임되는데, `report_retriever.search()`가 evidence
  모드로 돌면서 태그가 하나도 안 잡히면 근거 0건이 나올 수 있다
  (`supervisor.py`의 `is_market_like` 분기가 이걸 완화하도록 돼 있음 — 이
  로직이 지워지면 재발).

---

## 5. 서버 운영 — Windows/PowerShell 함정

- venv 활성화 후 `uvicorn`은 **`backend` 폴더 안에서** 실행해야 한다
  (`app.main:app`을 상대 경로로 찾기 때문).
- **`.env`를 바꾸면 uvicorn을 완전히 껐다 켜야 한다.** `--reload`는 `.py` 파일
  변경만 감지하고 `.env`는 못 본다 — 이거 몰라서 오늘도 한 번 헷갈렸다.
- 테스트는 `pytest`/`httpx`가 필요 (`requirements.txt`에 포함돼 있음,
  `pip install -r requirements.txt`로 같이 깔림).
- 진단 스크립트 둘: `backend/scripts/test_gemini.py`, `backend/scripts/test_chroma.py`.
  콘솔 한글이 깨지면 `$env:PYTHONIOENCODING="utf-8"`을 먼저 설정.

---

## 6. 지금 BE는 동결 상태

이 문서 작성 시점부터 백엔드 코드는 추가로 안 건드리는 걸로 합의됐다
(`feature/chat-backend`, 커밋 `5817d56`까지 반영). 문제를 발견하면 이 문서에
증상·원인·재현 방법을 추가하는 것까지만 하고, 코드 수정은 별도로 논의 후 진행.

## 관련 문서

- `docs/chatbot-architecture.md` — 전체 아키텍처 mermaid 다이어그램
- `docs/decision-agent-handoff.md` — 의사결정형(두 전문가 토론) 담당자용 인터페이스 계약

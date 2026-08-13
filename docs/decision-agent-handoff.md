# decision_agent 인수인계 — 의사결정형(두 전문가 토론) 담당자용

작성일 2026-08-13 · 브랜치 `feature/chat-backend` (커밋 `a898f39`)

## 지금 상태 요약

"살까 말까", "어떤 게 나아" 같은 **의사결정형 질문의 라우팅 + 근거 수집은 이미 다 붙어 있습니다.**
`backend/app/decision_agent.py`의 `answer_decision()` 함수 **내부만** 낙관/보수 두 페르소나
로직으로 교체하시면 됩니다. 검색 API를 새로 부르실 필요 없고, 라우팅도 건드릴 필요 없습니다.

지금은 이 함수가 임시로 `chat_agent`(단일 해설)를 호출하도록 스텁이 채워져 있어서,
아직 구현 전이어도 서비스는 정상 동작합니다 (트레이스에 "decision_agent(팀원 구현 전 —
chat_agent 임시 대체)"라고 표시됨).

## 어디서부터 시작하면 되나요

```
backend/app/decision_agent.py   ← 이 파일의 answer_decision() 함수만 교체
```

```python
def answer_decision(question: str, reports: list[dict], news: list[dict] | None,
                     profile_ctx: str = "") -> tuple[str, bool]:
    ...
    return text, used_llm
```

- **입력은 이미 Supervisor(`supervisor.py`)가 다 모아서 줍니다.**
  - `question`: 검색용으로 재구성된 사용자 질문 (후속 질문이면 이전 턴과 합쳐진 문장)
  - `reports`: report_retriever가 찾은 근거 리포트 목록 (아래 실제 스키마 참고)
  - `news`: evidence_finder가 찾은 보조 뉴스 (0건일 수 있음 — 특히 지금 네이버 API가
    401로 죽어 있어서 국내 뉴스는 거의 항상 빈 리스트로 옵니다. 아래 "알아두실 것" 참고)
  - `profile_ctx`: 사용자 위험 성향을 요약한 문자열 (예시는 아래)
- **반환은 `(완성된 답변 텍스트, LLM을 실제로 썼는가)`** — `chat_agent.answer()`와 똑같은 계약입니다.
  - 텍스트에는 `sanitize_output` + `DISCLAIMER`까지 이미 붙여서 반환해야 합니다
    (Supervisor는 반환값을 그대로 화면에 냅니다 — 재가공 안 함).
  - `guardrails.sanitize_output`, `guardrails.DISCLAIMER`를 그대로 가져다 쓰면 됩니다.

## 절대 규칙 (전체 서비스 공통 — 두 페르소나 모두에 적용)

- 넘겨받은 `reports`/`news` 발췌 **안의 내용만** 근거로 삼는다. 없는 사실·숫자를 지어내지 않는다.
- 매수·매도 지시, 종목 추천, 수익 보장, 확정적 예측 금지. 리포트 전망은 "리포트는 ~로 전망합니다"로 출처 명시.
- 리포트 간 관점이 갈리면 우열을 가리지 않고 나란히 소개한다 — 이게 바로 두 페르소나(📈 낙관 / 🛡️ 보수) 설계의 근거다.
- 인용한 리포트는 (증권사, 제목) 형태로 본문에 자연스럽게 밝힌다.
- `chat_agent.py`의 `SYSTEM_PROMPT` 상수를 참고하면 톤·규칙이 그대로 재사용 가능합니다.

## 실제 입력 데이터 예시

**`reports` 원소 하나 (`data/reports.json` 실데이터 기준):**
```json
{
  "id": "N-39887",
  "title": "08/13, 미 증시, 가치주 차익실현에도, CPI 안도감, A..",
  "house": "키움증권",
  "date": "2026-08-13",
  "category": "invest",
  "tags": ["채권-장기-국채", "금리", "매크로"],
  "summary": ["증시 코멘트 및 대응 전략 12일(수) 미국 증시는 ...", "..."],
  "excerpt": "[키움증권 · 08/13, 미 증시 ...] 증시 코멘트 및 대응 전략 ..."
}
```
(Chroma가 연결되면 필드는 `report_retriever._row_from_chroma`가 같은 모양으로 맞춰서 줍니다.)

**`news` 원소 하나 (`evidence_finder.py` 반환 형태):**
```json
{
  "source": "Reuters",
  "title": "Fed holds rates steady, signals caution on inflation",
  "description": "짧은 요약 (본문 전체 아님 — 페이월)",
  "url": "https://www.reuters.com/...",
  "published_at": "2026-08-10",
  "region": "global"
}
```

**`profile_ctx` 예시 문자열 (`supervisor._profile_ctx`가 만들어 줌):**
```
위험 점수 64 (수용력 55·선호도 70), 이해 수준 beginner. 기준 비중: 현금성 20% ·
ETF 40%(패시브 30/액티브 10) · 채권 40%(장기 20/단기 10/회사채 10)
```
프로필이 없는 턴이면 빈 문자열(`""`)이 옵니다 — 개인화 없이 답해야 합니다.

## 지금 라우팅이 어떻게 여기까지 오는지 (참고용, 안 건드려도 됨)

1. `triage.py`의 `DECISION_PAT`이 "할까/말까/살까/팔까/괜찮아/나을까/어떤 게/뭐 사" 등을 잡아 `turn_type="decision"`으로 분류
2. `supervisor.py`가 `report_retriever.search()`로 근거를 모음
   - 태그가 잡히면(`"국채 늘릴까"`) 태그+키워드 검색, 태그가 안 잡히는 막연한 질문(`"나 뭐사"`)이면 시장 전체 최신 리포트로 자동 확장 — 근거 0건이 나오지 않게 설계돼 있음
3. **뉴스는 리포트가 충분해도 항상 시도**합니다 (`force=True`) — 의사결정엔 최신 소식이 중요할 수 있다는 판단
4. 근거가 결국 0건이면 `decision_agent`까지 오지 않고 `NO_EVIDENCE_FALLBACK` 고정 문구로 끝남 (여기는 손댈 필요 없음)

## 알아두실 것 (제 책임 범위 — 참고만 하세요)

- **네이버 뉴스 API가 지금 401(인증 실패)** 입니다. `.env`에 있는 키가 문서에 적힌 그대로인데도
  실패해서, 네이버 개발자센터 쪽 앱 등록 상태를 제가 다시 확인해야 합니다. 그동안은 `news`가
  국내 이슈에서는 거의 항상 빈 리스트로 옵니다 — 두 페르소나 로직은 `news`가 없어도
  `reports`만으로 정상 작동하게 짜시는 걸 권장합니다.
- NewsAPI(해외, Reuters/Bloomberg)는 정상 작동 확인했습니다.
- 로컬 `.env` 세팅이나 "왜 답이 이상하지" 류는 이 문서 말고 **`docs/backend-handoff.md`**
  (환경변수 전체 구조 + 트러블슈팅 모음)를 먼저 보세요 — Gemini 모델이 잘못돼 있으면
  답이 어떻게 망가지는지, 조용히 실패하는 부분들이 어디인지 정리해뒀습니다.
- 완성되면 `supervisor.py`의 트레이스 라벨(`"decision_agent(팀원 구현 전 — chat_agent 임시
  대체)"`)을 실제 상태에 맞게 바꿔주시면 좋습니다 — 필수는 아니고, 데모 때 트레이스 위젯에
  그대로 노출되는 문구라 남겨두면 "아직 스텁"으로 보일 수 있어서요.

## 로컬에서 바로 테스트하는 법

```bash
cd backend
.venv/Scripts/python.exe -m uvicorn app.main:app --reload
```
```bash
curl -X POST http://localhost:8000/api/chat -H "Content-Type: application/json" \
  -d '{"message": "국채 비중을 지금 늘릴까 말까 고민이에요"}'
```
응답의 `trace[]`에서 `turn_type: "decision"`과 `Analysis` 단계 라벨을 확인하시면 됩니다.
전체 회귀 테스트: `.venv/Scripts/python.exe -m pytest tests/ -q` (현재 41개 통과, 그 중
`test_decision_question_routes_and_uses_evidence`가 이 경로를 검증합니다).

## 아키텍처 전체 그림

전체 흐름(가드레일→triage→검색→해설)은 `docs/chatbot-architecture.md`의 mermaid 다이어그램을
참고하세요 — decision 경로가 스텁(점선 보라색 노드)으로 표시돼 있습니다.

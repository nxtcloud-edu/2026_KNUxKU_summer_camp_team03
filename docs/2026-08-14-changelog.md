# 2026-08-14 작업 로그 — decision 경로 STM 배선 + 의사결정형 균형 가드레일

브랜치 `feature/chat-backend` · 원격 `010cd51`(훈수 탭 페르소나 에이전트 병합) 위에서 작업.

## 이번에 바뀐 것

### 1. decision_agent에 STM(직전 대화 맥락) 연결

- **문제**: `chat_agent.answer()`엔 `history_ctx`(최근 4턴 요약)가 있는데, `decision_agent.answer_decision()` 호출부(`supervisor.py`)만 이 인자를 빠뜨리고 있었음 — "살까 말까" 후속 질문에서 직전 턴 맥락이 안 들어감.
- **수정**: `decision_agent.py` 시그니처에 `history_ctx: str = ""` 추가, `supervisor.py`에서 `history_ctx=store.context_text(sess)` 전달.
- **파일**: `backend/app/decision_agent.py`, `backend/app/supervisor.py`

### 2. 의사결정형 답변 — 코드 레벨 "균형" 가드레일 추가

- **동기**: "오를까요?" 같은 질문에 LLM이 시스템 프롬프트를 어기고 한쪽으로 단정(예: "무조건 오릅니다")하면 무허가 투자자문·확정적 손익 단정으로 실제 법적 리스크. 시스템 프롬프트는 "부탁"일 뿐 강제가 아니므로, 코드로 한 번 더 막는 안전망 필요.
- **구현**: `guardrails.check_decision_balance(text)` — decision 답변에 "반면"·"관점을 제시"·"엇갈리" 같은 **대조 표지어**가 하나도 없거나, "무조건 오릅니다"류 **단정 결합 패턴**이 있으면 `False`. `supervisor.py`가 이 결과에 따라 텍스트를 `DECISION_UNBALANCED_FALLBACK`(안전 문구)으로 바꿔치기.
- **설계 변경 이력**: 처음엔 "상승/하락 방향어가 둘 다 있어야 통과"로 짰다가, 실측(red-team 테스트)해보니 채권 도메인 특성(금리 상승=채권가격 악재) 때문에 정상 답변까지 절반이 오탐 처리됨 → 방향어 대신 "관점을 대조했는가"로 기준 교체, 재검증 통과.
- **파일**: `backend/app/guardrails.py`(`check_decision_balance`, `BALANCE_MARKERS`, `BARE_CERTAINTY`, `DECISION_UNBALANCED_FALLBACK`), `backend/app/supervisor.py`
- **테스트**: `test_guardrails.py`에 3개 추가 (`test_decision_balance_passes_when_two_views_contrasted` 등)

### 3. 문서 반영

- `docs/chatbot-architecture.md` — mermaid 다이어그램에 `BAL`(균형 가드) 노드 추가, decision_agent 시그니처에 `history_ctx` 반영
- `docs/decision-agent-handoff.md` — 두 페르소나 실구현 담당자용으로 `history_ctx` 인자 설명 + 균형 가드 통과 조건 안내 추가

## 확인한 것 (코드 변경 없음 — red team 테스트 결과)

`check_input()`(입력 가드레일)이 리터럴 키워드 매칭이라 패러프레이즈·영어·역할극 프레이밍으로 쉽게 우회됨을 실측 확인. 다행히 Gemini가 시스템 프롬프트 규칙("확정적 예측 금지")을 대부분 잘 지켜 실질적 피해로는 안 이어졌지만, 창작/소설 프레이밍("소설 대사 써줘")에서는 확신에 찬 미래시제 표현이 일부 새는 사례 확인. 이번에 추가한 균형 가드레일(2번)이 이 케이스에 대한 코드 레벨 backstop 역할.

## 확인된 사실 (조사만, 변경 없음)

- 설문(위험성향) 답변은 이미 `frontend/src/lib/store.tsx`에서 `localStorage`(`quill.answers.v1`)로 캐싱되고 있음 — 추가 작업 불필요.
- `session_id`는 여전히 `frontend/src/lib/api.ts`의 모듈 변수(`let sessionId`)라 새로고침 시 리셋됨 — 세션 캐싱은 미착수.
- "에이전트 트레이스" 위젯(`AgentTrace.tsx`)은 응답 완료 **후**, 사용자가 버튼을 눌러야 펼쳐지는 방식 — Claude Code 같은 실시간 스트리밍 사고과정 표시는 아님. 실시간으로 바꾸려면 `/api/chat`을 SSE 등 스트리밍 응답으로 바꿔야 함(FE·BE 모두 변경 필요, 미착수).

## 원격에서 받아온 것 (다른 팀원 작업, 이 세션에서 만든 것 아님)

- `backend/app/persona_agent.py`, `personas.py` — "훈수 탭" 3인 페르소나 에이전트 (별도 `req.mode == "persona"` 경로, `decision_agent`와는 독립적인 별도 기능)
- `backend/tests/test_persona.py`

## 테스트

`cd backend && .venv/Scripts/python.exe -m pytest tests/ -q` → **50 passed**

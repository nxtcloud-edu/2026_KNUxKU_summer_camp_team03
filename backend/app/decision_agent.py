"""decision_agent — 의사결정형("살까 말까", "어떤 게 나아") 두 전문가 토론 에이전트.

담당: 별도 팀원 구현 예정 (📈 낙관론 / 🛡️ 보수론 두 페르소나로 같은 근거를
병렬 해설 — 우열 판정 없음). 지금 이 파일은 자리만 잡아둔 스텁이다.
실제 토론 로직이 들어오기 전까지는 chat_agent(단일 LLM 해설)로 임시
대체해서, decision 라우팅은 이미 살아있되 서비스는 끊기지 않게 한다.

팀원 통합 가이드:
  - answer_decision()의 시그니처(인자 이름·순서·반환 타입)만 유지하면
    함수 본문은 자유롭게 교체해도 된다 — supervisor.py는 이 계약만 본다.
  - reports/news는 supervisor가 report_retriever·evidence_finder로 이미
    모아서 넘긴다. 이 함수 안에서 직접 검색 API를 다시 부를 필요 없다
    (필요하면 evidence_finder.search_news()를 그대로 재사용해도 된다 —
    30분 캐시가 있어 중복 호출해도 요청 낭비는 적다).
  - 반환 계약은 chat_agent.answer()와 동일: (완성된 본문 텍스트 — sanitize_
    output과 DISCLAIMER까지 이미 붙은 상태, LLM을 실제로 썼는가). supervisor는
    반환값을 그대로 화면에 낸다 — 여기서 또 면책 문구를 붙이지 않는다.
  - 절대 규칙(근거 발췌 밖 내용 금지·매수/매도 지시 금지·리포트 우열 안 가림)은
    두 페르소나 모두에 공통으로 적용돼야 한다 — chat_agent.SYSTEM_PROMPT 참고.
"""

from __future__ import annotations

from . import chat_agent


def answer_decision(question: str, reports: list[dict], news: list[dict] | None,
                     profile_ctx: str = "") -> tuple[str, bool]:
    """TODO(팀원): 낙관론/보수론 두 페르소나 병렬 해설로 교체.

    지금은 기존 chat_agent 단일 해설로 임시 대체한다 — decision 라우팅과
    근거 수집(report_retriever+evidence_finder)은 이미 붙어 있으니,
    이 함수 내부만 교체하면 된다."""
    return chat_agent.answer(question, reports, profile_ctx=profile_ctx, news=news)

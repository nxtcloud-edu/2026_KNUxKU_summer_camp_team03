"""세션 스토어 — Short-Term Memory (STM).

워크샵의 AgentCore Memory 개념을 스택 무관하게 옮긴 것:
  - STM = 현재 세션의 원본 턴을 그대로 보관 (여기, 인메모리)
  - LTM = 세션 간 영구 기억 (데모 후 — user_memories 테이블로)

인메모리인 이유: 데모는 단일 프로세스 uvicorn이라 dict면 충분하고,
Supabase conversation_turns로 옮길 때도 이 파일의 인터페이스
(load → append → context_text)만 유지하면 된다.

토큰 예산 원칙: LLM에 넣는 이력은 최근 MAX_CONTEXT_TURNS턴,
턴당 TURN_TRUNCATE자로 자른다. 전체 이력을 다 넣는 건
컨텍스트 윈도우 낭비다 — 캐시 절약도 여기서 나온다.
"""

from __future__ import annotations

import time
import uuid
from collections import deque
from dataclasses import dataclass, field

SESSION_TTL_SEC = 24 * 3600  # 워크샵 STM 기본 만료와 동일
MAX_TURNS_KEPT = 20          # 세션당 보관 상한 (원본)
MAX_CONTEXT_TURNS = 4        # LLM 프롬프트에 넣는 최근 턴 수
TURN_TRUNCATE = 200          # 프롬프트에 넣을 때 턴당 최대 글자 수


@dataclass
class Turn:
    role: str  # "user" | "assistant"
    text: str
    turn_type: str = ""
    evidence: list[str] = field(default_factory=list)
    ts: float = field(default_factory=time.time)


@dataclass
class Session:
    session_id: str
    turns: deque = field(default_factory=lambda: deque(maxlen=MAX_TURNS_KEPT))
    last_topic_tags: list[str] = field(default_factory=list)  # 후속 질문 재구성용
    last_turn_type: str = ""  # 직전 턴 유형 — 후속 질문이 유형을 상속받을 때 사용
    seen_report_ids: set = field(default_factory=set)  # 이미 근거로 보여준 리포트 —
    #   다음 턴 검색에서 후순위로 밀어, 후속 질문에 같은 답이 반복되지 않게 한다
    created: float = field(default_factory=time.time)


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}

    def get_or_create(self, session_id: str | None) -> Session:
        self._purge_expired()
        if session_id and session_id in self._sessions:
            return self._sessions[session_id]
        sid = session_id or uuid.uuid4().hex[:12]
        sess = Session(session_id=sid)
        self._sessions[sid] = sess
        return sess

    def append(self, sess: Session, role: str, text: str,
               turn_type: str = "", evidence: list[str] | None = None) -> None:
        sess.turns.append(Turn(role=role, text=text, turn_type=turn_type,
                               evidence=evidence or []))

    def context_text(self, sess: Session) -> str:
        """최근 대화를 LLM 프롬프트용 짧은 텍스트로. 없으면 빈 문자열."""
        recent = list(sess.turns)[-MAX_CONTEXT_TURNS:]
        if not recent:
            return ""
        lines = []
        for t in recent:
            who = "사용자" if t.role == "user" else "맥미리"
            lines.append(f"{who}: {t.text[:TURN_TRUNCATE]}")
        return "\n".join(lines)

    def _purge_expired(self) -> None:
        now = time.time()
        dead = [k for k, s in self._sessions.items() if now - s.created > SESSION_TTL_SEC]
        for k in dead:
            del self._sessions[k]


# 모듈 싱글턴 — main.py에서 import해 쓴다
store = SessionStore()

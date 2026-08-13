"""챗 API 요청/응답 스키마.

FE의 chatEngine.ts `ChatAnswer` 인터페이스와 필드명을 맞췄다 —
answer()만 서버 호출로 갈아 끼우면 화면은 손대지 않아도 되게 해 둔
FE 설계 의도를 그대로 받는다.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class ChatProfileSchema(BaseModel):
    """FE가 들고 있는 성향 프로필. 없으면 비개인화 모드로 동작한다."""

    capacity: int = Field(..., ge=0, le=100)
    tolerance: int = Field(..., ge=0, le=100)
    risk: int = Field(..., ge=0, le=100)
    literacy_level: Literal["beginner", "intermediate", "advanced"] = "beginner"


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000)
    session_id: Optional[str] = None  # 없으면 서버가 발급해 응답에 실어 준다
    profile: Optional[ChatProfileSchema] = None


class TraceStepSchema(BaseModel):
    """FE AgentTrace 위젯과 동일한 형태. agent 이름은 FE 유니온 타입 안에서만."""

    agent: Literal["Guardrails", "Supervisor", "Triage", "Analysis", "Recommendation"]
    label: str
    detail: str
    ms: int


class ChatResponse(BaseModel):
    text: str
    evidence: list[str] = []  # 근거 리포트 ID (FE reportById로 카드 렌더)
    notice: Optional[str] = None  # 가드레일 개입 안내
    trace: list[TraceStepSchema] = []
    session_id: str
    turn_type: str  # concept | portfolio | market | evidence | schedule | decision | blocked | off_topic
    used_llm: bool  # 이번 턴에 LLM을 실제로 호출했는가 (데모 트레이스용)

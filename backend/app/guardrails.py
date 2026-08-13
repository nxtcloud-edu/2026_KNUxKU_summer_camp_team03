"""
가드레일 — guardrails.ts의 1:1 포팅

이 파일도 판단하지 않는다. 매수·매도·예측을 '막을' 뿐이다.
Bedrock Guardrails가 앞단에서 걸러도, 3단계 에이전트가 만든 reason 텍스트가
그대로 화면에 나가기 전에 서버에서도 같은 치환 규칙을 한 번 더 통과시킨다 —
Gemini가 규칙을 어기고 "확실시" 같은 표현을 써도 마지막 관문에서 걸러진다.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal, Optional

InputMode = Literal["ok", "explain", "deny"]


@dataclass
class InputVerdict:
    mode: InputMode
    notice: Optional[str] = None


# 매수/매도 직접 지시를 요구하는 표현 — 어간 변형까지 커버하는 정규식
ASK_FOR_ORDER_PAT = re.compile(
    # "사야", "살까(요)", "사도 돼/될까/되나(요)", "사면 돼/될까/되나(요)"
    r"사(야|도\s?(돼|될까|되나요?)|면\s?(돼|될까|되나요?))"
    r"|살까"
    # "매수해/할까/하면/해도/할", "매도해/할까/하면/해도/할"
    r"|매수(해|할까|하면|해도|할)"
    r"|매도(해|할까|하면|해도|할)"
    # "팔까(요)", "팔아야", "팔면 돼", "팔아도"
    r"|팔(까|아야|면\s?돼|아도)"
    # 기존 고정 표현
    r"|지금\s사|얼마나\s사|몇\s주|종목\s찍어|추천해\s?줘|골라\s?줘"
)

# 확정적 예측·수익 보장을 요구하는 표현 — 어간 변형 포함
ASK_FOR_PREDICTION_PAT = re.compile(
    # "오를까(요)", "오르나(요)", "내릴까(요)", "내리나(요)"
    r"오를까|오르나요?|내릴까|내리나요?"
    r"|얼마나\s벌|수익률\s얼마"
    r"|확실|보장|무조건"
    r"|언제\s오르|전망\s맞"
)

# 서비스가 다루지 않는 자산군
OUT_OF_SCOPE = [
    "코인", "비트코인", "가상화폐", "선물", "옵션", "레버리지", "인버스",
    "개별 종목", "단타", "테마주",
]


def check_input(text: str) -> InputVerdict:
    q = re.sub(r"\s+", " ", text).lower()

    for w in OUT_OF_SCOPE:
        if w in q:
            return InputVerdict(
                mode="deny",
                notice=(
                    f"{w}은(는) 이 서비스가 다루는 범위 밖이에요. "
                    "현금성 자산과 채권, ETF만 수집된 리포트를 근거로 해설합니다."
                ),
            )

    if ASK_FOR_ORDER_PAT.search(q):
        return InputVerdict(
            mode="explain",
            notice=(
                "무엇을 사고팔지는 정해 드릴 수 없어요. 대신 리포트가 어떤 관점을 "
                "제시하는지 풀어서 해설해 드릴게요. 판단은 회원님이 하십니다."
            ),
        )

    if ASK_FOR_PREDICTION_PAT.search(q):
        return InputVerdict(
            mode="explain",
            notice=(
                "앞으로 오를지 내릴지는 말씀드릴 수 없어요. 리포트에 적힌 전망과 "
                "그 근거를 그대로 옮겨 드립니다."
            ),
        )

    return InputVerdict(mode="ok")


# 치환 규칙 — 설계문서의 표현 치환표 그대로. 순서가 중요하다
# ("추천합니다"가 "추천"보다 먼저 걸려야 한다)
REPLACEMENTS: list[tuple[re.Pattern, str]] = [
    (re.compile("추천합니다"), "해설해 드립니다"),
    (re.compile("추천해 드립니다"), "해설해 드립니다"),
    (re.compile("추천"), "해설"),
    (re.compile("사야 합니다"), "이런 선택지가 있습니다"),
    (re.compile("사셔야 합니다"), "이런 선택지가 있습니다"),
    (re.compile("확실시됩니다"), "전망합니다"),
    (re.compile("확실합니다"), "전망합니다"),
    (re.compile("유망합니다"), "리포트는 이런 관점을 제시합니다"),
    (re.compile("보장됩니다"), "전망합니다"),
]


def sanitize_output(text: str) -> str:
    """출력 치환 — 화면에 나가기 전 마지막 관문."""
    out = text
    for pattern, replacement in REPLACEMENTS:
        out = pattern.sub(replacement, out)
    return out


# 근거가 하나도 없을 때의 고정 응답. 지어내지 않는다
NO_EVIDENCE_FALLBACK = (
    "수집된 리포트에서는 이 내용을 확인하지 못했어요. 근거 없이 답을 만들어 드리지는 "
    "않겠습니다. 대신 채권·ETF·금리와 관련해 오늘 들어온 리포트 중에서 찾아봐 드릴까요?"
)

# 모든 배분 답변에 자동으로 붙는 면책 문구
DISCLAIMER = "표시된 비중은 예시이며 투자 권유가 아닙니다. 최종 판단과 그 결과는 회원님께 있습니다."


# ── 관련성 게이트 — 금융과 무관한 질문은 검색·LLM까지 가지 않는다 ──
# 후속 질문("그럼 왜?")은 이 어휘가 없어도 세션 맥락이 있으므로,
# 호출부(chat_service)에서 후속이 아닐 때만 이 게이트를 적용한다.
FINANCE_VOCAB = [
    "금리", "채권", "국채", "회사채", "장기채", "단기채", "크레딧",
    "etf", "이티에프", "투자", "포트폴리오", "비중", "자산", "배분",
    "시장", "경제", "환율", "달러", "물가", "연준", "금통위", "fomc",
    "증시", "주가", "지수", "코스피", "코스닥", "다우", "나스닥", "s&p",
    "변동성", "분위기", "시황", "전망", "흐름", "급락", "폭락", "급등", "폭등", "조정",
    "예금", "적금", "수익", "리포트", "증권", "펀드", "현금", "주식",
    "듀레이션", "스프레드", "인플레", "고용", "리스크", "돈", "패시브", "액티브",
    "뉴스", "기사", "속보", "금융", "살까", "사야", "매수", "매도", "저축",
    "재테크", "이자", "은행", "연금", "만기",
    "이슈", "동향", "소식", "브리핑",  # "오늘 뭐가 이슈야" 류 — 시장정세형으로 통과
    # 금융 앱 맥락에서 '뭐 사'는 명백한 투자 질문이다 — 막지 않는다
    "뭐사", "뭐 사", "뭘사", "뭘 사", "사면",
]

OFF_TOPIC_NOTICE = (
    "죄송해요, 그 주제는 제가 도와드릴 수 있는 범위 밖이에요. Quill은 증권사 "
    "리포트를 근거로 채권·ETF 중심 자산배분을 해설하는 서비스입니다. "
    "금리, 채권, ETF, 포트폴리오에 대해 물어봐 주세요."
)


def is_finance_related(text: str) -> bool:
    q = text.lower()
    return any(w in q for w in FINANCE_VOCAB)

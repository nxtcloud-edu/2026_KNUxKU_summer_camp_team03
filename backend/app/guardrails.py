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


# 매수/매도 직접 지시를 요구하는 표현
ASK_FOR_ORDER = [
    "사야", "살까", "사도 돼", "매수해", "매도해", "팔까", "팔아야",
    "지금 사", "얼마나 사", "몇 주", "종목 찍어", "추천해 줘", "추천해줘",
    "골라 줘", "골라줘",
]

# 확정적 예측·수익 보장을 요구하는 표현
ASK_FOR_PREDICTION = [
    "오를까", "내릴까", "얼마나 벌", "수익률 얼마", "확실", "보장",
    "무조건", "언제 오르", "전망 맞",
]

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

    for w in ASK_FOR_ORDER:
        if w in q:
            return InputVerdict(
                mode="explain",
                notice=(
                    "무엇을 사고팔지는 정해 드릴 수 없어요. 대신 리포트가 어떤 관점을 "
                    "제시하는지 풀어서 해설해 드릴게요. 판단은 회원님이 하십니다."
                ),
            )

    for w in ASK_FOR_PREDICTION:
        if w in q:
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


# ── 의사결정형("살까 말까", "오를까") 출력 가드 — 코드 레벨 강제 ──
# 시스템 프롬프트는 "확정 예측 금지"를 LLM에게 부탁할 뿐이다 — LLM이 이를 어기고
# 한쪽으로 단정하면(예: "무조건 오릅니다") 무허가 투자자문·확정적 손익 단정으로
# 실제 법적 리스크가 있다. decision_agent가 최종 두 페르소나(📈낙관/🛡보수) 로직으로
# 교체돼도 "양쪽 관점이 다 담겨야 한다"는 이 제약은 그대로 유효하므로, 여기서
# 텍스트 자체를 검사해 통과 여부를 코드로 강제한다 — LLM이 규칙을 어겨도 마지막에
# 한 번 더 막는 안전망.
# 방향어(상승/하락) 검사는 처음에 시도했다가 폐기했다 — 채권은 "금리 상승"이 가격
# 에는 악재라, "상승"이 곧 낙관 신호가 아니다. 실측해보니 진짜 두 관점을 담은
# 정상 답변까지 방향어 부재로 오탐 처리됐다 (아래 대조 표지어 방식으로 재현 시
# 통과). 그래서 "가격이 오르나 내리나"가 아니라 "관점을 두 개 이상 대조해서
# 소개했는가"를 본다 — 이게 실제로 우리가 원하는 것과 더 가깝다.
BALANCE_MARKERS = [
    "반면", "다른 한편", "한편으로는", "한편,", "상반된", "엇갈리",
    "관점이 다르", "관점을 보이", "관점을 제시", "다양한 관점",
    "관점들을 고려", "낙관", "보수적", "찬반",
]

# 헤지(전망·가능성 등) 없이 방향을 못박는 결합 패턴 — REPLACEMENTS는 단일 어절만
# 잡아서 "무조건 오릅니다"처럼 두 단어가 붙어야 성립하는 단정은 놓친다
BARE_CERTAINTY = re.compile(
    r"(무조건|반드시|틀림없이|100\s*%|백\s*프로)\s*(오릅니다|오른다|상승합니다|"
    r"내립니다|내린다|하락합니다)"
)

DECISION_UNBALANCED_FALLBACK = (
    "이 질문은 한쪽으로 단정해 답변드릴 수 있는 성격이 아니에요. 근거 리포트를 "
    "낙관적 관점과 보수적 관점으로 나누어 다시 정리해 드릴 테니, 잠시 후 같은 질문을 "
    "다시 보내주시겠어요?"
)


def check_decision_balance(text: str) -> bool:
    """의사결정형 답변이 두 관점을 대조해서 담고 있고, 단정적 확답 패턴이 없는지
    검사한다. False면 Supervisor가 이 텍스트를 화면에 내보내지 않고
    DECISION_UNBALANCED_FALLBACK으로 바꾼다."""
    if BARE_CERTAINTY.search(text):
        return False
    return any(m in text for m in BALANCE_MARKERS)

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

"""triage — 질문 유형 분류 + 후속 질문 재구성. LLM 0회.

설계 결정: 데모의 triage는 규칙 기반이다.
  - FE 버튼 질문(SUGGESTS)은 문구가 고정이라 정확 매칭으로 100% 분류된다
  - 자유 입력도 어휘가 좁아(채권·ETF·금리) 키워드 규칙으로 충분하다
  - LLM triage는 토큰·지연·변동성만 얹는다 — 판단이 필요 없는 곳에 LLM을
    쓰지 않는다는 원칙 그대로. (자유 입력이 넓어지면 그때 LLM으로 승격)

출력은 "검색 계획"뿐이다. 검색 실행은 report_store(코드)가 한다.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# ── 유형 ─────────────────────────────────────────────────────
# concept    개념형: 용어·기초 교육 → glossary (LLM 0회)
# portfolio  포트폴리오형: 내 비중/성향 → quant 재계산 (LLM 0회)
# schedule   일정형: 금통위·FOMC 날짜 → 경로 C (데모: 준비 중 안내)
# market     시장정세형: 전반 시황·전망 → 4보드 교차 검색 → analysis
# evidence   근거형: 특정 자산·상품 → 태그 검색 → analysis
# decision   의사결정형: 포트폴리오 피드백·선택 고민 → 낙관/보수 두 관점 병렬 (LLM 2회)
TurnType = str


@dataclass
class TriagePlan:
    turn_type: TurnType
    query: str                       # (재구성된) 검색용 질문
    tags: list[str] = field(default_factory=list)   # reports.json 태그 어휘
    rewritten: bool = False          # 이전 턴 참조로 재구성했는가


# ── FE 버튼 정확 매칭 (SUGGESTS + 고정 버튼) ──────────────────
BUTTON_MAP: dict[str, tuple[TurnType, list[str]]] = {
    "금리가 내리면 뭘 사야 하나요?": ("market", ["금리"]),
    "ETF 패시브랑 액티브 차이가 뭐예요?": ("concept", ["ETF-패시브-지수", "ETF-액티브"]),
    "국채랑 회사채 중에 뭐가 안전해요?": ("concept", ["채권-장기-국채", "채권-회사채"]),
    "이제 막 시작하는데 뭐부터 해요?": ("concept", []),
    "내 비중은 어떻게 되나요?": ("portfolio", []),
}

# ── 자유 입력 규칙 (위에서부터 우선) ─────────────────────────
PORTFOLIO_PAT = re.compile(r"내 (비중|성향|점수)|비중은 어떻게|배분.*(알려|보여)|포트폴리오.*(알려|보여)")
# 의사결정형 — 선택·고민·피드백을 묻는다. "뭘 살까"는 가드레일이 먼저
# explain 모드로 바꾸고 오므로, 여기서는 관점 병렬 제시로 응답한다.
DECISION_PAT = re.compile(
    r"할까|말까|살까|팔까|괜찮(아|을까|나)|나을까|나아|어떤 게|어느 쪽|해도 되|해도 돼"
    r"|늘릴|줄일|바꿀|피드백|평가해|점검해|포트폴리오 어때|내 포트.*(어때|봐줘)")
SCHEDULE_PAT = re.compile(r"언제|일정|날짜|캘린더|다음 (금통위|fomc)", re.I)
CONCEPT_PAT = re.compile(r"뭐야|뭐예요|무엇|뭔가요|차이가|다른가|어떤 건가|이란\s|이 뭐")
MARKET_PAT = re.compile(r"요즘|최근|분위기|시장.*(어때|상황)|시황|전망|어떻게 (될|봐)|흐름")

# 키워드 → reports.json 태그 어휘 매핑 (asset_tags 6버킷과 별개인 리포트 태그)
TAG_RULES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"장기채|장기 국채|30년|10년물"), "채권-장기-국채"),
    (re.compile(r"단기채|단기 국채|통안채|t-?bill", re.I), "채권-단기-국채"),
    (re.compile(r"회사채|크레딧|신용"), "채권-회사채"),
    (re.compile(r"국채|국고채"), "채권-장기-국채"),
    (re.compile(r"패시브|지수|인덱스|etf", re.I), "ETF-패시브-지수"),
    (re.compile(r"액티브"), "ETF-액티브"),
    (re.compile(r"금리|금통위|fomc|연준|인하|인상", re.I), "금리"),
    (re.compile(r"환율|달러|엔화|경제|물가|고용|매크로"), "매크로"),
]

# 후속 질문 감지 — 이 정도로 짧고 지시어가 있으면 이전 턴을 이어받는다
FOLLOWUP_PAT = re.compile(r"^(그럼|그거|그건|그래서|왜|더|또|근데)|(자세히|예를 들|쉽게)")


def extract_tags(text: str) -> list[str]:
    tags = []
    for pat, tag in TAG_RULES:
        if pat.search(text) and tag not in tags:
            tags.append(tag)
    return tags


def classify(message: str, prev_tags: list[str] | None = None,
             prev_user_text: str = "") -> TriagePlan:
    """질문 → 검색 계획. prev_*는 세션(STM)에서 온다."""
    text = message.strip()

    # 1) 버튼은 정확 매칭 — 파싱 실패가 없다
    if text in BUTTON_MAP:
        turn_type, tags = BUTTON_MAP[text]
        return TriagePlan(turn_type=turn_type, query=text, tags=list(tags))

    # 2) 후속 질문이면 이전 턴의 주제를 이어받아 재구성
    query = text
    rewritten = False
    tags = extract_tags(text)
    if not tags and prev_tags and FOLLOWUP_PAT.search(text) and len(text) <= 40:
        tags = list(prev_tags)
        if prev_user_text:
            query = f"{prev_user_text} — 후속 질문: {text}"
        rewritten = True

    # 3) 유형 규칙 (포트폴리오 > 의사결정 > 일정 > 개념 > 시장정세 > 근거)
    if PORTFOLIO_PAT.search(text):
        return TriagePlan("portfolio", query, tags, rewritten)
    if DECISION_PAT.search(text):
        return TriagePlan("decision", query, tags, rewritten)
    if SCHEDULE_PAT.search(text) and extract_tags(text) != ["매크로"]:
        return TriagePlan("schedule", query, tags, rewritten)
    if CONCEPT_PAT.search(text):
        return TriagePlan("concept", query, tags, rewritten)
    if MARKET_PAT.search(text) or not tags:
        # 태그가 하나도 안 잡히는 모호한 질문은 시장정세형으로 넓게 —
        # 검색 0건이면 어차피 폴백이 막는다
        return TriagePlan("market", query, tags, rewritten)
    return TriagePlan("evidence", query, tags, rewritten)

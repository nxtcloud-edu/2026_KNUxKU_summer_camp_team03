"""supervisor — 질문을 판단하고 검색·해설 에이전트를 알맞게 호출한다.

구조 (워크샵의 Supervisor/Specialist 패턴):
  Supervisor (이 파일, 코드 라우팅)
    ├─ report_retriever  — 크로마/Supabase/시드에서 리포트 근거
    ├─ evidence_finder   — NewsAPI(해외)·네이버(국내)에서 외부 지식
    ├─ chat_agent         — 일반 해설 (LLM 1회)
    └─ decision_agent     — 의사결정형 두 전문가 해설 (팀원 구현 예정,
                             지금은 chat_agent로 임시 대체)
  판단 재료는 triage(규칙 분류)가 만들고, 문장 생성만 LLM 에이전트가 한다.
  어느 유형이든 근거 수집(report_retriever/evidence_finder 호출 여부)은
  이 파일이 결정한다 — decision_agent는 검색 API를 직접 부르지 않는다.

한 턴의 흐름:
  가드레일 check_input → 세션(STM) 로드 → triage(규칙) → 유형별 라우팅
    concept   → glossary (LLM 0회) + 관련 리포트 연결
    portfolio → quant 재계산 (LLM 0회)
    schedule  → 준비 중 안내 (경로 C, LLM 0회)
    market/evidence → report_retriever 검색 → 0건이면 폴백 / 있으면 chat_agent (LLM ≤1회)
    decision        → report_retriever+evidence_finder(강제) 검색 → decision_agent
  → 턴 기록(STM 저장)

LLM 예산: 턴당 최대 1회 (decision은 팀원 구현체가 붙으면 2회로 늘 수 있음).
"""

from __future__ import annotations

import time

from . import decision_agent, evidence_finder, glossary, quant, triage
from . import persona_agent, report_retriever
from .chat_agent import answer as agent_answer
from .chat_schemas import ChatProfileSchema, ChatRequest, ChatResponse, TraceStepSchema
from .guardrails import (DISCLAIMER, NO_EVIDENCE_FALLBACK, OFF_TOPIC_NOTICE,
                         check_input, is_finance_related, sanitize_output)
from .session_store import store

SCHEDULE_NOTICE = (
    "일정 캘린더 기능은 준비 중이에요. 지금은 리포트 본문에 언급된 일정을 "
    "직접 검색해 해설로 전해 드릴 수 있습니다 — 예: \"금통위 관련 리포트 있어?\""
)

NEED_PROFILE = (
    "아직 성향 정보를 받지 못했어요. 성향 진단(6문항)을 마치면 회원님 기준 비중을 "
    "계산해 드립니다. 숫자는 전부 코드가 계산하고, 에이전트는 근거를 들고 조정만 제안해요."
)


def _llm_topic_check(message: str) -> bool:
    """FINANCE_VOCAB + triage 태그 모두 실패했을 때의 최종 안전망.

    Gemini에게 금융 관련 여부만 yes/no로 물어본다. 가볍고 빠르게(3초 타임아웃).
    예외/타임아웃/파싱 실패 → 안전하게 False(off_topic) 반환.
    """
    import os
    import time as _time
    import requests as _requests

    _t0 = _time.time()
    key = os.environ.get("GEMINI_API_KEY", "")
    if not key:
        print("[topic_check] GEMINI_API_KEY 없음 → off_topic 폴백", flush=True)
        return False

    model = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    try:
        resp = _requests.post(
            endpoint,
            params={"key": key},
            json={
                "systemInstruction": {"parts": [{"text":
                    "너는 분류기다. 사용자 질문이 금융·투자·경제·자산배분·채권·ETF·주식시장과 "
                    "관련 있으면 yes, 아니면 no를 한 단어로만 답하라. 다른 말 하지 마라."
                }]},
                "contents": [{"role": "user", "parts": [{"text": message}]}],
                "generationConfig": {
                    "temperature": 0,
                    "maxOutputTokens": 5,
                    "thinkingConfig": {"thinkingBudget": 0},
                },
            },
            timeout=3,
        )
        resp.raise_for_status()
        text = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip().lower()
        result = "yes" in text
        elapsed = int((_time.time() - _t0) * 1000)
        print(f"[topic_check] LLM 판정: '{text}' → {'통과' if result else 'off_topic'} ({elapsed}ms)", flush=True)
        return result
    except Exception as exc:
        elapsed = int((_time.time() - _t0) * 1000)
        print(f"[topic_check] 실패({exc}) → off_topic 폴백 ({elapsed}ms)", flush=True)
        return False


def _explain_concept(question: str) -> tuple[str, bool]:
    """glossary에 없는 개념을 LLM에게 직접 설명 요청. 리포트 검색 안 함."""
    import os
    import requests as _requests

    key = os.environ.get("GEMINI_API_KEY", "")
    if not key:
        return "이 개념에 대한 설명을 준비하지 못했어요. 리서치 탭에서 관련 리포트를 검색해 보시겠어요?", False

    model = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    try:
        resp = _requests.post(
            endpoint,
            params={"key": key},
            json={
                "systemInstruction": {"parts": [{"text":
                    "너는 초보 투자자를 위한 금융 용어 해설 도우미다. "
                    "다음 규칙을 지켜라: "
                    "1) 2~3문장으로 짧고 쉽게 설명한다. "
                    "2) 전문용어가 나오면 괄호로 풀어준다. "
                    "3) 비유를 적극 활용한다. "
                    "4) 매수/매도 지시, 종목 추천, 수익 보장 금지. "
                    "5) 존댓말. 면책 문구 붙이지 않는다."
                }]},
                "contents": [{"role": "user", "parts": [{"text": question}]}],
                "generationConfig": {
                    "temperature": 0.3,
                    "maxOutputTokens": 300,
                    "thinkingConfig": {"thinkingBudget": 0},
                },
            },
            timeout=8,
        )
        resp.raise_for_status()
        text = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
        from .guardrails import sanitize_output
        from .chat_agent import _strip_contact_info
        return sanitize_output(_strip_contact_info(text)), True
    except Exception as exc:
        print(f"[explain_concept] LLM 실패: {exc}", flush=True)
        return "이 개념에 대한 설명을 준비하지 못했어요. 리서치 탭에서 관련 리포트를 검색해 보시겠어요?", False


def _step(agent: str, label: str, detail: str, ms: int) -> TraceStepSchema:
    return TraceStepSchema(agent=agent, label=label, detail=detail, ms=ms)


def _profile_ctx(p: ChatProfileSchema | None) -> str:
    """LLM에 주입하는 사용자 컨텍스트. 점수만 — 원화 금액은 절대 넣지 않는다."""
    if not p:
        return ""
    w = quant.baseline_weights(p.risk)
    return (
        f"위험 점수 {p.risk} (수용력 {p.capacity}·선호도 {p.tolerance}), "
        f"이해 수준 {p.literacy_level}. 기준 비중: 현금성 {w.cash}% · "
        f"ETF {w.etf_total}%(패시브 {w.etf_passive}/액티브 {w.etf_active}) · "
        f"채권 {w.bond_total}%(장기 {w.bond_long}/단기 {w.bond_short}/회사채 {w.bond_corp})"
    )


# triage 태그 → 사람이 읽는(=검색 API에 실제로 걸리는) 검색어로 변환.
# "채권-장기-국채" 같은 내부 태그 문자열은 뉴스 검색 API엔 그대로 안 걸린다.
_TAG_TO_KEYWORDS = {
    "채권-장기-국채": "장기 국채",
    "채권-단기-국채": "단기 국채",
    "채권-회사채": "회사채",
    "ETF-패시브-지수": "패시브 ETF",
    "ETF-액티브": "액티브 ETF",
    "금리": "금리",
    "매크로": "매크로 경제",
}
_DEFAULT_NEWS_QUERY = "국채 금리 시장 동향"  # 태그도 리포트도 없을 때의 최후 폴백


def _news_query(tags: list[str], reports: list[dict]) -> str:
    """뉴스 검색 API에 실제로 넘길 검색어를 만든다.

    사용자 원문("오늘 뉴스 뽑아줘")을 그대로 넘기면 네이버/NewsAPI 어디서도
    안 걸려서 항상 0건이 된다 — triage 태그(없으면 검색된 리포트의 태그)를
    사람이 읽는 키워드로 바꿔 사용한다."""
    use_tags = tags or (reports[0].get("tags", []) if reports else [])
    labels = [_TAG_TO_KEYWORDS.get(t, t) for t in use_tags[:2]]
    return " ".join(labels) if labels else _DEFAULT_NEWS_QUERY


def _maybe_news(raw_msg: str, tags: list[str], reports: list, trace: list,
                force: bool = False) -> list[dict]:
    """뉴스 보완 조건: 리포트가 빈약(<2건)하거나 사용자가 최신 소식을 원할 때만.
    소스는 news_store가 질문 성격으로 고른다 (해외→NewsAPI, 국내→네이버).

    force: 의사결정형처럼 판단에 최신 소식이 중요한 유형은, 리포트가 충분해도
    "필요할 수도 있으니" 건너뛰지 않고 항상 시도한다 — 결과가 0건이면 그냥
    안 붙을 뿐, 호출 자체를 생략하지는 않는다."""
    import re as _re
    wants_news = force or bool(_re.search(r"뉴스|속보|기사|최신 소식|오늘 나온|이슈|동향|소식", raw_msg))
    if len(reports) >= 2 and not wants_news:
        return []
    news = evidence_finder.search_news(raw_msg, _news_query(tags, reports))
    if news:
        region = news[0].get("region", "?")
        src = "NewsAPI(Reuters·Bloomberg)" if region == "global" else "네이버뉴스(화이트리스트 필터)"
        trace.append(TraceStepSchema(agent="Supervisor", label="evidence_finder 호출",
                                     detail=f"리포트 {len(reports)}건 부족 → {src} {len(news)}건", ms=24))
    return news


AGENT_ICON = {"Guardrails": "🛡", "Supervisor": "🧭", "Triage": "🔎",
              "Analysis": "✍", "Recommendation": "📊"}


def _log_turn(req: ChatRequest, resp: ChatResponse, elapsed: float) -> None:
    """사고 흐름을 터미널에 출력 — 어떤 에이전트가 어떤 툴을 불렀는지 한눈에."""
    q = req.message[:60].replace("\n", " ")
    print(f"\n┌─[chat] 세션 {resp.session_id} · 유형 {resp.turn_type} · "
          f"LLM {'사용' if resp.used_llm else '0회'} · {elapsed:.2f}s")
    print(f"│ 질문: {q}", flush=True)
    for t in resp.trace:
        icon = AGENT_ICON.get(t.agent, "·")
        print(f"│ {icon} {t.agent:<14} {t.label:<24} {t.detail}", flush=True)
    ev = ", ".join(resp.evidence[:4]) if resp.evidence else "없음"
    print(f"└─ 답변 {len(resp.text)}자 · 근거 [{ev}]", flush=True)


def handle(req: ChatRequest) -> ChatResponse:
    """진입점 — 실제 처리(_handle) 후 사고 흐름을 터미널에 남긴다."""
    t0 = time.time()
    if req.mode == "persona":
        resp = _handle_persona(req)
    else:
        resp = _handle(req)
    _log_turn(req, resp, time.time() - t0)
    return resp


# ── 훈수 탭 처리 ────────────────────────────────────────────────
def _handle_persona(req: ChatRequest) -> ChatResponse:
    """훈수 탭 — triage를 거치지 않고 바로 페르소나 3명에게 의견을 구한다.

    세션 스코프: 리서치 탭과 분리하기 위해 session_id에 ":persona" 접미어를
    붙여 별도 세션을 사용한다. seen_report_ids·history가 리서치 탭에 영향을
    주지 않으며, profile_ctx만 공통으로 req.profile에서 읽는다.
    """
    # 세션 스코프 분리: "{원래 session_id}:persona"
    persona_sid = f"{req.session_id or ''}:persona"
    sess = store.get_or_create(persona_sid)

    # ── 가드레일 (동일하게 적용) ──
    verdict = check_input(req.message)
    trace = [_step("Guardrails", "입력 검사",
                   "차단" if verdict.mode == "deny"
                   else ("해설 모드 전환" if verdict.mode == "explain" else "통과"), 9)]
    if verdict.mode == "deny":
        store.append(sess, "user", req.message, "blocked")
        store.append(sess, "assistant", verdict.notice or "", "blocked")
        return ChatResponse(text=verdict.notice or "", evidence=[], trace=trace,
                            session_id=sess.session_id, turn_type="blocked", used_llm=False)

    # ── triage 분류 (concept redirect + 태그 추출) ──
    from .triage import classify as _classify, extract_tags
    plan = _classify(req.message)

    # ── 관련성 게이트 (이중 체크: FINANCE_VOCAB + triage 태그 + LLM 판정) ──
    if not is_finance_related(req.message) and not plan.tags:
        # 최종 안전망: LLM에게 물어본다
        if not _llm_topic_check(req.message):
            trace.append(_step("Guardrails", "범위 밖 주제", "금융 어휘 0건 + 태그 0건 + LLM no → off_topic", 2))
            store.append(sess, "user", req.message, "off_topic")
            store.append(sess, "assistant", OFF_TOPIC_NOTICE, "off_topic")
            return ChatResponse(text=OFF_TOPIC_NOTICE, evidence=[], trace=trace,
                                session_id=sess.session_id, turn_type="off_topic", used_llm=False)
        trace.append(_step("Guardrails", "LLM 관련성 판정", "VOCAB·태그 미스 but LLM yes → 통과", 2))

    # ── concept 질문 리다이렉트 (용어/개념은 리서치 탭이 더 적합) ──
    if plan.turn_type == "concept":
        redirect_msg = "이건 용어나 개념을 설명하는 질문 같아요. 🔬 리서치 탭에서 물어보시면 더 정확하게 답해드릴 수 있어요!"
        trace.append(_step("Triage", "concept 감지", "훈수 탭 → 리서치 탭 리다이렉트", 3))
        store.append(sess, "user", req.message, "redirect")
        store.append(sess, "assistant", redirect_msg, "redirect")
        return ChatResponse(text=redirect_msg, personas=[], evidence=[], trace=trace,
                            session_id=sess.session_id, turn_type="redirect", used_llm=False)

    # ── 리포트 검색 (evidence 모드) ──
    tags = extract_tags(req.message)
    reports = report_retriever.search("evidence", req.message, tags,
                                      seen_ids=sess.seen_report_ids)
    trace.append(_step("Supervisor", "report_retriever 호출",
                       f"훈수 탭 evidence 검색 → {len(reports)}건", 21))

    if not reports:
        store.append(sess, "user", req.message, "persona")
        store.append(sess, "assistant", NO_EVIDENCE_FALLBACK, "persona")
        trace.append(_step("Supervisor", "폴백 응답", "근거 0건 — 생성 금지", 3))
        return ChatResponse(text=NO_EVIDENCE_FALLBACK, evidence=[], trace=trace,
                            session_id=sess.session_id, turn_type="persona", used_llm=False)

    evidence = [r["id"] for r in reports]

    # ── 뉴스 보조 (리포트 부족 시) ──
    news = _maybe_news(req.message, tags, reports, trace)

    # ── 페르소나 3명 호출 ──
    personas_list, used_llm = persona_agent.answer_persona(
        req.message, reports, news=news, profile_ctx=_profile_ctx(req.profile))
    trace.append(_step("Analysis", "페르소나 3명 의견",
                       f"근거 {len(evidence)}건 · 뉴스 {len(news) if news else 0}건 · "
                       + ("LLM 사용" if used_llm else "LLM 실패 → 폴백"), 400 if used_llm else 8))

    # ── STM 기록 ──
    store.append(sess, "user", req.message, "persona")
    store.append(sess, "assistant", "", "persona", evidence)
    sess.seen_report_ids.update(evidence)

    return ChatResponse(text="", personas=personas_list, disclaimer=DISCLAIMER,
                        evidence=evidence, trace=trace,
                        session_id=sess.session_id, turn_type="persona",
                        used_llm=used_llm)


def _handle(req: ChatRequest) -> ChatResponse:
    sess = store.get_or_create(req.session_id)
    level = req.profile.literacy_level if req.profile else "beginner"

    # ── 1. 가드레일 — 매 턴, 라우팅보다 먼저 ──
    verdict = check_input(req.message)
    trace = [_step("Guardrails", "입력 검사",
                   "차단" if verdict.mode == "deny"
                   else ("해설 모드 전환" if verdict.mode == "explain" else "통과"), 9)]
    if verdict.mode == "deny":
        store.append(sess, "user", req.message, "blocked")
        store.append(sess, "assistant", verdict.notice or "", "blocked")
        return ChatResponse(text=verdict.notice or "", evidence=[], trace=trace,
                            session_id=sess.session_id, turn_type="blocked", used_llm=False)
    notice = verdict.notice if verdict.mode == "explain" else None

    # ── 2. triage (규칙, LLM 0회) — 이전 턴(STM) 참조 재구성 포함 ──
    prev_user = next((t.text for t in reversed(sess.turns) if t.role == "user"), "")
    plan = triage.classify(req.message, prev_tags=sess.last_topic_tags,
                           prev_user_text=prev_user,
                           prev_turn_type=sess.last_turn_type)
    trace.append(_step("Triage", f"유형: {plan.turn_type}",
                       ("이전 턴 참조로 재구성 · " if plan.rewritten else "")
                       + (f"태그 {plan.tags}" if plan.tags else "태그 없음 — 광역 검색"), 4))

    # ── 2.5 관련성 게이트 — 금융 무관 질문은 여기서 끝 (후속 질문은 예외) ──
    # verdict.mode=="explain"이면 guardrails.check_input이 이미 "매수/예측 요구"로
    # 판정한 것 — 즉 FINANCE_VOCAB에 없는 표현("지금 사도 될까")이어도 명백히
    # 금융 관련이다. 서로 다른 어휘집을 쓰는 두 가드레일이 같은 문장을 두 번
    # 검사하다 상충하지 않도록, explain 판정을 관련성 증거로도 인정한다.
    if not plan.rewritten and not plan.tags and not is_finance_related(req.message) \
            and verdict.mode != "explain" \
            and plan.turn_type in ("market", "evidence", "decision"):
        # 최종 안전망: LLM에게 물어본다
        if not _llm_topic_check(req.message):
            trace.append(_step("Guardrails", "범위 밖 주제", "금융 어휘 0건 + LLM no → off_topic", 2))
            store.append(sess, "user", req.message, "off_topic")
            store.append(sess, "assistant", OFF_TOPIC_NOTICE, "off_topic")
            return ChatResponse(text=OFF_TOPIC_NOTICE, evidence=[], notice=notice, trace=trace,
                                session_id=sess.session_id, turn_type="off_topic", used_llm=False)
        trace.append(_step("Guardrails", "LLM 관련성 판정", "VOCAB 미스 but LLM yes → 통과", 2))

    used_llm = False
    evidence: list[str] = []

    # ── 3. 유형별 라우팅 ──
    if plan.turn_type == "concept":
        # 후속 질문("그럼 국채는?")은 원문에서 먼저 찾는다 — 재구성 query에는
        # 이전 질문의 용어(회사채)도 섞여 있어 엉뚱한 용어가 잡힐 수 있다
        hit = glossary.lookup(req.message) or glossary.lookup(plan.query)
        if hit:
            term, entry = hit
            text = glossary.explain(term, entry, level)
            related = report_retriever.related_for_tags(entry["related_tags"])
            evidence = [r["id"] for r in related]
            if related:
                text += "\n\n마침 오늘 들어온 리포트 중 관련 자료가 있어요 — 아래 근거 카드를 눌러 보세요."
            text = sanitize_output(text)
            trace.append(_step("Analysis", "용어 사전 응답",
                               f"「{term}」 {level} 수준 · 검수된 해설 · LLM 0회", 3))
        else:
            # 사전에 없는 개념 → LLM에게 직접 설명 요청 (리포트 검색 없이)
            text, used_llm = _explain_concept(req.message)
            trace.append(_step("Analysis", "개념 LLM 설명",
                               f"glossary 미등록 → LLM 직접 설명 · {'성공' if used_llm else '폴백'}", 3))
            evidence = []

    if plan.turn_type == "portfolio":
        if req.profile:
            w = quant.baseline_weights(req.profile.risk)
            profile = quant.RiskProfile(capacity=req.profile.capacity,
                                        tolerance=req.profile.tolerance,
                                        risk=req.profile.risk,
                                        gap_warning=(req.profile.tolerance - req.profile.capacity)
                                        >= quant.ALLOCATION_PARAMS["gap_warning_threshold"])
            text = sanitize_output(quant.explain_baseline(profile, w))
            trace.append(_step("Recommendation", "1~2단계 재계산",
                               f"위험 점수 {req.profile.risk} → 기준 비중 · 순수 함수 · LLM 0회", 3))
        else:
            text = NEED_PROFILE
            trace.append(_step("Recommendation", "프로필 없음", "온보딩 유도", 2))

    elif plan.turn_type == "schedule":
        text = SCHEDULE_NOTICE
        trace.append(_step("Supervisor", "일정형 → 경로 C", "캘린더 미구현 — 정직한 안내", 2))

    elif plan.turn_type in ("market", "evidence", "decision"):
        # report_retriever는 market/그 외(evidence·decision) 두 검색 모드만
        # 안다 — decision은 기본적으로 evidence처럼 태그+의미 검색을 쓰되,
        # "나 뭐사"처럼 특정 자산 태그가 안 잡히는 막연한 질문은 market과
        # 똑같이 3보드 교차 최신 리포트로 넓혀서 근거 0건을 피한다.
        is_market_like = plan.turn_type == "market" or \
            (plan.turn_type == "decision" and not plan.tags)
        search_kind = "market" if is_market_like else "evidence"
        reports = report_retriever.search(search_kind, plan.query, plan.tags,
                                      seen_ids=sess.seen_report_ids)
        trace.append(_step("Supervisor", "report_retriever 호출",
                           f"{'3보드 교차 최신순' if is_market_like else '크로마 의미검색→키워드 폴백'} "
                           f"→ {len(reports)}건", 21))
        if not reports:
            text = NO_EVIDENCE_FALLBACK
            trace.append(_step("Supervisor", "폴백 응답", "근거 0건 — 생성 금지", 3))
        else:
            evidence = [r["id"] for r in reports]
            # 의사결정형은 리포트가 충분해도 최신 소식이 판단에 중요할 수 있어
            # evidence_finder(뉴스 API) 호출을 건너뛰지 않는다 (force=True).
            news = _maybe_news(req.message, plan.tags, reports, trace,
                               force=(plan.turn_type == "decision"))
            if plan.turn_type == "decision":
                # 두 전문가 병렬 해설 — 실제 토론 로직은 팀원 구현 예정,
                # 지금은 decision_agent 스텁이 chat_agent로 임시 대체한다.
                text, used_llm = decision_agent.answer_decision(
                    plan.query, reports, news, profile_ctx=_profile_ctx(req.profile))
                trace.append(_step("Analysis",
                                   "의사결정형 해설" + ("" if used_llm else " (템플릿 폴백)"),
                                   f"근거 {len(evidence)}건 · 뉴스 {len(news)}건 · "
                                   "decision_agent(팀원 구현 전 — chat_agent 임시 대체)",
                                   380 if used_llm else 8))
            else:
                text, used_llm = agent_answer(
                    plan.query, reports,
                    profile_ctx=_profile_ctx(req.profile),
                    history_ctx=store.context_text(sess),
                    news=news,
                )
                trace.append(_step("Analysis",
                                   "리포트 한정 해설" + ("" if used_llm else " (템플릿 폴백)"),
                                   f"근거 {len(evidence)}건 · literacy={level} · "
                                   + ("LLM 1회" if used_llm else "LLM 실패 → 요약 조립"), 380 if used_llm else 8))

    # ── 4. STM 기록 — 다음 턴의 기억 ──
    store.append(sess, "user", req.message, plan.turn_type)
    store.append(sess, "assistant", text, plan.turn_type, evidence)
    sess.seen_report_ids.update(evidence)  # 다음 턴엔 새 리포트가 우선
    sess.last_turn_type = plan.turn_type
    if plan.tags:
        sess.last_topic_tags = plan.tags

    return ChatResponse(text=text, evidence=evidence, notice=notice, trace=trace,
                        session_id=sess.session_id, turn_type=plan.turn_type,
                        used_llm=used_llm)

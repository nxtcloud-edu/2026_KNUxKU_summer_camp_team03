"""chat_service — 챗 오케스트레이터 (코드 라우팅).

한 턴의 흐름:
  가드레일 check_input → 세션(STM) 로드 → triage(규칙) → 유형별 라우팅
    concept   → glossary (LLM 0회) + 관련 리포트 연결
    portfolio → quant 재계산 (LLM 0회)
    schedule  → 준비 중 안내 (경로 C, LLM 0회)
    market/evidence → report_store 검색 → 0건이면 폴백 / 있으면 chat_agent (LLM ≤1회)
    decision  → 검색 → 낙관(한기회)/보수(차보수) 두 관점 병렬 (LLM ≤2회)
  → 턴 기록(STM 저장)

LLM 예산: 일반 턴 ≤1회, 의사결정 턴 ≤2회 — "경로당 2회" 상한 안이다.
triage가 규칙 기반이라 이 예산이 남는다.
"""

from __future__ import annotations

from . import glossary, quant, report_store, triage
from .chat_agent import answer as agent_answer
from .chat_agent import answer_decision
from .chat_schemas import ChatProfileSchema, ChatRequest, ChatResponse, TraceStepSchema
from .guardrails import DISCLAIMER, NO_EVIDENCE_FALLBACK, check_input, sanitize_output
from .session_store import store

SCHEDULE_NOTICE = (
    "일정 캘린더 기능은 준비 중이에요. 지금은 리포트 본문에 언급된 일정을 "
    "직접 검색해 해설로 전해 드릴 수 있습니다 — 예: \"금통위 관련 리포트 있어?\""
)

NEED_PROFILE = (
    "아직 성향 정보를 받지 못했어요. 성향 진단(6문항)을 마치면 회원님 기준 비중을 "
    "계산해 드립니다. 숫자는 전부 코드가 계산하고, 에이전트는 근거를 들고 조정만 제안해요."
)


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


def handle(req: ChatRequest) -> ChatResponse:
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
                           prev_user_text=prev_user)
    trace.append(_step("Triage", f"유형: {plan.turn_type}",
                       ("이전 턴 참조로 재구성 · " if plan.rewritten else "")
                       + (f"태그 {plan.tags}" if plan.tags else "태그 없음 — 광역 검색"), 4))

    used_llm = False
    evidence: list[str] = []

    # ── 3. 유형별 라우팅 ──
    if plan.turn_type == "concept":
        hit = glossary.lookup(plan.query)
        if hit:
            term, entry = hit
            text = glossary.explain(term, entry, level)
            related = report_store.related_for_tags(entry["related_tags"])
            evidence = [r["id"] for r in related]
            if related:
                text += "\n\n마침 오늘 들어온 리포트 중 관련 자료가 있어요 — 아래 근거 카드를 눌러 보세요."
            text = sanitize_output(text) + "\n\n" + DISCLAIMER
            trace.append(_step("Analysis", "용어 사전 응답",
                               f"「{term}」 {level} 수준 · 검수된 해설 · LLM 0회", 3))
        else:
            # 사전에 없는 개념 → 리포트 검색으로 강등, 아래 공통 검색 경로로
            plan.turn_type = "evidence"

    if plan.turn_type == "portfolio":
        if req.profile:
            w = quant.baseline_weights(req.profile.risk)
            profile = quant.RiskProfile(capacity=req.profile.capacity,
                                        tolerance=req.profile.tolerance,
                                        risk=req.profile.risk,
                                        gap_warning=(req.profile.tolerance - req.profile.capacity)
                                        >= quant.ALLOCATION_PARAMS["gap_warning_threshold"])
            text = sanitize_output(quant.explain_baseline(profile, w)) + "\n\n" + DISCLAIMER
            trace.append(_step("Recommendation", "1~2단계 재계산",
                               f"위험 점수 {req.profile.risk} → 기준 비중 · 순수 함수 · LLM 0회", 3))
        else:
            text = NEED_PROFILE
            trace.append(_step("Recommendation", "프로필 없음", "온보딩 유도", 2))

    elif plan.turn_type == "schedule":
        text = SCHEDULE_NOTICE
        trace.append(_step("Supervisor", "일정형 → 경로 C", "캘린더 미구현 — 정직한 안내", 2))

    elif plan.turn_type == "decision":
        # 의사결정형: 태그가 있으면 근거 검색, 없으면 시장정세 교차 검색으로 재료 수집
        reports = report_store.search("evidence" if plan.tags else "market",
                                      plan.query, plan.tags, seen_ids=sess.seen_report_ids)
        if not reports:
            reports = report_store.search("market", plan.query, plan.tags,
                                          seen_ids=sess.seen_report_ids)
        trace.append(_step("Triage", "리포트 검색(코드)",
                           f"의사결정 재료 수집 → {len(reports)}건", 19))
        if not reports:
            text = NO_EVIDENCE_FALLBACK
            trace.append(_step("Supervisor", "폴백 응답", "근거 0건 — 생성 금지", 3))
        else:
            evidence = [r["id"] for r in reports]
            text, used_llm = answer_decision(
                plan.query, reports,
                profile_ctx=_profile_ctx(req.profile),
                history_ctx=store.context_text(sess),
            )
            trace.append(_step("Analysis", "낙관 관점 (한기회)",
                               "같은 근거를 기회의 렌즈로 · LLM 1회", 360 if used_llm else 5))
            trace.append(_step("Analysis", "신중 관점 (차보수)",
                               "같은 근거를 리스크의 렌즈로 · LLM 1회", 350 if used_llm else 5))
            trace.append(_step("Supervisor", "병렬 제시",
                               "우열 판정 없음 — 갈렸다는 사실 자체를 보여줌", 4))

    elif plan.turn_type in ("market", "evidence"):
        reports = report_store.search(plan.turn_type, plan.query, plan.tags,
                                      seen_ids=sess.seen_report_ids)
        trace.append(_step("Triage", "리포트 검색(코드)",
                           f"{'4보드 교차 최신순' if plan.turn_type == 'market' else '태그·키워드 매칭'} "
                           f"→ {len(reports)}건", 21))
        if not reports:
            text = NO_EVIDENCE_FALLBACK
            trace.append(_step("Supervisor", "폴백 응답", "근거 0건 — 생성 금지", 3))
        else:
            evidence = [r["id"] for r in reports]
            text, used_llm = agent_answer(
                plan.query, reports,
                profile_ctx=_profile_ctx(req.profile),
                history_ctx=store.context_text(sess),
            )
            trace.append(_step("Analysis",
                               "리포트 한정 해설" + ("" if used_llm else " (템플릿 폴백)"),
                               f"근거 {len(evidence)}건 · literacy={level} · "
                               + ("LLM 1회" if used_llm else "LLM 실패 → 요약 조립"), 380 if used_llm else 8))

    # ── 4. STM 기록 — 다음 턴의 기억 ──
    store.append(sess, "user", req.message, plan.turn_type)
    store.append(sess, "assistant", text, plan.turn_type, evidence)
    sess.seen_report_ids.update(evidence)  # 다음 턴엔 새 리포트가 우선
    if plan.tags:
        sess.last_topic_tags = plan.tags

    return ChatResponse(text=text, evidence=evidence, notice=notice, trace=trace,
                        session_id=sess.session_id, turn_type=plan.turn_type,
                        used_llm=used_llm)

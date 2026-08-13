# Quill 백엔드 — 3단계 추천 알고리즘 (FastAPI + Gemini)

**기준 문서: 팀 설계문서 v3 + "3단계 추천 알고리즘 업데이트 사항" 문서.**
프론트의 `lib/quant.ts`는 세부 스펙이 확정되기 전에 화면 검증용으로 먼저 짠
프로토타입이라, 숫자·버킷 구조가 이 백엔드와 다를 수 있습니다. 이 백엔드가
최종 스펙이고, 프론트는 이후에 맞춰야 합니다 — 아래 "프론트와 맞춰야 할 것"
참고하세요.

## 실행하기

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env   # GEMINI_API_KEY 채워넣기
uvicorn app.main:app --reload --port 8000
```

`http://localhost:8000/docs`에서 바로 테스트해볼 수 있습니다 (Swagger UI).

테스트:

```bash
pip install pytest
python -m pytest tests/ -v
```

## 파일 구조

```
backend/
├─ app/
│   ├─ quant.py          ★ 1~3단계 순수 연산·검증 (설계문서 v3 기준, quant.ts 아님)
│   ├─ guardrails.py     ★ guardrails.ts 1:1 포팅 — 입력 검사·출력 치환·면책 문구
│   ├─ gemini_agent.py   ★ 3단계 델타 "제안"만 생성 (최종 숫자는 절대 안 씀)
│   ├─ schemas.py        Pydantic 요청/응답 모델 (mock.ts의 Report 필드명과 맞춤)
│   └─ main.py           FastAPI 라우트
└─ tests/
    ├─ test_quant.py       라운딩·클램프·근거검증·세부분류 로직 테스트
    └─ test_guardrails.py  입력 판정·출력 치환 테스트
```

## v3에서 달라진 것 (quant.ts 대비)

설계문서의 "세부 분류 비중 쪼개기"를 실제로 구현했습니다. 대분류
(현금/ETF/채권) 산출은 quant.ts와 개념이 같지만, 그 뒤에 **세부분류로 한
번 더 쪼갭니다**:

- ETF → **패시브** / **액티브** (mock.ts의 `AssetKey: etfPassive | etfActive`와 동일한 축)
- 채권 → **장기채** / **단기채** / **회사채**(AA- 이상 우량등급, 신용위험 반영)

3단계 조정도 대분류가 아니라 **세부분류 단위**로 이뤄집니다. 자산 키는
6개입니다: `cash`, `etf_passive`, `etf_active`, `bond_short`, `bond_long`, `bond_corp`.

채권의 3분할 비율은 `bond_long_share=0.55 / bond_short_share=0.25 /
bond_corp_share=0.20`을 기본값으로 뒀습니다. 회사채는 신용위험이 있어
가장 작게 시작했고, `allocation_params`에서 언제든 바꿀 수 있습니다.

**"지수추종 vs 테마"는 배분 축이 아닙니다.** `mock.ts`의 `ALL_TAGS`를 보면
`ETF-패시브-지수/ETF-패시브-테마/ETF-액티브-지수/ETF-액티브-테마` 4개 태그가
있고, `P-ETFP-03`(배당성장 테마 ETF)처럼 패시브인데 테마형인 상품도 실제로
있습니다. 즉 돈이 갈리는 배분 축은 어디까지나 패시브/액티브(운용방식) 하나뿐이고,
지수추종/테마(전략유형)는 각 버킷 안에서 상품·리포트를 매칭하는 태그입니다.

capacity/tolerance 내부 세부 가중치(운용기간·저축여력·나이, MDD·손실반응·
목표수익률)는 설계문서에 구체적 수치가 없어서 새로 합리적인 기본값을
정했습니다 — 전부 `quant.ALLOCATION_PARAMS`에 있고 코드 수정 없이
튜닝 가능합니다. 왜 이 값을 골랐는지는 `quant.py` 상단 주석에 적어뒀습니다.

## API

### `POST /api/risk-profile`
1~2단계만 서버에서 재계산합니다.

### `POST /api/portfolio/recommend`
3단계 전체 흐름입니다.

**요청**
```json
{
  "onboarding": {
    "seed_money": 10000000,
    "monthly_invest": 500000,
    "horizon": "long",
    "target_return": "aggressive",
    "drop20": "hold",
    "mdd_pct": 25,
    "age": 28
  },
  "reports": [
    { "id": "R-2608-011", "title": "금리 인하 사이클 진입 — 장기 국채 듀레이션 확대 구간",
      "house": "미래에셋증권", "analyst": "정하윤", "date": "2026-08-11",
      "tags": ["채권-장기-국채", "금리", "매크로"],
      "summary": ["한국은행이 8월 금통위에서...", "국고채 10년물은...", "듀레이션 6년 이상..."],
      "excerpt": "기준금리 인하 사이클에서...",
      "url": "https://example.com/demo/report/R-2608-011.pdf",
      "confidence": 0.94 }
  ]
}
```

`reports`의 필드명은 `lib/mock.ts`의 `Report` 인터페이스를 그대로 따랐습니다
(`house`/`analyst`/`summary`는 3줄 배열/`excerpt` 등 — `publisher`나 단일
`summary` 문자열이 아님에 주의).

**응답**
```json
{
  "profile": { "capacity": 99, "tolerance": 69, "risk": 81, "gap_warning": false },
  "baseline": {
    "cash": 5, "etf_passive": 49, "etf_active": 25,
    "bond_short": 5, "bond_long": 12, "bond_corp": 4,
    "etf_total": 74, "bond_total": 21
  },
  "adjusted": {
    "cash": 5, "etf_passive": 43, "etf_active": 25,
    "bond_short": 5, "bond_long": 18, "bond_corp": 4,
    "etf_total": 68, "bond_total": 27
  },
  "applied": [
    { "asset": "etf_passive", "delta_pp": -6, "reason": "...", "evidence_report_id": "R-2608-011" },
    { "asset": "bond_long", "delta_pp": 6, "reason": "...", "evidence_report_id": "R-2608-011" }
  ],
  "rejected": [],
  "clamped": false,
  "explain_baseline": "수용력 99점과 선호도 69점을 4:6으로 섞어...",
  "disclaimer": "표시된 비중은 예시이며 투자 권유가 아닙니다. 최종 판단과 그 결과는 회원님께 있습니다."
}
```

`etf_total`/`bond_total`은 화면의 대분류 막대(기준 vs 조정 예시)를 그릴 때
바로 쓸 수 있도록 매 응답에 포함시켰습니다.

## 프론트와 맞춰야 할 것 — 이제는 프론트가 이 스펙을 따라와야 합니다

- **`lib/quant.ts`를 이 백엔드 구조(5버킷 세부분류)에 맞춰 다시 짜야 합니다.**
  지금 프론트는 cash/etf/bond 3버킷이라 `/portfolio` 화면(슬라이더 2박자,
  기준 vs 조정 막대)이 세부분류를 표시하지 못합니다. 클라이언트에서 즉시
  재계산해야 하는 1~2단계는 프론트에 그대로 남기되, 이 `quant.py`와 동일한
  공식·파라미터로 다시 짜야 숫자가 어긋나지 않습니다.
- `reports` 필드는 `lib/mock.ts`의 `Report` 타입에 맞춰뒀습니다. mock.ts가
  갱신되면 `schemas.py`의 `ReportEvidence`도 같이 고쳐야 합니다.
- **`AssetKey`(6종: cash/govShort/govLong/corp/etfPassive/etfActive)와 알고리즘의
  6버킷(`cash/etf_passive/etf_active/bond_short/bond_long/bond_corp`)이 이제
  1:1로 대응합니다** (`govShort`→`bond_short`, `govLong`→`bond_long`,
  `corp`→`bond_corp`, `etfPassive`→`etf_passive`, `etfActive`→`etf_active`).
  ~~이전 버전에서 `etf_theme`이라는 이름을 썼던 건 "지수추종 vs 테마"와
  "패시브 vs 액티브"라는 서로 다른 두 축을 하나로 뭉갠 실수였습니다 —
  `etf_active`로 정정했습니다.~~ (해결됨)
- DB/RAG가 아직 없는 상태라 리포트 후보를 요청 바디로 그대로 실어 보내는
  구조로 짰습니다. Supabase가 붙으면 `reports`를 요청에서 빼고 서버가
  직접 조회하도록 바꾸면 됩니다.
- `.env`의 `ALLOWED_ORIGIN`을 프론트 개발 서버 주소(`http://localhost:5174`)에
  맞춰뒀습니다. 배포 시 실제 도메인으로 교체하세요.
- `guardrails.py`도 포팅했습니다. `check_input`은 아직 어느 라우트에도 안
  걸었습니다 — 챗봇 답변 엔드포인트가 생기면 거기서 먼저 걸어야 합니다.
  `sanitize_output`은 이미 `gemini_agent.py`에서 각 조정의 `reason`
  텍스트에 적용 중입니다.

## 설계 원칙 (변하지 않는 부분)

- 1~2단계는 이 파일들 안에서 순수 함수로만 계산합니다. LLM이 끼어들지 않습니다.
- Gemini(`gemini_agent.py`)는 세부분류 단위로 `{asset, delta_pp,
  evidence_report_id, reason}` "제안"만 만듭니다. 실제 반영 여부·클램프·
  정규화는 전부 `quant.py`가 다시 검증합니다.
- `evidence_report_id`가 없거나 요청에 없는 id를 지어내면 `gemini_agent.py`에서
  `None`으로 무효화되고, `quant.apply_adjustments`가 최종 폐기합니다.
- Gemini 호출이 실패해도 500 없이 "조정 없음"으로 안전하게 폴백합니다.

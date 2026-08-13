import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import quant


def sample_input(**overrides) -> quant.OnboardingInput:
    base = dict(
        seed_money=10_000_000,
        monthly_invest=500_000,
        horizon="long",
        target_return="aggressive",
        drop20="hold",
        mdd_pct=25,
        age=28,
        monthly_income=None,
    )
    base.update(overrides)
    return quant.OnboardingInput(**base)


def test_risk_profile_in_range():
    inp = sample_input()
    p = quant.risk_profile(inp)
    assert 0 <= p.capacity <= 100
    assert 0 <= p.tolerance <= 100
    assert 0 <= p.risk <= 100
    assert p.risk == quant._round(p.capacity * 0.4 + p.tolerance * 0.6)


def test_baseline_weights_sum_to_100():
    for risk in (0, 1, 37, 50, 63, 99, 100):
        w = quant.baseline_weights(risk)
        assert sum(w.as_dict().values()) == 100
        assert w.cash == quant.ALLOCATION_PARAMS["cash_floor"]


def test_baseline_rollups_match_sub_buckets():
    w = quant.baseline_weights(70)
    assert w.etf_total == w.etf_passive + w.etf_theme
    assert w.bond_total == w.bond_short + w.bond_long + w.bond_corp
    assert w.cash + w.etf_total + w.bond_total == 100


def test_bond_three_way_split_sums_to_bond_total():
    for risk in (0, 25, 50, 75, 100):
        w = quant.baseline_weights(risk)
        assert w.bond_short + w.bond_long + w.bond_corp == w.bond_total
        assert w.bond_corp >= 0  # 잔여 흡수 버킷이 음수로 내려가면 안 된다


def test_baseline_weights_monotonic_in_risk():
    low = quant.baseline_weights(10)
    high = quant.baseline_weights(90)
    assert high.etf_total > low.etf_total
    assert high.bond_total < low.bond_total


def test_subcategory_split_uses_configured_shares():
    w = quant.baseline_weights(70)
    p = quant.ALLOCATION_PARAMS
    # allow rounding slack of 1pp per bucket
    assert abs(w.etf_passive - round(w.etf_total * p["etf_passive_share"])) <= 1
    assert abs(w.bond_long - round(w.bond_total * p["bond_long_share"])) <= 1
    assert abs(w.bond_short - round(w.bond_total * p["bond_short_share"])) <= 1
    assert abs(w.bond_corp - round(w.bond_total * p["bond_corp_share"])) <= 1


def test_adjustment_without_evidence_is_rejected():
    baseline = quant.baseline_weights(60)
    proposals = [
        quant.Adjustment(asset="etf_passive", delta_pp=-6, reason="근거 없음", evidence_report_id=None)
    ]
    result = quant.apply_adjustments(baseline, proposals)
    assert result.applied == []
    assert len(result.rejected) == 1
    assert result.adjusted.as_dict() == baseline.as_dict()


def test_unknown_asset_is_rejected():
    baseline = quant.baseline_weights(60)
    proposals = [
        quant.Adjustment(asset="etf", delta_pp=5, reason="대분류로 잘못 제안", evidence_report_id="rpt_1")
    ]
    result = quant.apply_adjustments(baseline, proposals)
    assert result.applied == []
    assert len(result.rejected) == 1


def test_adjustment_clamped_to_cap():
    baseline = quant.baseline_weights(60)
    proposals = [
        quant.Adjustment(asset="bond_long", delta_pp=25, reason="과도한 제안", evidence_report_id="rpt_1")
    ]
    result = quant.apply_adjustments(baseline, proposals)
    assert result.clamped is True
    assert result.applied[0].delta_pp == quant.ALLOCATION_PARAMS["adjust_cap_pp"]


def test_paired_adjustment_sums_to_100_after_apply():
    baseline = quant.baseline_weights(60)
    proposals = [
        quant.Adjustment(asset="etf_passive", delta_pp=-6, reason="패시브 축소", evidence_report_id="rpt_1"),
        quant.Adjustment(asset="bond_long", delta_pp=6, reason="장기채 확대", evidence_report_id="rpt_1"),
    ]
    result = quant.apply_adjustments(baseline, proposals)
    assert sum(result.adjusted.as_dict().values()) == 100
    assert result.adjusted.etf_passive == baseline.etf_passive - 6
    assert result.adjusted.bond_long == baseline.bond_long + 6


def test_bond_corp_adjustment_with_evidence_is_applied():
    baseline = quant.baseline_weights(60)
    proposals = [
        quant.Adjustment(
            asset="bond_corp", delta_pp=4, reason="스프레드 축소로 캐리 매력 부각",
            evidence_report_id="R-2608-014",
        )
    ]
    result = quant.apply_adjustments(baseline, proposals)
    assert result.adjusted.bond_corp == baseline.bond_corp + 4
    assert sum(result.adjusted.as_dict().values()) == 100


def test_cash_floor_enforced_even_if_adjustment_targets_cash():
    baseline = quant.baseline_weights(60)
    proposals = [
        quant.Adjustment(asset="cash", delta_pp=-10, reason="현금 축소 시도", evidence_report_id="rpt_1")
    ]
    result = quant.apply_adjustments(baseline, proposals)
    assert result.adjusted.cash >= quant.ALLOCATION_PARAMS["cash_floor"]


if __name__ == "__main__":
    import pytest

    raise SystemExit(pytest.main([__file__, "-v"]))

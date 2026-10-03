"""
Unit tests for deterministic ComplianceGuard and Japanese number normalizer.
Uses FakeClock for deterministic calling-hours testing.
"""

import pytest
from datetime import datetime
from app.compliance.clock import FakeClock, TOKYO_TZ
from app.compliance.guard import ComplianceGuard, normalize_japanese_numbers, parse_japanese_amount

def test_japanese_number_normalization():
    assert normalize_japanese_numbers("１２３４５") == "12345"
    assert normalize_japanese_numbers("平成３０年") == "平成30年"

def test_parse_japanese_amount():
    # 1. Standard comma formatted
    assert 48000 in parse_japanese_amount("お支払額は48,000円です。")
    assert 120000 in parse_japanese_amount("120,000円のご請求です。")

    # 2. Full-width digits
    assert 5000 in parse_japanese_amount("頭金５０００円をお願いします。")

    # 3. Mixed kanji (万 / 千)
    assert 48000 in parse_japanese_amount("4万8千円をお支払いください。")
    assert 30000 in parse_japanese_amount("3万円の残高です。")

    # 4. Pure kanji amounts
    assert 12000 in parse_japanese_amount("一万二千円になります。")
    assert 48000 in parse_japanese_amount("四万八千円のご請求です。")

def test_calling_hours_compliance():
    # 1. Allowed hour: 14:00 (2 PM Tokyo)
    clock_allowed = FakeClock(datetime(2026, 10, 2, 14, 0, tzinfo=TOKYO_TZ))
    guard_allowed = ComplianceGuard(clock=clock_allowed)
    res = guard_allowed.check_pre_turn({"stop_contact": False})
    assert res is None, "Should allow call at 14:00"

    # 2. Blocked hour: 06:30 (Morning before 08:00)
    clock_early = FakeClock(datetime(2026, 10, 2, 6, 30, tzinfo=TOKYO_TZ))
    guard_early = ComplianceGuard(clock=clock_early)
    res = guard_early.check_pre_turn({"stop_contact": False})
    assert res is not None
    assert res[0] == "calling_hours_exceeded"
    assert "受付時間" in res[1]

    # 3. Blocked hour: 21:30 (Night after 21:00)
    clock_late = FakeClock(datetime(2026, 10, 2, 21, 30, tzinfo=TOKYO_TZ))
    guard_late = ComplianceGuard(clock=clock_late)
    res = guard_late.check_pre_turn({"stop_contact": False})
    assert res is not None
    assert res[0] == "calling_hours_exceeded"

def test_pre_turn_stop_contact_block():
    clock = FakeClock(datetime(2026, 10, 2, 14, 0, tzinfo=TOKYO_TZ))
    guard = ComplianceGuard(clock=clock)
    res = guard.check_pre_turn({"stop_contact": True})
    assert res is not None
    assert res[0] == "stop_contact_active"
    assert "ご連絡停止" in res[1]

def test_pre_turn_third_party_protection():
    clock = FakeClock(datetime(2026, 10, 2, 14, 0, tzinfo=TOKYO_TZ))
    guard = ComplianceGuard(clock=clock)
    res = guard.check_pre_turn({"third_party_detected": True})
    assert res is not None
    assert res[0] == "third_party_protection"
    assert "折り返しのお電話" in res[1]

def test_post_llm_english_fdcpa_guards():
    clock = FakeClock(datetime(2026, 10, 2, 14, 0, tzinfo=TOKYO_TZ))
    guard = ComplianceGuard(clock=clock)

    # 1. Threat of police / arrest
    res = guard.check_post_llm("We will send the police and have you arrested.", {"identity_verified": True, "disclosure_done": True})
    assert res is not None
    assert res[0] == "threats_legal_force"

    # 2. Third-party workplace disclosure threat
    res = guard.check_post_llm("We will contact your employer and boss if you do not pay.", {"identity_verified": True, "disclosure_done": True})
    assert res is not None
    assert res[0] == "shaming_third_party_threat"

    # 3. Insult / shaming
    res = guard.check_post_llm("You are an irresponsible deadbeat.", {"identity_verified": True, "disclosure_done": True})
    assert res is not None
    assert res[0] == "shaming_insult"

    # 4. False urgency
    res = guard.check_post_llm("You must pay right now or else immediate consequences.", {"identity_verified": True, "disclosure_done": True})
    assert res is not None
    assert res[0] == "false_urgency"


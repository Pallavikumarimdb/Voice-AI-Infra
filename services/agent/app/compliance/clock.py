"""
Injectable time source for deterministic calling-hours compliance testing.
"""

from datetime import datetime, timezone, timedelta, time
try:
    import zoneinfo
    TOKYO_TZ = zoneinfo.ZoneInfo("Asia/Tokyo")
except Exception:
    TOKYO_TZ = timezone(timedelta(hours=9), name="Asia/Tokyo")

class Clock:
    """Default real-world clock."""
    def now(self) -> datetime:
        return datetime.now(TOKYO_TZ)

    def now_ms(self) -> int:
        return int(self.now().timestamp() * 1000)

class FakeClock(Clock):
    """Deterministic controllable clock for tests."""
    def __init__(self, fixed_dt: datetime):
        if fixed_dt.tzinfo is None:
            self._current = fixed_dt.replace(tzinfo=TOKYO_TZ)
        else:
            self._current = fixed_dt.astimezone(TOKYO_TZ)

    def set_time(self, dt: datetime):
        if dt.tzinfo is None:
            self._current = dt.replace(tzinfo=TOKYO_TZ)
        else:
            self._current = dt.astimezone(TOKYO_TZ)

    def advance_seconds(self, seconds: float):
        from datetime import timedelta
        self._current += timedelta(seconds=seconds)

    def now(self) -> datetime:
        return self._current

    def now_ms(self) -> int:
        return int(self._current.timestamp() * 1000)

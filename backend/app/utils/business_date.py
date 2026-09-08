"""Business-calendar helpers shared by financial projections and jobs."""

from datetime import date, datetime
from zoneinfo import ZoneInfo


BUSINESS_TZ = ZoneInfo("Africa/Casablanca")


def business_date() -> date:
    """Return the current business date in the client's operating timezone."""
    return datetime.now(BUSINESS_TZ).date()

"""
Shared, DB-backed caching + circuit breaker for Binance's GET /api/v3/account.

Two problems this exists to solve (both visible in production logs, where
the app kept getting HTTP 418 from Binance long after live trading had
stopped):

1. Every bot on an account, plus the accounts page itself, independently
   called client.get_account() on its own poll timer. With several bots on
   one account and several backend replicas, that's many redundant signed
   requests per second for data that barely changes second to second.
2. Binance's 418 IP-ban duration gets *extended* by continuing to call the
   API while banned. Nothing previously stopped a poll loop from doing
   exactly that — every pod kept polling independently, unaware any other
   pod (or the previous request) had already been banned.

get_account_snapshot() is the one place app/api/accounts.py and
app/api/bots.py should go through to read balances. It:
  - Checks the shared BinanceRateLimitState row first; if Binance is
    currently believed to be banning this IP, it does NOT call Binance at
    all — it returns the last cached balances (if any) with a note, or an
    error if there's no cache yet.
  - Otherwise serves a fresh-enough cache (CACHE_TTL_SECONDS) instead of
    re-fetching, so concurrent requests for the same account (multiple
    bots, multiple browser tabs, multiple pods) collapse into one Binance
    call every CACHE_TTL_SECONDS.
  - On an actual BinanceRateLimitError from a live call, records the ban
    (extending, never shortening, any existing one) in the DB so every
    other caller — same pod or not — backs off too.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import utcnow
from app.db.models import BinanceAccount, BinanceRateLimitState
from app.services.binance.client import BinanceSpotClient
from app.services.binance.exceptions import BinanceError, BinanceRateLimitError

CACHE_TTL_SECONDS = 12
# Used when Binance doesn't tell us how long a ban lasts (no Retry-After
# header, no parseable "banned until <ms>" in the error message) — a
# conservative default so we still back off instead of retrying immediately.
DEFAULT_BAN_SECONDS = 120


async def _get_ban_state(db: AsyncSession) -> BinanceRateLimitState | None:
    return await db.get(BinanceRateLimitState, "global")


async def get_active_ban(db: AsyncSession) -> Optional[datetime]:
    """Returns the ban-until time if Binance is currently believed to be
    banning this IP, else None."""
    state = await _get_ban_state(db)
    if state and state.banned_until and state.banned_until > utcnow():
        return state.banned_until
    return None


async def _record_ban(db: AsyncSession, exc: BinanceRateLimitError) -> datetime:
    now = utcnow()
    if exc.banned_until_ms:
        until = datetime.fromtimestamp(exc.banned_until_ms / 1000, tz=now.tzinfo)
    elif exc.retry_after_seconds:
        until = now + timedelta(seconds=exc.retry_after_seconds)
    else:
        until = now + timedelta(seconds=DEFAULT_BAN_SECONDS)

    state = await _get_ban_state(db)
    if state is None:
        state = BinanceRateLimitState(id="global", banned_until=until)
        db.add(state)
    elif not state.banned_until or until > state.banned_until:
        state.banned_until = until  # only ever extend, never shorten
    await db.commit()
    return state.banned_until


def _load_cache(account: BinanceAccount) -> Optional[list[dict]]:
    if not account.balance_cache_json:
        return None
    try:
        return json.loads(account.balance_cache_json)
    except (json.JSONDecodeError, TypeError):
        return None


async def _store_cache(db: AsyncSession, account: BinanceAccount, raw_balances: list[dict]) -> None:
    account.balance_cache_json = json.dumps(raw_balances)
    account.balance_cache_at = utcnow()
    await db.commit()


async def get_account_snapshot(
    db: AsyncSession, account: BinanceAccount, client: BinanceSpotClient,
) -> tuple[list[dict], Optional[str], bool]:
    """Returns (non_zero_balances, note_or_error, served_from_cache).

    non_zero_balances is a list of {"asset","free","locked"} (string
    values, as Binance returns them) with zero-balance assets already
    filtered out. note_or_error is None on a clean fresh fetch; otherwise
    it explains why cached/empty data is being returned (still populated
    even when served_from_cache is True and the cache is itself fine — in
    that case it's just informational, not necessarily an error).
    """
    cached = _load_cache(account)

    active_ban = await get_active_ban(db)
    if active_ban is not None:
        if cached is not None:
            return cached, f"Binance API is rate-limited until {active_ban.isoformat()}; showing last known balance", True
        return [], f"Binance API is rate-limited until {active_ban.isoformat()}; no cached balance available yet", False

    if cached is not None and account.balance_cache_at:
        age = (utcnow() - account.balance_cache_at).total_seconds()
        if age < CACHE_TTL_SECONDS:
            return cached, None, True

    try:
        account_info = await client.get_account()
    except BinanceRateLimitError as exc:
        until = await _record_ban(db, exc)
        if cached is not None:
            return cached, f"Binance API just rate-limited us (banned until {until.isoformat()}); showing last known balance", True
        return [], f"Binance API rate-limited us and no cached balance is available: {exc.message}", False
    except BinanceError as exc:
        if cached is not None:
            return cached, f"Could not refresh balance ({exc.message}); showing last known balance", True
        return [], exc.message, False

    raw_balances = account_info.get("balances", [])
    non_zero: list[dict] = []
    for b in raw_balances:
        try:
            free = Decimal(str(b.get("free", "0")))
            locked = Decimal(str(b.get("locked", "0")))
        except InvalidOperation:
            continue
        if free == 0 and locked == 0:
            continue
        non_zero.append({"asset": b["asset"], "free": str(free), "locked": str(locked)})

    await _store_cache(db, account, non_zero)
    return non_zero, None, False

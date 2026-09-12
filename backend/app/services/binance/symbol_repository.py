"""
Caches exchange-info-derived SymbolFilters so we don't hit /exchangeInfo on
every single order. Cache TTL is intentionally short since filters can
change (e.g. a pair being delisted or trading halted).
"""
from __future__ import annotations

import time
from typing import Optional

from app.services.binance.client import BinanceSpotClient
from app.services.binance.filters import SymbolFilters
from app.services.binance.exceptions import BinanceError


class SymbolRepository:
    def __init__(self, client: BinanceSpotClient, ttl_seconds: int = 300):
        self._client = client
        self._ttl = ttl_seconds
        self._cache: dict[str, tuple[float, SymbolFilters]] = {}

    async def get(self, symbol: str, force_refresh: bool = False) -> SymbolFilters:
        now = time.time()
        cached = self._cache.get(symbol)
        if cached and not force_refresh and (now - cached[0]) < self._ttl:
            return cached[1]

        info = await self._client.get_exchange_info(symbol=symbol)
        symbols = info.get("symbols", [])
        if not symbols:
            raise BinanceError(f"Symbol {symbol} not found on exchange")
        filters = SymbolFilters.from_exchange_info_symbol(symbols[0])
        self._cache[symbol] = (now, filters)
        return filters

    def invalidate(self, symbol: Optional[str] = None) -> None:
        if symbol:
            self._cache.pop(symbol, None)
        else:
            self._cache.clear()

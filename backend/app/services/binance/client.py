"""
Binance Spot REST client.

Direct httpx-based integration against the official Binance Spot REST API
(no unofficial SDK dependency, per project requirements).

Security:
- The API secret is only ever held in memory for the duration of a single
  client instance's use and is never logged. Signed query strings (which
  contain the signature) are also never logged.
- `withdraw()` exists (see below) but is never called from anywhere in the
  autonomous trading loop (`app/workers/bot_worker.py` has no reference to
  it and never will). It is reachable only from the explicit,
  user-initiated endpoints in `app/api/accounts.py`, which additionally
  require a separate per-account application-level opt-in
  (`BinanceAccount.withdrawal_enabled`) on top of Binance's own
  `canWithdraw` key permission. This keeps the original safety principle —
  nothing that runs unattended can ever move funds off the exchange —
  intact even though the app now supports withdrawals as a deliberate,
  manual, audited action.
"""
from __future__ import annotations

import hashlib
import hmac
import time
from typing import Any, Optional
from urllib.parse import urlencode

import httpx

from app.config import get_settings
from app.services.binance.exceptions import (
    BinanceAuthError, BinanceError, BinanceRateLimitError,
)


class BinanceSpotClient:
    def __init__(
        self,
        api_key: Optional[str] = None,
        api_secret: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 10.0,
        transport: Optional[httpx.AsyncBaseTransport] = None,
    ):
        settings = get_settings()
        self.api_key = api_key
        self._api_secret = api_secret  # never logged, never exposed via __repr__/serialization
        self.base_url = base_url or settings.binance_api_base_url
        self._client = httpx.AsyncClient(
            base_url=self.base_url, timeout=timeout, transport=transport
        )

    def __repr__(self) -> str:  # never leak the secret via repr/debugging
        return f"BinanceSpotClient(base_url={self.base_url!r}, api_key={'set' if self.api_key else None})"

    async def aclose(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "BinanceSpotClient":
        return self

    async def __aexit__(self, *exc) -> None:
        await self.aclose()

    # -- low level -----------------------------------------------------

    def _sign(self, params: dict[str, Any]) -> dict[str, Any]:
        if not self._api_secret:
            raise BinanceAuthError("No API secret configured for signed request")
        query = urlencode(params)
        signature = hmac.new(
            self._api_secret.encode(), query.encode(), hashlib.sha256
        ).hexdigest()
        return {**params, "signature": signature}

    def _headers(self, signed: bool) -> dict[str, str]:
        headers = {"Accept": "application/json"}
        if signed:
            if not self.api_key:
                raise BinanceAuthError("No API key configured for signed request")
            headers["X-MBX-APIKEY"] = self.api_key
        return headers

    async def _request(
        self,
        method: str,
        path: str,
        params: Optional[dict[str, Any]] = None,
        signed: bool = False,
    ) -> Any:
        params = dict(params or {})
        if signed:
            params["timestamp"] = int(time.time() * 1000)
            params.setdefault("recvWindow", 5000)
            params = self._sign(params)

        try:
            resp = await self._client.request(
                method, path, params=params, headers=self._headers(signed)
            )
        except httpx.HTTPError as exc:
            raise BinanceError(f"Network error calling Binance: {exc}") from exc

        if resp.status_code == 429 or resp.status_code == 418:
            raise BinanceRateLimitError(
                "Binance rate limit exceeded", status_code=resp.status_code
            )

        if resp.status_code >= 400:
            try:
                body = resp.json()
                code = body.get("code")
                msg = body.get("msg", resp.text)
            except Exception:
                code, msg = None, resp.text
            if resp.status_code in (401, 403) or code in (-2014, -2015):
                raise BinanceAuthError(msg, code=code, status_code=resp.status_code)
            raise BinanceError(msg, code=code, status_code=resp.status_code)

        return resp.json()

    # -- public market data ---------------------------------------------

    async def get_exchange_info(self, symbol: Optional[str] = None) -> dict:
        params = {"symbol": symbol} if symbol else {}
        return await self._request("GET", "/api/v3/exchangeInfo", params)

    async def get_ticker_price(self, symbol: str) -> dict:
        return await self._request("GET", "/api/v3/ticker/price", {"symbol": symbol})

    async def get_ticker_24hr(self, symbol: str) -> dict:
        return await self._request("GET", "/api/v3/ticker/24hr", {"symbol": symbol})

    async def get_order_book(self, symbol: str, limit: int = 100) -> dict:
        return await self._request("GET", "/api/v3/depth", {"symbol": symbol, "limit": limit})

    async def get_recent_trades(self, symbol: str, limit: int = 50) -> list:
        return await self._request("GET", "/api/v3/trades", {"symbol": symbol, "limit": limit})

    async def get_klines(self, symbol: str, interval: str = "1m", limit: int = 100) -> list:
        return await self._request(
            "GET", "/api/v3/klines", {"symbol": symbol, "interval": interval, "limit": limit}
        )

    # -- authenticated account data --------------------------------------

    async def get_account(self) -> dict:
        return await self._request("GET", "/api/v3/account", signed=True)

    async def get_open_orders(self, symbol: Optional[str] = None) -> list:
        params = {"symbol": symbol} if symbol else {}
        return await self._request("GET", "/api/v3/openOrders", params, signed=True)

    async def get_order(self, symbol: str, order_id: Optional[str] = None,
                         orig_client_order_id: Optional[str] = None) -> dict:
        params: dict[str, Any] = {"symbol": symbol}
        if order_id:
            params["orderId"] = order_id
        if orig_client_order_id:
            params["origClientOrderId"] = orig_client_order_id
        return await self._request("GET", "/api/v3/order", params, signed=True)

    async def get_my_trades(self, symbol: str, limit: int = 100) -> list:
        return await self._request(
            "GET", "/api/v3/myTrades", {"symbol": symbol, "limit": limit}, signed=True
        )

    # -- trading -----------------------------------------------------------

    async def place_order(
        self,
        symbol: str,
        side: str,
        order_type: str,
        quantity: Optional[str] = None,
        quote_order_qty: Optional[str] = None,
        price: Optional[str] = None,
        time_in_force: Optional[str] = "GTC",
        new_client_order_id: Optional[str] = None,
    ) -> dict:
        params: dict[str, Any] = {
            "symbol": symbol,
            "side": side,
            "type": order_type,
        }
        if quantity is not None:
            params["quantity"] = quantity
        if quote_order_qty is not None:
            params["quoteOrderQty"] = quote_order_qty
        if order_type == "LIMIT":
            if price is None:
                raise BinanceError("price is required for LIMIT orders")
            params["price"] = price
            params["timeInForce"] = time_in_force
        if new_client_order_id:
            params["newClientOrderId"] = new_client_order_id
        return await self._request("POST", "/api/v3/order", params, signed=True)

    async def cancel_order(self, symbol: str, order_id: Optional[str] = None,
                            orig_client_order_id: Optional[str] = None) -> dict:
        params: dict[str, Any] = {"symbol": symbol}
        if order_id:
            params["orderId"] = order_id
        if orig_client_order_id:
            params["origClientOrderId"] = orig_client_order_id
        return await self._request("DELETE", "/api/v3/order", params, signed=True)

    async def cancel_all_open_orders(self, symbol: str) -> list:
        return await self._request(
            "DELETE", "/api/v3/openOrders", {"symbol": symbol}, signed=True
        )

    # -- withdrawals ---------------------------------------------------------
    # Deliberately isolated at the bottom of the client and never imported by
    # app/workers/*. Only app/api/accounts.py calls these, and only behind
    # the withdrawal_enabled + canWithdraw checks described in that module.

    async def withdraw(
        self,
        coin: str,
        address: str,
        amount: str,
        network: Optional[str] = None,
        address_tag: Optional[str] = None,
        withdraw_order_id: Optional[str] = None,
    ) -> dict:
        """POST /sapi/v1/capital/withdraw/apply — submits a withdrawal.

        This calls Binance's real withdrawal endpoint. Binance itself
        enforces the account's withdrawal whitelist/2FA settings; this
        client does not (and cannot) bypass those. Returns Binance's
        response, which includes an `id` (Binance's withdrawal id) on
        success.
        """
        params: dict[str, Any] = {"coin": coin, "address": address, "amount": amount}
        if network:
            params["network"] = network
        if address_tag:
            params["addressTag"] = address_tag
        if withdraw_order_id:
            params["withdrawOrderId"] = withdraw_order_id
        return await self._request("POST", "/sapi/v1/capital/withdraw/apply", params, signed=True)

    async def get_withdraw_history(
        self, coin: Optional[str] = None, withdraw_order_id: Optional[str] = None, limit: int = 100
    ) -> list:
        """GET /sapi/v1/capital/withdraw/history — used to refresh the
        status of a previously submitted withdrawal."""
        params: dict[str, Any] = {"limit": limit}
        if coin:
            params["coin"] = coin
        if withdraw_order_id:
            params["withdrawOrderId"] = withdraw_order_id
        return await self._request("GET", "/sapi/v1/capital/withdraw/history", params, signed=True)

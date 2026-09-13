"""
Binance symbol filter handling.

Every order MUST be validated and rounded against these filters before
submission. This is one of the most common sources of real-world order
rejections, so it gets its own well-tested module.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_DOWN, ROUND_UP

from app.services.binance.exceptions import BinanceFilterError


def _dec(value) -> Decimal:
    return Decimal(str(value))


def _step_precision(step: Decimal) -> int:
    """Number of decimal places implied by a step size like 0.00100000."""
    normalized = step.normalize()
    exponent = normalized.as_tuple().exponent
    return max(0, -exponent) if isinstance(exponent, int) else 0


@dataclass
class SymbolFilters:
    symbol: str
    base_asset: str
    quote_asset: str
    status: str

    min_price: Decimal
    max_price: Decimal
    tick_size: Decimal

    min_qty: Decimal
    max_qty: Decimal
    step_size: Decimal

    market_min_qty: Decimal
    market_max_qty: Decimal
    market_step_size: Decimal

    min_notional: Decimal
    apply_min_notional_to_market: bool

    base_asset_precision: int
    quote_asset_precision: int

    @classmethod
    def from_exchange_info_symbol(cls, symbol_info: dict) -> "SymbolFilters":
        filters = {f["filterType"]: f for f in symbol_info.get("filters", [])}

        price_filter = filters.get("PRICE_FILTER", {})
        lot_size = filters.get("LOT_SIZE", {})
        market_lot_size = filters.get("MARKET_LOT_SIZE", lot_size)
        notional = filters.get("NOTIONAL") or filters.get("MIN_NOTIONAL") or {}

        return cls(
            symbol=symbol_info["symbol"],
            base_asset=symbol_info.get("baseAsset", ""),
            quote_asset=symbol_info.get("quoteAsset", ""),
            status=symbol_info.get("status", "UNKNOWN"),
            min_price=_dec(price_filter.get("minPrice", "0")),
            max_price=_dec(price_filter.get("maxPrice", "0")) or Decimal("Infinity"),
            tick_size=_dec(price_filter.get("tickSize", "0.00000001")),
            min_qty=_dec(lot_size.get("minQty", "0")),
            max_qty=_dec(lot_size.get("maxQty", "0")) or Decimal("Infinity"),
            step_size=_dec(lot_size.get("stepSize", "0.00000001")),
            market_min_qty=_dec(market_lot_size.get("minQty", lot_size.get("minQty", "0"))),
            market_max_qty=_dec(market_lot_size.get("maxQty", lot_size.get("maxQty", "0")) or "Infinity"),
            market_step_size=_dec(market_lot_size.get("stepSize", lot_size.get("stepSize", "0.00000001"))),
            min_notional=_dec(notional.get("minNotional", notional.get("notional", "0"))),
            apply_min_notional_to_market=notional.get("applyToMarket", notional.get("applyMinToMarket", True)),
            base_asset_precision=symbol_info.get("baseAssetPrecision", 8),
            quote_asset_precision=symbol_info.get("quoteAssetPrecision", 8),
        )

    def round_price(self, price) -> Decimal:
        price = _dec(price)
        tick = self.tick_size
        if tick == 0:
            return price
        return (price / tick).to_integral_value(rounding=ROUND_DOWN) * tick

    def format_price(self, price) -> str:
        """String form safe for Binance LIMIT price params."""
        p = self.round_price(price)
        tick = self.tick_size
        if tick and tick != 0:
            prec = _step_precision(tick)
            p = p.quantize(Decimal(1).scaleb(-prec), rounding=ROUND_DOWN)
        s = format(p, "f")
        if "." in s:
            s = s.rstrip("0").rstrip(".")
        return s or "0"

    def round_quantity(self, quantity, market: bool = False) -> Decimal:
        quantity = _dec(quantity)
        step = self.market_step_size if market else self.step_size
        # Binance often sets MARKET_LOT_SIZE.stepSize to 0 ("no extra limit").
        # Still must respect LOT_SIZE.stepSize or the order is rejected.
        if step == 0:
            step = self.step_size
        if step == 0:
            return quantity
        rounded = (quantity / step).to_integral_value(rounding=ROUND_DOWN) * step
        return rounded.normalize() if rounded == rounded.to_integral() else rounded

    def format_quantity(self, quantity: Decimal, market: bool = False) -> str:
        """String form safe for Binance query params (no excess decimals)."""
        q = self.round_quantity(quantity, market=market)
        step = self.market_step_size if market and self.market_step_size != 0 else self.step_size
        if step and step != 0:
            prec = _step_precision(step)
            q = q.quantize(Decimal(1).scaleb(-prec), rounding=ROUND_DOWN)
        # Strip trailing zeros: 4983.000 -> 4983
        s = format(q, "f")
        if "." in s:
            s = s.rstrip("0").rstrip(".")
        return s or "0"

    def validate_order(
        self,
        side: str,
        order_type: str,
        quantity: Decimal | None = None,
        price: Decimal | None = None,
        quote_order_qty: Decimal | None = None,
    ) -> None:
        """Raise BinanceFilterError if the order would be rejected by Binance."""
        if self.status not in ("TRADING",):
            raise BinanceFilterError(f"{self.symbol} is not currently TRADING (status={self.status})")

        is_market = order_type == "MARKET"

        if order_type == "LIMIT":
            if price is None:
                raise BinanceFilterError("LIMIT orders require a price")
            if price < self.min_price or (self.max_price and price > self.max_price):
                raise BinanceFilterError(
                    f"Price {price} outside allowed range [{self.min_price}, {self.max_price}] for {self.symbol}"
                )
            remainder = (price - self.min_price) % self.tick_size if self.tick_size else Decimal(0)
            if self.tick_size and remainder != 0:
                raise BinanceFilterError(f"Price {price} does not respect tick size {self.tick_size}")

        if quantity is not None:
            min_qty = self.market_min_qty if is_market else self.min_qty
            max_qty = self.market_max_qty if is_market else self.max_qty
            step = self.market_step_size if is_market else self.step_size
            if step == 0:
                step = self.step_size
            # Market min can be 0 — fall back to LOT min
            if is_market and min_qty == 0:
                min_qty = self.min_qty
            if quantity < min_qty or (max_qty and max_qty != 0 and quantity > max_qty):
                raise BinanceFilterError(
                    f"Quantity {quantity} outside allowed range [{min_qty}, {max_qty}] for {self.symbol}"
                )
            if step and step != 0 and (quantity % step) != 0:
                raise BinanceFilterError(f"Quantity {quantity} does not respect step size {step}")

        # NOTIONAL check
        notional = None
        if quantity is not None and price is not None:
            notional = quantity * price
        elif quote_order_qty is not None:
            notional = quote_order_qty

        if notional is not None and self.min_notional:
            if is_market and not self.apply_min_notional_to_market:
                pass
            elif notional < self.min_notional:
                raise BinanceFilterError(
                    f"Order notional {notional} is below minimum notional {self.min_notional} for {self.symbol}"
                )

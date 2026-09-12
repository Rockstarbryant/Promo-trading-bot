class BinanceError(Exception):
    """Base error for anything returned by Binance or the client wrapper."""

    def __init__(self, message: str, code: int | None = None, status_code: int | None = None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


class BinanceAuthError(BinanceError):
    pass


class BinanceRateLimitError(BinanceError):
    pass


class BinanceFilterError(BinanceError):
    """Raised when an order would violate a symbol's exchange filters."""

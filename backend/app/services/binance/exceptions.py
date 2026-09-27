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
    """Raised on HTTP 429 (too many requests) or 418 (IP auto-banned).

    retry_after_seconds: parsed from the Retry-After header when Binance
    sends one.
    banned_until_ms: parsed from Binance's error message when it embeds an
    explicit unban timestamp (typically only on 418), e.g. "...IP banned
    until 1700000000000...". Either or both may be None if Binance didn't
    provide that detail, in which case the caller should fall back to a
    conservative default backoff.
    """

    def __init__(
        self,
        message: str,
        code: int | None = None,
        status_code: int | None = None,
        retry_after_seconds: int | None = None,
        banned_until_ms: int | None = None,
    ):
        super().__init__(message, code=code, status_code=status_code)
        self.retry_after_seconds = retry_after_seconds
        self.banned_until_ms = banned_until_ms


class BinanceFilterError(BinanceError):
    """Raised when an order would violate a symbol's exchange filters."""

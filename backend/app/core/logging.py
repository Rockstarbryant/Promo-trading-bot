"""
Structured logging setup.

CRITICAL: never log API keys, API secrets, auth headers, or signed request
query strings. The `redact` helper and `SENSITIVE_KEYS` set exist so every
call site has an easy, consistent way to scrub before logging.
"""
import logging
import json
import sys
from datetime import datetime, timezone
from typing import Any

SENSITIVE_KEYS = {
    "api_key", "apikey", "api_secret", "apisecret", "secret",
    "signature", "authorization", "password", "token",
    "x-mbx-apikey", "jwt", "access_token", "refresh_token",
}


def redact(data: Any) -> Any:
    """Recursively redact sensitive keys from dicts before logging."""
    if isinstance(data, dict):
        return {
            k: ("***REDACTED***" if k.lower() in SENSITIVE_KEYS else redact(v))
            for k, v in data.items()
        }
    if isinstance(data, list):
        return [redact(v) for v in data]
    return data


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        extra = getattr(record, "context", None)
        if extra:
            payload["context"] = redact(extra)
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging(level: str = "INFO") -> None:
    root = logging.getLogger()
    root.setLevel(level)
    root.handlers.clear()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root.addHandler(handler)


def get_event_logger() -> logging.Logger:
    return logging.getLogger("promo_trader.events")


def log_event(
    logger: logging.Logger,
    event_type: str,
    severity: str = "info",
    **context: Any,
) -> None:
    """Standard structured event log used throughout bots/workers."""
    payload = {"event_type": event_type, **context}
    log_fn = getattr(logger, severity.lower(), logger.info)
    log_fn(event_type, extra={"context": payload})

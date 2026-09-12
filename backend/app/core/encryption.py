"""
Symmetric encryption for API secrets at rest (Fernet / AES-128-CBC + HMAC).

Binance API secrets are NEVER stored in plaintext and NEVER returned via any
API response. Only this module touches the encryption key.
"""
from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings


class EncryptionError(Exception):
    pass


class SecretBox:
    """Thin wrapper around Fernet so callers never touch the raw key."""

    def __init__(self, key: str | None = None):
        settings = get_settings()
        key = key or settings.binance_api_encryption_key
        if not key:
            raise EncryptionError(
                "BINANCE_API_ENCRYPTION_KEY is not set. Generate one with "
                "`python -c \"from cryptography.fernet import Fernet; "
                "print(Fernet.generate_key().decode())\"` and set it in .env"
            )
        self._fernet = Fernet(key.encode() if isinstance(key, str) else key)

    def encrypt(self, plaintext: str) -> str:
        return self._fernet.encrypt(plaintext.encode()).decode()

    def decrypt(self, ciphertext: str) -> str:
        try:
            return self._fernet.decrypt(ciphertext.encode()).decode()
        except InvalidToken as exc:
            raise EncryptionError("Failed to decrypt stored secret") from exc


_box: SecretBox | None = None


def get_secret_box() -> SecretBox:
    global _box
    if _box is None:
        _box = SecretBox()
    return _box

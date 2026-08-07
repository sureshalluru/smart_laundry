"""
Encryption service for per-tenant API key storage.
Uses Fernet symmetric encryption (AES-128-CBC + HMAC-SHA256).
"""
import logging
from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)


class EncryptionService:
    """Encrypts and decrypts API key values using Fernet."""

    def __init__(self, master_key: str):
        """
        Initialize with MASTER_ENCRYPTION_KEY from env.
        Raises ValueError if key is missing or not a valid Fernet key.
        """
        if not master_key:
            raise ValueError(
                "MASTER_ENCRYPTION_KEY is required for tenant key encryption. "
                "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
        try:
            self._fernet = Fernet(master_key.encode() if isinstance(master_key, str) else master_key)
        except (ValueError, Exception) as e:
            raise ValueError(
                f"MASTER_ENCRYPTION_KEY is not a valid Fernet key: {e}. "
                "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )

    def encrypt(self, plaintext: str) -> str:
        """Encrypt a plaintext string. Returns base64-encoded ciphertext."""
        if plaintext is None:
            plaintext = ""
        token = self._fernet.encrypt(plaintext.encode("utf-8"))
        return token.decode("utf-8")

    def decrypt(self, ciphertext: str) -> str:
        """
        Decrypt a ciphertext string. Returns original plaintext.
        Raises InvalidToken if the ciphertext is corrupted or the key is wrong.
        """
        plaintext_bytes = self._fernet.decrypt(ciphertext.encode("utf-8"))
        return plaintext_bytes.decode("utf-8")


# Singleton instance — initialized lazily at first use
_instance: EncryptionService | None = None


def get_encryption_service() -> EncryptionService:
    """
    Get the singleton EncryptionService instance.
    Initializes on first call using settings.master_encryption_key.
    Returns None if master key is not configured (features gracefully degrade).
    """
    global _instance
    if _instance is None:
        from app.config import settings
        if not settings.master_encryption_key:
            logger.warning("[encryption] MASTER_ENCRYPTION_KEY not set — tenant key encryption disabled")
            return None
        _instance = EncryptionService(settings.master_encryption_key)
    return _instance

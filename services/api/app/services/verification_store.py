"""
In-memory verification store for onboarding email codes and tokens.

Thread-safe dict-based storage with TTL enforcement and periodic cleanup.
"""

import time
import uuid
import threading
from typing import Optional


# Constants
CODE_TTL = 600          # 10 minutes
TOKEN_TTL = 1800        # 30 minutes
MAX_ATTEMPTS = 3
CLEANUP_INTERVAL = 300  # 5 minutes


def normalize_address(street: str, city: str, state: str, zip_code: str) -> dict:
    """
    Normalize address fields by trimming whitespace and lowercasing.
    Reused by other modules for address comparison.

    Args:
        street: Street address
        city: City name
        state: State abbreviation or name
        zip_code: Zip/postal code

    Returns:
        Dict with normalized street, city, state, zip_code
    """
    return {
        "street": street.strip().lower(),
        "city": city.strip().lower(),
        "state": state.strip().lower(),
        "zip_code": zip_code.strip().lower(),
    }


class VerificationStore:
    """Thread-safe in-memory store for email verification codes and tokens."""

    def __init__(self):
        self._codes: dict = {}      # email -> {code, created_at, attempts}
        self._tokens: dict = {}     # token -> {email, created_at}
        self._lock = threading.Lock()
        self._cleanup_thread: Optional[threading.Thread] = None
        self._start_cleanup_thread()

    def _start_cleanup_thread(self):
        """Start a daemon thread that periodically cleans up expired entries."""
        self._cleanup_thread = threading.Thread(
            target=self._cleanup_loop,
            daemon=True,
            name="verification-store-cleanup",
        )
        self._cleanup_thread.start()

    def _cleanup_loop(self):
        """Background loop that calls cleanup_expired every CLEANUP_INTERVAL seconds."""
        while True:
            time.sleep(CLEANUP_INTERVAL)
            self.cleanup_expired()

    def store_code(self, email: str, code: str) -> None:
        """
        Store a 6-digit verification code for the given email.

        Overwrites any existing code for the same email (last code wins).

        Args:
            email: Email address (key)
            code: 6-digit verification code
        """
        with self._lock:
            self._codes[email] = {
                "code": code,
                "created_at": time.time(),
                "attempts": 0,
            }

    def verify_code(self, email: str, code: str) -> tuple:
        """
        Validate a code against the stored entry for the given email.

        Enforces 10-minute TTL and max 3 attempts.

        Args:
            email: Email address to look up
            code: Code entered by the user

        Returns:
            Tuple of (success: bool, error_code: str, attempts_remaining: int)
            - success=True, error_code="", attempts_remaining=0 on match
            - success=False, error_code="CODE_EXPIRED", attempts_remaining=0 if expired or not found
            - success=False, error_code="MAX_ATTEMPTS", attempts_remaining=0 if too many attempts
            - success=False, error_code="INVALID_CODE", attempts_remaining=N on mismatch
        """
        with self._lock:
            entry = self._codes.get(email)

            if entry is None:
                return (False, "CODE_EXPIRED", 0)

            # Check TTL
            elapsed = time.time() - entry["created_at"]
            if elapsed > CODE_TTL:
                del self._codes[email]
                return (False, "CODE_EXPIRED", 0)

            # Check max attempts
            if entry["attempts"] >= MAX_ATTEMPTS:
                return (False, "MAX_ATTEMPTS", 0)

            # Compare code
            if entry["code"] != code:
                entry["attempts"] += 1
                remaining = MAX_ATTEMPTS - entry["attempts"]
                return (False, "INVALID_CODE", remaining)

            # Success — remove entry so code can't be reused
            del self._codes[email]
            return (True, "", 0)

    def create_token(self, email: str) -> str:
        """
        Generate a UUID verification token associated with the given email.

        Token has a 30-minute TTL.

        Args:
            email: Email address to associate with the token

        Returns:
            The generated UUID token string
        """
        token = str(uuid.uuid4())
        with self._lock:
            self._tokens[token] = {
                "email": email,
                "created_at": time.time(),
            }
        return token

    def validate_token(self, token: str) -> Optional[str]:
        """
        Validate a verification token and return the associated email.

        Args:
            token: The UUID token to validate

        Returns:
            The associated email if the token is valid and not expired, else None
        """
        with self._lock:
            entry = self._tokens.get(token)
            if entry is None:
                return None

            elapsed = time.time() - entry["created_at"]
            if elapsed > TOKEN_TTL:
                del self._tokens[token]
                return None

            return entry["email"]

    def cleanup_expired(self) -> None:
        """
        Evict expired codes and tokens from the store.

        - Codes older than CODE_TTL are removed
        - Tokens older than TOKEN_TTL are removed
        """
        now = time.time()
        with self._lock:
            # Clean expired codes
            expired_emails = [
                email for email, entry in self._codes.items()
                if now - entry["created_at"] > CODE_TTL
            ]
            for email in expired_emails:
                del self._codes[email]

            # Clean expired tokens
            expired_tokens = [
                token for token, entry in self._tokens.items()
                if now - entry["created_at"] > TOKEN_TTL
            ]
            for token in expired_tokens:
                del self._tokens[token]


# Module-level singleton instance
verification_store = VerificationStore()

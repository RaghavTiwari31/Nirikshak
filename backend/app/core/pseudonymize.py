"""Keyed pseudonymisation of identifiers (hostnames, analyst IDs) at ingestion.

The same raw value always maps to the same token within a deployment, so joins and
per-analyst analytics still work, but raw identifiers are never stored.
"""

import hashlib
import hmac

from app.core.config import get_settings

TOKEN_LENGTH = 32


def pseudonymize(value: str | None, *, namespace: str = "") -> str | None:
    if value is None or value == "":
        return None
    key = get_settings().pseudonym_hmac_key.encode()
    msg = f"{namespace}:{value.strip().lower()}".encode()
    return hmac.new(key, msg, hashlib.sha256).hexdigest()[:TOKEN_LENGTH]

"""Deterministic finding text: the same inputs always produce the same words (no LLM)."""

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)


class _Ctx(dict[str, Any]):
    def __missing__(self, key: str) -> str:
        return "n/a"


def render(template: str, context: dict[str, Any]) -> str:
    safe = _Ctx({k: (0 if v is None else v) for k, v in context.items()})
    try:
        text = template.format_map(safe)
    except (ValueError, TypeError) as exc:  # format spec mismatch, e.g. :.0% on "n/a"
        logger.warning("Narrative render failed (%s); falling back to raw template", exc)
        text = template
    return re.sub(r"\s+", " ", text).strip()

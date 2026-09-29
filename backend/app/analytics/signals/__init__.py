"""Importing this package registers every signal implementation."""

from app.analytics.signals import anomaly, execution_gaps, negative_space, trends
from app.analytics.signals.base import REGISTRY, PopulationSignal, Signal

__all__ = [
    "REGISTRY",
    "PopulationSignal",
    "Signal",
    "anomaly",
    "execution_gaps",
    "negative_space",
    "trends",
]

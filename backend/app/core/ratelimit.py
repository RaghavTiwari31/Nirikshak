"""Login throttling: slows password guessing without locking legitimate users out for long.

Failed attempts are counted per (client address, username) in a sliding window. The API
runs as a single worker (Render free tier, and the offline bundle), so in-memory state is
sufficient; a multi-worker deployment would move this into Postgres or Redis.
"""

import threading
import time
from collections import defaultdict, deque
from collections.abc import Callable

MAX_FAILURES = 5
WINDOW_SECONDS = 15 * 60


class LoginThrottle:
    def __init__(
        self,
        max_failures: int = MAX_FAILURES,
        window: float = WINDOW_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.max_failures = max_failures
        self.window = window
        self._clock = clock
        self._failures: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _prune(self, key: tuple[str, str], now: float) -> deque[float]:
        q = self._failures[key]
        while q and now - q[0] > self.window:
            q.popleft()
        return q

    def retry_after(self, client: str, username: str) -> int:
        """Seconds until another attempt is allowed (0 = allowed now)."""
        key = (client, username.lower())
        with self._lock:
            q = self._prune(key, self._clock())
            if len(q) < self.max_failures:
                return 0
            return max(1, int(self.window - (self._clock() - q[0])))

    def record_failure(self, client: str, username: str) -> None:
        with self._lock:
            key = (client, username.lower())
            self._prune(key, self._clock()).append(self._clock())

    def reset(self, client: str, username: str) -> None:
        with self._lock:
            self._failures.pop((client, username.lower()), None)


login_throttle = LoginThrottle()

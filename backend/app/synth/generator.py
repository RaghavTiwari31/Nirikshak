"""Synthetic CSE submissions with planted, known weaknesses.

Output uses the *raw* submission contract (real-looking hostnames and analyst names),
so it goes through exactly the same ingestion path as a real entity's files.

Realism levers: diurnal/weekly alert rhythms, sector asset mixes, heavy-tailed per-asset
noise, lognormal response times by severity, shift rosters, realistic TP/FP rates,
multi-alert cases, escalation tiers with CERT-In's 6-hour reporting window.
"""

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
from faker import Faker

from app.domain.taxonomy import CATEGORIES, EXPECTED_SOURCES, OT_ASSET_TYPES
from app.models.enums import AssetType
from app.synth import text
from app.synth.archetypes import ARCHETYPES

IST = ZoneInfo("Asia/Kolkata")
SEVERITIES = np.array(["low", "medium", "high", "critical"])
SEV_RANK = {s: i for i, s in enumerate(SEVERITIES)}
SLA_HOURS = {"critical": 4.0, "high": 8.0, "medium": 24.0, "low": 72.0}
ACK_MEDIAN_MIN = {"low": 90.0, "medium": 45.0, "high": 20.0, "critical": 10.0}
CLOSE_MEDIAN_H = {"low": 20.0, "medium": 7.0, "high": 2.6, "critical": 1.3}
TP_RATE = {"low": 0.03, "medium": 0.08, "high": 0.20, "critical": 0.40}
CAT_TP_FACTOR = {
    "recon_scan": 0.3,
    "policy_violation": 0.6,
    "dos": 0.7,
    "phishing": 1.2,
    "c2_beacon": 1.3,
    "ot_unauthorized_command": 1.2,
}
CAT_WEIGHT = {
    "malware": 1.0,
    "phishing": 14.0,
    "auth_bruteforce": 2.2,
    "auth_anomaly": 3.0,
    "privilege_escalation": 0.4,
    "lateral_movement": 0.2,
    "c2_beacon": 0.15,
    "data_exfiltration": 0.3,
    "recon_scan": 18.0,
    "policy_violation": 0.8,
    "vuln_exploit": 0.5,
    "web_attack": 0.6,
    "dos": 3.0,
    "ot_protocol_anomaly": 1.6,
    "ot_unauthorized_command": 0.35,
    "insider_misuse": 0.3,
}
SEV_DIST = {
    "recon_scan": [0.6, 0.3, 0.08, 0.02],
    "policy_violation": [0.5, 0.4, 0.1, 0.0],
    "phishing": [0.4, 0.4, 0.15, 0.05],
    "auth_bruteforce": [0.3, 0.4, 0.25, 0.05],
    "auth_anomaly": [0.3, 0.4, 0.25, 0.05],
    "ot_unauthorized_command": [0, 0.2, 0.4, 0.4],
    "dos": [0.3, 0.4, 0.2, 0.1],
    "web_attack": [0.3, 0.4, 0.2, 0.1],
    "malware": [0.3, 0.4, 0.2, 0.1],
    "ot_protocol_anomaly": [0.2, 0.4, 0.3, 0.1],
}
DEFAULT_SEV_DIST = [0.15, 0.4, 0.35, 0.1]
HOUR_WEIGHTS = np.array(
    [2, 1.5, 1.2, 1, 1, 1.2, 2, 3, 5, 7, 8, 8, 7, 8, 8, 8, 7, 6, 5, 4, 3.5, 3, 2.5, 2.2]
)
HOUR_WEIGHTS = HOUR_WEIGHTS / HOUR_WEIGHTS.sum()


@dataclass(frozen=True)
class SizeProfile:
    assets: tuple[int, int]  # asset count range
    alerts: int  # mean alerts per month
    analysts: int


SIZES = {
    "small": SizeProfile(assets=(60, 110), alerts=220, analysts=5),
    "medium": SizeProfile(assets=(140, 260), alerts=480, analysts=9),
    "large": SizeProfile(assets=(300, 480), alerts=900, analysts=14),
}
A = AssetType
ASSET_MIX: dict[str, dict[AssetType, float]] = {
    "power_energy": {
        A.ENDPOINT: 50,
        A.SERVER: 18,
        A.DATABASE: 4,
        A.CLOUD: 2,
        A.OT_SCADA: 10,
        A.OT_HMI: 6,
    },
    "transport": {
        A.ENDPOINT: 52,
        A.SERVER: 18,
        A.DATABASE: 4,
        A.CLOUD: 3,
        A.OT_SCADA: 8,
        A.OT_HMI: 5,
    },
    "strategic_public": {
        A.ENDPOINT: 50,
        A.SERVER: 20,
        A.DATABASE: 5,
        A.CLOUD: 1,
        A.OT_SCADA: 6,
        A.OT_HMI: 4,
    },
    "bfsi": {A.ENDPOINT: 55, A.SERVER: 22, A.DATABASE: 10, A.CLOUD: 6},
    "telecom": {A.ENDPOINT: 45, A.SERVER: 30, A.DATABASE: 6, A.CLOUD: 8},
    "government": {A.ENDPOINT: 60, A.SERVER: 20, A.DATABASE: 7, A.CLOUD: 5},
}
OT_SECTORS = ("power_energy", "transport", "strategic_public")
VOLUME_BASE = {
    "siem": 9000,
    "edr": 4000,
    "fw": 120000,
    "ids": 30000,
    "email": 18000,
    "ot_ids": 2500,
}
UNMONITORED_TOOL = "ids"
MAX_VOLUME_ASSETS = 15


@dataclass
class EntitySpec:
    code: str
    display_name: str
    sector: str
    size_tier: str
    soc_model: str
    archetype: str
    intensity: float
    seed: int


@dataclass
class EntityData:
    spec: EntitySpec
    profile: dict[str, Any]
    assets: pd.DataFrame
    alerts: pd.DataFrame
    cases: pd.DataFrame
    case_events: pd.DataFrame
    escalations: pd.DataFrame
    source_volume: pd.DataFrame
    planted_signals: list[str]
    skipped_months: list[int] = field(default_factory=list)


def _next_daily(local: pd.Series, hour: int) -> pd.Series:
    """Next occurrence of `hour`:00 local time strictly after each timestamp."""
    base = local.dt.normalize() + pd.Timedelta(hours=hour)
    return base.where(base > local, base + pd.Timedelta(days=1))


def _next_weekday(local: pd.Series, weekday: int, hour: int) -> pd.Series:
    days_ahead = (weekday - local.dt.weekday) % 7
    cand = local.dt.normalize() + pd.to_timedelta(days_ahead, unit="D") + pd.Timedelta(hours=hour)
    return cand.where(cand > local, cand + pd.Timedelta(days=7))


class EntityGenerator:
    def __init__(self, spec: EntitySpec, start: date, months: int) -> None:
        self.spec = spec
        self.rng = np.random.default_rng(spec.seed)
        self.faker = Faker("en_IN")
        self.faker.seed_instance(spec.seed)
        self.arch = spec.archetype
        self.k = spec.intensity
        self.months = months
        bounds = pd.date_range(pd.Timestamp(start, tz=IST), periods=months + 1, freq="MS")
        self.month_starts = bounds
        self.start_ts, self.end_ts = bounds[0], bounds[-1]
        self.short = spec.code.replace("-", "").lower()
        self.declared_24x7 = self._declared_24x7()
        self.genuine_24x7 = self.declared_24x7 and self.arch != "ghost_night_shift"
        self.usernames = [self.faker.user_name() for _ in range(40)]

    # ------------------------------------------------------------------ setup
    def _declared_24x7(self) -> bool:
        if self.arch == "ghost_night_shift":
            return True
        p = {"small": 0.3, "medium": 0.6, "large": 0.9}[self.spec.size_tier]
        return bool(self.rng.random() < p)

    def _assets(self) -> pd.DataFrame:
        rng, sector = self.rng, self.spec.sector
        n = int(rng.integers(*SIZES[self.spec.size_tier].assets))
        mix = ASSET_MIX[sector]
        weights = np.array(list(mix.values()), dtype=float)
        types = list(rng.choice(list(mix.keys()), n, p=weights / weights.sum()))
        types += [A.DOMAIN_CONTROLLER] * (3 if self.spec.size_tier == "large" else 2)
        types += [A.EMAIL_GATEWAY] + [A.FIREWALL] * (4 if self.spec.size_tier == "large" else 2)
        if sector in OT_SECTORS:
            types += [A.OT_SCADA] * 4 + [A.OT_HMI] * 2
        counters: dict[str, int] = {}
        rows = []
        for t in types:
            t = AssetType(t)
            counters[t] = counters.get(t, 0) + 1
            env = {
                A.FIREWALL: "dmz",
                A.EMAIL_GATEWAY: "dmz",
                A.OT_SCADA: "ot",
                A.OT_HMI: "ot",
                A.CLOUD: "cloud",
            }.get(t, "it")
            if t == A.SERVER and rng.random() < 0.2:
                env = "dmz"
            crit = {
                A.DOMAIN_CONTROLLER: 4,
                A.OT_SCADA: 4,
                A.OT_HMI: 3,
                A.FIREWALL: 3,
                A.EMAIL_GATEWAY: 3,
            }.get(t)
            if crit is None:
                crit = int(
                    {
                        A.DATABASE: rng.choice([3, 4]),
                        A.SERVER: rng.choice([2, 3, 4], p=[0.4, 0.4, 0.2]),
                        A.ENDPOINT: rng.choice([1, 2], p=[0.7, 0.3]),
                        A.CLOUD: rng.choice([2, 3]),
                    }[t]
                )
            rows.append(
                {
                    "asset_ref": f"{self.short}-{t.value}-{counters[t]:03d}",
                    "asset_type": t.value,
                    "environment": env,
                    "criticality": crit,
                    "expected_sources": [s.value for s in EXPECTED_SOURCES[t]],
                }
            )
        return pd.DataFrame(rows)

    def _analysts(self) -> tuple[list[str], np.ndarray]:
        n = SIZES[self.spec.size_tier].analysts
        names = [self.faker.name() for _ in range(n)]
        # 24x7 shifts: 0 = 08-16, 1 = 16-24, 2 = 00-08. Otherwise: 0 = 08-14, 1 = 14-20.
        shifts = np.arange(n) % (3 if self.genuine_24x7 else 2)
        return names, shifts

    def _covered(self, hours: np.ndarray) -> np.ndarray:
        if self.genuine_24x7:
            return np.ones_like(hours, dtype=bool)
        return (hours >= 8) & (hours < 20)

    # ------------------------------------------------------------------ alerts
    def _alert_skeleton(self, assets: pd.DataFrame) -> pd.DataFrame:
        rng = self.rng
        noise = rng.gamma(1.5, 1 / 1.5, len(assets))
        silent_crit: set[int] = set()
        if self.arch == "silent_blind_spot":
            cand = assets.index[
                (assets.criticality == 4) & assets.asset_type.isin(["server", "db"])
            ].tolist()
            if not cand:
                cand = assets.index[assets.asset_type.isin(["server", "db"])].tolist()[:3]
            n_silent = max(1, int(round(len(cand) * 0.5)))
            silent_crit = set(rng.choice(cand, size=min(n_silent, len(cand)), replace=False))
        self.silent_assets = silent_crit

        pairs: list[tuple[int, str]] = []
        weights: list[float] = []
        for idx, row in assets.iterrows():
            if idx in silent_crit:
                continue
            for key, cat in CATEGORIES.items():
                if row.asset_type not in [t.value for t in cat.asset_types]:
                    continue
                if self.arch == "silent_blind_spot" and (
                    AssetType(row.asset_type) in OT_ASSET_TYPES
                    or (row.asset_type == "dc" and key.startswith("auth"))
                ):
                    continue
                pairs.append((int(idx), key))
                weights.append(CAT_WEIGHT[key] * noise[idx])
        w = np.array(weights) / np.sum(weights)

        base = SIZES[self.spec.size_tier].alerts * rng.uniform(0.8, 1.2)
        frames = []
        for m in range(self.months):
            ms, me = self.month_starts[m], self.month_starts[m + 1]
            n = int(rng.poisson(base * (1 + 0.08 * np.sin(2 * np.pi * m / 12))))
            days = pd.date_range(ms, me - pd.Timedelta(days=1), freq="D")
            day_w = np.where(days.weekday >= 5, 0.6, 1.0)
            day = rng.choice(len(days), n, p=day_w / day_w.sum())
            secs = rng.choice(24, n, p=HOUR_WEIGHTS) * 3600 + rng.integers(0, 3600, n)
            created = days[day] + pd.to_timedelta(secs, unit="s")
            pick = rng.choice(len(pairs), n, p=w)
            frames.append(
                pd.DataFrame(
                    {
                        "created_at": created,
                        "asset_idx": [pairs[i][0] for i in pick],
                        "category": [pairs[i][1] for i in pick],
                        "month": m,
                        "recurring": False,
                    }
                )
            )
        df = pd.concat(frames, ignore_index=True)
        if self.arch == "recurring_wounds":
            df = pd.concat([df, self._recurring(assets)], ignore_index=True)
        return df

    def _recurring(self, assets: pd.DataFrame) -> pd.DataFrame:
        rng = self.rng
        cand = assets.index[assets.asset_type.isin(["server", "endpoint"])].tolist()
        chosen = rng.choice(cand, size=min(len(cand), int(8 + 6 * self.k)), replace=False)
        rows = []
        for a in chosen:
            cat = str(rng.choice(["malware", "c2_beacon"]))
            t = self.start_ts + pd.Timedelta(days=float(rng.uniform(0, 30)))
            while t < self.end_ts - pd.Timedelta(hours=12):
                rows.append(
                    {
                        "created_at": t.floor("s"),
                        "asset_idx": int(a),
                        "category": cat,
                        "recurring": True,
                    }
                )
                t = t + pd.Timedelta(days=float(rng.uniform(9, 16)))
        df = pd.DataFrame(rows)
        df["month"] = [self._month_of(ts) for ts in df.created_at]
        return df

    def _month_of(self, ts: pd.Timestamp) -> int:
        return int(np.searchsorted(self.month_starts, ts, side="right") - 1)

    def _alerts(
        self, assets: pd.DataFrame, analysts: list[str], shifts: np.ndarray
    ) -> pd.DataFrame:
        rng, k = self.rng, self.k
        df = self._alert_skeleton(assets).sort_values("created_at", ignore_index=True)
        n = len(df)
        cats = df.category.to_numpy()

        sev = np.empty(n, dtype=object)
        tool = np.empty(n, dtype=object)
        rule = np.empty(n, dtype=object)
        for key in np.unique(cats):
            mask = cats == key
            cnt = int(mask.sum())
            sev[mask] = rng.choice(SEVERITIES, cnt, p=SEV_DIST.get(key, DEFAULT_SEV_DIST))
            tool[mask] = rng.choice([t.value for t in CATEGORIES[key].source_tools], cnt)
            rules = text.RULES[key]
            zipf = 1 / np.arange(1, len(rules) + 1)
            rule[mask] = rng.choice(rules, cnt, p=zipf / zipf.sum())
        rec = df.recurring.to_numpy()
        sev[rec] = rng.choice(["high", "medium"], int(rec.sum()), p=[0.7, 0.3])
        if rec.any():
            # One persistent detection per recurring asset.
            first_rule = df[rec].groupby("asset_idx").category.first()
            rule[rec] = [text.RULES[first_rule[a]][0] for a in df.asset_idx[rec]]

        tp_p = np.array([TP_RATE[s] for s in sev]) * np.array(
            [CAT_TP_FACTOR.get(c, 1.0) for c in cats]
        )
        tp = (rng.random(n) < tp_p) | rec
        disp = np.where(tp, "tp", rng.choice(["fp", "benign", "dup"], n, p=[0.6, 0.3, 0.1]))

        created = df.created_at
        local = created.dt.tz_convert(IST)
        hour = local.dt.hour.to_numpy()
        covered = self._covered(hour)
        ack_min = np.exp(np.log([ACK_MEDIAN_MIN[s] for s in sev]) + rng.normal(0, 0.7, n))
        if self.genuine_24x7:
            ack_min = np.where((hour < 8), ack_min * 1.4, ack_min)
        ack = created + pd.to_timedelta(ack_min, unit="m")
        wait_until = _next_daily(local, 8).dt.tz_convert(IST)
        delayed = wait_until + pd.to_timedelta(np.exp(np.log(25) + rng.normal(0, 0.5, n)), "m")
        ack = ack.where(covered, delayed)

        close_h = np.exp(np.log([CLOSE_MEDIAN_H[s] for s in sev]) + rng.normal(0, 0.8, n))
        close_h = close_h * np.where(tp, 1.5, 0.6)
        month = df.month.to_numpy()
        if self.arch == "decaying_soc":
            factor = np.where(month >= 6, 1 + (month - 5) * 0.45 * k, 1.0)
            ack = created + (ack - created) * factor
            close_h = close_h * factor
        closed = ack + pd.to_timedelta(close_h, unit="h")
        if not self.genuine_24x7:
            c_local = closed.dt.tz_convert(IST)
            off = ~self._covered(c_local.dt.hour.to_numpy())
            pushed = _next_daily(c_local, 8) + pd.to_timedelta(
                np.exp(np.log(30) + rng.normal(0, 0.5, n)), "m"
            )
            closed = closed.where(~off, pushed)

        analyst_idx = self._pick_analysts(ack, shifts)

        if self.arch == "metric_gamer":
            sla = np.array([SLA_HOURS[s] for s in sev])
            total_h = (closed - created).dt.total_seconds().to_numpy() / 3600
            gamed = (total_h > 0.85 * sla) & (rng.random(n) < 0.9 * k)
            new_total = sla * rng.uniform(0.86, 0.995, n)
            closed = closed.where(~gamed, created + pd.to_timedelta(new_total, unit="h"))
            rapid = np.isin(sev, ["high", "critical"]) & ~tp & (rng.random(n) < 0.45 * k)
            rapid_ack = created + pd.to_timedelta(rng.uniform(1, 3, n), unit="m")
            ack = ack.where(~rapid, rapid_ack)
            closed = closed.where(~rapid, rapid_ack + pd.to_timedelta(rng.uniform(1, 6, n), "m"))
            too_late = ack > closed
            ack = ack.where(~too_late, created + (closed - created) * 0.3)

        if self.arch == "bulk_closer":
            batch = np.isin(sev, ["low", "medium"]) & ~tp & (rng.random(n) < 0.7 * k)
            friday = _next_weekday(local, 4, 18).dt.tz_convert(IST) + pd.to_timedelta(
                rng.integers(0, 40, n), unit="s"
            )
            closed = closed.where(~batch, friday)
            ack = ack.where(~batch, friday - pd.to_timedelta(rng.integers(5, 60, n), unit="s"))
            analyst_idx = np.where(batch, 0, analyst_idx)
            auto = tool == UNMONITORED_TOOL
            tp[auto] = False
            disp = np.where(auto, "benign", disp)
            closed = closed.where(~auto, created + pd.to_timedelta(rng.integers(1, 6, n), "s"))
            ack = ack.where(~auto, pd.NaT)
            analyst_idx = np.where(auto, -1, analyst_idx)

        still_open = closed >= self.end_ts
        closed = closed.where(~still_open, pd.NaT)
        disp = np.where(still_open, "open", disp)
        ack = ack.where(ack < self.end_ts, pd.NaT)

        out = pd.DataFrame(
            {
                "alert_ref": [f"{self.spec.code}-A{i:07d}" for i in range(1, n + 1)],
                "asset_ref": assets.asset_ref.to_numpy()[df.asset_idx.to_numpy()],
                "source_tool": tool,
                "rule_ref": rule,
                "category": cats,
                "mitre_tactic": [CATEGORIES[c].mitre_tactic for c in cats],
                "severity": sev,
                "created_at": created,
                "acknowledged_at": ack.dt.floor("s"),
                "closed_at": closed.dt.floor("s"),
                "disposition": disp,
                "case_ref": pd.Series([None] * n, dtype=object),
                "analyst": [analysts[i] if i >= 0 else None for i in analyst_idx],
            }
        )
        out["h_tp"] = tp
        out["h_recurring"] = rec
        out["h_month"] = month
        out["h_asset_idx"] = df.asset_idx.to_numpy()
        return out

    def _pick_analysts(self, ack: pd.Series, shifts: np.ndarray) -> np.ndarray:
        rng, n = self.rng, len(ack)
        hour = ack.dt.tz_convert(IST).dt.hour.to_numpy()
        if self.genuine_24x7:
            shift_now = np.select([(hour >= 8) & (hour < 16), hour >= 16], [0, 1], 2)
        else:
            shift_now = np.where(hour < 14, 0, 1)
        idx = np.empty(n, dtype=int)
        for s in np.unique(shifts):
            members = np.flatnonzero(shifts == s)
            mask = shift_now == s
            idx[mask] = rng.choice(members, int(mask.sum()))
        if self.arch == "template_closer":
            idx = np.where(rng.random(n) < 0.6 * self.k, rng.choice([0, 1], n), idx)
        if self.arch == "holdout_unknown":
            idx = np.where(rng.random(n) < 0.9, 0, idx)
        return idx

    # ------------------------------------------------------------------- cases
    def _cases(
        self, alerts: pd.DataFrame, assets: pd.DataFrame, analysts: list[str]
    ) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
        rng, k = self.rng, self.k
        # Plain arrays: row-wise pandas indexing is far too slow for ~1k cases per entity.
        sev_rank = alerts.severity.map(SEV_RANK).to_numpy()
        tp = alerts["h_tp"].to_numpy()
        rec = alerts["h_recurring"].to_numpy()
        month_arr = alerts["h_month"].to_numpy()
        asset_arr = alerts["h_asset_idx"].to_numpy()
        created = list(alerts.created_at)
        acked = list(alerts.acknowledged_at)
        closed_arr = list(alerts.closed_at)
        analyst_arr = list(alerts.analyst)
        asset_ref_arr = list(alerts.asset_ref)
        rule_arr = list(alerts.rule_ref)

        auto = alerts.analyst.isna().to_numpy() & alerts.acknowledged_at.isna().to_numpy()
        cand = (tp & (sev_rank >= 1)) | (~tp & (sev_rank >= 2) & (rng.random(len(alerts)) < 0.12))
        cand &= ~auto
        idx = np.flatnonzero(cand)
        # Alerts are already in time order, so the row position is the secondary sort key.
        order = idx[np.lexsort((idx, asset_arr[idx]))]

        members: list[list[int]] = []
        member_tp: list[bool] = []
        last_case: dict[int, tuple[int, pd.Timestamp]] = {}
        for i in order:
            prev = last_case.get(asset_arr[i])
            if (
                prev is not None
                and tp[i]
                and member_tp[prev[0]]
                and created[i] - prev[1] < pd.Timedelta(hours=12)
                and rng.random() < 0.6
            ):
                members[prev[0]].append(int(i))
                continue
            members.append([int(i)])
            member_tp.append(bool(tp[i]))
            last_case[asset_arr[i]] = (len(members) - 1, created[i])

        case_ref_col: list[str | None] = [None] * len(alerts)
        case_rows, events, escalations = [], [], []
        template_analysts = {analysts[0], analysts[1]} if self.arch == "template_closer" else set()
        for j, mem in enumerate(sorted(members, key=lambda m: created[m[0]]), start=1):
            f0 = mem[0]
            ref = f"{self.spec.code}-C{j:06d}"
            for i in mem:
                case_ref_col[i] = ref
            is_tp = bool(tp[mem].any())
            month = int(month_arr[f0])
            late = self.arch == "decaying_soc" and month >= 6
            opened = acked[f0] if pd.notna(acked[f0]) else created[f0] + pd.Timedelta(minutes=5)
            opened = pd.Timestamp(opened).floor("s")
            closes = [closed_arr[i] for i in mem]
            closed = max(closes) if all(pd.notna(c) for c in closes) else pd.NaT
            priority = str(SEVERITIES[int(sev_rank[mem].max())])
            owner = analyst_arr[f0] or str(rng.choice(analysts))
            recurring = bool(rec[mem].any())

            # --- escalations
            tiers: list[tuple[str, str, pd.Timestamp, str]] = []
            if self.arch != "never_escalates" and is_tp:
                scale = max(0.2, 1 - (month - 5) * 0.15 * k) if late else 1.0
                p_l2 = {"critical": 0.95, "high": 0.55, "medium": 0.12}.get(priority, 0) * scale
                if rng.random() < p_l2:
                    t2 = opened + pd.Timedelta(minutes=float(rng.uniform(10, 90)))
                    tiers.append(("l1", "l2", t2, "Confirmed malicious activity"))
                    p_ciso = {"critical": 0.6, "high": 0.15}.get(priority, 0) * scale
                    if rng.random() < p_ciso:
                        tiers.append(
                            (
                                "l2",
                                "ciso",
                                t2 + pd.Timedelta(minutes=float(rng.uniform(30, 240))),
                                "Business impact assessment",
                            )
                        )
                if priority == "critical" and rng.random() < 0.3 * scale:
                    tiers.append(
                        (
                            "l2",
                            "cert_in",
                            opened + pd.Timedelta(hours=float(rng.uniform(1, 5.5))),
                            "Reportable incident (6-hour rule)",
                        )
                    )
            if self.arch == "holdout_unknown" and tiers:
                # Escalations wait for the Monday meeting; the case stays open until then.
                tiers = [
                    (f, t, _next_weekday(pd.Series([ts.tz_convert(IST)]), 0, 10).iloc[0], r)
                    for f, t, ts, r in tiers
                ]
                last_esc = max(ts for _, _, ts, _ in tiers)
                if pd.notna(closed) and closed <= last_esc:
                    reclose = last_esc + pd.Timedelta(hours=float(rng.uniform(1, 4)))
                    closed = reclose if reclose < self.end_ts else pd.NaT
            if pd.notna(closed):
                tiers = [
                    (f, t, ts if ts < closed else opened + (closed - opened) * 0.5, r)
                    for f, t, ts, r in tiers
                ]
            tier_rank = {"l2": 1, "ciso": 2, "cert_in": 3}
            level = max((t for _, t, _, _ in tiers), key=lambda t: tier_rank[t], default=None)

            # --- notes
            host = str(asset_ref_arr[f0])
            templated = owner in template_analysts
            if templated:
                note = str(rng.choice(text.TEMPLATE_NOTES))
            else:
                root_ctx = str(rng.choice(text.ROOT_CAUSES_TP if is_tp else text.ROOT_CAUSES_FP))
                ctx = {
                    "host": host,
                    "user": str(rng.choice(self.usernames)),
                    "rule": str(rule_arr[f0]).split(" ", 1)[-1],
                    "root": root_ctx,
                    "remediation": str(rng.choice(text.REMEDIATIONS)),
                }
                note = text.compose_note(
                    rng, tp=is_tp, ctx=ctx, max_sentences=int(rng.integers(1, 3)) if late else None
                )
            if recurring:
                root_cause, remediation = None, None
            elif is_tp:
                root_cause = str(rng.choice(text.ROOT_CAUSES_TP))
                remediation = (
                    None if late and rng.random() < 0.5 else str(rng.choice(text.REMEDIATIONS))
                )
            else:
                root_cause = str(rng.choice(text.ROOT_CAUSES_FP)) if rng.random() < 0.7 else None
                remediation = None

            # --- workflow events
            ev: list[tuple[pd.Timestamp, str]] = [
                (opened + pd.Timedelta(minutes=float(rng.uniform(0, 5))), "assign")
            ]
            horizon = (
                closed if pd.notna(closed) else min(opened + pd.Timedelta(days=2), self.end_ts)
            )
            skip_detail = templated and rng.random() < 0.5
            if not skip_detail:
                for _ in range(1 + int(rng.poisson(1.5))):
                    ev.append(
                        (opened + (horizon - opened) * float(rng.uniform(0.05, 0.95)), "comment")
                    )
                if is_tp and rng.random() < (0.4 if late else 0.75):
                    ev.append(
                        (opened + (horizon - opened) * float(rng.uniform(0.2, 0.5)), "contain")
                    )
            ev += [(ts, "escalate") for _, _, ts, _ in tiers]
            reopened = 0
            if pd.notna(closed):
                ev.append((closed, "close"))
                if rng.random() < 0.03:
                    reopen = closed + pd.Timedelta(hours=float(rng.uniform(1, 24)))
                    reclose = reopen + pd.Timedelta(hours=float(rng.uniform(1, 8)))
                    if reclose < self.end_ts:
                        ev += [(reopen, "reopen"), (reclose, "close")]
                        closed, reopened = reclose, 1
            seen: set[tuple[pd.Timestamp, str]] = set()
            for ts, action in sorted(ev):
                ts = pd.Timestamp(ts).floor("s")
                while (ts, action) in seen:  # keep (case, ts, action) unique
                    ts += pd.Timedelta(seconds=1)
                seen.add((ts, action))
                events.append({"case_ref": ref, "ts": ts, "action": action, "actor": owner})
            for f, t, ts, r in tiers:
                escalations.append(
                    {
                        "case_ref": ref,
                        "ts": pd.Timestamp(ts).floor("s"),
                        "from_tier": f,
                        "to_tier": t,
                        "reason": r,
                    }
                )

            case_rows.append(
                {
                    "case_ref": ref,
                    "opened_at": opened,
                    "closed_at": pd.Timestamp(closed).floor("s") if pd.notna(closed) else pd.NaT,
                    "priority": priority,
                    "status": "closed" if pd.notna(closed) else "open",
                    "assignee": owner,
                    "escalated": bool(tiers),
                    "escalation_level": level,
                    "resolution_note": note,
                    "root_cause": root_cause,
                    "remediation_action": remediation,
                    "reopened_count": reopened,
                    # A case belongs to the submission of the month it was opened in.
                    "h_month": min(self._month_of(opened), self.months - 1),
                }
            )
        alerts["case_ref"] = case_ref_col
        cases_df = pd.DataFrame(case_rows)
        events_df = pd.DataFrame(events, columns=["case_ref", "ts", "action", "actor"])
        esc_df = pd.DataFrame(
            escalations, columns=["case_ref", "ts", "from_tier", "to_tier", "reason"]
        )
        return cases_df, events_df, esc_df

    # ---------------------------------------------------------- source volume
    def _source_volume(self, assets: pd.DataFrame) -> pd.DataFrame:
        rng = self.rng
        days = pd.date_range(
            self.start_ts.date(), (self.end_ts - pd.Timedelta(days=1)).date(), freq="D"
        )
        week_factor = np.where(days.weekday >= 5, 0.7, 1.0)
        silence_from = len(days) // 6
        parts = []
        # Daily telemetry is only submitted for the most critical systems (keeps volume sane).
        priority = {"dc": 0, "ot_scada": 1, "db": 2, "firewall": 3, "email_gw": 4, "server": 5}
        crit = assets[assets.criticality == 4].copy()
        crit["_p"] = crit.asset_type.map(priority).fillna(9)
        chosen = crit.sort_values("_p").head(MAX_VOLUME_ASSETS).index
        chosen = chosen.union(pd.Index(sorted(self.silent_assets)))
        for idx, row in assets.loc[chosen].iterrows():
            is_ot = AssetType(row.asset_type) in OT_ASSET_TYPES
            if self.arch == "silent_blind_spot" and is_ot:
                continue  # OT telemetry never reaches the SOC
            for tool in row.expected_sources:
                lam = VOLUME_BASE[tool] * float(np.exp(rng.normal(0, 0.3))) * week_factor
                counts = rng.poisson(lam)
                counts[rng.random(len(days)) < 0.004] = 0  # occasional collector outage
                if idx in self.silent_assets:
                    counts[silence_from:] = 0
                parts.append(
                    pd.DataFrame(
                        {
                            "asset_ref": row.asset_ref,
                            "source_tool": tool,
                            "day": days.date,
                            "event_count": counts,
                        }
                    )
                )
        cols = ["asset_ref", "source_tool", "day", "event_count"]
        return pd.concat(parts, ignore_index=True) if parts else pd.DataFrame(columns=cols)

    # ------------------------------------------------------------------ public
    def generate(self) -> EntityData:
        assets = self._assets()
        analysts, shifts = self._analysts()
        alerts = self._alerts(assets, analysts, shifts)
        cases, events, escalations = self._cases(alerts, assets, analysts)
        volume = self._source_volume(assets)

        closed = alerts[alerts.closed_at.notna()]
        observed_mttr = (
            float(((closed.closed_at - closed.created_at).dt.total_seconds() / 3600).mean())
            if len(closed)
            else 8.0
        )
        optimistic = self.arch in ("metric_gamer", "ghost_night_shift", "decaying_soc")
        mttr_factor = self.rng.uniform(0.35, 0.55) if optimistic else self.rng.uniform(0.9, 1.15)
        coverage = (
            self.rng.uniform(95, 99)
            if self.arch == "silent_blind_spot"
            else self.rng.uniform(86, 97)
        )
        profile = {
            "entity_code": self.spec.code,
            "display_name": self.spec.display_name,
            "sector": self.spec.sector,
            "size_tier": self.spec.size_tier,
            "soc_model": self.spec.soc_model,
            "declared_24x7": self.declared_24x7,
            **{f"declared_sla_hours_{s}": h for s, h in SLA_HOURS.items()},
            "declared_mttr_hours": round(observed_mttr * mttr_factor, 2),
            "declared_coverage_pct": round(coverage, 1),
        }
        planted = list(ARCHETYPES[self.arch].planted_signals)
        has_ot = assets.asset_type.isin(["ot_scada", "ot_hmi"]).any()
        if "NS-07" in planted and not has_ot:
            planted.remove("NS-07")
        skipped = (
            [min(self.months - 2, 7)]
            if self.arch == "silent_blind_spot" and self.months >= 4
            else []
        )
        return EntityData(
            self.spec, profile, assets, alerts, cases, events, escalations, volume, planted, skipped
        )


def split_by_month(
    data: EntityData, start: date, months: int
) -> list[tuple[date, date, dict[str, pd.DataFrame]]]:
    """One submission per month. Assets travel with the first submission."""
    bounds = pd.date_range(pd.Timestamp(start, tz=IST), periods=months + 1, freq="MS")
    alert_cols = [c for c in data.alerts.columns if not c.startswith("h_")]
    case_cols = [c for c in data.cases.columns if not c.startswith("h_")]
    out = []
    for m in range(months):
        if m in data.skipped_months:
            continue
        ms, me = bounds[m], bounds[m + 1]
        cases = data.cases[data.cases["h_month"] == m] if len(data.cases) else data.cases
        refs = set(cases.case_ref) if len(cases) else set()
        frames = {
            "alerts": data.alerts.loc[data.alerts["h_month"] == m, alert_cols],
            "cases": cases[case_cols] if len(cases) else cases,
            "case_events": data.case_events[data.case_events.case_ref.isin(refs)],
            "escalations": data.escalations[data.escalations.case_ref.isin(refs)],
        }
        if len(data.source_volume):
            day = pd.to_datetime(data.source_volume.day)
            in_month = (day >= ms.tz_localize(None)) & (day < me.tz_localize(None))
            frames["source_volume"] = data.source_volume[in_month]
        if m == 0:
            frames["assets"] = data.assets
        frames = {k: v for k, v in frames.items() if len(v)}
        out.append((ms.date(), (me - timedelta(days=1)).date(), frames))
    return out


def entity_specs(n: int, seed: int, intensity_scale: float = 1.0) -> list[EntitySpec]:
    """Fictional entities spread across sectors, with archetypes assigned deterministically.

    `intensity_scale` weakens (<1) the graded planted behaviours (how much closures are
    gamed, how many notes are templated, how fast a SOC decays...) for sensitivity studies.
    Binary weaknesses (an unmonitored OT estate, no escalations at all) are unaffected.
    """
    from app.synth.archetypes import archetype_plan

    rng = np.random.default_rng(seed)
    sectors = list(text.SECTOR_NAMES)
    slots = [sectors[i % len(sectors)] for i in range(n)]
    sizes = rng.choice(["small", "medium", "large"], n, p=[0.35, 0.45, 0.2])
    plan = archetype_plan(n)
    # Blind spots go to OT-heavy sectors so the OT gap is meaningful.
    ot_slots = [i for i, s in enumerate(slots) if s in OT_SECTORS]
    other_slots = [i for i in range(n) if i not in ot_slots]
    rng.shuffle(ot_slots)
    rng.shuffle(other_slots)
    order = ot_slots + other_slots
    blind = [a for a in plan if a == "silent_blind_spot"]
    rest = [a for a in plan if a != "silent_blind_spot"]
    rng.shuffle(rest)
    assignment: dict[int, str] = {}
    for slot, arch in zip(order, blind + rest, strict=True):
        assignment[slot] = arch

    counters: dict[str, int] = {}
    used_names: set[str] = set()
    specs = []
    for i, sector in enumerate(slots):
        prefix, nouns = text.SECTOR_NAMES[sector]
        counters[sector] = counters.get(sector, 0) + 1
        while True:
            name = f"{rng.choice(text.REGIONS)} {rng.choice(nouns)}"
            if name not in used_names:
                used_names.add(name)
                break
        specs.append(
            EntitySpec(
                code=f"CSE-{prefix}-{counters[sector]:02d}",
                display_name=f"{name} (synthetic)",
                sector=sector,
                size_tier=str(sizes[i]),
                soc_model=str(rng.choice(["inhouse", "mssp", "hybrid"], p=[0.45, 0.3, 0.25])),
                archetype=assignment[i],
                intensity=float(rng.uniform(0.7, 1.0)) * intensity_scale,
                seed=int(seed * 1000 + i),
            )
        )
    return specs


def generation_start(start: date | None, months: int) -> date:
    if start is not None:
        return start.replace(day=1)
    today = datetime.now(IST).date().replace(day=1)
    y, m = today.year, today.month - months
    while m <= 0:
        m += 12
        y -= 1
    return date(y, m, 1)

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.analytics.robustness import StudyConfig
from app.analytics.validation import yield_curves
from app.core.security import hash_password
from app.models.analysis import ValidationStudy
from app.models.system import AppUser
from app.synth.generator import entity_specs
from app.synth.runner import generate


def test_yield_curves_perfect_and_worst_rankings() -> None:
    codes = [f"E{i}" for i in range(10)]
    weak = {"E0", "E1", "E2", "E3"}
    best = yield_curves(codes, weak, n_sims=500)
    assert best["tool"] == best["oracle"]
    assert best["effort_to_target"]["tool"] == 4  # 80% of 4 weak -> 4th entity (3.2 rounds up)
    assert best["tool"][0] == 0.0 and best["tool"][-1] == 1.0
    # Random order needs ~80% of all entities to find 80% of the weak ones.
    assert best["effort_to_target"]["random"] == 8
    assert all(
        lo <= m <= hi
        for lo, m, hi in zip(
            best["random_p05"], best["random_mean"], best["random_p95"], strict=True
        )
    )

    worst = yield_curves(list(reversed(codes)), weak, n_sims=100)
    assert worst["effort_to_target"]["tool"] == 10
    assert yield_curves([], weak)["k"] == []


def test_study_config_parse_and_intensity_scale() -> None:
    assert StudyConfig.parse("7:0.5") == StudyConfig(7, 0.5)
    assert StudyConfig.parse("99") == StudyConfig(99, 1.0)
    full = {s.code: s.intensity for s in entity_specs(10, 3)}
    half = {s.code: s.intensity for s in entity_specs(10, 3, intensity_scale=0.5)}
    assert all(half[c] == pytest.approx(full[c] * 0.5) for c in full)


def _auth(client: TestClient, db: Session) -> dict[str, str]:
    db.add(
        AppUser(
            username="v-sup",
            display_name="v",
            pw_hash=hash_password("pw-123456"),
            role="supervisor",
        )
    )
    db.commit()
    tok = client.post("/api/auth/login", json={"username": "v-sup", "password": "pw-123456"})
    return {"Authorization": f"Bearer {tok.json()['access_token']}"}


def test_validation_endpoints(client: TestClient, db: Session) -> None:
    h = _auth(client, db)
    assert client.get("/api/validation/summary", headers=h).status_code == 404  # no run yet
    generate(db, n_entities=10, months=3, seed=31, start=date(2025, 9, 1))
    assert client.post("/api/runs", headers=h, json={}).status_code == 202

    s = client.get("/api/validation/summary", headers=h).json()
    ev, y = s["evaluation"], s["yield_curves"]
    assert ev["weak_entities"] + ev["healthy_entities"] == 10
    assert len(ev["signals"]) == 22
    assert len(y["tool"]) == 11 and y["n_entities"] == 10
    assert y["effort_to_target"]["tool"] <= y["effort_to_target"]["random"]
    assert {a["key"] for a in s["archetypes"]} >= {"healthy"}
    assert all(h_["entity_code"] for h_ in s["holdout"])

    finding = client.get("/api/findings", headers=h).json()["items"][0]
    client.post(f"/api/findings/{finding['id']}/feedback", headers=h, json={"verdict": "accepted"})
    sample = client.get("/api/review/packs", headers=h).json()[0]["entity_code"]
    item = client.get(f"/api/review/packs/{sample}", headers=h).json()["items"][0]
    client.patch(f"/api/review/samples/{item['id']}", headers=h, json={"outcome": "no_issue"})
    f = client.get("/api/validation/field", headers=h).json()
    assert f["feedback"][0]["accepted"] == 1 and f["feedback"][0]["precision"] == 1.0
    reviewed = f["review"]["directed"]["reviewed"] + f["review"]["control"]["reviewed"]
    assert reviewed == 1

    db.add(
        ValidationStudy(
            batch="b1",
            seed=7,
            intensity_scale=0.5,
            config_sha256="x" * 64,
            results_json={
                "evaluation": {
                    "weak_caught": 9,
                    "weak_entities": 10,
                    "healthy_flagged": [],
                    "healthy_entities": 10,
                },
                "holdout": [{"found": True}, {"found": False}],
            },
        )
    )
    db.commit()
    rows = client.get("/api/validation/robustness", headers=h).json()
    assert rows[0]["weak_caught"] == 9 and rows[0]["holdout_found"] == 1

"""Generated documents must match the code and configuration they describe."""

from pathlib import Path

from app.analytics.config import load_config
from app.analytics.docs import signal_library_markdown
from app.cli import main

DOCS = Path(__file__).resolve().parents[2] / "docs"


def test_signal_library_lists_every_signal() -> None:
    cfg = load_config()
    md = signal_library_markdown(cfg)
    for s in cfg.signals:
        assert f"### {s.id}: {s.name}" in md
    assert cfg.version in md


def test_signal_library_doc_is_current() -> None:
    committed = (DOCS / "SIGNAL_LIBRARY.md").read_text(encoding="utf-8")
    assert committed == signal_library_markdown(load_config()), (
        "docs/SIGNAL_LIBRARY.md is stale: run `python -m app.cli signal-docs`"
    )


def test_data_contract_doc_is_current(tmp_path: Path) -> None:
    out = tmp_path / "contract.md"
    assert main(["contract-docs", "--out", str(out)]) == 0
    assert out.read_text(encoding="utf-8") == (DOCS / "DATA_CONTRACT.md").read_text(
        encoding="utf-8"
    ), "docs/DATA_CONTRACT.md is stale: run `python -m app.cli contract-docs`"

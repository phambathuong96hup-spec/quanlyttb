"""Focused relevance regressions for the lightweight legal RAG backend."""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import sys


LIGHTRAG_ROOT = Path(__file__).resolve().parents[1]
SERVER_PATH = LIGHTRAG_ROOT / "lightrag" / "api" / "legal_rag_server.py"
os.environ["LEGAL_RAG_INDEX"] = str(LIGHTRAG_ROOT / "legal-knowledge.json")

SPEC = importlib.util.spec_from_file_location("legal_rag_server_relevance", SERVER_PATH)
assert SPEC and SPEC.loader
SERVER = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = SERVER
SPEC.loader.exec_module(SERVER)


SMOKE_QUERY = (
    "Theo Nghị định 98/2021/NĐ-CP, nguyên tắc quản lý "
    "trang thiết bị y tế là gì?"
)


def test_nghi_dinh_98_query_prefers_directly_overlapping_citations():
    references = SERVER._rank(SMOKE_QUERY)

    assert references
    assert len(references) <= 3
    assert all(
        reference["file_path"] == "98_2021_ND-CP_493940.docx"
        for reference in references
    )
    assert references[0]["section_title"].startswith(
        "Điều 3. Nguyên tắc quản lý trang thiết bị y tế"
    )
    first_evidence = SERVER._normalize(
        " ".join(
            [
                references[0]["section_title"],
                *references[0]["content"],
            ]
        )
    )
    assert "nguyen tac quan ly trang thiet bi y te" in first_evidence


def test_out_of_scope_query_returns_safe_empty_evidence():
    assert SERVER._rank("quasar zyxwv blockchain ngoài phạm vi pháp quy") == []

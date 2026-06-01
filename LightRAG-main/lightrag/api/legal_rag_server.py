"""Legal RAG API for the equipment-management assistant.

The backend retrieves relevant legal snippets from a prebuilt index, then asks an
OpenAI-compatible LLM to synthesize the final answer when a provider key is
configured. If the LLM provider is unavailable, it falls back to deterministic
retrieval so the public AI endpoints remain usable.
"""

from __future__ import annotations

import asyncio
import json
import math
import os
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse


INDEX_PATH = Path(os.getenv("LEGAL_RAG_INDEX", "/app/legal-knowledge.json"))
MIN_TOKEN_LENGTH = 2
BM25_K1 = 1.4
BM25_B = 0.72
LLM_TIMEOUT_SECONDS = float(os.getenv("LLM_TIMEOUT_SECONDS", "45"))
LLM_MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "900"))
LLM_CONTEXT_CHAR_LIMIT = int(os.getenv("LLM_CONTEXT_CHAR_LIMIT", "5200"))
REQUIRED_ANSWER_SECTIONS = [
    "### Tóm tắt",
    "### Căn cứ trong tài liệu",
    "### Việc cần làm",
    "### Lưu ý",
]


@dataclass(frozen=True)
class PreparedChunk:
    raw: dict[str, Any]
    normalized_text: str
    tokens: list[str]
    term_frequency: dict[str, int]


@dataclass(frozen=True)
class PreparedIndex:
    documents: list[dict[str, Any]]
    chunks: list[PreparedChunk]
    document_frequency: dict[str, int]
    average_chunk_length: float


def _remove_vietnamese_tones(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value)
    without_marks = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    return without_marks.replace("đ", "d").replace("Đ", "D")


def _normalize(value: str) -> str:
    return re.sub(r"\s+", " ", _remove_vietnamese_tones(value).lower()).strip()


def _tokenize(value: str) -> list[str]:
    tokens = re.findall(r"[\w]+", _normalize(value), flags=re.UNICODE)
    return [token for token in tokens if len(token) >= MIN_TOKEN_LENGTH]


def _term_frequency(tokens: list[str]) -> dict[str, int]:
    frequency: dict[str, int] = {}
    for token in tokens:
        frequency[token] = frequency.get(token, 0) + 1
    return frequency


def _load_index() -> PreparedIndex:
    if not INDEX_PATH.exists():
        raise RuntimeError(f"Legal RAG index not found: {INDEX_PATH}")

    source = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    chunks = []
    document_frequency: dict[str, int] = {}
    total_length = 0

    for item in source.get("chunks", []):
        normalized_text = _normalize(
            " ".join(
                [
                    item.get("documentTitle", ""),
                    item.get("documentDescription", ""),
                    item.get("sectionTitle", ""),
                    item.get("text", ""),
                ]
            )
        )
        tokens = _tokenize(normalized_text)
        total_length += len(tokens)
        term_frequency = _term_frequency(tokens)
        for token in set(tokens):
            document_frequency[token] = document_frequency.get(token, 0) + 1
        chunks.append(
            PreparedChunk(
                raw=item,
                normalized_text=normalized_text,
                tokens=tokens,
                term_frequency=term_frequency,
            )
        )

    average_chunk_length = total_length / len(chunks) if chunks else 1
    return PreparedIndex(
        documents=source.get("documents", []),
        chunks=chunks,
        document_frequency=document_frequency,
        average_chunk_length=average_chunk_length,
    )


INDEX = _load_index()


def _score_bm25(chunk: PreparedChunk, query_tokens: list[str]) -> float:
    score = 0.0
    total_chunks = max(len(INDEX.chunks), 1)
    chunk_length = max(len(chunk.tokens), 1)

    for token in query_tokens:
        frequency = chunk.term_frequency.get(token, 0)
        if not frequency:
            continue
        document_frequency = INDEX.document_frequency.get(token, 0)
        idf = math.log(1 + (total_chunks - document_frequency + 0.5) / (document_frequency + 0.5))
        denominator = frequency + BM25_K1 * (
            1 - BM25_B + BM25_B * chunk_length / INDEX.average_chunk_length
        )
        score += idf * (frequency * (BM25_K1 + 1)) / denominator

    return score


def _metadata_boost(chunk: PreparedChunk, normalized_query: str) -> float:
    raw = chunk.raw
    metadata = _normalize(
        " ".join(
            [
                raw.get("documentTitle", ""),
                raw.get("documentDescription", ""),
                raw.get("sectionTitle", ""),
                raw.get("fileName", ""),
            ]
        )
    )
    boost = 0.0
    for phrase in ["nghi dinh 98", "thong tu 05", "thong tu 19", "nghi dinh 117", "quyet dinh 7115"]:
        if phrase in normalized_query and phrase in metadata:
            boost += 0.35
    return boost


def _excerpt(text: str, query_tokens: list[str]) -> str:
    normalized = _normalize(text)
    match_positions = [normalized.find(token) for token in query_tokens if normalized.find(token) >= 0]
    if not match_positions:
        return text[:700].strip()

    start = max(min(match_positions) - 180, 0)
    end = min(start + 700, len(text))
    prefix = "... " if start else ""
    suffix = " ..." if end < len(text) else ""
    return f"{prefix}{text[start:end].strip()}{suffix}"


def _rank(query: str) -> list[dict[str, Any]]:
    query_tokens = _tokenize(query)
    if not query_tokens:
        return []

    normalized_query = _normalize(query)
    scored = []
    for chunk in INDEX.chunks:
        score = _score_bm25(chunk, query_tokens) + _metadata_boost(chunk, normalized_query)
        if score > 0:
            scored.append((score, chunk))

    scored.sort(key=lambda item: item[0], reverse=True)
    return [
        {
            "reference_id": chunk.raw.get("id"),
            "file_path": chunk.raw.get("fileName"),
            "content": [_excerpt(chunk.raw.get("text", ""), query_tokens)],
            "score": score,
            "document_title": chunk.raw.get("documentTitle"),
            "section_title": chunk.raw.get("sectionTitle"),
        }
        for score, chunk in scored[:5]
    ]


def _answer(query: str, references: list[dict[str, Any]]) -> str:
    if not references:
        return (
            "### Tóm tắt\n"
            "Chưa tìm thấy đoạn phù hợp trong bộ 5 văn bản pháp quy đã nạp.\n\n"
            "### Việc cần làm\n"
            "- Hỏi cụ thể hơn theo số văn bản, điều khoản hoặc từ khóa nghiệp vụ.\n"
            "- Kiểm tra lại tên thiết bị, loại hồ sơ hoặc quy trình cần tra cứu.\n\n"
            "### Lưu ý\n"
            "- Cần bổ sung thêm tài liệu nếu câu hỏi nằm ngoài chỉ mục hiện có."
        )

    lines = [
        "### Tóm tắt",
        "Các đoạn liên quan nhất trong chỉ mục pháp quy nội bộ được liệt kê dưới đây.",
        "",
        "### Căn cứ trong tài liệu",
    ]
    for index, reference in enumerate(references[:3], start=1):
        lines.extend(
            [
                f"- [{index}] **{reference['document_title']}** - {reference['section_title']}: {reference['content'][0]}",
            ]
        )
    lines.extend(
        [
            "",
            "### Việc cần làm",
            "- Đối chiếu nguyên văn văn bản được trích dẫn trước khi áp dụng.",
            "- Nếu cần quyết định chính thức, ghi lại số văn bản và mục được dùng làm căn cứ.",
            "",
            "### Lưu ý",
            "- Đây là tổng hợp theo chỉ mục nội bộ, không thay thế ý kiến pháp chế.",
        ]
    )
    return "\n".join(lines).strip()


def _fallback_evidence_lines(references: list[dict[str, Any]]) -> list[str]:
    if not references:
        return ["- Chưa có nguồn phù hợp trong chỉ mục hiện tại."]
    return [
        f"- [{index}] **{reference.get('document_title') or 'Tài liệu'}** - {reference.get('section_title') or 'Không rõ mục'}"
        for index, reference in enumerate(references[:3], start=1)
    ]


def _ensure_answer_sections(answer: str, references: list[dict[str, Any]]) -> str:
    normalized = answer.strip()
    if not normalized:
        normalized = _answer("", references)

    has_section = {
        section: bool(re.search(rf"^{re.escape(section)}\s*$", normalized, flags=re.MULTILINE))
        for section in REQUIRED_ANSWER_SECTIONS
    }
    if all(has_section.values()):
        return normalized

    chunks = []
    if has_section["### Tóm tắt"]:
        chunks.append(normalized)
    else:
        chunks.append(f"### Tóm tắt\n{normalized}")

    if not has_section["### Căn cứ trong tài liệu"]:
        chunks.append("### Căn cứ trong tài liệu\n" + "\n".join(_fallback_evidence_lines(references)))

    if not has_section["### Việc cần làm"]:
        chunks.append(
            "### Việc cần làm\n"
            "- Đối chiếu nguyên văn các nguồn tham chiếu trước khi áp dụng.\n"
            "- Ghi lại số văn bản, mục hoặc hồ sơ liên quan trong biên bản xử lý.\n"
            "- Nếu câu hỏi cần quyết định chính thức, chuyển nội dung cho bộ phận phụ trách pháp chế hoặc quản lý chất lượng."
        )

    if not has_section["### Lưu ý"]:
        chunks.append(
            "### Lưu ý\n"
            "- Câu trả lời được tổng hợp từ chỉ mục nội bộ và không thay thế văn bản gốc.\n"
            "- Nếu nguồn chưa đủ rõ, cần bổ sung tài liệu hoặc hỏi cụ thể hơn."
        )

    return "\n\n".join(chunk.strip() for chunk in chunks if chunk.strip())


def _resolve_secret(value: str) -> str:
    stripped = value.strip()
    match = re.fullmatch(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}", stripped)
    if match:
        return os.getenv(match.group(1), "").strip()
    return stripped


def _llm_api_key() -> str:
    configured_key = _resolve_secret(os.getenv("LLM_BINDING_API_KEY", ""))
    if configured_key:
        return configured_key
    return (
        os.getenv("HF_TOKEN", "").strip()
        or os.getenv("OPENAI_API_KEY", "").strip()
        or os.getenv("OPENROUTER_API_KEY", "").strip()
    )


def _llm_binding() -> str:
    return os.getenv("LLM_BINDING", "openai").strip()


def _llm_host() -> str:
    return os.getenv("LLM_BINDING_HOST", "https://router.huggingface.co/v1").strip().rstrip("/")


def _llm_model() -> str:
    return os.getenv("LLM_MODEL", "openai/gpt-oss-20b:novita").strip()


def _llm_models() -> list[str]:
    models = [_llm_model()]
    models.extend(
        item.strip()
        for item in os.getenv("LLM_FALLBACK_MODELS", "").split(",")
        if item.strip()
    )
    return list(dict.fromkeys(model for model in models if model))


def _llm_is_configured() -> bool:
    binding = _llm_binding().lower()
    if binding in {"", "none", "null", "offline", "offline_legal_rag"}:
        return False
    return bool(_llm_host() and _llm_models() and _llm_api_key())


def _chat_completions_url() -> str:
    host = _llm_host()
    if host.endswith("/chat/completions"):
        return host
    return f"{host}/chat/completions"


def _reference_context(references: list[dict[str, Any]]) -> str:
    blocks = []
    used = 0
    for index, reference in enumerate(references[:5], start=1):
        excerpt = "\n".join(reference.get("content", []))[:1200]
        block = (
            f"[{index}] {reference.get('document_title') or 'Tài liệu'}"
            f" - {reference.get('section_title') or 'Không rõ mục'}\n"
            f"File: {reference.get('file_path') or 'Không rõ file'}\n"
            f"Nội dung: {excerpt}"
        )
        if used + len(block) > LLM_CONTEXT_CHAR_LIMIT:
            break
        used += len(block)
        blocks.append(block)
    return "\n\n".join(blocks)


def _llm_prompt(query: str, references: list[dict[str, Any]]) -> list[dict[str, str]]:
    context = _reference_context(references)
    return [
        {
            "role": "system",
            "content": (
                "Bạn là trợ lý AI cho hệ thống quản lý trang thiết bị y tế. "
                "Chỉ dùng các đoạn nguồn được cung cấp để trả lời. "
                "Nếu nguồn chưa đủ, nói rõ là chưa đủ dữ liệu trong chỉ mục. "
                "Trả lời bằng tiếng Việt, dạng markdown rõ ràng, ưu tiên câu ngắn và hành động cụ thể. "
                "Bố cục bắt buộc gồm các tiêu đề markdown đúng thứ tự: "
                "### Tóm tắt, ### Căn cứ trong tài liệu, ### Việc cần làm, ### Lưu ý. "
                "Dùng bullet cho từng ý, in đậm thuật ngữ/văn bản quan trọng, và nêu mã nguồn tham chiếu dạng [1], [2] khi phù hợp. "
                "Không bịa điều khoản, số văn bản hoặc kết luận pháp lý ngoài nguồn."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Câu hỏi: {query}\n\n"
                f"Nguồn truy xuất từ chỉ mục nội bộ:\n{context or 'Không có nguồn phù hợp.'}\n\n"
                "Hãy tổng hợp câu trả lời như một khuyến nghị vận hành cho người quản lý thiết bị. "
                "Không mở đầu bằng 'Câu trả lời'. Không dùng bảng nếu không thật cần thiết."
            ),
        },
    ]


def _call_chat_completions(query: str, references: list[dict[str, Any]]) -> str:
    messages = _llm_prompt(query, references)
    errors = []

    with httpx.Client(timeout=LLM_TIMEOUT_SECONDS) as client:
        for model in _llm_models():
            payload = {
                "model": model,
                "messages": messages,
                "temperature": 0.2,
                "max_tokens": LLM_MAX_TOKENS,
            }
            try:
                response = client.post(
                    _chat_completions_url(),
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {_llm_api_key()}",
                        "Content-Type": "application/json",
                        "User-Agent": "LightRAG-Legal-RAG/1.0",
                    },
                )
                response.raise_for_status()
                data = response.json()
            except httpx.HTTPStatusError as error:
                detail = error.response.text[:280]
                errors.append(f"{model}: HTTP {error.response.status_code}: {detail}")
                continue
            except (httpx.HTTPError, json.JSONDecodeError) as error:
                errors.append(f"{model}: {error}")
                continue

            choices = data.get("choices") or []
            if not choices:
                errors.append(f"{model}: returned no choices")
                continue

            first = choices[0]
            message = first.get("message") or {}
            content = message.get("content") or first.get("text") or ""
            if isinstance(content, list):
                content = "\n".join(
                    item.get("text", "") if isinstance(item, dict) else str(item)
                    for item in content
                )
            answer = str(content).strip()
            if answer:
                return answer
            errors.append(f"{model}: returned an empty answer")

    raise RuntimeError("LLM provider failed for all models: " + " | ".join(errors))


async def _generate_answer(query: str, references: list[dict[str, Any]]) -> dict[str, str]:
    if _llm_is_configured() and references:
        try:
            return {
                "response": _ensure_answer_sections(
                    await asyncio.to_thread(_call_chat_completions, query, references),
                    references,
                ),
                "answer_source": "llm",
                "llm_error": "",
            }
        except RuntimeError as error:
            return {
                "response": _ensure_answer_sections(_answer(query, references), references),
                "answer_source": "retrieval_fallback",
                "llm_error": str(error),
            }

    return {
        "response": _ensure_answer_sections(_answer(query, references), references),
        "answer_source": "retrieval_fallback",
        "llm_error": "" if references else "No matching indexed context",
    }


app = FastAPI(title="Equipment Legal RAG API", version="legal-rag-llm")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return HTMLResponse(
        """
        <!doctype html>
        <html lang="vi">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>TBDeviceCare-AI</title>
            <style>
              :root {
                --bg: #eef4f7;
                --surface: #ffffff;
                --surface-soft: #f7fafc;
                --ink: #0d1b2a;
                --muted: #617386;
                --line: #d8e3eb;
                --accent: #0f8b7b;
                --accent-strong: #0b665c;
                --accent-soft: #e5f5f1;
                --amber: #d98721;
                --danger: #b42318;
                --shadow: 0 18px 50px rgba(13, 27, 42, 0.12);
              }

              * { box-sizing: border-box; }

              body {
                margin: 0;
                min-height: 100vh;
                color: var(--ink);
                background:
                  radial-gradient(circle at top left, rgba(15, 139, 123, 0.14), transparent 32rem),
                  linear-gradient(135deg, #f7fbfd 0%, var(--bg) 48%, #eaf0f4 100%);
                font-family: Aptos, "Segoe UI", sans-serif;
              }

              main {
                width: min(1160px, calc(100vw - 28px));
                margin: 0 auto;
                padding: 22px 0;
              }

              .shell {
                display: block;
              }

              .chat {
                background: rgba(255, 255, 255, 0.92);
                border: 1px solid var(--line);
                border-radius: 8px;
                box-shadow: var(--shadow);
                backdrop-filter: blur(12px);
              }

              .chat {
                min-height: calc(100vh - 44px);
                display: flex;
                flex-direction: column;
                overflow: hidden;
              }

              header {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto;
                gap: 16px;
                align-items: center;
                padding: 24px 26px 20px;
                border-bottom: 1px solid var(--line);
                background:
                  linear-gradient(180deg, rgba(247, 250, 252, 0.95), rgba(255, 255, 255, 0.9));
              }

              .eyebrow {
                margin: 0 0 8px;
                color: var(--accent-strong);
                font-size: 0.78rem;
                font-weight: 800;
                letter-spacing: 0.12em;
                text-transform: uppercase;
              }

              h1 {
                margin: 0;
                font-family: "Aptos Display", Aptos, "Segoe UI", sans-serif;
                font-size: clamp(2rem, 4vw, 3.8rem);
                line-height: 0.96;
                letter-spacing: 0;
              }

              .subhead {
                max-width: 60ch;
                margin: 10px 0 0;
                color: var(--muted);
                line-height: 1.55;
              }

              .header-actions {
                display: flex;
                flex-wrap: wrap;
                justify-content: flex-end;
                gap: 8px;
              }

              .ghost-button {
                min-width: 0;
                min-height: 40px;
                padding: 0 12px;
                border: 1px solid var(--line);
                color: var(--ink);
                background: var(--surface);
                box-shadow: none;
                font-size: 0.92rem;
              }

              .status {
                color: var(--accent-strong);
                font-weight: 700;
              }

              .status-panel {
                display: grid;
                gap: 8px;
                padding: 12px 26px;
                border-bottom: 1px solid var(--line);
                background: var(--accent-soft);
              }

              .status-panel.collapsed .status-details {
                display: none;
              }

              .status-line {
                display: flex;
                align-items: center;
                gap: 8px;
                min-width: 0;
              }

              .status-dot {
                width: 9px;
                height: 9px;
                border-radius: 999px;
                background: var(--accent);
                box-shadow: 0 0 0 5px rgba(15, 139, 123, 0.12);
                flex: 0 0 auto;
              }

              .status-details {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                color: var(--muted);
                font-size: 0.9rem;
              }

              .status-details span {
                border: 1px solid rgba(15, 139, 123, 0.18);
                border-radius: 999px;
                padding: 4px 9px;
                background: rgba(255, 255, 255, 0.62);
              }

              .messages {
                flex: 1;
                display: grid;
                gap: 16px;
                align-content: start;
                padding: 24px 26px;
                background:
                  linear-gradient(180deg, rgba(255, 255, 255, 0.35), rgba(247, 250, 252, 0.6));
              }

              .message {
                max-width: min(82ch, 100%);
                padding: 16px 18px;
                border: 1px solid var(--line);
                border-radius: 8px;
                background: var(--surface);
                line-height: 1.55;
                box-shadow: 0 10px 26px rgba(13, 27, 42, 0.06);
              }

              .message.user {
                justify-self: end;
                max-width: min(62ch, 88%);
                background: var(--ink);
                border-color: var(--ink);
                color: #ffffff;
              }

              .message.assistant {
                width: min(82ch, 100%);
              }

              .message.loading {
                color: var(--muted);
              }

              .message.error {
                border-color: #f0b08f;
                color: var(--danger);
                background: #fff2ec;
              }

              .answer h3 {
                display: flex;
                align-items: center;
                gap: 10px;
                margin: 18px 0 8px;
                color: var(--ink);
                font-size: 1rem;
              }

              .answer h3:first-child { margin-top: 0; }

              .answer h3::before {
                content: "";
                width: 8px;
                height: 24px;
                border-radius: 4px;
                background: linear-gradient(180deg, var(--accent), var(--amber));
                flex: 0 0 auto;
              }

              .answer p {
                margin: 8px 0;
                color: #1f2d3a;
              }

              .answer ul,
              .answer ol {
                margin: 8px 0 0;
                padding-left: 1.25rem;
                display: grid;
                gap: 8px;
              }

              .answer li::marker {
                color: var(--accent);
                font-weight: 800;
              }

              .answer strong {
                color: #082f2b;
              }

              .ref-chip {
                display: inline-flex;
                align-items: center;
                min-height: 1.45em;
                margin: 0 2px;
                padding: 0 6px;
                border-radius: 6px;
                background: var(--accent-soft);
                color: var(--accent-strong);
                font-size: 0.88em;
                font-weight: 800;
              }

              .answer code {
                padding: 2px 5px;
                border-radius: 5px;
                background: #eef3f7;
                color: #0d1b2a;
              }

              form {
                display: grid;
                gap: 12px;
                padding: 18px 26px 24px;
                border-top: 1px solid var(--line);
                background: var(--surface);
              }

              label {
                font-size: 0.92rem;
                color: var(--muted);
                font-weight: 700;
              }

              .composer {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto;
                gap: 10px;
                align-items: end;
              }

              textarea {
                min-height: 104px;
                resize: vertical;
                width: 100%;
                border: 1px solid var(--line);
                border-radius: 8px;
                padding: 14px;
                color: var(--ink);
                background: var(--surface-soft);
                font: inherit;
                line-height: 1.45;
              }

              textarea:focus,
              button:focus-visible {
                outline: 3px solid rgba(29, 111, 99, 0.28);
                outline-offset: 2px;
              }

              button {
                min-width: 132px;
                min-height: 54px;
                border: 0;
                border-radius: 8px;
                color: #ffffff;
                background: linear-gradient(135deg, var(--accent), var(--accent-strong));
                font: inherit;
                font-weight: 700;
                cursor: pointer;
                box-shadow: 0 12px 28px rgba(15, 139, 123, 0.24);
              }

              button:hover:not(:disabled) {
                transform: translateY(-1px);
              }

              button:disabled {
                cursor: wait;
                opacity: 0.66;
              }

              .sources {
                display: grid;
                gap: 10px;
                margin: 0;
                padding: 0;
                list-style: none;
              }

              .source {
                border: 1px solid var(--line);
                border-radius: 8px;
                padding: 12px;
                color: var(--muted);
                line-height: 1.45;
                overflow-wrap: anywhere;
                background: var(--surface-soft);
              }

              .source strong {
                display: block;
                color: var(--ink);
                font-size: 0.96rem;
              }

              .source-index {
                display: inline-flex;
                margin-bottom: 8px;
                padding: 2px 7px;
                border-radius: 6px;
                background: #fff3df;
                color: #92560f;
                font-size: 0.78rem;
                font-weight: 800;
              }

              .drawer-backdrop {
                position: fixed;
                inset: 0;
                z-index: 20;
                background: rgba(13, 27, 42, 0.32);
              }

              .library-drawer {
                position: fixed;
                inset: 0 0 0 auto;
                z-index: 21;
                width: min(440px, 100vw);
                padding: 18px;
                overflow: auto;
                background: var(--surface);
                border-left: 1px solid var(--line);
                box-shadow: -20px 0 50px rgba(13, 27, 42, 0.2);
                transform: translateX(100%);
                transition: transform 180ms ease;
              }

              .library-drawer.open {
                transform: translateX(0);
              }

              .drawer-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 12px;
                padding-bottom: 14px;
                border-bottom: 1px solid var(--line);
              }

              .drawer-header h2,
              .drawer-section h3 {
                margin: 0;
                font-size: 1rem;
              }

              .drawer-section {
                display: grid;
                gap: 10px;
                margin-top: 16px;
              }

              .document-list {
                display: grid;
                gap: 10px;
                margin: 0;
                padding: 0;
                list-style: none;
              }

              .document-item {
                border: 1px solid var(--line);
                border-radius: 8px;
                padding: 12px;
                background: var(--surface-soft);
                color: var(--muted);
                line-height: 1.45;
              }

              .document-item strong {
                display: block;
                color: var(--ink);
                overflow-wrap: anywhere;
              }

              @media (max-width: 820px) {
                main { width: min(100vw - 20px, 720px); padding: 10px 0; }
                .chat { min-height: calc(100vh - 20px); }
                header { grid-template-columns: 1fr; padding: 18px; }
                .header-actions { justify-content: stretch; }
                .header-actions button { flex: 1 1 auto; }
                .status-panel { padding: 10px 18px; }
                .messages { padding: 18px; }
                form { padding: 16px 18px 18px; }
                .composer { grid-template-columns: 1fr; }
                button { width: 100%; }
                .library-drawer { width: 100vw; }
              }

              /* Clean embedded Space UI */
              :root {
                --bg: #f4faff;
                --surface: #ffffff;
                --ink: #061427;
                --muted: #607086;
                --line: #e6edf5;
                --blue: #315bdc;
                --cyan: #00b8b8;
                --ready: #00b879;
                --shadow: 0 20px 60px rgba(15, 35, 75, 0.08);
              }

              body {
                min-height: 100vh;
                background: linear-gradient(180deg, #fbfdff 0%, #f2f9fd 58%, #ffffff 100%);
                color: var(--ink);
                font-family: "Segoe UI", Aptos, sans-serif;
              }

              main {
                width: 100%;
                margin: 0;
                padding: 0;
              }

              .chat {
                min-height: 100vh;
                border: 0;
                border-radius: 0;
                box-shadow: none;
                background: transparent;
              }

              header {
                position: relative;
                min-height: 90px;
                grid-template-columns: auto 1fr auto;
                padding: 14px 20px;
                border-bottom: 1px solid var(--line);
                background: rgba(255, 255, 255, 0.78);
                backdrop-filter: blur(16px);
              }

              header::before {
                content: "";
                position: absolute;
                top: 10px;
                left: 50%;
                width: 96px;
                height: 2px;
                transform: translateX(-50%);
                background: #23344e;
              }

              .top-close {
                width: 48px;
                min-width: 48px;
                height: 48px;
                min-height: 48px;
                padding: 0;
                border: 1px solid var(--line);
                border-radius: 10px;
                background: rgba(255, 255, 255, 0.9);
                color: #29445f;
                box-shadow: none;
                font-size: 1.65rem;
                line-height: 1;
              }

              .brand-row {
                display: flex;
                align-items: center;
                gap: 12px;
                min-width: 0;
                font-size: 1.1rem;
                font-weight: 800;
              }

              .ready-pill {
                display: inline-flex;
                align-items: center;
                gap: 7px;
                min-height: 30px;
                padding: 5px 13px;
                border: 1px solid rgba(16, 185, 129, 0.24);
                border-radius: 999px;
                background: #dffbf2;
                color: var(--ready);
                font-size: 0.72rem;
                font-weight: 900;
              }

              .ready-pill::before {
                content: "";
                width: 9px;
                height: 9px;
                border-radius: 999px;
                background: currentColor;
              }

              .header-actions {
                gap: 12px;
              }

              .ghost-button {
                width: 44px;
                min-width: 44px;
                height: 44px;
                min-height: 44px;
                padding: 0;
                border: 0;
                border-radius: 999px;
                background: rgba(255, 255, 255, 0.72);
                color: #29445f;
                box-shadow: none;
                overflow: hidden;
                white-space: nowrap;
                font-size: 0;
                text-indent: 0;
              }

              .ghost-button::before {
                display: block;
                text-indent: 0;
                font-size: 1.15rem;
                line-height: 44px;
                text-align: center;
              }

              #open-library::before { content: "▣"; }
              #toggle-status::before { content: "↓"; }

              .status-panel {
                display: none !important;
              }

              .messages {
                flex: 1;
                display: flex;
                flex-direction: column;
                justify-content: center;
                gap: 18px;
                padding: 56px min(7vw, 96px) 24px;
                background: transparent;
                overflow-y: auto;
              }

              .welcome {
                width: min(620px, 100%);
                margin: auto;
                text-align: center;
                background: transparent;
                border: 0;
                box-shadow: none;
                padding: 0;
              }

              .welcome-icon {
                width: 80px;
                height: 80px;
                margin: 0 auto 34px;
                border-radius: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: linear-gradient(135deg, #4854df 0%, #1688d4 48%, #00b8b8 100%);
                color: #fff;
                box-shadow: 0 22px 52px rgba(35, 86, 160, 0.22);
                font-size: 2rem;
              }

              .welcome h1 {
                margin: 0;
                font-size: clamp(2rem, 4vw, 2.45rem);
                line-height: 1.15;
                font-weight: 850;
                background: linear-gradient(90deg, #4854df 0%, #1c74d8 52%, #00b8b8 100%);
                -webkit-background-clip: text;
                background-clip: text;
                color: transparent;
              }

              .welcome p {
                width: min(560px, 100%);
                margin: 18px auto 0;
                color: var(--muted);
                font-size: 1rem;
                line-height: 1.65;
              }

              .message {
                max-width: min(860px, 100%);
                width: min(900px, 100%);
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                border: 1px solid var(--line);
                border-radius: 14px;
                background: rgba(255, 255, 255, 0.92);
                box-shadow: 0 10px 32px rgba(15, 35, 75, 0.05);
              }

              .message.user {
                align-self: flex-end;
                align-items: flex-end;
                width: min(680px, 92%);
                background: var(--blue);
                border-color: var(--blue);
                color: #fff;
              }

              .message.assistant {
                align-self: flex-start;
              }

              .message-meta {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 8px;
                color: #8d9db2;
                font-size: 0.72rem;
                font-weight: 800;
              }

              .message.user .message-meta {
                justify-content: flex-end;
                color: rgba(255, 255, 255, 0.78);
              }

              .message-role {
                display: inline-flex;
                align-items: center;
                min-height: 22px;
                padding: 3px 8px;
                border-radius: 999px;
                border: 1px solid var(--line);
                background: rgba(255, 255, 255, 0.86);
                color: var(--blue);
              }

              .message.user .message-role {
                border-color: rgba(255, 255, 255, 0.22);
                background: rgba(255, 255, 255, 0.12);
                color: #fff;
              }

              .message-body {
                width: 100%;
              }

              form {
                padding: 18px 0 24px;
                border-top: 0;
                background: linear-gradient(180deg, rgba(255, 255, 255, 0), #fff 26%);
              }

              form label {
                position: absolute;
                width: 1px;
                height: 1px;
                overflow: hidden;
                clip: rect(0 0 0 0);
              }

              .composer {
                width: min(92%, 1374px);
                min-height: 80px;
                margin: 0 auto;
                display: grid;
                grid-template-columns: minmax(0, 1fr) 56px;
                align-items: center;
                gap: 14px;
                padding: 12px 12px 12px 24px;
                border: 1px solid rgba(226, 234, 243, 0.95);
                border-radius: 19px;
                background: rgba(255, 255, 255, 0.96);
                box-shadow: var(--shadow);
              }

              textarea {
                min-height: 34px;
                max-height: 120px;
                resize: none;
                padding: 6px 0;
                border: 0;
                border-radius: 0;
                background: transparent;
                font-size: 1rem;
              }

              #submit {
                width: 56px;
                min-width: 56px;
                height: 56px;
                min-height: 56px;
                padding: 0;
                border-radius: 14px;
                background: #f4f8fc;
                color: #8d9db2;
                box-shadow: none;
                overflow: hidden;
                white-space: nowrap;
                font-size: 0;
                text-indent: 0;
              }

              #submit::before {
                content: "➤";
                display: block;
                text-indent: 0;
                line-height: 56px;
                text-align: center;
                font-size: 1.25rem;
              }

              #submit:not(:disabled) {
                background: linear-gradient(135deg, var(--blue), var(--cyan));
                color: #fff;
              }

              .disclaimer {
                display: flex;
                justify-content: center;
                align-items: center;
                gap: 7px;
                margin-top: 16px;
                color: #a1adc0;
                font-size: 0.78rem;
                font-weight: 650;
              }

              @media (max-width: 820px) {
                header {
                  min-height: 72px;
                  grid-template-columns: auto minmax(0, 1fr) auto;
                  padding: 10px 12px;
                }
                .brand-row { gap: 8px; font-size: 0.92rem; }
                .ready-pill { padding: 4px 9px; font-size: 0.66rem; }
                .top-close { width: 42px; min-width: 42px; height: 42px; min-height: 42px; }
                .ghost-button { width: 38px; min-width: 38px; height: 38px; min-height: 38px; }
                .messages { padding: 32px 18px 18px; }
                .welcome-icon { width: 68px; height: 68px; margin-bottom: 24px; }
                .composer {
                  width: calc(100% - 28px);
                  min-height: 68px;
                  grid-template-columns: minmax(0, 1fr) 48px;
                  padding: 10px 10px 10px 16px;
                }
                #submit { width: 48px; min-width: 48px; height: 48px; min-height: 48px; }
                #submit::before { line-height: 48px; }
              }
            </style>
          </head>
          <body>
            <main>
              <div class="shell">
                <section class="chat" aria-labelledby="app-title">
                  <header>
                    <button class="top-close" id="clear-chat" type="button" aria-label="Xóa hội thoại">×</button>
                    <div class="brand-row">
                      <span id="app-title">TBDeviceCare-AI</span>
                      <span class="ready-pill" id="ready-pill">READY</span>
                    </div>
                    <div class="header-actions">
                      <button class="ghost-button" id="open-library" type="button" aria-label="Mở tài liệu đã nạp" aria-controls="library-drawer" aria-expanded="false">
                        Tài liệu đã nạp <span id="doc-count">-</span>
                      </button>
                      <button class="ghost-button" id="toggle-status" type="button" aria-label="Tải hội thoại" aria-controls="status-panel" aria-expanded="false">
                        Tải hội thoại
                      </button>
                    </div>
                  </header>

                  <div class="status-panel collapsed" id="status-panel">
                    <div class="status-line">
                      <span class="status-dot" aria-hidden="true"></span>
                      <span class="status" id="status" role="status">Đang tải dữ liệu...</span>
                    </div>
                    <div class="status-details">
                      <span id="model-status">LLM: đang kiểm tra</span>
                      <span id="source-count">0 nguồn trong câu trả lời</span>
                    </div>
                  </div>

                  <div class="messages" id="messages" aria-live="polite">
                    <div class="welcome" id="welcome">
                      <div class="welcome-icon" aria-hidden="true">▦</div>
                      <h1>TBDeviceCare-AI Pro</h1>
                      <p>Trợ lý tra cứu pháp quy trang thiết bị y tế.</p>
                    </div>
                  </div>

                  <form id="question-form">
                    <label for="question">Câu hỏi</label>
                    <div class="composer">
                      <textarea id="question" name="question" required placeholder="Nhập câu hỏi về nghị định, thông tư, hồ sơ quản lý..."></textarea>
                      <button id="submit" type="submit" aria-label="Gửi câu hỏi">Gửi câu hỏi</button>
                    </div>
                    <div class="disclaimer">AI có thể mắc lỗi. Luôn đối chiếu văn bản pháp quy chính thức.</div>
                  </form>
                </section>
              </div>
            </main>

            <div class="drawer-backdrop" id="drawer-backdrop" hidden></div>
            <aside class="library-drawer" id="library-drawer" aria-labelledby="library-title" aria-hidden="true">
              <div class="drawer-header">
                <h2 id="library-title">Tài liệu đã nạp</h2>
                <button class="ghost-button" id="close-library" type="button">Đóng</button>
              </div>

              <section class="drawer-section">
                <h3>Chỉ mục nội bộ</h3>
                <ul class="document-list" id="documents-list">
                  <li class="document-item">Đang tải danh sách tài liệu...</li>
                </ul>
              </section>

              <section class="drawer-section">
                <h3 id="sources-title">Nguồn câu trả lời gần nhất</h3>
                <ul class="sources" id="sources">
                  <li class="source">Nguồn sẽ xuất hiện sau khi AI trả lời.</li>
                </ul>
              </section>
            </aside>

            <script>
              const form = document.querySelector('#question-form');
              const input = document.querySelector('#question');
              const button = document.querySelector('#submit');
              const messages = document.querySelector('#messages');
              const sources = document.querySelector('#sources');
              const status = document.querySelector('#status');
              const docCount = document.querySelector('#doc-count');
              const sourceCount = document.querySelector('#source-count');
              const modelStatus = document.querySelector('#model-status');
              const statusPanel = document.querySelector('#status-panel');
              const toggleStatus = document.querySelector('#toggle-status');
              const openLibrary = document.querySelector('#open-library');
              const closeLibrary = document.querySelector('#close-library');
              const drawer = document.querySelector('#library-drawer');
              const drawerBackdrop = document.querySelector('#drawer-backdrop');
              const documentsList = document.querySelector('#documents-list');
              const clearChat = document.querySelector('#clear-chat');
              const welcome = document.querySelector('#welcome');

              function escapeHtml(value) {
                return String(value).replace(/[&<>"']/g, (char) => ({
                  '&': '&amp;',
                  '<': '&lt;',
                  '>': '&gt;',
                  '"': '&quot;',
                  "'": '&#039;',
                }[char]));
              }

              function formatInline(value) {
                return escapeHtml(value)
                  .replace(/`([^`]+)`/g, '<code>$1</code>')
                  .replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>')
                  .replace(/\\[(\\d+)\\]/g, '<span class="ref-chip">[$1]</span>');
              }

              function renderMarkdown(text) {
                const lines = String(text || '').split(/\\r?\\n/);
                let html = '';
                let list = '';

                const closeList = () => {
                  if (!list) return;
                  html += `</${list}>`;
                  list = '';
                };

                lines.forEach((rawLine) => {
                  const line = rawLine.trim();
                  if (!line) {
                    closeList();
                    return;
                  }

                  const heading = line.match(/^#{2,3}\\s+(.+)$/);
                  if (heading) {
                    closeList();
                    html += `<h3>${formatInline(heading[1])}</h3>`;
                    return;
                  }

                  const bullet = line.match(/^[-*]\\s+(.+)$/);
                  if (bullet) {
                    if (list !== 'ul') {
                      closeList();
                      html += '<ul>';
                      list = 'ul';
                    }
                    html += `<li>${formatInline(bullet[1])}</li>`;
                    return;
                  }

                  const numbered = line.match(/^\\d+\\.\\s+(.+)$/);
                  if (numbered) {
                    if (list !== 'ol') {
                      closeList();
                      html += '<ol>';
                      list = 'ol';
                    }
                    html += `<li>${formatInline(numbered[1])}</li>`;
                    return;
                  }

                  closeList();
                  html += `<p>${formatInline(line)}</p>`;
                });

                closeList();
                return html || '<p>Không có nội dung trả lời.</p>';
              }

              function addMessage(text, className = '', options = {}) {
                const item = document.createElement('div');
                item.className = `message ${className}`.trim();
                const meta = document.createElement('div');
                meta.className = 'message-meta';
                const role = document.createElement('span');
                role.className = 'message-role';
                role.textContent = className.includes('user') ? 'Bạn hỏi' : 'AI trả lời';
                const time = document.createElement('span');
                time.textContent = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                meta.append(role, time);
                const body = document.createElement('div');
                body.className = 'message-body';
                if (options.markdown) {
                  body.innerHTML = renderMarkdown(text);
                } else {
                  body.textContent = text;
                }
                item.append(meta, body);
                messages.appendChild(item);
                item.scrollIntoView({ block: 'end', behavior: 'smooth' });
                return item;
              }

              function renderSources(items) {
                sources.replaceChildren();
                if (!items || items.length === 0) {
                  const empty = document.createElement('li');
                  empty.className = 'source';
                  empty.textContent = 'Chưa có nguồn tham chiếu.';
                  sources.appendChild(empty);
                  sourceCount.textContent = '0 nguồn trong câu trả lời';
                  return;
                }

                items.slice(0, 6).forEach((reference) => {
                  const item = document.createElement('li');
                  item.className = 'source';
                  const index = document.createElement('span');
                  index.className = 'source-index';
                  index.textContent = `[${items.indexOf(reference) + 1}]`;
                  const title = document.createElement('strong');
                  title.textContent = reference.document_title || reference.file_path || reference.source || 'Tài liệu';
                  const detail = document.createElement('span');
                  detail.textContent = [reference.section_title, reference.file_path || reference.source]
                    .filter(Boolean)
                    .join(' - ');
                  item.append(index, title, detail);
                  sources.appendChild(item);
                });
                sourceCount.textContent = `${Math.min(items.length, 6)} nguồn trong câu trả lời`;
              }

              function renderDocuments(items) {
                documentsList.replaceChildren();
                if (!items || items.length === 0) {
                  const empty = document.createElement('li');
                  empty.className = 'document-item';
                  empty.textContent = 'Chưa có tài liệu trong chỉ mục.';
                  documentsList.appendChild(empty);
                  return;
                }

                items.forEach((entry) => {
                  const item = document.createElement('li');
                  item.className = 'document-item';
                  const title = document.createElement('strong');
                  title.textContent = entry.file_path || entry.id || 'Tài liệu';
                  const summary = document.createElement('span');
                  summary.textContent = entry.content_summary || `${entry.content_length || 0} ký tự`;
                  item.append(title, summary);
                  documentsList.appendChild(item);
                });
              }

              function setDrawer(open) {
                drawer.classList.toggle('open', open);
                drawer.setAttribute('aria-hidden', String(!open));
                openLibrary.setAttribute('aria-expanded', String(open));
                drawerBackdrop.hidden = !open;
                if (open) closeLibrary.focus();
              }

              function setStatusExpanded(expanded) {
                statusPanel.classList.toggle('collapsed', !expanded);
                toggleStatus.setAttribute('aria-expanded', String(expanded));
                toggleStatus.textContent = expanded ? 'Thu gọn trạng thái' : 'Mở trạng thái';
              }

              async function loadStatus() {
                try {
                  const [countsResponse, healthResponse, documentsResponse] = await Promise.all([
                    fetch('/documents/status_counts'),
                    fetch('/health'),
                    fetch('/documents'),
                  ]);
                  const data = await countsResponse.json();
                  const health = await healthResponse.json();
                  const documents = await documentsResponse.json();
                  const count = data?.status_counts?.processed ?? 0;
                  status.textContent = `${count} tài liệu đã lập chỉ mục`;
                  docCount.textContent = String(count);
                  modelStatus.textContent = `LLM: ${health?.configuration?.llm_model || 'đang hoạt động'}`;
                  renderDocuments(documents?.statuses?.processed || []);
                } catch {
                  status.textContent = 'Chưa đọc được trạng thái dữ liệu';
                  docCount.textContent = '-';
                  modelStatus.textContent = 'LLM: chưa đọc được trạng thái';
                }
              }

              toggleStatus.addEventListener('click', () => {
                const transcript = Array.from(messages.querySelectorAll('.message'))
                  .map((item) => item.textContent.trim())
                  .filter(Boolean)
                  .join('\\n\\n---\\n\\n');
                if (!transcript) return;
                const blob = new Blob([transcript], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `tbdevicecare-ai-${new Date().toISOString().slice(0, 10)}.txt`;
                link.click();
                URL.revokeObjectURL(url);
              });
              clearChat.addEventListener('click', () => {
                messages.replaceChildren(welcome);
                renderSources([]);
                status.textContent = 'Sẵn sàng';
              });
              openLibrary.addEventListener('click', () => setDrawer(true));
              closeLibrary.addEventListener('click', () => setDrawer(false));
              drawerBackdrop.addEventListener('click', () => setDrawer(false));
              document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') setDrawer(false);
              });

              form.addEventListener('submit', async (event) => {
                event.preventDefault();
                const query = input.value.trim();
                if (!query) return;

                welcome.remove();
                addMessage(query, 'user');
                input.value = '';
                button.disabled = true;
                button.setAttribute('aria-label', 'Đang hỏi');
                status.textContent = 'AI đang tổng hợp câu trả lời...';
                const pending = addMessage('AI đang tra cứu...', 'assistant loading');

                try {
                  const response = await fetch('/query', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query, mode: 'hybrid', stream: false }),
                  });

                  if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                  }

                  const data = await response.json();
                  pending.className = 'message assistant answer';
                  pending.querySelector('.message-body').innerHTML = renderMarkdown(data.response || 'Không có nội dung trả lời.');
                  if (data.answer_source === 'llm') {
                    status.textContent = 'LLM đã tổng hợp từ chỉ mục nội bộ';
                  } else if (data.answer_source === 'retrieval_fallback') {
                    status.textContent = 'Đang dùng fallback truy xuất nội bộ';
                    if (data.llm_error) console.warn(data.llm_error);
                  }
                  renderSources(data.references);
                } catch (error) {
                  pending.className = 'message error';
                  pending.querySelector('.message-body').textContent = `Không gọi được AI: ${error.message}`;
                  renderSources([]);
                } finally {
                  button.disabled = false;
                  button.setAttribute('aria-label', 'Gửi câu hỏi');
                  input.focus();
                }
              });

              loadStatus();
            </script>
          </body>
        </html>
        """
    )


@app.get("/health")
async def health():
    llm_configured = _llm_is_configured()
    return {
        "status": "healthy",
        "webui_available": True,
        "working_directory": str(INDEX_PATH.parent),
        "input_directory": str(INDEX_PATH.parent),
        "configuration": {
            "llm_binding": _llm_binding() if llm_configured else "offline_legal_rag",
            "llm_binding_host": _llm_host() if llm_configured else "",
            "llm_model": _llm_model() if llm_configured else "deterministic-retrieval",
            "llm_fallback_models": _llm_models()[1:] if llm_configured else [],
            "llm_configured": llm_configured,
            "answer_fallback": "retrieval_fallback",
            "embedding_binding": "bm25",
            "embedding_binding_host": "",
            "embedding_model": "legal-knowledge.json",
            "kv_storage": "JsonKVStorage",
            "doc_status_storage": "StaticJsonIndex",
            "graph_storage": "StaticJsonIndex",
            "vector_storage": "BM25",
            "workspace": "",
        },
        "auth_mode": "disabled",
        "pipeline_busy": False,
        "core_version": "legal-rag-llm",
        "api_version": "legal-rag-llm",
        "webui_title": "TBDeviceCare-AI",
        "webui_description": "Legal RAG with LLM synthesis and retrieval fallback",
    }


@app.get("/documents/status_counts")
async def status_counts():
    count = len(INDEX.documents)
    return {
        "status_counts": {
            "pending": 0,
            "processing": 0,
            "preprocessed": 0,
            "processed": count,
            "failed": 0,
            "all": count,
        }
    }


@app.get("/documents")
async def documents():
    processed = [
        {
            "id": document.get("id"),
            "content_summary": document.get("description"),
            "content_length": document.get("charLength"),
            "status": "processed",
            "file_path": document.get("fileName"),
        }
        for document in INDEX.documents
    ]
    return {"statuses": {"processed": processed}}


@app.get("/documents/pipeline_status")
async def pipeline_status():
    return {
        "autoscanned": False,
        "busy": False,
        "job_name": "-",
        "docs": 0,
        "batchs": 0,
        "cur_batch": 0,
        "request_pending": False,
        "latest_message": "",
        "history_messages": [],
    }


@app.post("/query")
async def query(request: dict[str, Any]):
    query_text = str(request.get("query", "")).strip()
    if len(query_text) < 3:
        raise HTTPException(status_code=422, detail="query must contain at least 3 characters")

    references = _rank(query_text)
    include_chunk_content = bool(request.get("include_chunk_content", False))
    response_references = references if include_chunk_content else [
        {key: value for key, value in reference.items() if key != "content"}
        for reference in references
    ]
    answer = await _generate_answer(query_text, references)
    return {
        **answer,
        "references": response_references,
    }


@app.post("/query/stream")
async def query_stream(request: dict[str, Any]):
    result = await query(request)

    async def generate():
        yield json.dumps(result, ensure_ascii=False) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


@app.post("/documents/upload")
async def upload_document(request: Request):
    raise HTTPException(
        status_code=501,
        detail="Read-only legal RAG is already indexed; upload is disabled.",
    )


def main():
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "9621"))
    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    main()

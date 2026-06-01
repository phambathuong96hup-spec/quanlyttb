import os
from numbers import Real

import pipmaster as pm

if not pm.is_installed("aiohttp"):
    pm.install("aiohttp")
if not pm.is_installed("numpy"):
    pm.install("numpy")
if not pm.is_installed("tenacity"):
    pm.install("tenacity")

import aiohttp
import numpy as np
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from lightrag.utils import logger, wrap_embedding_func_with_attrs


def _embedding_endpoint(base_url: str | None, model: str) -> str:
    base = (base_url or "https://router.huggingface.co/hf-inference/models").rstrip("/")
    if base.endswith("/pipeline/feature-extraction"):
        return base
    return f"{base}/{model}/pipeline/feature-extraction"


def _is_number_list(value) -> bool:
    return isinstance(value, list) and all(isinstance(item, Real) for item in value)


def _normalize_embeddings(payload) -> np.ndarray:
    if _is_number_list(payload):
        vectors = [payload]
    elif isinstance(payload, list) and payload and all(_is_number_list(item) for item in payload):
        vectors = payload
    elif isinstance(payload, list) and payload and all(isinstance(item, list) for item in payload):
        vectors = [np.asarray(item, dtype=np.float32).mean(axis=0).tolist() for item in payload]
    else:
        raise ValueError("Unexpected HuggingFace feature-extraction response shape")

    return np.asarray(vectors, dtype=np.float32)


async def _fetch_embeddings(url: str, headers: dict[str, str], data: dict) -> np.ndarray:
    async with aiohttp.ClientSession() as session:
        async with session.post(url, headers=headers, json=data) as response:
            if response.status != 200:
                error_text = await response.text()
                logger.error(
                    f"HuggingFace feature-extraction error {response.status}: {error_text}"
                )
                raise aiohttp.ClientResponseError(
                    request_info=response.request_info,
                    history=response.history,
                    status=response.status,
                    message=error_text,
                )
            return _normalize_embeddings(await response.json())


@wrap_embedding_func_with_attrs(
    embedding_dim=384,
    max_token_size=512,
    model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
)
@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=4, max=60),
    retry=retry_if_exception_type(aiohttp.ClientError)
    | retry_if_exception_type(aiohttp.ClientResponseError),
)
async def hf_inference_embed(
    texts: list[str],
    model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    base_url: str | None = None,
    api_key: str | None = None,
) -> np.ndarray:
    token = api_key or os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACEHUB_API_TOKEN")
    if not token:
        raise ValueError("HF_TOKEN environment variable is required")

    data = {"inputs": texts}
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    embeddings = await _fetch_embeddings(
        _embedding_endpoint(base_url, model),
        headers,
        data,
    )

    if embeddings.shape[0] != len(texts):
        raise ValueError(
            f"HuggingFace returned {embeddings.shape[0]} embeddings for {len(texts)} texts"
        )

    return embeddings

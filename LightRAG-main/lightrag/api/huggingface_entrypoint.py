"""HuggingFace Space entrypoint for the project-specific LightRAG config."""

from pathlib import Path
import os

from dotenv import load_dotenv


def load_huggingface_config() -> None:
    env_path = Path(os.getenv("LIGHTRAG_HUGGINGFACE_ENV", "/app/.env.huggingface"))
    if env_path.exists():
        load_dotenv(dotenv_path=env_path, override=True)


load_huggingface_config()

if os.getenv("LIGHTWEIGHT_LEGAL_RAG", "true").lower() == "true":
    from lightrag.api.legal_rag_server import main  # noqa: E402
else:
    from lightrag.api.lightrag_server import main  # noqa: E402


if __name__ == "__main__":
    main()

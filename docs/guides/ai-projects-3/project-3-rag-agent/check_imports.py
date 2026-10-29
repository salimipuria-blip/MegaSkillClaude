"""Check the exact import surface this project documents, against whatever is installed.

    python3 check_imports.py            # 0 = all good or nothing installed, 1 = broken
    python3 check_imports.py --strict   # a missing dependency is a failure

Exit codes: 0 ok/skipped, 1 broken (or missing under --strict).
The point: a tutorial that says "copy these lines" must test those lines, because
LangChain 1.x deleted `langchain.chains`, `langchain.memory` and `langchain.text_splitter`.
"""

from __future__ import annotations

import argparse
import importlib
import sys

# (import statement to prove, distribution name for the version line)
REQUIRED = [
    ("from langchain_ollama import ChatOllama, OllamaEmbeddings", "langchain-ollama"),
    ("from langchain_chroma import Chroma", "langchain-chroma"),
    ("from langchain_community.document_loaders import PyPDFLoader", "langchain-community"),
    ("from langchain_core.documents import Document", "langchain-core"),
]

# Imports that older tutorials print and that LangChain 1.x really did remove. They must FAIL.
# Measured on langchain 1.4.7 / langchain-core 1.7.3 / langchain-community 0.4.2.
FORBIDDEN = [
    "from langchain.chains import RetrievalQA",
    "from langchain.memory import ConversationBufferMemory",
    "from langchain.text_splitter import RecursiveCharacterTextSplitter",
]

# Deprecated, *not* removed: the old home still imports on 0.4.2 but warns on every use and
# names its own removal version. Reported, never gated — it is the caller's migration call.
DEPRECATED = [
    "from langchain_community.embeddings import OllamaEmbeddings",
    "from langchain_community.llms import Ollama",
]


def version(distribution: str) -> str:
    try:
        from importlib.metadata import version as _v

        return _v(distribution)
    except Exception:  # noqa: BLE001
        return "?"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--strict", action="store_true", help="missing dependencies are a failure")
    args = parser.parse_args(argv)

    missing = []
    print("imports this project documents:")
    for statement, distribution in REQUIRED:
        try:
            exec(statement, {})  # noqa: S102 - the statement is a constant in this file
            print(f"  OK    {statement}   [{distribution} {version(distribution)}]")
        except Exception as error:  # noqa: BLE001
            missing.append(f"{distribution} ({type(error).__name__})")
            print(f"  MISS  {statement}   [{distribution} {version(distribution)}]")

    removed = []
    for statement in FORBIDDEN:
        try:
            exec(statement, {})  # noqa: S102
        except Exception:  # noqa: BLE001
            print(f"  gone  {statement}   (expected on LangChain 1.x)")
        else:
            removed.append(statement)
            print(f"  BACK  {statement}   (this tutorial must stop warning about it)")

    for statement in DEPRECATED:
        try:
            exec(statement, {})  # noqa: S102
        except Exception as error:  # noqa: BLE001
            print(f"  n/a   {statement}   (already removed: {type(error).__name__})")
        else:
            print(f"  dep   {statement}   (importable but deprecated; use langchain_ollama)")

    if removed:
        print("\nFAIL: an import this guide calls removed is importable again.", file=sys.stderr)
        return 1
    if missing:
        if args.strict:
            print(f"\nFAIL: missing {', '.join(missing)}", file=sys.stderr)
            return 1
        print(f"\nskip: {', '.join(missing)} not installed; "
              "run `pip install -r requirements.txt` to verify the imports for real.")
    else:
        print("\nall documented imports resolve against the installed versions.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

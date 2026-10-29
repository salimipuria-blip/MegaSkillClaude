"""Project 3 — RAG agent over your own documents, on today's LangChain (1.x).

Why this file looks different from most tutorials
-------------------------------------------------
The classic snippet
    ❌ from langchain.chains import RetrievalQA
    ❌ from langchain.memory import ConversationBufferMemory
does not run on LangChain 1.x: `langchain.chains` and `langchain.memory` were removed.
Measured on 2026-10-29 with langchain 1.4.7 / langchain-core 1.7.3 / langchain-community
0.4.2, both imports raise ModuleNotFoundError. The supported shape is:
    * retrieval + prompt + `llm.invoke(...)` written out explicitly (no RetrievalQA), and
    * conversation state kept by the caller (a list of messages), not by a Memory object.

Design note for testability
---------------------------
LangChain, Chroma and Ollama are imported *inside* the functions that need them, so this
module imports with nothing installed. Everything worth testing — the splitter, the
context builder, the citation numbering, the refusal path — is a pure function, and
`test_rag.py` runs in CI without a model, a database or a network.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Protocol, Sequence

# --------------------------------------------------------------------------- #
# Constants                                                                    #
# --------------------------------------------------------------------------- #

CHUNK_SIZE = 800
CHUNK_OVERLAP = 100
DEFAULT_K = 4
MAX_CONTEXT_CHARS = 6000
NOT_FOUND = "در اسنادی که در اختیار دارم پاسخی برای این پرسش پیدا نکردم."

SYSTEM_RULES = (
    "تو دستیارِ اسنادِ شخصیِ کاربر هستی. فقط بر اساس «متن مرجع» پاسخ بده. "
    "اگر پاسخ در متن مرجع نبود، صریح بگو که در اسناد پیدا نشد و حدس نزن. "
    "هر ادعا را با شمارهٔ منبع در قلاب مثل [۱] ارجاع بده."
)


# --------------------------------------------------------------------------- #
# Pure core — no third-party import, fully unit-tested                        #
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class Chunk:
    """A piece of one document, with the metadata a citation needs."""

    text: str
    source: str
    index: int


@dataclass(frozen=True)
class Answer:
    text: str
    sources: tuple[dict[str, Any], ...] = field(default_factory=tuple)
    used: int = 0

    def render(self) -> str:
        """The answer plus a numbered source list — what the user actually reads."""
        if not self.sources:
            return self.text
        lines = [self.text, "", "منابع:"]
        for source in self.sources:
            where = source.get("source", "?")
            page = source.get("page")
            lines.append(f"  [{source['n']}] {where}" + (f" — صفحهٔ {page}" if page else ""))
        return "\n".join(lines)


def _sentences(text: str) -> list[str]:
    """Split on Persian and Latin sentence terminators, keeping the terminator."""
    out: list[str] = []
    current: list[str] = []
    for char in text:
        current.append(char)
        if char in ".!?؟…۔\n":
            piece = "".join(current).strip()
            if piece:
                out.append(piece)
            current = []
    tail = "".join(current).strip()
    if tail:
        out.append(tail)
    return out


def split_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split into ~`size`-character chunks on sentence boundaries with `overlap` repetition.

    This is the same idea as LangChain's RecursiveCharacterTextSplitter (paragraph →
    sentence → character) implemented in 25 deterministic lines, so the behaviour can be
    asserted in a test instead of trusted.
    """
    if size <= 0:
        raise ValueError("size must be positive")
    if not 0 <= overlap < size:
        raise ValueError("overlap must be in [0, size)")
    cleaned = "\n".join(line.rstrip() for line in str(text or "").splitlines()).strip()
    if not cleaned:
        return []

    chunks: list[str] = []
    current = ""
    for sentence in _sentences(cleaned):
        if len(sentence) > size:  # a single huge sentence: hard-wrap it
            for start in range(0, len(sentence), size - overlap):
                piece = sentence[start:start + size]
                if piece.strip():
                    chunks.append(piece.strip())
            current = ""
            continue
        candidate = f"{current} {sentence}".strip() if current else sentence
        if len(candidate) <= size:
            current = candidate
        else:
            chunks.append(current)
            carry = current[-overlap:].lstrip() if overlap else ""
            current = f"{carry} {sentence}".strip() if carry else sentence
    if current.strip():
        chunks.append(current.strip())
    return chunks


def chunks_for_document(text: str, source: str, **kwargs: int) -> list[Chunk]:
    return [Chunk(text=piece, source=source, index=i) for i, piece in enumerate(split_text(text, **kwargs))]


def _field(document: Any, name: str, default: Any = "") -> Any:
    """Read a field from a LangChain Document, a dict, or any duck-typed object."""
    if isinstance(document, dict):
        return document.get(name, default)
    return getattr(document, name, default)


def select_documents(
    documents: Sequence[Any], max_chars: int = MAX_CONTEXT_CHARS,
) -> list[tuple[int, Any, str]]:
    """The documents that actually reach the model, with the number the model will see.

    Numbering, truncation and citations must all come from *this* one list. Numbering the
    raw input instead is what makes a citation say [3] about text the model never saw — the
    bug the first version of this file had, caught by `test_blank_documents_are_numbered_1`.
    """
    selected: list[tuple[int, Any, str]] = []
    used = 0
    for document in documents:
        text = str(_field(document, "page_content") or "").strip()
        if not text:
            continue
        number = len(selected) + 1
        block = f"[{number}] {text}"
        if selected and used + len(block) + 2 > max_chars:
            break
        if not selected:
            block = block[:max_chars]
        selected.append((number, document, block))
        used += len(block) + 2
    return selected


def format_context(documents: Sequence[Any], max_chars: int = MAX_CONTEXT_CHARS) -> str:
    """Numbered context blocks, truncated between blocks so no block is cut mid-sentence."""
    return "\n\n".join(block for _, _, block in select_documents(documents, max_chars))


def sources_of(documents: Sequence[Any]) -> tuple[dict[str, Any], ...]:
    """De-duplicated citation list, numbered 1..n in the order the model sees them."""
    seen: set[tuple[str, Any]] = set()
    out: list[dict[str, Any]] = []
    for number, document in enumerate(documents, start=1):
        metadata = _field(document, "metadata", {}) or {}
        source = str(metadata.get("source", "?")) if isinstance(metadata, dict) else "?"
        page = metadata.get("page") if isinstance(metadata, dict) else None
        key = (source, page)
        if key in seen:
            continue
        seen.add(key)
        entry: dict[str, Any] = {"n": number, "source": source}
        if page is not None:
            entry["page"] = page
        out.append(entry)
    return tuple(out)


def build_messages(question: str, context: str) -> list[dict[str, str]]:
    """The exact message list sent to the chat model."""
    return [
        {"role": "system", "content": SYSTEM_RULES},
        {"role": "user", "content": f"متن مرجع:\n{context}\n\nپرسش: {question}"},
    ]


def content_of(reply: Any) -> str:
    """A chat model returns a message object; a plain string is also accepted."""
    if isinstance(reply, str):
        return reply.strip()
    content = getattr(reply, "content", None)
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):  # multimodal content blocks
        return " ".join(str(part.get("text", "")) for part in content if isinstance(part, dict)).strip()
    return str(reply).strip()


class Retriever(Protocol):
    def invoke(self, query: str) -> Sequence[Any]: ...


class ChatModel(Protocol):
    def invoke(self, messages: list[dict[str, str]]) -> Any: ...


def answer_question(
    question: str,
    retriever: Retriever,
    llm: ChatModel,
    *,
    k: int = DEFAULT_K,
    max_chars: int = MAX_CONTEXT_CHARS,
) -> Answer:
    """Retrieve, refuse when nothing was found, otherwise answer with citations.

    The refusal is not a nicety: a RAG agent that answers from an empty context is just a
    hallucinating chatbot with extra steps, and that is the most common failure in the
    tutorials this replaces.
    """
    question = str(question or "").strip()
    if not question:
        return Answer(text="پرسش خالی است.")

    documents = list(retriever.invoke(question) or [])[: max(1, k)]
    selected = select_documents(documents, max_chars=max_chars)
    if not selected:
        return Answer(text=NOT_FOUND)

    used = [document for _, document, _ in selected]
    context = "\n\n".join(block for _, _, block in selected)
    reply = llm.invoke(build_messages(question, context))
    text = content_of(reply)
    if not text:
        return Answer(text=NOT_FOUND, sources=sources_of(used), used=len(used))
    return Answer(text=text, sources=sources_of(used), used=len(used))


# --------------------------------------------------------------------------- #
# LangChain / Ollama / Chroma — imported only when actually used              #
# --------------------------------------------------------------------------- #


def load_documents(paths: Iterable[str | Path]) -> list[Chunk]:
    """Read every .txt/.md/.pdf under `paths` into Chunks. PDFs need `pypdf`."""
    chunks: list[Chunk] = []
    for path in map(Path, paths):
        files = sorted(path.rglob("*")) if path.is_dir() else [path]
        for file in files:
            if not file.is_file():
                continue
            suffix = file.suffix.lower()
            if suffix == ".pdf":
                from langchain_community.document_loaders import PyPDFLoader

                for page_number, page in enumerate(PyPDFLoader(str(file)).load()):
                    chunks.extend(chunks_for_document(
                        page.page_content, f"{file}#page={page_number + 1}",
                    ))
            elif suffix in {".txt", ".md", ".markdown", ""}:
                chunks.extend(chunks_for_document(file.read_text(encoding="utf-8"), str(file)))
    return chunks


def build_vectorstore(chunks: Sequence[Chunk], persist_directory: str = "./chroma_db"):
    """Embed the chunks into a persistent Chroma collection with a local embedding model."""
    from langchain_chroma import Chroma
    from langchain_core.documents import Document
    from langchain_ollama import OllamaEmbeddings

    documents = [
        Document(page_content=chunk.text, metadata={"source": chunk.source, "chunk": chunk.index})
        for chunk in chunks
    ]
    return Chroma.from_documents(
        documents=documents,
        embedding=OllamaEmbeddings(model="nomic-embed-text"),
        persist_directory=persist_directory,
    )


def build_llm(model: str = "llama3.1:8b"):
    from langchain_ollama import ChatOllama

    return ChatOllama(model=model, temperature=0.1)


def build_retriever(persist_directory: str = "./chroma_db", k: int = DEFAULT_K):
    from langchain_chroma import Chroma
    from langchain_ollama import OllamaEmbeddings

    store = Chroma(persist_directory=persist_directory, embedding_function=OllamaEmbeddings(model="nomic-embed-text"))
    return store.as_retriever(search_kwargs={"k": k})


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="پرسش از اسناد خودت با Ollama + Chroma.")
    parser.add_argument("--docs", nargs="+", default=["."], help="فایل یا پوشهٔ سند (txt/md/pdf)")
    parser.add_argument("--ask", help="پرسش؛ اگر نباشد حالت تعاملی اجرا می‌شود")
    parser.add_argument("--index", action="store_true", help="ساخت دوبارهٔ ایندکس")
    parser.add_argument("--persist", default="./chroma_db")
    parser.add_argument("--model", default="llama3.1:8b")
    parser.add_argument("--k", type=int, default=DEFAULT_K)
    args = parser.parse_args(argv)

    try:
        if args.index:
            chunks = load_documents(args.docs)
            if not chunks:
                print("هیچ سندی پیدا نشد.", file=sys.stderr)
                return 1
            build_vectorstore(chunks, args.persist)
            print(f"{len(chunks)} تکه از اسناد در {args.persist} ذخیره شد.")
        retriever = build_retriever(args.persist, args.k)
        llm = build_llm(args.model)
    except ModuleNotFoundError as error:
        print(f"وابستگیِ «{error.name}» نصب نیست: pip install -r requirements.txt", file=sys.stderr)
        return 2
    except Exception as error:  # noqa: BLE001 - the CLI must explain, not traceback
        print(f"ایندکس یا مدل آماده نیست: {error}", file=sys.stderr)
        return 2

    questions = [args.ask] if args.ask else iter(lambda: input("پرسش (خالی = خروج): ").strip(), "")
    for question in questions:
        if not question:
            continue
        print(answer_question(question, retriever, llm, k=args.k).render())
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

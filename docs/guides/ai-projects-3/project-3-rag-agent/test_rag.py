"""Offline tests: no LangChain, no Chroma, no Ollama, no network.

    python3 -m unittest discover -s docs/guides/ai-projects-3/project-3-rag-agent -p "test_*.py" -v
"""

from __future__ import annotations

import unittest
from dataclasses import dataclass, field

from rag_agent import (
    MAX_CONTEXT_CHARS,
    NOT_FOUND,
    Chunk,
    answer_question,
    build_messages,
    chunks_for_document,
    content_of,
    format_context,
    sources_of,
    split_text,
)


@dataclass
class Doc:
    """Stands in for langchain_core.documents.Document."""

    page_content: str
    metadata: dict = field(default_factory=dict)


class FakeRetriever:
    def __init__(self, documents):
        self.documents = documents
        self.queries = []

    def invoke(self, query):
        self.queries.append(query)
        return self.documents


class FakeLLM:
    def __init__(self, reply="پاسخ مدل"):
        self.reply = reply
        self.messages = []

    def invoke(self, messages):
        self.messages = messages
        return type("Message", (), {"content": self.reply})()


class SplitTextTests(unittest.TestCase):
    def test_empty_input_yields_no_chunks(self):
        self.assertEqual(split_text(""), [])
        self.assertEqual(split_text("   \n\n  "), [])
        self.assertEqual(split_text(None), [])

    def test_short_text_is_one_chunk_and_is_not_rewritten(self):
        text = "این یک جمله است. این هم جملهٔ دوم است."
        self.assertEqual(split_text(text, size=500), [text])

    def test_chunks_respect_the_size_budget(self):
        text = " ".join(f"جملهٔ شمارهٔ {i} برای آزمون برش ساخته شده است." for i in range(200))
        chunks = split_text(text, size=300, overlap=40)
        self.assertGreater(len(chunks), 1)
        for chunk in chunks:
            self.assertLessEqual(len(chunk), 300, chunk[:60])

    def test_overlap_repeats_the_tail_of_the_previous_chunk(self):
        text = " ".join(f"متن شمارهٔ {i}. " for i in range(200))
        chunks = split_text(text, size=200, overlap=60)
        # Something from the end of chunk N must appear at the start of chunk N+1.
        tail = chunks[0][-40:].split()[-1]
        self.assertIn(tail, chunks[1])

    def test_a_single_oversized_sentence_is_hard_wrapped(self):
        chunks = split_text("x" * 1000, size=300, overlap=50)
        self.assertTrue(all(len(c) <= 300 for c in chunks))
        self.assertGreaterEqual(len(chunks), 4)

    def test_invalid_parameters_are_rejected(self):
        with self.assertRaises(ValueError):
            split_text("متن", size=0)
        with self.assertRaises(ValueError):
            split_text("متن", size=100, overlap=100)

    def test_chunks_for_document_numbers_each_piece(self):
        chunks = chunks_for_document("جمله. " * 200, "notes.md", size=200, overlap=20)
        self.assertEqual([c.index for c in chunks], list(range(len(chunks))))
        self.assertTrue(all(isinstance(c, Chunk) and c.source == "notes.md" for c in chunks))


class ContextTests(unittest.TestCase):
    def test_numbers_blocks_in_retrieval_order(self):
        context = format_context([Doc("اول"), Doc("دوم")])
        self.assertEqual(context, "[1] اول\n\n[2] دوم")

    def test_skips_empty_documents_instead_of_numbering_them(self):
        context = format_context([Doc("   "), Doc("دوم")])
        self.assertEqual(context, "[1] دوم")

    def test_stops_between_blocks_instead_of_cutting_one(self):
        documents = [Doc("ا" * 3000), Doc("ب" * 3000)]
        context = format_context(documents, max_chars=MAX_CONTEXT_CHARS)
        self.assertLessEqual(len(context), MAX_CONTEXT_CHARS + 10)
        self.assertIn("[1]", context)
        self.assertNotIn("[2]", context, "the second block does not fit, so it is dropped whole")

    def test_sources_are_numbered_and_deduplicated(self):
        documents = [
            Doc("a", {"source": "notes.md", "page": 1}),
            Doc("b", {"source": "notes.md", "page": 1}),
            Doc("c", {"source": "book.pdf", "page": 7}),
        ]
        self.assertEqual(
            sources_of(documents),
            ({"n": 1, "source": "notes.md", "page": 1}, {"n": 3, "source": "book.pdf", "page": 7}),
        )

    def test_sources_survive_missing_metadata(self):
        self.assertEqual(sources_of([Doc("x")]), ({"n": 1, "source": "?"},))


class PromptTests(unittest.TestCase):
    def test_messages_carry_the_rules_the_context_and_the_question(self):
        messages = build_messages("چرا؟", "[1] چون")
        self.assertEqual([m["role"] for m in messages], ["system", "user"])
        self.assertIn("فقط بر اساس", messages[0]["content"])
        self.assertIn("[1] چون", messages[1]["content"])
        self.assertIn("چرا؟", messages[1]["content"])

    def test_content_of_accepts_strings_objects_and_block_lists(self):
        self.assertEqual(content_of(" متن "), "متن")
        self.assertEqual(content_of(type("M", (), {"content": "دوم"})()), "دوم")
        self.assertEqual(content_of(type("M", (), {"content": [{"type": "text", "text": "سوم"}]})()), "سوم")
        self.assertEqual(content_of(None), "None")


class AnswerTests(unittest.TestCase):
    def test_empty_question_never_calls_the_retriever(self):
        retriever = FakeRetriever([Doc("x")])
        answer = answer_question("   ", retriever, FakeLLM())
        self.assertEqual(retriever.queries, [])
        self.assertIn("خالی", answer.text)

    def test_no_documents_means_an_explicit_refusal(self):
        llm = FakeLLM()
        answer = answer_question("سؤال", FakeRetriever([]), llm)
        self.assertEqual(answer.text, NOT_FOUND)
        self.assertEqual(answer.used, 0)
        self.assertEqual(llm.messages, [], "the model must not be asked without context")
        self.assertEqual(answer.render(), NOT_FOUND)

    def test_blank_documents_are_treated_as_no_documents(self):
        answer = answer_question("سؤال", FakeRetriever([Doc("   ")]), FakeLLM())
        self.assertEqual(answer.text, NOT_FOUND)

    def test_a_normal_answer_gets_its_citations(self):
        documents = [Doc("متن یک", {"source": "a.md"}), Doc("متن دو", {"source": "b.md"})]
        llm = FakeLLM("پاسخ نهایی [1]")
        answer = answer_question("سؤال", FakeRetriever(documents), llm)
        self.assertEqual(answer.text, "پاسخ نهایی [1]")
        self.assertEqual(answer.used, 2)
        self.assertIn("[1] متن یک", llm.messages[1]["content"])
        rendered = answer.render()
        self.assertIn("منابع:", rendered)
        self.assertIn("[2] b.md", rendered)

    def test_k_caps_how_many_documents_are_used(self):
        documents = [Doc(f"متن {i}", {"source": f"{i}.md"}) for i in range(10)]
        answer = answer_question("سؤال", FakeRetriever(documents), FakeLLM("ok"), k=2)
        self.assertEqual(answer.used, 2)

    def test_an_empty_model_reply_degrades_to_the_refusal_not_to_blank_text(self):
        answer = answer_question("سؤال", FakeRetriever([Doc("x", {"source": "a"})]), FakeLLM(""))
        self.assertEqual(answer.text, NOT_FOUND)
        self.assertEqual(answer.used, 1)

    def test_the_question_reaches_the_retriever(self):
        retriever = FakeRetriever([Doc("x")])
        answer_question("خلاصهٔ جلسهٔ سه‌شنبه؟", retriever, FakeLLM())
        self.assertEqual(retriever.queries, ["خلاصهٔ جلسهٔ سه‌شنبه؟"])


if __name__ == "__main__":
    unittest.main()

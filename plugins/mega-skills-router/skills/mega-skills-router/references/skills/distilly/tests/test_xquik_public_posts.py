from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path

import _paths  # noqa: F401  (puts tools/ on sys.path)
from research.xquik_public_posts import (
    API_CONTRACT,
    API_URL,
    MAX_CONTENT_CHARS,
    CollectorError,
    build_query,
    collect_public_posts,
    normalize_post,
    validate_limit,
    write_collection,
)


class FakeResponse:
    def __init__(self, payload: object, status_code: int = 200) -> None:
        self.payload = payload
        self.status_code = status_code

    def json(self) -> object:
        return self.payload


def sample_post(tweet_id: str = "123") -> dict:
    return {
        "id": tweet_id,
        "text": "A public first-person observation.",
        "createdAt": "2026-08-20T10:00:00Z",
        "lang": "en",
        "likeCount": 10,
        "retweetCount": 2,
        "replyCount": 1,
        "quoteCount": 0,
        "viewCount": 500,
        "bookmarkCount": 3,
        "author": {
            "id": "42",
            "username": "example_user",
            "name": "Example User",
            "verified": True,
        },
    }


class QueryValidationTest(unittest.TestCase):
    def test_build_query_accepts_username_with_at_prefix(self) -> None:
        self.assertEqual(build_query(None, "@example_user"), "from:example_user")

    def test_build_query_rejects_invalid_username(self) -> None:
        with self.assertRaisesRegex(CollectorError, "Invalid X username"):
            build_query(None, "not-valid!")

    def test_validate_limit_rejects_unbounded_collection(self) -> None:
        with self.assertRaisesRegex(CollectorError, "between 1 and 100"):
            validate_limit(101)


class PostNormalizationTest(unittest.TestCase):
    def test_normalize_post_canonicalizes_url_and_metrics(self) -> None:
        post = normalize_post(sample_post())

        self.assertIsNotNone(post)
        self.assertEqual(post["url"], "https://x.com/example_user/status/123")
        self.assertEqual(post["metrics"]["likes"], 10)
        self.assertEqual(post["trust"], "untrusted_candidate_evidence")

    def test_normalize_post_truncates_long_form_text(self) -> None:
        raw = sample_post()
        raw["text"] = "x" * (MAX_CONTENT_CHARS + 50)

        post = normalize_post(raw)

        self.assertTrue(post["content_truncated"])
        self.assertEqual(len(post["content"]), MAX_CONTENT_CHARS)

    def test_normalize_post_accepts_current_normalized_contract(self) -> None:
        raw = sample_post()
        raw.pop("createdAt")
        raw.pop("likeCount")
        raw["created"] = 1_700_000_000
        raw["like_count"] = 11

        post = normalize_post(raw)

        self.assertEqual(post["published_at"], "2023-11-14T22:13:20Z")
        self.assertEqual(post["metrics"]["likes"], 11)

    def test_normalize_post_removes_terminal_control_characters(self) -> None:
        raw = sample_post()
        raw["text"] = "safe\x1b[31m text"

        post = normalize_post(raw)

        self.assertNotIn("\x1b", post["content"])

    def test_normalize_post_rejects_non_x_source_url(self) -> None:
        raw = sample_post()
        raw["author"] = {}
        raw["url"] = "https://example.com/example_user/status/123"

        self.assertIsNone(normalize_post(raw))


class CollectionTest(unittest.TestCase):
    def test_collect_public_posts_uses_one_bounded_read_request(self) -> None:
        calls = []

        def fake_get(url: str, **kwargs: object) -> FakeResponse:
            calls.append((url, kwargs))
            return FakeResponse(
                {
                    "tweets": [sample_post(), sample_post(), sample_post("456")],
                    "has_more": True,
                    "next_cursor": "opaque",
                }
            )

        collection = collect_public_posts(
            api_key="test-key",
            query="from:example_user",
            limit=20,
            query_type="Latest",
            subject="Example User",
            request_get=fake_get,
            collected_at="2026-08-21T00:00:00Z",
        )

        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][0], API_URL)
        self.assertEqual(calls[0][1]["headers"]["x-api-key"], "test-key")
        self.assertEqual(calls[0][1]["headers"]["xquik-api-contract"], API_CONTRACT)
        self.assertEqual(calls[0][1]["params"]["limit"], 20)
        self.assertFalse(calls[0][1]["allow_redirects"])
        self.assertEqual(len(collection["messages"]), 2)
        self.assertEqual(collection["subject_candidates"], ["Example User", "example_user"])
        self.assertTrue(collection["metadata"]["has_more"])
        self.assertFalse(collection["metadata"]["pagination_followed"])
        self.assertNotIn("test-key", json.dumps(collection))

    def test_collect_public_posts_enforces_limit_on_oversized_response(self) -> None:
        collection = collect_public_posts(
            api_key="test-key",
            query="from:example_user",
            limit=1,
            query_type="Latest",
            request_get=lambda *args, **kwargs: FakeResponse(
                {"tweets": [sample_post("1"), sample_post("2")]}
            ),
        )

        self.assertEqual([post["id"] for post in collection["messages"]], ["1"])

    def test_collect_public_posts_rejects_missing_tweets(self) -> None:
        with self.assertRaisesRegex(CollectorError, "missing the tweets list"):
            collect_public_posts(
                api_key="test-key",
                query="from:example_user",
                limit=20,
                query_type="Latest",
                request_get=lambda *args, **kwargs: FakeResponse({}),
            )

    def test_collect_public_posts_rejects_unknown_sort(self) -> None:
        with self.assertRaisesRegex(CollectorError, "Sort must be Latest or Top"):
            collect_public_posts(
                api_key="test-key",
                query="from:example_user",
                limit=20,
                query_type="Popular",
                request_get=lambda *args, **kwargs: FakeResponse({"tweets": []}),
            )

    def test_collect_public_posts_sanitizes_authentication_error(self) -> None:
        with self.assertRaisesRegex(CollectorError, "Authentication failed") as raised:
            collect_public_posts(
                api_key="secret-key",
                query="from:example_user",
                limit=20,
                query_type="Latest",
                request_get=lambda *args, **kwargs: FakeResponse({"secret": "body"}, 401),
            )

        self.assertNotIn("secret-key", str(raised.exception))
        self.assertNotIn("body", str(raised.exception))

    def test_collect_public_posts_refuses_redirects_without_exposing_key(self) -> None:
        with self.assertRaisesRegex(CollectorError, "Refusing to forward") as raised:
            collect_public_posts(
                api_key="secret-key",
                query="from:example_user",
                limit=20,
                query_type="Latest",
                request_get=lambda *args, **kwargs: FakeResponse({}, 302),
            )

        self.assertNotIn("secret-key", str(raised.exception))

    def test_write_collection_requires_force_to_replace_output(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            output = Path(tmp_dir) / "candidates" / "x.json"
            write_collection(output, {"messages": []}, force=False)

            with self.assertRaisesRegex(CollectorError, "Pass --force"):
                write_collection(output, {"messages": [1]}, force=False)

            write_collection(output, {"messages": [1]}, force=True)
            self.assertEqual(json.loads(output.read_text(encoding="utf-8")), {"messages": [1]})
            self.assertEqual([path.name for path in output.parent.iterdir()], ["x.json"])

    @unittest.skipUnless(hasattr(os, "symlink"), "symbolic links are unavailable")
    def test_write_collection_rejects_dangling_symlink(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            output = Path(tmp_dir) / "candidates" / "x.json"
            target = Path(tmp_dir) / "outside.json"
            output.parent.mkdir()
            try:
                output.symlink_to(target)
            except OSError as error:
                self.skipTest(f"cannot create symbolic links: {error}")

            with self.assertRaisesRegex(CollectorError, "symbolic link"):
                write_collection(output, {"messages": []}, force=False)
            with self.assertRaisesRegex(CollectorError, "symbolic link"):
                write_collection(output, {"messages": []}, force=True)

            self.assertFalse(target.exists())


if __name__ == "__main__":
    unittest.main()

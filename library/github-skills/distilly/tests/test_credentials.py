from __future__ import annotations

import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import _paths  # noqa: F401  (puts tools/ on sys.path)
import credentials
import feishu_auto_collector


class FakeKeyring:
    def __init__(self) -> None:
        self.store: dict[tuple[str, str], str] = {}

    def get_password(self, service: str, name: str):
        return self.store.get((service, name))

    def set_password(self, service: str, name: str, value: str) -> None:
        self.store[(service, name)] = value


class CredentialsTest(unittest.TestCase):
    def setUp(self) -> None:
        patcher = patch.object(credentials, "_keyring", return_value=None)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_env_overrides_config_file(self) -> None:
        raw = {"app_id": "cli_file", "app_secret": "file-secret"}
        with patch.dict("os.environ", {"FEISHU_APP_SECRET": "env-secret"}, clear=False):
            config = credentials.resolve("feishu", raw)
        self.assertEqual(config["app_id"], "cli_file")
        self.assertEqual(config["app_secret"], "env-secret")

    def test_keyring_is_used_for_secrets_when_available(self) -> None:
        fake = FakeKeyring()
        fake.store[("distilly", "SLACK_BOT_TOKEN")] = "xoxb-from-keyring"
        with patch.object(credentials, "_keyring", return_value=fake), patch.dict("os.environ", {}, clear=True):
            self.assertEqual(credentials.resolve("slack", {})["bot_token"], "xoxb-from-keyring")

    def test_describe_never_prints_values(self) -> None:
        raw = {"app_key": "ding_visible_key", "app_secret": "super-secret-value"}
        with patch.dict("os.environ", {}, clear=True):
            report = credentials.describe("dingtalk", raw)
        self.assertNotIn("super-secret-value", report)
        self.assertNotIn("ding_visible_key", report)
        self.assertIn("配置文件", report)

    def test_save_secrets_keeps_secrets_out_of_file_when_keyring_chosen(self) -> None:
        fake = FakeKeyring()
        saved: list[dict] = []
        raw = {credentials.SECRET_STORE_KEY: "keyring"}
        with patch.object(credentials, "_keyring", return_value=fake):
            credentials.save_secrets(
                "feishu",
                raw,
                {"app_id": "cli_x", "app_secret": "s3cret", "p2p_chat_id": "oc_1"},
                lambda cfg: saved.append(dict(cfg)),
            )
        self.assertEqual(fake.store[("distilly", "FEISHU_APP_SECRET")], "s3cret")
        self.assertNotIn("s3cret", json.dumps(saved[-1]))
        self.assertEqual(saved[-1]["app_id"], "cli_x")
        self.assertEqual(saved[-1]["p2p_chat_id"], "oc_1")

    def test_refresh_does_not_write_env_secret_to_disk(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "feishu_config.json"
            raw = {"app_id": "cli_x", "refresh_token": "r-old"}
            env = {"FEISHU_APP_SECRET": "env-only-secret"}
            response = SimpleNamespace(
                json=lambda: {"code": 0, "data": {"access_token": "u-new", "refresh_token": "r-new"}}
            )
            with (
                patch.object(feishu_auto_collector, "CONFIG_PATH", path),
                patch.dict("os.environ", env, clear=True),
                patch.object(feishu_auto_collector, "get_tenant_token", return_value="t-app"),
                patch.object(feishu_auto_collector.requests, "post", return_value=response),
            ):
                config = credentials.resolve("feishu", raw)
                self.assertTrue(feishu_auto_collector.refresh_user_token(raw, config))
            on_disk = path.read_text(encoding="utf-8")
        self.assertNotIn("env-only-secret", on_disk)
        self.assertEqual(json.loads(on_disk)["user_access_token"], "u-new")
        self.assertEqual(config["user_access_token"], "u-new")

    def test_setup_refuses_non_interactive_stdin(self) -> None:
        with patch.object(sys, "stdin", io.StringIO("piped-secret\n")), redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as raised:
                credentials.ensure_interactive("dingtalk")
        self.assertEqual(raised.exception.code, 2)

    def test_feishu_rejects_token_on_command_line(self) -> None:
        argv = ["feishu_auto_collector.py", "--name", "x", "--user-token", "u-leak"]
        with patch.object(sys, "argv", argv), redirect_stderr(io.StringIO()) as err:
            with self.assertRaises(SystemExit):
                feishu_auto_collector.main()
        self.assertIn("已移除", err.getvalue())
        self.assertNotIn("u-leak", err.getvalue())

    def test_extract_oauth_code_accepts_callback_url(self) -> None:
        self.assertEqual(
            feishu_auto_collector.extract_oauth_code("http://www.example.com/?code=abc123&state=x"),
            "abc123",
        )
        self.assertEqual(feishu_auto_collector.extract_oauth_code(" abc123 "), "abc123")


if __name__ == "__main__":
    unittest.main()

"""Guards the Infinity Mega Skill provider/agent bank in registry/."""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REG = ROOT / "registry"
VERIFY = {"live", "docs", "unknown"}
KEY_LIKE = re.compile(r"(sk-[A-Za-z0-9]{16,}|hf_[A-Za-z0-9]{20,}|gsk_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,})")


def load(name):
    return json.loads((REG / name).read_text(encoding="utf-8"))


class ProviderBank(unittest.TestCase):
    def setUp(self):
        self.data = load("providers.json")
        self.rows = self.data["providers"]

    def test_ids_unique_and_fields_present(self):
        ids = [p["id"] for p in self.rows]
        self.assertEqual(len(ids), len(set(ids)))
        for p in self.rows:
            for field in ("name", "kind", "openai_compatible", "auth_env", "free_tier", "strengths", "in_hermes", "verify"):
                self.assertIn(field, p, p["id"])
            self.assertIn(p["verify"], VERIFY, p["id"])
            self.assertIn(p["kind"], {"api", "aggregator", "gateway", "local", "eval"}, p["id"])

    def test_urls_are_https_except_local(self):
        for p in self.rows:
            for field in ("base_url", "models_endpoint"):
                url = p.get(field)
                if url and p["kind"] != "local":
                    self.assertTrue(url.startswith("https://"), f"{p['id']}.{field}")

    def test_hermes_providers_match_code(self):
        code = "".join((ROOT / "hermes" / f).read_text(encoding="utf-8") for f in ("providers.mjs", "worker.mjs"))
        for p in self.rows:
            if p["in_hermes"]:
                found = (p["auth_env"] and p["auth_env"] in code) or p["name"].split()[0] in code
                self.assertTrue(found, f"{p['id']} marked in_hermes but not found in hermes/")


class AgentBank(unittest.TestCase):
    def setUp(self):
        self.data = load("agents.json")

    def test_positions_and_agents_consistent(self):
        positions = {p["id"] for p in self.data["positions"]}
        criteria = set(self.data["criteria"])
        for pos in self.data["positions"]:
            self.assertTrue(set(pos["weights"]) <= criteria, pos["id"])
        ids = [a["id"] for a in self.data["agents"]]
        self.assertEqual(len(ids), len(set(ids)))
        for a in self.data["agents"]:
            self.assertIn(a["verify"], VERIFY, a["id"])
            self.assertTrue(set(a["best_positions"]) <= positions, a["id"])
            self.assertIn(a["cost"], {0, 1, 2, 3}, a["id"])
            if a["verify"] != "unknown":
                self.assertTrue(a["best_positions"], f"{a['id']} has no position")

    def test_every_position_has_a_free_candidate(self):
        for pos in self.data["positions"]:
            free = [a for a in self.data["agents"] if pos["id"] in a["best_positions"] and a["cost"] <= 1]
            self.assertTrue(free, f"no free agent for {pos['id']}")


class LiveModels(unittest.TestCase):
    def test_models_snapshot_shape(self):
        data = load("models.json")
        self.assertIn("generated_at", data)
        self.assertEqual(data["totals"]["models"], len(data["models"]))
        self.assertTrue(any(s["status"] == "ok" for s in data["sources"].values()))
        for m in data["models"]:
            self.assertIn("provider", m)
            self.assertIn("model", m)


class NoSecrets(unittest.TestCase):
    def test_registry_has_no_keys(self):
        for path in REG.rglob("*"):
            if path.is_file():
                self.assertIsNone(KEY_LIKE.search(path.read_text(encoding="utf-8")), str(path))


if __name__ == "__main__":
    unittest.main()

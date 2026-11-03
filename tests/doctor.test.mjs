import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("repo doctor executes the root Python suite instead of a zero-test false green", () => {
  const result = spawnSync(process.execPath, ["scripts/doctor.mjs", "repo", "--json"], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 120_000,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);

  const report = JSON.parse(result.stdout);
  const commonTests = report.results[0].rows.find((row) => row.step === "common-tests");
  assert.equal(commonTests?.status, "pass", JSON.stringify(commonTests));
  const count = commonTests.output.match(/Ran (\d+) tests/);
  assert.ok(count, `doctor output did not report unittest discovery: ${commonTests.output}`);
  assert.ok(Number(count[1]) >= 50, `expected the full root suite, got ${count[1]} tests`);
});

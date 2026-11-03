import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RENDERER = path.resolve(HERE, "../render.mjs");

async function makeFakePlaywright(directory) {
  const modulePath = path.join(directory, "fake-playwright.cjs");
  await writeFile(modulePath, `
    const fs = require("node:fs");
    const trace = (message) => fs.appendFileSync(process.env.RENDER_TRACE, message + "\\n");
    const screenshot = async ({ path }) => {
      trace("screenshot:" + path);
      if (process.env.FAIL_SCREENSHOT === "1") throw new Error("fixture screenshot failure");
      fs.writeFileSync(path, "fixture png");
    };
    exports.chromium = {
      launch: async () => {
        trace("launch");
        return {
          newPage: async () => ({
            on: () => {},
            goto: async () => trace("goto"),
            evaluate: async () => {},
            waitForTimeout: async () => {},
            locator: (selector) => selector === "#st"
              ? { count: async () => 1, screenshot }
              : {
                  count: async () => 3,
                  all: async () => [1, 2, 3].map((number) => ({
                    getAttribute: async () => "p" + number,
                    screenshot,
                  })),
                },
          }),
          close: async () => trace("close"),
        };
      },
    };
  `, "utf8");
  return modulePath;
}

async function runRender(directory, format, { failScreenshot = false } = {}) {
  const trace = path.join(directory, "trace.log");
  const fakePlaywright = await makeFakePlaywright(directory);
  const output = path.join(directory, `output-${format}`);
  // These fixtures exercise layout, not a campaign: the brief is unverified by default, so the
  // renderer's fail-closed gate has to be released explicitly.
  const result = spawnSync(process.execPath, [RENDERER, format, output, "--allow-unverified-claims"], {
    cwd: directory,
    encoding: "utf8",
    timeout: 30_000,
    env: {
      ...process.env,
      PLAYWRIGHT_PATH: fakePlaywright,
      RENDER_TRACE: trace,
      ...(failScreenshot ? { FAIL_SCREENSHOT: "1" } : { FAIL_SCREENSHOT: "0" }),
    },
  });
  return { result, trace, output };
}

test("post and story renderers create the expected files and close the browser", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "viking-render-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const post = await runRender(directory, "post");
  assert.equal(post.result.status, 0, post.result.stdout + post.result.stderr);
  assert.deepEqual((await readdir(post.output)).sort(), ["post-1.png", "post-2.png", "post-3.png"]);
  assert.match(await readFile(post.trace, "utf8"), /launch[\s\S]*close/);

  const story = await runRender(directory, "story");
  assert.equal(story.result.status, 0, story.result.stdout + story.result.stderr);
  assert.deepEqual(await readdir(story.output), ["story.png"]);
  assert.match(await readFile(story.trace, "utf8"), /launch[\s\S]*close/);
});

test("browser closes in finally when a screenshot fails", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "viking-render-fail-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const { result, trace } = await runRender(directory, "post", { failScreenshot: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /fixture screenshot failure/);
  assert.match(await readFile(trace, "utf8"), /launch[\s\S]*close/);
});

test("invalid output format fails before loading or launching the browser", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "viking-render-input-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const trace = path.join(directory, "trace.log");
  const fakePlaywright = await makeFakePlaywright(directory);
  const result = spawnSync(process.execPath, [RENDERER, "carousel"], {
    cwd: directory,
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, PLAYWRIGHT_PATH: fakePlaywright, RENDER_TRACE: trace },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /usage: node brand\/viking\/render\.mjs/);
  await assert.rejects(readFile(trace));
});

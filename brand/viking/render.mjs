// Render the Viking templates to PNG: node brand/viking/render.mjs [story|post] [outDir]
// Playwright and Chromium are runtime prerequisites; set PLAYWRIGHT_PATH or
// CHROMIUM_PATH only when the local installations are not auto-discoverable.
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function loadPlaywright() {
  const candidates = [];
  if (process.env.PLAYWRIGHT_PATH) {
    const configured = process.env.PLAYWRIGHT_PATH;
    candidates.push(isAbsolute(configured) ? configured : resolve(process.cwd(), configured));
  }
  candidates.push(
    join(here, "node_modules/playwright"),
    join(here, "node_modules/playwright-core"),
    "/opt/node-tools/node_modules/playwright",
    "playwright",
    "playwright-core",
  );

  const tried = new Set();
  for (const candidate of candidates) {
    if (tried.has(candidate)) continue;
    tried.add(candidate);
    try {
      const playwright = require(candidate);
      if (playwright?.chromium?.launch) return playwright;
    } catch {
      // Continue through the supported module locations; report one concise hint below.
    }
  }
  throw new Error(
    "Playwright was not found. Install playwright/playwright-core in this workspace " +
    "or set PLAYWRIGHT_PATH to its module path.",
  );
}

/**
 * Campaign claims (price, date, capacity, giveaway) live in brief.json, never implicitly in the
 * artwork. Rendering a template whose claims are not marked verified would publish numbers nobody
 * signed off on, so the renderer fails closed unless --allow-unverified-claims is passed.
 */
function assertBrief(templatePath, {allowUnverified = false} = {}) {
  const briefPath = join(here, "brief.json");
  if (!existsSync(briefPath)) throw new Error("brief.json is missing; campaign claims must be tracked");
  const brief = JSON.parse(readFileSync(briefPath, "utf8"));
  if (brief.schema !== 1) throw new Error(`unsupported brief schema: ${brief.schema}`);
  const html = readFileSync(templatePath, "utf8");
  const kind = templatePath.endsWith("story.html") ? "story" : "post";
  const applicable = (brief.claims || []).filter((claim) => (claim.in || ["post", "story"]).includes(kind));
  const missing = applicable.filter((claim) => !html.includes(claim.value));
  if (missing.length) {
    // A claim that is no longer in the artwork means the brief drifted from the design.
    throw new Error(
      `brief.json lists ${missing.length} claim(s) that ${templatePath.split("/").pop()} does not ` +
        `contain: ${missing.map((c) => c.key).join(", ")}. Update the brief or the template.`,
    );
  }
  if (brief.verified !== true && !allowUnverified) {
    const unverified = applicable.filter((c) => !c.source);
    throw new Error(
      "brief.json is not verified: the campaign numbers have no recorded source. Fill `source` for " +
        `each claim (${unverified.map((c) => c.key).join(", ") || "none"}), set verified=true, or re-run ` +
        "with --allow-unverified-claims for a layout draft that you will not publish.",
    );
  }
  return brief;
}

function resolveRenderTarget() {
  const argv = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [format = "post", outputArgument] = argv;
  if (format !== "post" && format !== "story") {
    throw new Error("usage: node brand/viking/render.mjs [post|story] [output-directory] [--allow-unverified-claims]");
  }
  const template = join(here, format === "story" ? "story.html" : "post.html");
  const outputDirectory = outputArgument ? resolve(outputArgument) : join(here, "out");
  return { format, template, outputDirectory };
}

async function render() {
  const { format, template, outputDirectory } = resolveRenderTarget();
  if (!existsSync(template)) throw new Error(`template not found: ${template}`);
  const brief = assertBrief(template, {allowUnverified: process.argv.includes("--allow-unverified-claims")});
  mkdirSync(outputDirectory, { recursive: true });

  const { chromium } = loadPlaywright();
  const launchOptions = {};
  if (process.env.CHROMIUM_PATH) {
    const executablePath = isAbsolute(process.env.CHROMIUM_PATH)
      ? process.env.CHROMIUM_PATH
      : resolve(process.cwd(), process.env.CHROMIUM_PATH);
    if (!existsSync(executablePath)) throw new Error(`CHROMIUM_PATH does not exist: ${executablePath}`);
    launchOptions.executablePath = executablePath;
  }

  let browser;
  try {
    try {
      browser = await chromium.launch(launchOptions);
    } catch (error) {
      throw new Error(
        `Chromium could not start (${error.message}). Install the Playwright Chromium browser ` +
        "or set CHROMIUM_PATH to an executable file.",
      );
    }

    const viewport = format === "story"
      ? { width: 1080, height: 1920 }
      : { width: 1080, height: 1350 };
    const page = await browser.newPage({ viewport });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(pathToFileURL(template).href, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);

    if (format === "story") {
      const target = page.locator("#st");
      if (await target.count() !== 1) throw new Error("story.html must contain exactly one #st render target");
      await target.screenshot({ path: join(outputDirectory, "story.png") });
    } else {
      const slides = page.locator("section.sl");
      const slideCount = await slides.count();
      if (slideCount !== 3) throw new Error(`post.html must contain exactly 3 slides; found ${slideCount}`);
      for (const slide of await slides.all()) {
        const id = await slide.getAttribute("id");
        if (!id || !/^p\d+$/.test(id)) throw new Error(`invalid slide id: ${id || "(empty)"}`);
        await slide.screenshot({ path: join(outputDirectory, `post-${id.slice(1)}.png`) });
      }
    }

    if (pageErrors.length) throw new Error(`template runtime error: ${pageErrors.join("; ")}`);
    console.log(
      `rendered ${format} → ${outputDirectory}` +
        (brief.verified === true ? " (brief verified)" : " (UNVERIFIED brief — layout draft only)"),
    );
  } finally {
    // Chromium must be released even if navigation or a screenshot fails.
    if (browser) await browser.close();
  }
}

render().catch((error) => {
  console.error(`render failed: ${error.message}`);
  process.exitCode = 1;
});

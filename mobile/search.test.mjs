import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSearchIndex,
  escapeHtml,
  isSafeSkillPath,
  isSkillsPayload,
  searchSkills,
  tokenize,
} from "./search.mjs";

const skills = [
  {
    n: "design-logo",
    d: "graphic-design",
    p: "psk/data/skills/design-logo/SKILL.md",
    t: ["طراحی لوگو", "brand mark"],
  },
  {
    n: "photo-restyler",
    d: "image-ai",
    p: "library/skills/photo-restyler/SKILL.md",
    t: ["طراحی تصویر", "image treatment"],
  },
  {
    n: "react-performance",
    d: "web-development",
    p: "library/github-skills/react-performance/SKILL.md",
    t: ["web performance"],
  },
];

test("tokenization normalizes Persian variants and maps Persian/Finglish aliases", () => {
  assert.deepEqual(tokenize("كدنویسی با گرافیک و tarahi"), ["code", "design", "design"]);
});

test("search prioritizes skill-name hits over trigger-only hits", () => {
  const index = buildSearchIndex(skills);
  const result = searchSkills(index, "طراحی", "", 10);
  assert.deepEqual(result.map((skill) => skill.n), ["design-logo", "photo-restyler"]);
});

test("search respects domain filtering, limits, and stable ordering", () => {
  const index = buildSearchIndex([
    skills[0],
    { ...skills[0], n: "design-badge" },
    skills[1],
  ]);
  assert.deepEqual(searchSkills(index, "design", "graphic-design", 1).map((skill) => skill.n), ["design-logo"]);
  assert.deepEqual(searchSkills(index, "", "graphic-design", 10).map((skill) => skill.n), ["design-logo", "design-badge"]);
  assert.deepEqual(searchSkills(index, "design", "", 0), []);
});

test("HTML escaping protects text and double-quoted attributes", () => {
  assert.equal(escapeHtml(`\"><img src=x onerror='alert(1)'>&`), "&quot;&gt;&lt;img src=x onerror=&#39;alert(1)&#39;&gt;&amp;");
});

test("skill paths are limited to canonical repository locations", () => {
  assert.equal(isSafeSkillPath("library/github-skills/react-performance/SKILL.md"), true);
  assert.equal(isSafeSkillPath("https://evil.example/SKILL.md"), false);
  assert.equal(isSafeSkillPath("library/skills/../../outside/SKILL.md"), false);
  assert.equal(isSafeSkillPath("library/skills/skill/README.md"), false);
});

test("the downloaded index payload is schema- and shape-checked", () => {
  assert.equal(isSkillsPayload({
    schema: "mega-skills-mobile/v1",
    counts: { routable_skills: skills.length },
    skills,
  }), true);
  assert.equal(isSkillsPayload({ schema: "mega-skills-mobile/v1", counts: { routable_skills: 1 }, skills }), false);
  assert.equal(isSkillsPayload({ schema: "unexpected", counts: { routable_skills: 0 }, skills: [] }), false);
});

// Regressions from the 2026-10-18 audit (each failed before its fix).
test("diacritics, tatweel, heh variants and Persian digits normalize away", () => {
  assert.deepEqual(tokenize("کُد"), ["code"]);
  assert.deepEqual(tokenize("کـد"), ["code"]);
  assert.deepEqual(tokenize("خانۀ"), ["خانه"]);
  assert.deepEqual(tokenize("۳d"), ["3d"]);
});

test("prototype words stay strings instead of resolving to Object.prototype", () => {
  assert.deepEqual(tokenize("constructor toString"), ["constructor", "tostring"]);
  const index = buildSearchIndex([{ ...skills[0], t: ["constructor pattern"] }]);
  assert.equal(searchSkills(index, "constructor", "", 10).length, 1);
});

test("a query of only stop words or marks matches nothing, not the whole library", () => {
  const index = buildSearchIndex(skills);
  assert.deepEqual(searchSkills(index, "برای و", "", 10), []);
  assert.deepEqual(searchSkills(index, "a", "", 10), [], "a single letter is not a query");
  assert.equal(searchSkills(index, "   ", "", 10).length, skills.length, "blank still browses");
});

test("ZWNJ compounds match with ZWNJ, a space, or nothing between the parts", () => {
  const index = buildSearchIndex([{ ...skills[0], n: "social-kit", t: ["شبکه‌های اجتماعی"] }]);
  for (const query of ["شبکه‌های", "شبکه های", "شبکههای"]) {
    assert.deepEqual(searchSkills(index, query, "", 10).map((s) => s.n), ["social-kit"], query);
  }
});

test("covering every query word outranks one strong name hit", () => {
  const index = buildSearchIndex([
    { ...skills[0], n: "design-brief", t: ["brief"] },
    { ...skills[0], n: "mark-explorer", t: ["طراحی لوگو"] },
  ]);
  assert.deepEqual(searchSkills(index, "طراحی لوگو", "", 10).map((s) => s.n), ["mark-explorer", "design-brief"]);
});

test("the last word matches as a prefix while it is still being typed", () => {
  const index = buildSearchIndex(skills);
  assert.deepEqual(searchSkills(index, "reac", "", 10).map((s) => s.n), ["react-performance"]);
  assert.deepEqual(searchSkills(index, "re", "", 10), [], "two letters are too short to prefix-match");
});

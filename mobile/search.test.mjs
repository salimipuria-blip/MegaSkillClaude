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

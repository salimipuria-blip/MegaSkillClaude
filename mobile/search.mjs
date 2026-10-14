const ALIASES = {
  "طراحی": "design", "گرافیک": "design", "عکس": "image", "تصویر": "image",
  "تحلیل": "analysis", "داده": "data", "اکسل": "excel", "سایت": "website",
  "وبسایت": "website", "محتوا": "content", "فروش": "sales", "رشد": "growth",
  "ساخت": "create", "بساز": "create", "ویرایش": "edit", "ویدئو": "video",
  "ویدیو": "video", "اینستاگرام": "instagram", "پرامپت": "prompt",
  "اتوماسیون": "automation", "داشبورد": "dashboard", "کد": "code",
  "برنامه‌نویسی": "code", "پژوهش": "research", "تحقیق": "research",
  "بازاریابی": "marketing", "سفر": "travel", "ارائه": "presentation",
  "اسلاید": "presentation", "tarahi": "design", "aks": "image",
  "tahlil": "analysis", "dade": "data", "mohtava": "content",
  "foroosh": "sales", "roshd": "growth", "sakht": "create",
  "virayesh": "edit", "site": "website",
};

const STOP_WORDS = new Set([
  "a", "an", "the", "for", "of", "to", "and", "و", "در", "برای", "با",
  "از", "رو", "را", "می", "کن", "بده",
]);

/** Normalize common Arabic/Persian glyph variants before tokenization. */
export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u200c\u200d]/g, "")
    // ZWNJ-separated Persian compounds are split before alias lookup unless
    // normalized as phrases here (e.g. «برنامه‌نویسی» -> code).
    .replace(/برنامه\s*نویسی/gu, " code ")
    .replace(/کد\s*نویسی/gu, " code ")
    .replace(/kod[\s-]*nevisi/gu, " code ");
}

/** Convert Persian, Finglish and English queries to comparable search tokens. */
export function tokenize(value) {
  return normalizeText(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
    .map((token) => ALIASES[token] || token);
}

/** Escape any index-provided value before it is placed into an HTML template. */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

/**
 * Only expose repository skill files in the generated console. This prevents a
 * malformed index entry from creating a traversal or an unexpected external URL.
 */
export function isSafeSkillPath(value) {
  if (typeof value !== "string" || !value.endsWith("/SKILL.md")) return false;
  if (!(value.startsWith("psk/data/skills/") || value.startsWith("library/skills/") ||
        value.startsWith("library/github-skills/"))) return false;
  return value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

/** Validate the compact payload before it is used by the UI. */
export function isSkillsPayload(payload) {
  if (!payload || payload.schema !== "mega-skills-mobile/v1" ||
      !Array.isArray(payload.skills) ||
      !Number.isInteger(payload.counts?.routable_skills) ||
      payload.counts.routable_skills !== payload.skills.length) return false;

  return payload.skills.every((skill) =>
    skill && typeof skill.n === "string" && skill.n.length > 0 &&
    typeof skill.d === "string" && skill.d.length > 0 &&
    isSafeSkillPath(skill.p) && Array.isArray(skill.t) &&
    skill.t.every((trigger) => typeof trigger === "string"));
}

/**
 * Build the token index once after download instead of normalizing every trigger
 * on every keystroke. The source records are left untouched.
 */
export function buildSearchIndex(skills) {
  if (!Array.isArray(skills)) throw new TypeError("skills must be an array");

  return skills.map((skill, position) => ({
    skill,
    position,
    nameTokens: new Set(tokenize(String(skill.n).replace(/-/g, " "))),
    triggerTokens: new Set((Array.isArray(skill.t) ? skill.t : []).flatMap(tokenize)),
  }));
}

/** Return up to `limit` matching source skills, with deterministic tie order. */
export function searchSkills(searchIndex, query, domain = "", limit = 60) {
  if (!Array.isArray(searchIndex)) throw new TypeError("searchIndex must be an array");
  const safeLimit = Number.isInteger(limit) && limit >= 0 ? limit : 60;
  if (safeLimit === 0) return [];

  const queryTokens = tokenize(query);
  const matches = [];

  for (const entry of searchIndex) {
    const { skill, position, nameTokens, triggerTokens } = entry;
    if (domain && skill.d !== domain) continue;

    if (queryTokens.length === 0) {
      matches.push({ skill, position, score: 1 });
      continue;
    }

    let score = 0;
    let hits = 0;
    for (const token of queryTokens) {
      if (nameTokens.has(token)) {
        score += 5;
        hits += 1;
      } else if (triggerTokens.has(token)) {
        score += 2;
        hits += 1;
      }
    }
    if (hits > 0) matches.push({ skill, position, score });
  }

  matches.sort((left, right) => right.score - left.score || left.position - right.position);
  return matches.slice(0, safeLimit).map(({ skill }) => skill);
}

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
  "لوگو": "logo", "برند": "brand", "سئو": "seo", "ایمیل": "email",
  "پادکست": "podcast",
};

const STOP_WORDS = new Set([
  "a", "an", "the", "for", "of", "to", "and", "و", "در", "برای", "با",
  "از", "رو", "را", "می", "کن", "بده",
  // Plural/adjective suffixes that become standalone words when a phone keyboard
  // types a space instead of a ZWNJ («شبکه های»); alone they match everything.
  "ها", "های", "هایی", "ای", "تر", "ترین",
]);

const PERSIAN_DIGITS = /[\u06f0-\u06f9\u0660-\u0669]/g;
const digitValue = (character) => String(character.charCodeAt(0) & 0xf);

/** Normalize common Arabic/Persian glyph variants before tokenization. */
export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    // Harakat, superscript alef and tatweel are decoration: «کُد» and «کـد» are «کد».
    .replace(/[\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ةۀە]/g, "ه")
    .replace(/[أإٱ]/g, "ا")
    .replace(PERSIAN_DIGITS, digitValue)
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
    // Own keys only: a plain-object lookup would turn "constructor" or "tostring"
    // into Object.prototype functions instead of strings.
    .map((token) => (Object.hasOwn(ALIASES, token) ? ALIASES[token] : token));
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
    // A ZWNJ compound («شبکه‌های») is indexed joined and split, so it matches whether
    // the keyboard typed a ZWNJ, nothing, or a plain space between the parts.
    triggerTokens: new Set((Array.isArray(skill.t) ? skill.t : []).flatMap((trigger) =>
      /[\u200c\u200d]/.test(trigger)
        ? [...tokenize(trigger), ...tokenize(String(trigger).replace(/[\u200c\u200d]/g, " "))]
        : tokenize(trigger))),
  }));
}

/** Return up to `limit` matching source skills, with deterministic tie order. */
export function searchSkills(searchIndex, query, domain = "", limit = 60) {
  if (!Array.isArray(searchIndex)) throw new TypeError("searchIndex must be an array");
  const safeLimit = Number.isInteger(limit) && limit >= 0 ? limit : 60;
  if (safeLimit === 0) return [];

  const queryTokens = tokenize(query);
  // Text that tokenizes to nothing (only stop words, marks or single letters) is
  // not an empty query: it must not "match" the whole library.
  if (queryTokens.length === 0 && normalizeText(query).trim() !== "") return [];
  // The last word may still be mid-typing («reac»): let it match as a prefix.
  const lastToken = queryTokens[queryTokens.length - 1];
  const prefixToken = lastToken && lastToken.length >= 3 ? lastToken : "";
  const hasPrefix = (tokens) => {
    for (const token of tokens) if (token.startsWith(prefixToken)) return true;
    return false;
  };
  const matches = [];

  for (const entry of searchIndex) {
    const { skill, position, nameTokens, triggerTokens } = entry;
    if (domain && skill.d !== domain) continue;

    if (queryTokens.length === 0) {
      matches.push({ skill, position, hits: 0, score: 1 });
      continue;
    }

    let score = 0;
    let hits = 0;
    queryTokens.forEach((token, index) => {
      if (nameTokens.has(token)) {
        score += 5;
        hits += 1;
      } else if (triggerTokens.has(token)) {
        score += 2;
        hits += 1;
      } else if (prefixToken && index === queryTokens.length - 1) {
        if (hasPrefix(nameTokens)) {
          score += 2;
          hits += 1;
        } else if (hasPrefix(triggerTokens)) {
          score += 1;
          hits += 1;
        }
      }
    });
    if (hits > 0) matches.push({ skill, position, hits, score });
  }

  // Covering more of the request beats one strong word: «طراحی لوگو» must rank
  // logo skills above every skill that merely has "design" in its name.
  matches.sort((left, right) =>
    right.hits - left.hits || right.score - left.score || left.position - right.position);
  return matches.slice(0, safeLimit).map(({ skill }) => skill);
}

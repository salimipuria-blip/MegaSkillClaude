import {
  buildSearchIndex,
  escapeHtml,
  isSkillsPayload,
  searchSkills,
} from "./search.mjs";

"use strict";
const REPO = "salimipuria-blip/MegaSkillClaude";
const GH = `https://github.com/${REPO}`;
const VSCODE = `https://vscode.dev/github/${REPO}`;
const $ = (selector) => document.querySelector(selector);
const MAX_VISIBLE_SKILLS = 60;

const DOMAIN_FA = {
  "web-development": "توسعهٔ وب", "agents-automation": "ایجنت و اتوماسیون",
  "business-sales": "کسب‌وکار و فروش", "content-writing": "تولید محتوا",
  "data-spreadsheets": "داده و اکسل", "general": "عمومی",
  "graphic-design": "طراحی گرافیک", "image-ai": "هوش مصنوعی تصویر",
  "knowledge-research": "پژوهش و دانش", "product-design": "طراحی محصول",
  "prompt-requirements": "پرامپت و نیازمندی", "skill-development": "ساخت مهارت",
  "social-media": "شبکه‌های اجتماعی", "travel-outdoors": "سفر و طبیعت",
  "video-ai": "هوش مصنوعی ویدئو",
};

const PROJECTS = [
  { id: "psk", name: "MEGA SKILLS 3000", fa: "موتور ۳۰۰۰ مهارت", path: "psk", test: "node scripts/doctor.mjs psk", desc: "سایت فارسی و موتور مسیریابی مهارت‌ها روی Vercel" },
  { id: "hermes", name: "Hermes", fa: "دستیار تلگرامی هرمس", path: "hermes", test: "node scripts/doctor.mjs hermes", desc: "بات ۲۴/۷ روی Cloudflare Worker + نصب‌کنندهٔ Oracle" },
  { id: "fjcod", name: "CHAM Store OS", fa: "سامانهٔ فروشگاه چام", path: "fjcod", test: "node scripts/doctor.mjs fjcod", desc: "React 19 + TypeScript؛ در مسیر مهاجرت به بک‌اند امن" },
  { id: "lithos", name: "Lithos", fa: "داشبورد خصوصی لیتوس", path: "lithos", test: "node scripts/doctor.mjs lithos", desc: "پایش اینستاگرام/Buffer با Supabase" },
  { id: "viking-team", name: "Viking Team", fa: "مرکز فرمان وایکینگ", path: "viking-team", test: "node scripts/doctor.mjs viking-team", desc: "تیم اجرایی آفرود؛ Supabase Auth و RLS" },
  { id: "viking-motion", name: "Viking Motion Study", fa: "مطالعهٔ حرکتی وایکینگ", path: "viking-team/motion", test: "node scripts/doctor.mjs viking-motion", desc: "نمونهٔ Remotion مستقل؛ هنوز در محصول ادغام نشده" },
  { id: "bison-brand-book", name: "BISON Brand Book", fa: "کتاب برند بایسون", path: "bison-brand-book", test: "node scripts/doctor.mjs bison-brand-book", desc: "برندبوک سینمایی Vite + GSAP" },
  { id: "orchestrator", name: "Orchestrator", fa: "ارکستریتور (تاریخی)", path: "orchestrator", test: "node scripts/doctor.mjs orchestrator", desc: "توابع قدیمی Supabase Edge؛ مرجع مهاجرت" },
  { id: "router", name: "Skill Library & Router", fa: "کتابخانه و مسیریاب مهارت‌ها", path: "plugins/mega-skills-router", test: "node scripts/doctor.mjs router", desc: "منبع canonical، sync و پلاگین قابل‌نصب" },
  { id: "brand-stickers", name: "Viking Sticker Packs", fa: "استیکرهای وایکینگ آفرود", path: "brands/viking-offroad", test: "node scripts/doctor.mjs brand-stickers", desc: "۱۲ پک، ۳۶۰ PNG شفاف و سورس ساخت" },
  { id: "brand-viking", name: "Viking Content Templates", fa: "قالب پست و استوری وایکینگ", path: "brand/viking", test: "node scripts/doctor.mjs brand-viking", desc: "قالب HTML و رندر محلی Playwright" },
  { id: "tasks", name: "Hermes Tasks", fa: "برنامهٔ تسک‌های هرمس", path: "tasks", test: "python3 tasks/apply_hermes_tasks.py --manifest tasks/hermes_tasks.json --validate-only", desc: "مانیفست و پلنر فقط‌خواندنی تسک‌ها" },
  { id: "mobile", name: "iPhone Console", fa: "همین کنسول آیفون", path: "mobile", test: "node scripts/doctor.mjs mobile", desc: "رابط موبایل VS Code و مهارت‌ها (همین صفحه)" },
];

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.remove("hidden");
  setTimeout(() => element.classList.add("hidden"), 1600);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  toast("کپی شد");
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-copy]");
  if (button) copyText(button.dataset.copy);
});

/* ---------- تب‌ها ---------- */
document.querySelectorAll(".tabbar button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tabbar button").forEach((tab) => tab.classList.remove("active"));
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
    button.classList.add("active");
    $(`#tab-${button.dataset.tab}`).classList.add("active");
    window.scrollTo({ top: 0 });
  });
});

/* ---------- پروژه‌ها / عملیات ---------- */
$("#openVscodeTop").href = VSCODE;
$("#openVscode").href = VSCODE;
$("#openGithubDev").href = `https://github.dev/${REPO}`;
$("#projectList").innerHTML = PROJECTS.map((project) => {
  const repositoryPath = project.path.split("/").map(encodeURIComponent).join("/");
  return `
  <article class="card"><h3>${escapeHtml(project.fa)} <small dir="ltr">${escapeHtml(project.name)}</small></h3><p>${escapeHtml(project.desc)}</p>
  <div class="row">
    <a class="btn primary" href="${VSCODE}/tree/main/${repositoryPath}" target="_blank" rel="noopener">باز کردن در VS Code</a>
    <a class="btn" href="${GH}/tree/main/${repositoryPath}" target="_blank" rel="noopener">گیت‌هاب</a>
    <button class="btn" data-copy="${escapeHtml(project.test)}">کپی دستور تست</button>
  </div></article>`;
}).join("");
$("#opsList").innerHTML = PROJECTS.map((project) => `
  <div class="item" style="cursor:default"><b>${escapeHtml(project.fa)}</b><small dir="ltr" style="text-align:left">${escapeHtml(project.test)}</small>
  <div class="row" style="margin-top:8px"><button class="btn" data-copy="${escapeHtml(project.test)}">کپی دستور</button></div></div>`).join("");

/* ---------- مهارت‌ها ---------- */
let SKILLS = [];
let SEARCH_INDEX = [];
let activeDomain = "";

async function loadSkills() {
  const status = $("#skillStatus");
  try {
    const response = await fetch("./skills-index.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!isSkillsPayload(payload)) throw new Error("invalid skills-index schema");

    SKILLS = payload.skills;
    SEARCH_INDEX = buildSearchIndex(SKILLS);
    status.textContent = `${SKILLS.length.toLocaleString("fa-IR")} مهارت آمادهٔ جست‌وجوست. یک حوزه یا عبارت جست‌وجو انتخاب کن.`;

    const counts = Object.create(null);
    SKILLS.forEach((skill) => { counts[skill.d] = (counts[skill.d] || 0) + 1; });
    $("#domainChips").innerHTML = `<button class="chip on" data-domain="">همه</button>` +
      Object.entries(counts).sort((left, right) => right[1] - left[1]).map(([domain, count]) =>
        `<button class="chip" data-domain="${escapeHtml(domain)}">${escapeHtml(DOMAIN_FA[domain] || domain)} (${count.toLocaleString("fa-IR")})</button>`,
      ).join("");
    renderSkills(searchSkills(SEARCH_INDEX, "", "", 30));
  } catch (error) {
    // Keep diagnostics useful without exposing fetched content or user data.
    console.warn("Could not load the local skills index:", error.message);
    status.textContent = "ایندکس مهارت‌ها بارگذاری نشد یا ساختار آن معتبر نیست؛ اتصال را بررسی و صفحه را تازه کن.";
  }
}
void loadSkills();

document.addEventListener("click", (event) => {
  const chip = event.target.closest(".chip");
  if (!chip) return;
  document.querySelectorAll(".chip").forEach((button) => button.classList.remove("on"));
  chip.classList.add("on");
  activeDomain = chip.dataset.domain;
  searchSkillsInUi();
});

let searchTimer;
$("#skillSearch").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(searchSkillsInUi, 180);
});

function searchSkillsInUi() {
  const matches = searchSkills(SEARCH_INDEX, $("#skillSearch").value, activeDomain, Number.MAX_SAFE_INTEGER);
  const query = $("#skillSearch").value.trim();
  $("#skillStatus").textContent = query || activeDomain
    ? `${matches.length.toLocaleString("fa-IR")} نتیجه`
    : `${SKILLS.length.toLocaleString("fa-IR")} مهارت آمادهٔ جست‌وجوست.`;
  renderSkills(matches.slice(0, MAX_VISIBLE_SKILLS));
}

function renderSkills(skills) {
  $("#skillResults").innerHTML = skills.length ? skills.map((skill) => `
    <button class="item" data-skill="${escapeHtml(skill.n)}"><b dir="ltr" style="text-align:left">${escapeHtml(skill.n)}</b>
    <span class="tag">${escapeHtml(DOMAIN_FA[skill.d] || skill.d)}</span>
    <small>${escapeHtml(skill.t[1] || skill.t[0] || "")}</small></button>`).join("")
    : `<p class="status">نتیجه‌ای پیدا نشد؛ مترادف دیگری امتحان کن (فارسی/انگلیسی).</p>`;
}

document.addEventListener("click", (event) => {
  const item = event.target.closest("[data-skill]");
  if (!item) return;
  const skill = SKILLS.find((entry) => entry.n === item.dataset.skill);
  if (!skill) return;

  const safePath = skill.p.split("/").map(encodeURIComponent).join("/");
  const skillUrl = `${VSCODE}/blob/main/${safePath}`;
  const githubUrl = `${GH}/blob/main/${safePath}`;
  const prompt = `با استفاده از مهارت «${skill.n}» این کار را انجام بده: فایل ${skill.p} را کامل بخوان و دستورالعملش را اعمال کن. کار من: `;
  $("#skillSheet").innerHTML = `
    <h3>${escapeHtml(skill.n)}</h3>
    <p class="meta">حوزه: ${escapeHtml(DOMAIN_FA[skill.d] || skill.d)}<br>مسیر فایل مهارت: <code>${escapeHtml(skill.p)}</code><br>تریگرها: ${escapeHtml(skill.t.join(" · "))}</p>
    <div class="row">
      <button class="btn orange" data-copy="${escapeHtml(prompt)}">کپی پرامپت آماده برای Claude</button>
      <a class="btn primary" href="${escapeHtml(skillUrl)}" target="_blank" rel="noopener">خواندن مهارت در VS Code</a>
      <a class="btn" href="${escapeHtml(githubUrl)}" target="_blank" rel="noopener">مشاهده در گیت‌هاب</a>
      <button class="btn" id="closeSheet">بستن</button>
    </div>
    <p class="meta">در VS Code کافی است پرامپت کپی‌شده را به Claude بدهی؛ مسیریاب مهارت‌ها (<code>mega-skills-router</code>) چون داخل <code>.claude/skills/</code> این ریپوست، خودکار همین فایل را پیدا می‌کند.</p>`;
  $("#skillSheet").classList.remove("hidden");
  $("#sheetBackdrop").classList.remove("hidden");
  $("#closeSheet").addEventListener("click", closeSheet);
});

function closeSheet() {
  $("#skillSheet").classList.add("hidden");
  $("#sheetBackdrop").classList.add("hidden");
}

$("#sheetBackdrop").addEventListener("click", closeSheet);

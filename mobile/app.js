"use strict";
const REPO = "salimipuria-blip/MegaSkillClaude";
const GH = `https://github.com/${REPO}`;
const VSCODE = `https://vscode.dev/github/${REPO}`;
const $ = (s) => document.querySelector(s);

const DOMAIN_FA = {
  "web-development":"توسعهٔ وب","agents-automation":"ایجنت و اتوماسیون","business-sales":"کسب‌وکار و فروش",
  "content-writing":"تولید محتوا","data-spreadsheets":"داده و اکسل","general":"عمومی",
  "graphic-design":"طراحی گرافیک","image-ai":"هوش مصنوعی تصویر","knowledge-research":"پژوهش و دانش",
  "product-design":"طراحی محصول","prompt-requirements":"پرامپت و نیازمندی","skill-development":"ساخت مهارت",
  "social-media":"شبکه‌های اجتماعی","travel-outdoors":"سفر و طبیعت","video-ai":"هوش مصنوعی ویدئو"
};

const PROJECTS = [
  {id:"psk", name:"MEGA SKILLS 3000", fa:"موتور ۳۰۰۰ مهارت", path:"psk", test:"cd psk && npm run check && npm test", desc:"سایت فارسی و موتور مسیریابی مهارت‌ها روی Vercel"},
  {id:"hermes", name:"Hermes", fa:"دستیار تلگرامی هرمس", path:"hermes", test:"npm run check --prefix hermes && npm test --prefix hermes && npm run test:integration --prefix hermes", desc:"بات ۲۴/۷ روی Cloudflare Worker + نصب‌کنندهٔ Oracle"},
  {id:"fjcod", name:"CHAM Store OS", fa:"سامانهٔ فروشگاه چام", path:"fjcod", test:"cd fjcod && npm ci && npm run check", desc:"React 19 + TypeScript؛ در مسیر مهاجرت به بک‌اند امن"},
  {id:"lithos", name:"Lithos", fa:"داشبورد خصوصی لیتوس", path:"lithos", test:"cd lithos && npm test && npm run build", desc:"پایش اینستاگرام/Buffer با Supabase"},
  {id:"viking-team", name:"Viking Team", fa:"مرکز فرمان وایکینگ", path:"viking-team", test:"cd viking-team && node --test tests/*.test.mjs && python3 -m unittest discover -s tests -v", desc:"تیم اجرایی آفرود؛ Supabase Auth و RLS"},
  {id:"bison", name:"BISON Brand Book", fa:"کتاب برند بایسون", path:"bison-brand-book", test:"cd bison-brand-book && npm ci && npm run build", desc:"برندبوک سینمایی Vite + GSAP"},
  {id:"orchestrator", name:"Orchestrator", fa:"ارکستریتور (تاریخی)", path:"orchestrator", test:"cd orchestrator && python scripts/audit/check_repository_contract.py && python -m pytest -q -ra tests", desc:"توابع قدیمی Supabase Edge؛ مرجع مهاجرت"},
  {id:"tasks", name:"Hermes Tasks", fa:"برنامهٔ ۱۰۰ تسک هرمس", path:"tasks", test:"python3 tasks/apply_hermes_tasks.py --manifest tasks/hermes_tasks.json --validate-only", desc:"مانیفست و پلنر فقط‌خواندنی تسک‌ها"},
  {id:"mobile", name:"iPhone Console", fa:"همین کنسول آیفون", path:"mobile", test:"python3 mobile/build-index.py --check", desc:"رابط موبایل VS Code و مهارت‌ها (همین صفحه)"}
];

function toast(msg){ const t=$("#toast"); t.textContent=msg; t.classList.remove("hidden"); setTimeout(()=>t.classList.add("hidden"),1600); }
async function copyText(text){
  try{ await navigator.clipboard.writeText(text); }
  catch{ const ta=document.createElement("textarea"); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
  toast("کپی شد");
}
document.addEventListener("click",(e)=>{ const b=e.target.closest("[data-copy]"); if(b) copyText(b.dataset.copy); });

/* ---------- تب‌ها ---------- */
document.querySelectorAll(".tabbar button").forEach((btn)=>{
  btn.addEventListener("click",()=>{
    document.querySelectorAll(".tabbar button").forEach(b=>b.classList.remove("active"));
    document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
    btn.classList.add("active"); $("#tab-"+btn.dataset.tab).classList.add("active");
    window.scrollTo({top:0});
  });
});

/* ---------- پروژه‌ها / عملیات ---------- */
$("#openVscodeTop").href = VSCODE; $("#openVscode").href = VSCODE;
$("#openGithubDev").href = `https://github.dev/${REPO}`;
$("#projectList").innerHTML = PROJECTS.map(p=>`
  <article class="card"><h3>${p.fa} <small dir="ltr">${p.name}</small></h3><p>${p.desc}</p>
  <div class="row">
    <a class="btn primary" href="${VSCODE}/tree/main/${p.path}" target="_blank" rel="noopener">باز کردن در VS Code</a>
    <a class="btn" href="${GH}/tree/main/${p.path}" target="_blank" rel="noopener">گیت‌هاب</a>
    <button class="btn" data-copy="${p.test.replace(/"/g,"&quot;")}">کپی دستور تست</button>
  </div></article>`).join("");
$("#opsList").innerHTML = PROJECTS.map(p=>`
  <div class="item" style="cursor:default"><b>${p.fa}</b><small dir="ltr" style="text-align:left">${p.test}</small>
  <div class="row" style="margin-top:8px"><button class="btn" data-copy="${p.test.replace(/"/g,"&quot;")}">کپی دستور</button></div></div>`).join("");

/* ---------- مهارت‌ها ---------- */
const ALIASES = {"طراحی":"design","گرافیک":"design","عکس":"image","تصویر":"image","تحلیل":"analysis","داده":"data","اکسل":"excel","سایت":"website","وبسایت":"website","محتوا":"content","فروش":"sales","رشد":"growth","ساخت":"create","بساز":"create","ویرایش":"edit","ویدئو":"video","ویدیو":"video","اینستاگرام":"instagram","پرامپت":"prompt","اتوماسیون":"automation","داشبورد":"dashboard","کد":"code","برنامه‌نویسی":"code","پژوهش":"research","تحقیق":"research","بازاریابی":"marketing","سفر":"travel","ارائه":"presentation","اسلاید":"presentation",
"tarahi":"design","aks":"image","tahlil":"analysis","dade":"data","mohtava":"content","foroosh":"sales","roshd":"growth","sakht":"create","virayesh":"edit","site":"website"};
const STOP = new Set(["a","an","the","for","of","to","and","و","در","برای","با","از","رو","را","می","کن","بده"]);
const norm = (s)=> (s||"").normalize("NFKC").toLowerCase().replace(/[يى]/g,"ی").replace(/ك/g,"ک");
function tokens(s){ return norm(s).split(/[^\p{L}\p{N}]+/u).filter(t=>t.length>1&&!STOP.has(t)).map(t=>ALIASES[t]||t); }
let SKILLS=[], activeDomain="";
fetch("skills-index.json").then(r=>r.json()).then(d=>{
  SKILLS=d.skills;
  $("#skillStatus").textContent = `${SKILLS.length.toLocaleString("fa-IR")} مهارت آمادهٔ جست‌وجوست. یک حوزه یا عبارت جست‌وجو انتخاب کن.`;
  const counts={}; SKILLS.forEach(s=>counts[s.d]=(counts[s.d]||0)+1);
  $("#domainChips").innerHTML = `<button class="chip on" data-domain="">همه</button>` +
    Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([d,c])=>`<button class="chip" data-domain="${d}">${DOMAIN_FA[d]||d} (${c.toLocaleString("fa-IR")})</button>`).join("");
  renderSkills(SKILLS.slice(0,30));
}).catch(()=>{ $("#skillStatus").textContent="ایندکس مهارت‌ها بارگذاری نشد؛ اتصال شبکه را بررسی و صفحه را تازه کن."; });

document.addEventListener("click",(e)=>{
  const chip=e.target.closest(".chip"); if(!chip) return;
  document.querySelectorAll(".chip").forEach(c=>c.classList.remove("on")); chip.classList.add("on");
  activeDomain=chip.dataset.domain; searchSkills();
});
let timer; $("#skillSearch").addEventListener("input",()=>{ clearTimeout(timer); timer=setTimeout(searchSkills,180); });

function score(skill, qTokens){
  if(!qTokens.length) return 1;
  const nameT=new Set(tokens(skill.n.replace(/-/g," ")));
  let score=0, hits=0;
  for(const t of qTokens){
    if(nameT.has(t)){ score+=5; hits++; continue; }
    const inTriggers = skill.t.some(tr=>tokens(tr).includes(t));
    if(inTriggers){ score+=2; hits++; }
  }
  return hits ? score : 0;
}
function searchSkills(){
  const q = tokens($("#skillSearch").value);
  let pool = activeDomain ? SKILLS.filter(s=>s.d===activeDomain) : SKILLS;
  if(q.length){ pool = pool.map(s=>[score(s,q),s]).filter(([sc])=>sc>0).sort((a,b)=>b[0]-a[0]).map(([,s])=>s); }
  $("#skillStatus").textContent = q.length||activeDomain ? `${pool.length.toLocaleString("fa-IR")} نتیجه` : `${SKILLS.length.toLocaleString("fa-IR")} مهارت آمادهٔ جست‌وجوست.`;
  renderSkills(pool.slice(0,60));
}
function renderSkills(list){
  $("#skillResults").innerHTML = list.length ? list.map(s=>`
    <button class="item" data-skill="${s.n}"><b dir="ltr" style="text-align:left">${s.n}</b><span class="tag">${DOMAIN_FA[s.d]||s.d}</span>
    <small>${(s.t[1]||s.t[0]||"")}</small></button>`).join("")
    : `<p class="status">نتیجه‌ای پیدا نشد؛ مترادف دیگری امتحان کن (فارسی/انگلیسی).</p>`;
}
document.addEventListener("click",(e)=>{
  const item=e.target.closest("[data-skill]"); if(!item) return;
  const s=SKILLS.find(x=>x.n===item.dataset.skill); if(!s) return;
  const prompt=`با استفاده از مهارت «${s.n}» این کار را انجام بده: فایل ${s.p} را کامل بخوان و دستورالعملش را اعمال کن. کار من: `;
  $("#skillSheet").innerHTML = `
    <h3>${s.n}</h3>
    <p class="meta">حوزه: ${DOMAIN_FA[s.d]||s.d}<br>مسیر فایل مهارت: <code>${s.p}</code><br>تریگرها: ${s.t.join(" · ")}</p>
    <div class="row">
      <button class="btn orange" data-copy="${prompt.replace(/"/g,"&quot;")}">کپی پرامپت آماده برای Claude</button>
      <a class="btn primary" href="${VSCODE}/blob/main/${s.p}" target="_blank" rel="noopener">خواندن مهارت در VS Code</a>
      <a class="btn" href="${GH}/blob/main/${s.p}" target="_blank" rel="noopener">مشاهده در گیت‌هاب</a>
      <button class="btn" id="closeSheet">بستن</button>
    </div>
    <p class="meta">در VS Code کافی است پرامپت کپی‌شده را به Claude بدهی؛ مسیریاب مهارت‌ها (<code>mega-skills-router</code>) چون داخل <code>.claude/skills/</code> این ریپوست، خودکار همین فایل را پیدا می‌کند.</p>`;
  $("#skillSheet").classList.remove("hidden"); $("#sheetBackdrop").classList.remove("hidden");
  $("#closeSheet").addEventListener("click", closeSheet);
});
function closeSheet(){ $("#skillSheet").classList.add("hidden"); $("#sheetBackdrop").classList.add("hidden"); }
$("#sheetBackdrop").addEventListener("click", closeSheet);

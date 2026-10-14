import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Match whole stop words in the same normalized form as input (e.g. آن → ان).
const STOP = new Set('و در از به برای با که را این آن یک یا تا هم من تو ما شما خود روی اگر است می کنم کن انجام بده لطفا لطفاً چه چطور میخواهم میخوام بنویس want need please the a an and for my to in of create make do i you me it on use when or with'.split(' ').map(normalize));
// Persian ↔ English bridges so Persian requests reach English-named skills.
const roman = [['استوری','story'],['اینستاگرام','instagram'],['اینستا','instagram'],['طراحی','design'],['تصویر','image'],['عکس','photo'],['ویدیو','video'],['ویدئو','video'],['فیلم','video'],['سایت','website'],['وبسایت','website'],['وب','web'],['تحقیق','research'],['پژوهش','research'],['فروش','sales'],['مشتری','customer'],['تحلیل','analytics'],['داده','data'],['اکسل','excel'],['مهارت','skill'],['سناریو','scenario'],['اتوماسیون','automation'],['کد','code'],['لوگو','logo'],['رنگ','color'],['کسب','business'],['محتوا','content'],['عسل','honey'],['کافه','cafe'],['سفر','travel'],['قیمت','price'],['موبایل','mobile'],['پوستر','poster'],['بنر','banner'],['کپشن','caption'],['ریلز','reels'],['پست','post'],['تبلیغ','ad'],['تبلیغات','ads'],['ایمیل','email'],['خبرنامه','newsletter'],['فروشگاه','shop'],['فروشگاهی','ecommerce'],['جدول','sheet'],['گزارش','report'],['داشبورد','dashboard'],['پرامپت','prompt'],['ایجنت','agent'],['عامل','agent'],['برند','brand'],['هویت','identity'],['فونت','font'],['تایپوگرافی','typography'],['ارائه','presentation'],['اسلاید','slides'],['لندینگ','landing'],['سئو','seo'],['کمپین','campaign'],['تقویم','calendar'],['منو','menu'],['رستوران','restaurant'],['هتل','hotel'],['عروسی','wedding'],['دندانپزشکی','dental'],['کلینیک','clinic'],['آموزش','tutorial'],['ترجمه','translate'],['خلاصه','summary'],['مقاله','article'],['وبلاگ','blog'],['کاروسل','carousel'],['تامنیل','thumbnail'],['یوتیوب','youtube'],['تیک','tiktok'],['لینکدین','linkedin']];
const ROMAN = new Map(roman);
// Persian plural/possessive suffixes; a token also contributes its stem.
const SUFFIX = /(هایی|های|ها|ای|ی)$/u;

export function normalize(v) { return String(v||'').toLowerCase().normalize('NFKC').replace(/[أإآ]/g,'ا').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[ً-ٰٟ‏‪-‮]/g,'').replace(/‌/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim(); }
export function tokens(v) {
 // A pure number is not a topic: "90 day roadmap" must not reach "surya-ocr-90-langs".
 // Numeric-only queries therefore produce no tokens at all and route to nothing (see edge cases).
 const t=normalize(v).split(' ').filter(s=>s.length>1&&!STOP.has(s)&&!/^\p{N}+$/u.test(s));
 const out=new Set(t);
 for(const w of t){
   const stem=w.length>4?w.replace(SUFFIX,''):w;
   if(stem!==w&&stem.length>1)out.add(stem);
   for(const x of [w,stem])if(ROMAN.has(x))out.add(ROMAN.get(x));
 }
 return [...out];
}

function frontmatterDescription(text){
 const m=/^---\s*\n([\s\S]*?)\n---/.exec(text);if(!m)return '';
 const d=/^description:\s*(.*)$/m.exec(m[1]);if(!d)return '';
 return d[1].trim().replace(/^["']|["']$/g,'').slice(0,600);
}

/**
 * Load the metadata registry. With `skillsRoot`, every SKILL.md body is read and checked
 * against the registry's SHA-256 id (or the explicit repaired allowlist). Only verified bodies
 * are kept as `content`; their frontmatter description also enriches routing terms.
 */
export function loadRegistry(filename,{skillsRoot=null,repairedFile=null}={}) {
 const raw=JSON.parse(fs.readFileSync(filename,'utf8'));
 if(!Array.isArray(raw.skills)||raw.skills.length===0)throw Error('Invalid skill registry');
 const repaired=repairedFile&&fs.existsSync(repairedFile)?JSON.parse(fs.readFileSync(repairedFile,'utf8')).repaired||{}:{};
 const records=[],index=new Map(),content={verified:0,repaired:0,missing:0,rejected:0};
 const root=skillsRoot?fs.realpathSync(skillsRoot):null;
 for(const r of raw.skills){
   if(!r.skill_id||!r.name||!Array.isArray(r.triggers))continue;
   const record={id:r.skill_id,name:r.name,domain:r.domain||'general',triggers:r.triggers,source_path:r.source_path||null,content:null,contentStatus:'missing',description:''};
   if(root){const v=verifySkillFile(root,record,repaired[r.name]);record.contentStatus=v.status;content[v.status]++;
     if(v.text){record.content=v.text;record.description=frontmatterDescription(v.text);}}
   else content.missing++;
   const ts=[r.name,r.domain,...r.triggers];
   const tk=new Set([...ts,record.description].flatMap(tokens));
   record.terms=tk;record.phrases=ts.map(normalize);
   // Name-derived values are constant per skill (phrases[0] is normalize(name)); computing them once
   // at load instead of per candidate per request keeps the routing output identical.
   record.nameNorm=record.phrases[0];record.nameTokens=new Set(tokens(r.name));
   const n=records.push(record)-1;
   for(const term of tk){if(!index.has(term))index.set(term,[]);index.get(term).push(n);}
 }
 const idf=new Map();for(const [term,list] of index)idf.set(term,Math.log(1+records.length/list.length));
 return {records,index,idf,content,declaredSkills:raw.counts?.skills,declaredTriggers:raw.counts?.triggers};
}

// Imported SKILL.md is untrusted instruction data. It is hashed and read, never executed.
function verifySkillFile(root,record,repairedEntry){
 if(!record.source_path)return {status:'missing'};
 const relative=record.source_path.replace(/^mega-skills-3000\//,'');
 const candidate=path.resolve(root,relative);
 if(!candidate.startsWith(root+path.sep))return {status:'rejected',reason:'path traversal'};
 try{
   const real=fs.realpathSync(candidate);
   if(!real.startsWith(root+path.sep))return {status:'rejected',reason:'symlink escape'};
   const stat=fs.statSync(real);if(!stat.isFile()||stat.size>65536)return {status:'rejected',reason:'invalid skill file size'};
   const data=fs.readFileSync(real);const digest='sha256:'+crypto.createHash('sha256').update(data).digest('hex');
   const text=data.toString('utf8');if(!text.trim())return {status:'rejected',reason:'empty skill'};
   if(digest===record.id)return {status:'verified',text};
   if(repairedEntry&&repairedEntry.registry_id===record.id&&repairedEntry.repaired_sha256===digest)return {status:'repaired',text};
   return {status:'rejected',reason:'SHA-256 differs from registry; not trusted'};
 }catch(e){return {status:e.code==='ENOENT'?'missing':'rejected',reason:e.message};}
}

export function routeSkills(registry,query,{limit=8}={}){
 const norm=normalize(query);const tk=tokens(query);
 if(!norm||!tk.length)return {selected:[],matches:0,queryTokens:tk};
 const c=new Set();for(const t of tk)for(const i of registry.index.get(t)||[])c.add(i);
 const idf=t=>registry.idf?.get(t)??0;
 // Weight of the query = rarest form of each typed word, so stems/aliases don't double-count.
 const queryWeight=tk.reduce((s,t)=>s+idf(t),0)||1;
 const domainSignals=[];
 // Patterns are matched against normalize()d text: آ/أ/إ fold to ا and ZWNJ is removed, so both
 // spellings are listed where it matters. A design artefact (banner, poster, menu, card, thumbnail)
 // asks for graphic-design, while the bare
 // word "web" is only a qualifier there ("typography for a web banner"): the web-development signal
 // stays only for queries that also name a real site surface.
 const designArtefact=/banner|poster|logo|typography|thumbnail|business card|menu|بنر|پوستر|لوگو|تایپوگرافی|کارت ویزیت|منو/.test(norm);
 const siteSurface=/website|site|page|landing|ecommerce|shop|فروشگاه|وبسایت|وب سایت|سایت|صفحه|لندینگ/.test(norm);
 if(/استوری|instagram|story|اینستاگرام|ریلز|reels/.test(norm))domainSignals.push(['social-media',0.65],['content-writing',0.12]);
 if(/design|طراحی|تصویر|image|عکس|photo|لوگو|logo|پوستر|poster/.test(norm))domainSignals.push(['graphic-design',0.17],['image-ai',0.10]);
 if(/website|وبسایت|وب سایت|سایت|web|landing|لندینگ/.test(norm)&&!(designArtefact&&!siteSurface))domainSignals.push(['web-development',0.75],['product-design',0.12]);
 if(/تحقیق|research|رقبا|بازار/.test(norm))domainSignals.push(['knowledge-research',0.35],['business-sales',0.13]);
 if(/فروش|sales|مشتری|customer/.test(norm))domainSignals.push(['business-sales',0.42]);
 if(/اکسل|excel|جدول|spreadsheet|sheet/.test(norm))domainSignals.push(['data-spreadsheets',0.6]);
 if(/ویدیو|video|فیلم|reels/.test(norm))domainSignals.push(['video-ai',0.2]);
 if(designArtefact&&!siteSurface)domainSignals.push(['graphic-design',0.15]);
 if(/translat|ترجمه|برگردان/.test(norm))domainSignals.push(['prompt-requirements',0.5]);
 if(/pricing|price|قیمت|strategy|استراتژی|business model|مدل کسب/.test(norm))domainSignals.push(['business-sales',0.32]);
 if(/podcast|پادکست|audio|صدا|noise|نویز|denoise/.test(norm))domainSignals.push(['video-ai',0.3]);
 if(/افرود|آفرود|offroad|off-road|کوهنوردی|hiking|camping|کمپینگ|کویر|desert|roadtrip|road trip|طبیعتگردی|طبیعت گردی/.test(norm))domainSignals.push(['travel-outdoors',0.5]);
 const wantsPlan=/طراحی|بساز|ساخت|سناریو|برنامه|create|design|make|build|plan|generate/.test(norm);
 const wantsPublish=/انتشار|منتشر|زمانبندی|زمان بندی|publish|post|schedule/.test(norm);
 const out=[];
 for(const i of c){const r=registry.records[i];let hits=0,weight=0;for(const w of tk)if(r.terms.has(w)){hits++;weight+=idf(w);}
   if(!hits)continue;
   let score=1.4*weight/queryWeight + hits/Math.max(r.terms.size,5)*0.65;
   if(r.phrases.some(p=>p.length>6&&norm.includes(p)))score+=2;
   if(norm.includes(r.nameNorm))score+=1;
   for(const token of tk)if(r.nameTokens.has(token))score+=0.12+0.08*idf(token);
   for(const [domain,bonus] of domainSignals)if(domain===r.domain)score+=bonus;
   if(wantsPlan&&/planner|generator|design|scripting|sequence|ideas|copy|frontend/.test(r.name))score+=0.19;
   if(wantsPlan&&!wantsPublish&&/repost|publisher|auto-publisher|monitor|scheduler|auditor|dm-export/.test(r.name))score-=0.26;
   if(/website|سایت|وبسایت/.test(norm)&&/landing-page-generator|frontend-design|website/.test(r.name))score+=0.25;
   if(/استوری|story/.test(norm)&&/story-sequence|story-engagement|storyboard/.test(r.name))score+=0.18;
   if(r.domain==='general')score-=0.05;
   out.push({id:r.id,name:r.name,domain:r.domain,score:Math.round(score*1000)/1000,triggerHits:hits,skillLoaded:!!r.content,contentStatus:r.contentStatus});
 }
 out.sort((a,b)=>b.score-a.score||b.triggerHits-a.triggerHits||a.name.localeCompare(b.name));
 return {selected:out.slice(0,Math.min(Math.max(limit,1),25)),matches:out.length,queryTokens:tk};
}

/** Verified instruction text for the selected skills; nothing is read from disk here. */
export function skillTexts(registry,selected,{maxEach=6000}={}){
 const loaded=[],missing=[],rejected=[];
 for(const item of selected){
   const r=registry.records.find(x=>x.id===item.id);
   if(!r||r.contentStatus==='missing')missing.push(item.name);
   else if(r.contentStatus==='rejected')rejected.push({name:item.name,reason:'integrity check failed'});
   else loaded.push({name:r.name,status:r.contentStatus,description:r.description,content:r.content.slice(0,maxEach)});
 }
 return {loaded,missing,rejected};
}

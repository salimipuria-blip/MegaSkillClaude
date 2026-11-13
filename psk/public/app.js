const slides = [
{no:17,kicker:'THE PROBLEM',title:'مسئله از <span>اینجا شروع می‌شود.</span>',desc:'پراکندگی ابزارها، هزینه متغیر و از دست رفتن زمینه؛ قبل از ساختن هر رابطی باید مسئله واقعی سیستم را روشن کنیم.',tag:'01 / PROBLEM DEFINITION'},
{no:4,kicker:'ONE INTELLIGENCE LAYER',title:'۳۰۰۰ مهارت؛ <span>یک هسته.</span>',desc:'یک لایه هماهنگ‌کننده که درخواست را دریافت می‌کند و مسیر مناسب را میان مهارت، مدل و ابزار تعیین می‌کند.',tag:'02 / CORE CONCEPT'},
{no:26,kicker:'SKILL REGISTRY',title:'هر مهارت، <span>هویت مشخص.</span>',desc:'رجیستری مهارت‌ها، نقطه شروع کشف، دسته‌بندی و فراخوانی قابل پیگیریِ قابلیت‌های سیستم است.',tag:'03 / SKILL SYSTEM'},
{no:1,kicker:'SKILL CHAINING',title:'زنجیره‌ای از <span>تصمیم‌های دقیق.</span>',desc:'کار پیچیده به گام‌های قابل مدیریت شکسته می‌شود؛ خروجی یک مهارت، ورودی مهارت بعدی را می‌سازد.',tag:'04 / ORCHESTRATION'},
{no:21,kicker:'INTELLIGENT ROUTING',title:'مسیر درست، <span>در زمان درست.</span>',desc:'به‌جای فعال‌سازی هم‌زمان همه ابزارها، مسیریاب بر اساس نوع درخواست، زمینه و محدودیت‌ها انتخاب می‌کند.',tag:'05 / ROUTING'},
{no:3,kicker:'LAZY LOADING',title:'فقط آنچه لازم است، <span>بارگذاری کن.</span>',desc:'بارگذاری انتخابی مهارت‌ها می‌تواند از شلوغی زمینه و اجرای غیرضروری جلوگیری کند؛ در این نمونه فعلاً فقط به‌صورت بصری روایت می‌شود.',tag:'06 / CONTEXT MANAGEMENT'},
{no:10,kicker:'MODEL STRATEGY',title:'هر مسئله، <span>مدل متناسب.</span>',desc:'لایه مدل‌ها باید انتخاب آگاهانه میان ارائه‌دهندگان و گزینه‌های محلی یا ابری را ممکن کند؛ بدون وابستگی نمایشی به یک نام ثابت.',tag:'07 / MODEL LAYER'},
{no:14,kicker:'LOCAL RUNTIME',title:'از ایده، <span>به اجرای قابل کنترل.</span>',desc:'محیط اجرا، مرز بین رابط زیبا و محصول واقعی است؛ این مرحله به مجوزها، ابزارهای اجرایی و گزارش نتیجه نیاز دارد.',tag:'08 / EXECUTION'},
{no:19,kicker:'REAL PROJECT STATUS',title:'وضعیت واقعی، <span>نه نمایش ساختگی.</span>',desc:'چیزی را «متصل» یا «فعال» می‌نامیم که واقعاً تست شده باشد. مسیریاب ابری در بخش «موتور ۳۰۰۰» واقعاً کار می‌کند؛ پاسخ مدل فقط وقتی فعال است که یک کلید مدل رایگان روی سرور تنظیم شده باشد.',tag:'09 / VERIFICATION'},
{no:5,kicker:'THE ROADMAP',title:'نمایش مفهومی، <span>سپس محصول.</span>',desc:'نخست تجربه سینماتیک و روایت؛ سپس رابط تعاملی، اتصال واقعی عامل‌ها، و در نهایت استقرار موبایل‌محور.',tag:'10 / NEXT STEPS'}
];
const manifest = Array.from({length:30},(_,i)=>({no:i+1,src:`assets/frame-${String(i+1).padStart(2,'0')}.webp`}));
const chapters=document.getElementById('chapters');
chapters.innerHTML=slides.map((s,i)=>`<section class="chapter observe" id="scene-${s.no}" data-chapter="${String(i+2).padStart(2,'0')}"><div class="chapter-copy"><div class="chapter-index">${String(i+2).padStart(2,'0')} / ${s.kicker}</div><h2>${s.title}</h2><p class="chapter-description">${s.desc}</p><div class="chapter-footer"><span class="chapter-tag">${s.tag}</span><button class="chapter-more" data-view="${s.no}">مشاهده فریم اصلی ↗</button></div></div><div class="frame-wrap"><div class="frame-shell"><img src="${manifest[s.no-1].src}" alt="فریم مرجع پروژه: ${s.kicker}" ${i<2?'':'loading="lazy"'} decoding="async"></div><div class="frame-info"><span>MEGA SKILLS 3000 / VISUAL SYSTEM</span><span>FRAME ${String(s.no).padStart(2,'0')} OF 30</span></div></div></section>`).join('');
const gallery=document.getElementById('gallery'),galleryGrid=document.getElementById('galleryGrid'),viewer=document.getElementById('galleryViewer'),viewerImage=document.getElementById('viewerImage'),viewerIndex=document.getElementById('viewerIndex');
let activeImage=1,lastFocus=null;
galleryGrid.innerHTML=manifest.map((a)=>`<button class="gallery-item" data-view="${a.no}" aria-label="باز کردن فریم ${a.no}"><img loading="lazy" decoding="async" src="${a.src}" alt="تصویر مرجع ${a.no}"><span>REFERENCE FRAME ${String(a.no).padStart(2,'0')} / 30</span></button>`).join('');
function openGallery(){lastFocus=document.activeElement;gallery.classList.add('open');gallery.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';document.getElementById('closeGallery').focus();document.getElementById('mobileNav').classList.remove('open');document.getElementById('mobileMenu').setAttribute('aria-expanded','false')}
function closeGallery(){gallery.classList.remove('open');gallery.setAttribute('aria-hidden','true');viewer.hidden=true;document.body.style.overflow='';lastFocus?.focus?.()}
function showImage(n){activeImage=(n+29)%30+1;viewer.hidden=false;viewerImage.src=manifest[activeImage-1].src;viewerImage.alt=`تصویر شماره ${activeImage} از ۳۰ فریم مرجع`;viewerIndex.textContent=`${String(activeImage).padStart(2,'0')} / 30`;document.getElementById('viewerClose').focus()}
['openGallery','openGalleryMobile','architectureGallery','endingGallery'].forEach(id=>document.getElementById(id).addEventListener('click',openGallery));
document.getElementById('closeGallery').addEventListener('click',closeGallery);document.getElementById('viewerClose').addEventListener('click',()=>{viewer.hidden=true;document.getElementById('closeGallery').focus()});document.getElementById('prevImage').addEventListener('click',()=>showImage(activeImage-1));document.getElementById('nextImage').addEventListener('click',()=>showImage(activeImage+1));
document.addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b){if(!gallery.classList.contains('open'))openGallery();showImage(Number(b.dataset.view))}});
document.addEventListener('keydown',e=>{if(!gallery.classList.contains('open'))return;if(e.key==='Escape'){if(!viewer.hidden){viewer.hidden=true;document.getElementById('closeGallery').focus()}else closeGallery()}if(!viewer.hidden&&e.key==='ArrowLeft')showImage(activeImage+1);if(!viewer.hidden&&e.key==='ArrowRight')showImage(activeImage-1)});
let swipeStart=null;viewer.addEventListener('touchstart',e=>{swipeStart=e.touches[0].clientX},{passive:true});viewer.addEventListener('touchend',e=>{if(swipeStart===null)return;const d=e.changedTouches[0].clientX-swipeStart;if(Math.abs(d)>45)showImage(activeImage+(d<0?1:-1));swipeStart=null},{passive:true});
const mobileMenu=document.getElementById('mobileMenu'),mobileNav=document.getElementById('mobileNav');mobileMenu.addEventListener('click',()=>{const next=!mobileNav.classList.contains('open');mobileNav.classList.toggle('open',next);mobileMenu.setAttribute('aria-expanded',String(next))});mobileNav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{mobileNav.classList.remove('open');mobileMenu.setAttribute('aria-expanded','false')}));
document.getElementById('openArchitecture').addEventListener('click',()=>document.getElementById('architecture').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}));
document.querySelectorAll('.node').forEach(n=>n.addEventListener('click',()=>document.getElementById('scene-'+n.dataset.target)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})));
const orb=document.getElementById('orb'),coreStatus=document.getElementById('coreStatus');let activeTimer=0;orb.addEventListener('click',()=>{orb.classList.toggle('active');coreStatus.textContent=orb.classList.contains('active')?'SYSTEM VISUALIZATION / ACTIVE DEMO':'SYSTEM VISUALIZATION / STANDBY';clearTimeout(activeTimer);if(orb.classList.contains('active'))activeTimer=setTimeout(()=>{orb.classList.remove('active');coreStatus.textContent='SYSTEM VISUALIZATION / STANDBY'},8000)});
const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('in-view')}),{threshold:.18});document.querySelectorAll('.observe').forEach(s=>observer.observe(s));
let updating=false;function updateProgress(){const max=document.documentElement.scrollHeight-innerHeight;document.getElementById('progressFill').style.height=`${max>0?Math.min(100,scrollY/max*100):0}%`;updating=false}addEventListener('scroll',()=>{if(!updating){updating=true;requestAnimationFrame(updateProgress)}},{passive:true});updateProgress();
const glow=document.querySelector('.cursor-glow');if(matchMedia('(pointer:fine)').matches)addEventListener('pointermove',e=>{glow.style.left=e.clientX+'px';glow.style.top=e.clientY+'px'},{passive:true});
// ——— SKILL GALAXY · یک کهکشان سه‌بُعدی از مهارت‌ها ———
const canvas=document.getElementById('spaceCanvas'),ctx=canvas.getContext('2d');
let ww=0,hh=0,dpr=1,tick=0,raf=0,mx=0,my=0;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const TAU=Math.PI*2;
// کهکشان: هستهٔ روشن + سه بازهٔ مارپیچی (۳۰۰۰ مهارت روی سه ردیف)
let core=[],arms=[],dust=[],shots=[];
function buildGalaxy(){
  const R=Math.min(ww,hh)*0.42, coreN=Math.floor(190+ww/6), armN=Math.floor(300+ww/2.6), dustN=90;
  core=Array.from({length:coreN},()=>{const r=Math.pow(Math.random(),1.8)*R*0.42,t=Math.random()*TAU,z=(Math.random()-.5)*R*.3;return{x:Math.cos(t)*r,y:(Math.random()-.5)*R*.34,z:Math.sin(t)*r*.82+z,r:Math.random()*1.15+.35,p:Math.random()*TAU,c:Math.random()<.24?'#8fd8ff':Math.random()<.5?'#e9f6ff':'#5fa8ff'}});
  arms=Array.from({length:armN},()=>{const arm=Math.floor(Math.random()*3),t=Math.pow(Math.random(),.72)*4.6+0.32,R0=Math.pow(t/5.1,1.12)*R+R*.16,spread=(Math.random()+Math.random()+Math.random()-1.5)*R*.15,ang=arm*(TAU/3)+t+spread*.012,r=Math.hypot(R0,spread);return{x:Math.cos(ang)*r,y:(Math.random()-.5)*R*.3*(1-t/6.4),z:Math.sin(ang)*r,r:Math.random()*1.35+.45,p:Math.random()*TAU,c:Math.random()<.18?'#ffd9a0':Math.random()<.5?'#9fe0ff':'#6db4ff',arm}});
  dust=Array.from({length:dustN},()=>({x:(Math.random()-.5)*ww*1.4,y:(Math.random()-.5)*hh*1.3,z:(Math.random()-.5)*900,r:Math.random()*.75+.2,p:Math.random()*TAU}));
  shots=[];
}
function project(p,rotY,tilt){
  const cos=Math.cos(rotY),sin=Math.sin(rotY);
  let x=p.x*cos+p.z*sin,z=-p.x*sin+p.z*cos,y=p.y;
  const ct=Math.cos(tilt),st=Math.sin(tilt);let y2=y*ct-z*st,z2=y*st+z*ct;y=y2;z=z2;
  const fov=Math.min(ww,hh)*1.35,d=fov+z+fov*0.32,s=fov/d;
  return{sx:ww/2+x*s+mx*(s*38),sy:hh/2+y*s+my*(s*26),s,z};
}
function resize(){ww=canvas.clientWidth;hh=canvas.clientHeight;dpr=Math.min(devicePixelRatio||1,1.75);canvas.width=Math.round(ww*dpr);canvas.height=Math.round(hh*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);buildGalaxy()}
resize();addEventListener('resize',resize,{passive:true});
if(matchMedia('(pointer:fine)').matches)addEventListener('pointermove',e=>{mx=(e.clientX/innerWidth-.5);my=(e.clientY/innerHeight-.5)},{passive:true});
function star(s,alpha){ctx.globalAlpha=Math.max(0,Math.min(1,alpha));ctx.fillStyle=s.c;ctx.shadowColor=s.c;ctx.shadowBlur=s.r>1.15?9:0;ctx.beginPath();ctx.arc(s.sx,s.sy,s.r*s.s,0,TAU);ctx.fill();ctx.shadowBlur=0;ctx.globalAlpha=1}
function drawFrame(){
  ctx.clearRect(0,0,ww,hh);
  const rotY=tick*0.0021+mx*0.35,tilt=0.62+my*0.18;
  // هالهٔ مرکزی
  const halo=project({x:0,y:0,z:0},rotY,tilt);
  const haloR=Math.min(ww,hh)*.24*halo.s;
  const g=ctx.createRadialGradient(halo.sx,halo.sy,0,halo.sx,halo.sy,haloR);
  g.addColorStop(0,'rgba(150,224,255,.9)');g.addColorStop(.18,'rgba(96,186,255,.55)');g.addColorStop(.45,'rgba(38,120,235,.22)');g.addColorStop(1,'rgba(0,30,80,0)');
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(halo.sx,halo.sy,haloR,0,TAU);ctx.fill();
  // غبار دوردست (پارالاکس معکوس)
  for(const p of dust){const q=project(p,rotY*.18,tilt*.7);ctx.globalAlpha=.34+.3*Math.sin(tick*.01+p.p);ctx.fillStyle='#7fb6e8';ctx.beginPath();ctx.arc(q.sx,q.sy,Math.max(.3,p.r*q.s),0,TAU);ctx.fill();ctx.globalAlpha=1}
  // ستاره‌ها (دوردست به نزدیک)
  const all=[...core,...arms];for(const o of all)o.j=project(o,rotY,tilt);all.sort((a,b)=>a.j.z-b.j.z);
  for(const o of all){const tw=.5+.5*Math.sin(tick*.016+o.p);star(o.j,.28+.62*tw)}
  // سه «مهارتِ راستین» نورانی روی بازوها
  for(let i=0;i<3;i++){const o=arms[(i*97+tick/240|0)%arms.length];if(o){const q=project(o,rotY,tilt);ctx.globalAlpha=.55+.4*Math.sin(tick*.03+i*2);ctx.strokeStyle='#bfeaff';ctx.lineWidth=1;ctx.beginPath();ctx.arc(q.sx,q.sy,7*q.s+3*Math.sin(tick*.05+i),0,TAU);ctx.stroke();ctx.globalAlpha=1}}
  // شهاب‌ها
  if(!reduced&&Math.random()<.012)shots.push({x:Math.random()*ww*.7+ww*.15,y:Math.random()*hh*.3,vx:-(4+Math.random()*4),vy:2.2+Math.random()*1.6,life:1});
  shots=shots.filter(s=>s.life>0);for(const s of shots){ctx.globalAlpha=s.life;const grad=ctx.createLinearGradient(s.x,s.y,s.x-s.vx*16,s.y-s.vy*16);grad.addColorStop(0,'#eaf7ff');grad.addColorStop(1,'rgba(140,210,255,0)');ctx.strokeStyle=grad;ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(s.x-s.vx*16,s.y-s.vy*16);ctx.stroke();ctx.globalAlpha=1;s.x+=s.vx;s.y+=s.vy;s.life-=.016}
  tick++;
}
function render(){drawFrame();if(!reduced)raf=requestAnimationFrame(render)}
render();
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!reduced){cancelAnimationFrame(raf);render()}else cancelAnimationFrame(raf)});

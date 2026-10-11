// VIKING / private team client. The key below is a public/anon browser key, NEVER a service-role key.
const URL = 'https://aupkeramhsufnmhkbihl.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1cGtlcmFtaHN1Zm5taGtiaWhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxNjI2NzUsImV4cCI6MjEwNDczODY3NX0.SATIibEZdkZc_cFo3vm4_9HGj_NJHeUblC2v4gBi6EI';
const $ = (id) => document.getElementById(id);
const esc = (text = '') => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels = {trip:'سفر',task:'وظیفه',experience:'تجربه',report:'گزارش'};
const tables = {trip:'trips',task:'tasks',experience:'experiences',report:'reports'};
const statuses = {trip:['در حال برنامه‌ریزی','ثبت‌نام باز','تکمیل ظرفیت','انجام شد'],task:['باز','در حال انجام','انجام شد']};
let api, session=null, members=[], records=[], photos=[], selectedView='home', editing=null, memberRole='member', refreshTimer=null, noticeTimer=null, mediaUrls=[];
const motionPreferenceKey='viking-reduce-motion';
function notify(message,error=false){const n=$('notice');n.textContent=message;n.className=(error?'error ':'')+'visible';clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>n.className='',6500)}
function errorText(error){return String(error?.message||error||'خطای نامشخص');}
function setBusy(button,busy){if(button)button.disabled=busy;}
function setStatus(label,offline=false){$('connectionStatus').textContent=label;document.querySelector('.live-dot')?.classList.toggle('offline',offline);}
function applyMotionPreference(reduce){document.body.classList.toggle('reduce-motion',reduce);$('motionToggle').checked=reduce;localStorage.setItem(motionPreferenceKey,reduce?'1':'0')}
function updateSettings(){if(!session)return;$('settingsEmail').textContent=session.user.email||'—';$('settingsRole').textContent=memberRole==='admin'?'مدیر تیم':'عضو اجرایی';$('settingsWorkspace').textContent='متصل · دادهٔ مشترک';}
async function init(){
 try{
  const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.49.0?bundle').catch(()=>import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.0/+esm'));
  api=createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const result=await api.auth.getSession();if(result.error)throw result.error;
  $('loadStatus').textContent='اتصال امن آماده است.';session=result.data.session;await enter();
  api.auth.onAuthStateChange((event,updated)=>{if(event==='SIGNED_IN'&&updated?.user?.id!==session?.user?.id){session=updated;setTimeout(()=>enter(),0)}else if(event==='SIGNED_OUT'){session=null;leave()}});
 }catch(e){$('auth').hidden=false;notify('اتصال سرویس ورود برقرار نشد؛ اینترنت را بررسی و صفحه را تازه‌سازی کنید. '+errorText(e),true)}
}
function leave(){if(refreshTimer)clearInterval(refreshTimer);refreshTimer=null;session=null;records=[];photos=[];members=[];releaseUrls();$('app').hidden=true;$('auth').hidden=false;setStatus('خارج از حساب',true)}
async function enter(){if(!session){leave();return}setStatus('در حال اتصال…');
 const r=await api.from('viking_team_members').select('email,role,active,added_at').eq('active',true).order('added_at');
 if(r.error){leave();notify('مجوز تیم بررسی نشد: '+errorText(r.error),true);return}
 const mine=r.data?.find(m=>m.email.toLowerCase()===session.user.email?.toLowerCase());
 if(!mine){await api.auth.signOut();leave();notify('این ایمیل هنوز توسط مدیر وایکینگ به تیم دعوت نشده است.',true);return}
 members=r.data||[];memberRole=mine.role;session=session||((await api.auth.getSession()).data.session);
 $('auth').hidden=true;$('app').hidden=false;$('profileButton').textContent=(session.user.email||'V').slice(0,2).toUpperCase();$('heroDate').textContent=new Date().toLocaleDateString('fa-IR');$('inviteButton').hidden=memberRole!=='admin';updateSettings();
 await refresh(true);if(refreshTimer)clearInterval(refreshTimer);refreshTimer=setInterval(()=>{if(!document.hidden)refresh(false)},20000);
}
async function refresh(loud=false){if(!session)return;const [rec,team,med]=await Promise.all([
 api.from('viking_workspace_records').select('*').order('created_at',{ascending:false}),
 api.from('viking_team_members').select('email,role,active,added_at').order('added_at'),
 api.from('viking_trip_media').select('*').order('created_at',{ascending:false})
]);
 if(rec.error||team.error||med.error){setStatus('نیاز به اتصال مجدد',true);$('settingsWorkspace').textContent='اتصال ناموفق';if(loud)notify('خطای بارگیری: '+errorText(rec.error||team.error||med.error),true);return}
 records=rec.data||[];members=team.data||[];photos=med.data||[];setStatus('متصل · تیم خصوصی');$('lastSync').textContent='آخرین همگام‌سازی: '+new Date().toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit'});render();
}
function go(view){if(!$("view-"+view))return;selectedView=view;document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!=='view-'+view);document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));const reduce=document.body.classList.contains('reduce-motion')||matchMedia('(prefers-reduced-motion: reduce)').matches;window.scrollTo({top:0,behavior:reduce?'auto':'smooth'});$('main').focus({preventScroll:true});if(view==='gallery')renderPhotos()}
function tripName(id){return records.find(r=>r.id===id&&r.kind==='trip')?.title||'بدون سفر مرتبط'}
function ordered(kind){return records.filter(r=>r.kind===kind)}
function shortDate(value){if(!value)return 'تاریخ نامشخص';const d=new Date(value+'T12:00:00');return Number.isNaN(d.getTime())?esc(value):d.toLocaleDateString('fa-IR',{year:'numeric',month:'short',day:'numeric'})}
function empty(label){return `<div class="empty"><b>V /</b>هنوز ${esc(label)} ثبت نشده است.<br>از دکمهٔ افزودن، اولین مورد را بسازید.</div>`}
function recordCard(row){const p=row.payload||{};const trip=row.trip_id?`<p>سفر: ${esc(tripName(row.trip_id))}</p>`:'';
 const meta=row.kind==='trip'?`${esc(p.location||'مقصد ثبت نشده')} · ${esc(shortDate(p.date))} · ظرفیت ${esc(p.capacity||'—')}`:row.kind==='task'?`${esc(p.owner||'مسئول تعیین نشده')} · ${esc(shortDate(p.due))}`:row.kind==='report'?`بازدید ${esc(p.reach||'—')} · درخواست ${esc(p.leads||'—')} · ثبت‌نام ${esc(p.sales||'—')}`: 'انتظار · ورود · اوج · ارتباط · ادامه';
 const detail=row.kind==='experience'?['expectation','arrival','peak','connection','afterglow'].map((k,i)=>p[k]?`${['انتظار','ورود','اوج','ارتباط','ادامه'][i]}: ${p[k]}`:'').filter(Boolean).join('\n'):p.notes||p.description||'';
 return `<article class="record"><div class="record-head"><span class="record-tag">${labels[row.kind]} / VIKING</span><span class="record-status">${esc(p.status||'ثبت‌شده')}</span></div><h3>${esc(row.title)}</h3><p>${meta}</p>${trip}<p>${esc(detail)}</p><div class="record-bottom"><button data-edit="${row.id}">ویرایش</button><button class="danger" data-delete="${row.id}">حذف</button></div></article>`;
}
function render(){const trips=ordered('trip'),tasks=ordered('task');$('metrics').innerHTML=[['سفرهای ثبت‌شده',trips.length],['وظایف باز',tasks.filter(r=>r.payload?.status!=='انجام شد').length],['رسانه‌های سفر',photos.length],['اعضای فعال',members.filter(m=>m.active).length]].map(([label,n])=>`<article class="metric"><span>${label}</span><strong>${n.toLocaleString('fa-IR')}</strong></article>`).join('');
 $('homeTrips').innerHTML=trips.length?trips.slice(0,2).map(recordCard).join(''):empty('سفری');
 for(const kind of Object.keys(tables))$(tables[kind]+'List').innerHTML=ordered(kind).length?ordered(kind).map(recordCard).join(''):empty(labels[kind]+'ی');
 $('teamList').innerHTML=members.map(m=>`<article class="record"><div class="record-head"><span class="record-tag">${m.role==='admin'?'TEAM / ADMIN':'TEAM / MEMBER'}</span><span class="record-status">${m.active?'فعال':'غیرفعال'}</span></div><h3>${esc(m.email)}</h3><p>${m.role==='admin'?'مدیر تیم':'عضو اجرایی'}</p><div class="record-bottom">${memberRole==='admin'&&m.role!=='admin'?`<button data-member-toggle="${esc(m.email)}">${m.active?'تعلیق دسترسی':'فعال‌سازی'}</button><button data-member-remove="${esc(m.email)}" class="danger">حذف دعوت</button>`:''}</div></article>`).join('')||empty('عضوی');
 renderTripSelect();if(selectedView==='gallery')renderPhotos();
}
function renderTripSelect(){const el=$('galleryTrip'),selected=el.value;el.innerHTML='<option value="">همهٔ سفرها</option>'+ordered('trip').map(t=>`<option value="${t.id}">${esc(t.title)}</option>`).join('');el.value=ordered('trip').some(t=>t.id===selected)?selected:''}
function field(name,title,type='text',value='',extra=''){if(type==='textarea')return `<label>${title}<textarea name="${name}" ${extra}>${esc(value)}</textarea></label>`;if(type==='select')return `<label>${title}<select name="${name}" ${extra}>${value}</select></label>`;return `<label>${title}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`}
function optionList(options,selected){return options.map(v=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(v)}</option>`).join('')}
function tripOptions(selected){return `<option value="">بدون سفر مرتبط</option>`+ordered('trip').map(t=>`<option value="${t.id}" ${t.id===selected?'selected':''}>${esc(t.title)}</option>`).join('')}
function openEdit(kind,id=null){const row=id?records.find(r=>r.id===id):null;const p=row?.payload||{};editing={kind,id};$('sheetTitle').textContent=(id?'ویرایش ':'ثبت ')+labels[kind];let f=field('title','عنوان','text',row?.title||'','required maxlength="180"');
 if(kind!=='trip')f+=field('trip_id','سفر مرتبط','select',tripOptions(row?.trip_id||''));
 if(kind==='trip'){f+=field('location','مقصد / لوکیشن','text',p.location||'');f+=field('date','تاریخ حرکت','date',p.date||'');f+=field('capacity','ظرفیت','number',p.capacity||'','min="0"');f+=field('status','وضعیت','select',optionList(statuses.trip,p.status||statuses.trip[0]));f+=field('description','شرح سفر','textarea',p.description||'')}
 if(kind==='task'){f+=field('owner','مسئول','text',p.owner||'');f+=field('due','مهلت انجام','date',p.due||'');f+=field('status','وضعیت','select',optionList(statuses.task,p.status||statuses.task[0]));f+=field('notes','جزئیات کار','textarea',p.notes||'')}
 if(kind==='experience'){for(const [key,label] of [['expectation','انتظار و کنجکاوی'],['arrival','اولین برخورد'],['peak','لحظهٔ اوج'],['connection','تعامل آدم‌ها'],['afterglow','ادامهٔ خاطره']])f+=field(key,label,'textarea',p[key]||'')}
 if(kind==='report'){f+=field('date','تاریخ گزارش','date',p.date||'');for(const [k,label] of [['reach','بازدید'],['leads','درخواست‌ها'],['sales','ثبت‌نام‌ها']])f+=field(k,label,'number',p[k]||'','min="0"');f+=field('notes','جمع‌بندی','textarea',p.notes||'')}
 $('editForm').innerHTML=f;$('sheet').hidden=false;$('editForm').querySelector('input')?.focus();
}
function closeEdit(){$('sheet').hidden=true;editing=null}
async function saveEdit(){if(!editing)return;const form=$('editForm');if(!form.reportValidity())return;const button=$('saveRecord');setBusy(button,true);
 try{const formData=new FormData(form),data=Object.fromEntries(formData);const title=String(data.title||'').trim();if(!title)throw new Error('عنوان را وارد کنید');delete data.title;const trip_id=data.trip_id||null;delete data.trip_id;const payload={};for(const [k,v] of Object.entries(data))payload[k]=String(v).trim();let result;
 if(editing.id){result=await api.from('viking_workspace_records').update({title,trip_id,payload,updated_at:new Date().toISOString()}).eq('id',editing.id).select('id').single()}
 else{result=await api.from('viking_workspace_records').insert({kind:editing.kind,title,trip_id,payload}).select('id').single()}
 if(result.error)throw result.error;closeEdit();notify('تغییرات در فضای مشترک تیم ذخیره شد.');await refresh(true)
 }catch(e){notify('ذخیره نشد: '+errorText(e),true)}finally{setBusy(button,false)}
}
async function deleteRecord(id){const row=records.find(r=>r.id===id);if(!row||!confirm('«'+row.title+'» حذف شود؟'))return;
 if(row.kind==='trip'&&photos.some(p=>p.trip_id===id)){notify('اول عکس‌های این سفر را حذف یا منتقل کنید.',true);return}
 const r=await api.from('viking_workspace_records').delete().eq('id',id);if(r.error)notify('حذف انجام نشد: '+errorText(r.error),true);else{notify('مورد حذف شد.');await refresh(true)}
}
function releaseUrls(){for(const url of mediaUrls)URL.revokeObjectURL(url);mediaUrls=[]}
async function renderPhotos(){if(selectedView!=='gallery'||!session)return;releaseUrls();const target=$('galleryList');const selected=$('galleryTrip').value;const matching=photos.filter(p=>!selected||p.trip_id===selected);if(!matching.length){target.innerHTML=empty('عکسی برای این سفر');return}target.innerHTML=matching.map(p=>`<article class="media" data-media="${p.id}"><div class="media-placeholder" style="aspect-ratio:4/3;display:grid;place-items:center;background:#28362d;color:#ff9969">V / MEDIA</div><div class="media-body"><h3>${esc(p.display_name)}</h3><small>${esc(tripName(p.trip_id))} · ${(p.size_bytes/1024/1024).toFixed(1)} MB</small><div class="media-actions"><button data-photo-download="${p.id}">دانلود</button><button data-photo-replace="${p.id}">جایگزینی</button><button class="danger" data-photo-delete="${p.id}">حذف</button></div></div></article>`).join('');
 for(const p of matching){const card=target.querySelector(`[data-media="${p.id}"]`);if(!card)continue;const r=await api.storage.from('viking-private').download(p.storage_path);if(r.error){card.querySelector('.media-placeholder').textContent='نمایش عکس ممکن نشد';continue}const url=URL.createObjectURL(r.data);mediaUrls.push(url);if(!card.isConnected){URL.revokeObjectURL(url);continue}const img=document.createElement('img');img.alt=p.display_name;img.loading='lazy';img.src=url;card.querySelector('.media-placeholder')?.replaceWith(img)}
}
async function uploadFile(file,tripId){if(!session)throw new Error('ابتدا وارد حساب شوید');const kind=file.type.toLowerCase();const extensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/heic':'heic'};if(!extensions[kind])throw new Error('فرمت عکس پشتیبانی نمی‌شود');if(file.size>8388608)throw new Error('هر عکس باید کمتر از ۸ مگابایت باشد');const id=crypto.randomUUID();const path=`trips/${tripId}/${id}.${extensions[kind]}`;
 const storage=api.storage.from('viking-private');const up=await storage.upload(path,file,{contentType:kind,upsert:false});if(up.error)throw up.error;
 const saved=await api.from('viking_trip_media').insert({id,trip_id:tripId,storage_path:path,display_name:file.name||'عکس سفر',mime_type:kind,size_bytes:file.size});if(saved.error){await storage.remove([path]);throw saved.error}
 return id;
}
async function addPhotos(files,tripId){const input=$('photoUpload');if(!tripId||!ordered('trip').some(t=>t.id===tripId)){notify('قبل از آپلود، یک سفر را از فیلتر بالای گالری انتخاب کنید.',true);return false}input.disabled=true;let success=0;
 try{for(const file of files){try{await uploadFile(file,tripId);success++}catch(e){notify('بارگذاری «'+file.name+'» ناموفق بود: '+errorText(e),true)}}if(success){notify(success.toLocaleString('fa-IR')+' عکس در فضای خصوصی تیم ذخیره شد.');await refresh(true)}return success===files.length}finally{input.disabled=false;input.value=''}
}
async function downloadPhoto(id){const p=photos.find(x=>x.id===id);if(!p)return;const r=await api.storage.from('viking-private').download(p.storage_path);if(r.error){notify('دانلود انجام نشد: '+errorText(r.error),true);return}const url=URL.createObjectURL(r.data),a=document.createElement('a');a.href=url;a.download=p.display_name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000)}
async function deletePhoto(id){const p=photos.find(x=>x.id===id);if(!p||!confirm('عکس از آرشیو خصوصی تیم حذف شود؟'))return;const r=await api.storage.from('viking-private').remove([p.storage_path]);if(r.error){notify('حذف فایل انجام نشد: '+errorText(r.error),true);return}const row=await api.from('viking_trip_media').delete().eq('id',id);if(row.error){notify('فایل حذف شد ولی پاک‌سازی فهرست کامل نشد: '+errorText(row.error),true)}else notify('عکس از آرشیو حذف شد.');await refresh(true)}
async function replacePhoto(id){const p=photos.find(x=>x.id===id);if(!p)return;const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp,image/heic';input.onchange=async()=>{if(!input.files?.length)return;try{await uploadFile(input.files[0],p.trip_id);const rm=await api.storage.from('viking-private').remove([p.storage_path]);if(rm.error)throw rm.error;const del=await api.from('viking_trip_media').delete().eq('id',p.id);if(del.error)throw del.error;notify('عکس جدید جایگزین شد.');await refresh(true)}catch(e){notify('جایگزینی کامل نشد؛ عکس قدیمی را بررسی کنید: '+errorText(e),true);await refresh(true)}};input.click()}
async function invite(){if(memberRole!=='admin')return;const email=prompt('ایمیل عضو جدید را وارد کنید:');if(!email)return;const normalized=email.trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)){notify('نشانی ایمیل معتبر نیست.',true);return}if(members.filter(m=>m.active).length>=5){notify('در حال حاضر پنج عضو فعال دارید؛ ابتدا یک دسترسی قدیمی را غیرفعال کنید.',true);return}const r=await api.from('viking_team_members').insert({email:normalized,role:'member'});if(r.error){notify('دعوت ثبت نشد: '+errorText(r.error),true);return}notify('ایمیل مجاز شد؛ عضو باید با همین ایمیل ثبت‌نام و تأیید حساب کند.');await refresh(true)}
async function changeMember(email,remove=false){if(memberRole!=='admin')return;const m=members.find(x=>x.email===email&&x.role==='member');if(!m||!confirm(remove?'دعوت این عضو حذف شود؟':'وضعیت دسترسی این عضو تغییر کند؟'))return;const r=remove?await api.from('viking_team_members').delete().eq('email',email):await api.from('viking_team_members').update({active:!m.active}).eq('email',email);if(r.error)notify('تغییر دسترسی ثبت نشد: '+errorText(r.error),true);else{notify('دسترسی عضو به‌روزرسانی شد.');await refresh(true)}}

$('loginForm').addEventListener('submit',async e=>{e.preventDefault();if(!api)return;const data=new FormData(e.currentTarget),email=String(data.get('email')).trim().toLowerCase(),password=String(data.get('password'));setBusy($('loginBtn'),true);try{const r=await api.auth.signInWithPassword({email,password});if(r.error)throw r.error;session=r.data.session;await enter()}catch(err){notify('ورود انجام نشد: '+errorText(err),true)}finally{setBusy($('loginBtn'),false)}});
$('signupBtn').addEventListener('click',async()=>{if(!api)return;const form=$('loginForm'),email=form.email.value.trim().toLowerCase(),password=form.password.value;if(!email||password.length<6){notify('ابتدا ایمیل و رمز حداقل ۶ کاراکتری را وارد کنید.',true);return}if(!confirm('فقط اگر مدیر تیم این ایمیل را دعوت کرده ثبت‌نام کنید. ادامه می‌دهید؟'))return;const r=await api.auth.signUp({email,password,options:{emailRedirectTo:location.origin+'/team/'}});if(r.error)notify('ثبت‌نام انجام نشد: '+errorText(r.error),true);else if(r.data.session){session=r.data.session;await enter()}else notify('ایمیل تأیید ارسال شد. پس از تأیید، با همین ایمیل و رمز وارد شوید.')});
$('forgotBtn').addEventListener('click',async()=>{if(!api)return;const email=$('loginForm').email.value.trim();if(!email){notify('اول ایمیل را وارد کنید.',true);return}const r=await api.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/team/'});notify(r.error?'بازیابی انجام نشد: '+errorText(r.error):'اگر این حساب وجود داشته باشد، پیام بازیابی برایش ارسال می‌شود.',Boolean(r.error))});
async function signOut(){if(confirm('از حساب وایکینگ خارج شوید؟'))await api.auth.signOut()}
$('profileButton').addEventListener('click',signOut);$('logoutButton').addEventListener('click',signOut);
$('motionToggle').addEventListener('change',e=>applyMotionPreference(e.currentTarget.checked));
$('refreshButton').addEventListener('click',async e=>{setBusy(e.currentTarget,true);await refresh(true);setBusy(e.currentTarget,false)});
$('motionToggle').checked=localStorage.getItem(motionPreferenceKey)==='1';document.body.classList.toggle('reduce-motion',$('motionToggle').checked);
window.addEventListener('offline',()=>setStatus('آفلاین',true));window.addEventListener('online',()=>{setStatus('در حال اتصال…');refresh(true)});
$('inviteButton').addEventListener('click',invite);$('galleryTrip').addEventListener('change',renderPhotos);
$('photoUpload').addEventListener('change',e=>addPhotos([...e.target.files],$('galleryTrip').value));
$('closeSheet').addEventListener('click',closeEdit);$('cancelSheet').addEventListener('click',closeEdit);$('saveRecord').addEventListener('click',saveEdit);$('sheet').addEventListener('click',e=>{if(e.target===$('sheet'))closeEdit()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeEdit()});
document.addEventListener('click',async e=>{const b=e.target.closest('button,[data-add],[data-view]');if(!b)return;
 if(b.dataset.view){go(b.dataset.view);return}
 if(b.dataset.add){openEdit(b.dataset.add);return}
 if(b.dataset.edit){const row=records.find(x=>x.id===b.dataset.edit);if(row)openEdit(row.kind,row.id);return}
 if(b.dataset.delete){await deleteRecord(b.dataset.delete);return}
 if(b.dataset.photoDownload){await downloadPhoto(b.dataset.photoDownload);return}
 if(b.dataset.photoDelete){await deletePhoto(b.dataset.photoDelete);return}
 if(b.dataset.photoReplace){await replacePhoto(b.dataset.photoReplace);return}
 if(b.dataset.memberToggle){await changeMember(b.dataset.memberToggle);return}
 if(b.dataset.memberRemove){await changeMember(b.dataset.memberRemove,true)}
});
init();

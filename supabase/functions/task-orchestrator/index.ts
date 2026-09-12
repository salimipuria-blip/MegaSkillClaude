import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
const SUPABASE_URL=Deno.env.get('SUPABASE_URL')!
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}})
function classifyTask(text=''){const q=String(text).toLowerCase();if(/code|coding|typescript|javascript|python|bug|debug|api|sql|برنامه|کد|باگ/.test(q))return'coding';if(/image|photo|vision|تصویر|عکس/.test(q))return'vision';if(/research|تحقیق|بررسی|منبع/.test(q))return'research';if(/reason|analysis|تحلیل|استدلال/.test(q))return'reasoning';return'general'}
async function call(name:string,body:any,auth:string){const r=await fetch(`${SUPABASE_URL}/functions/v1/${name}`,{method:'POST',headers:{'content-type':'application/json','authorization':auth},body:JSON.stringify(body)});const text=await r.text();let data:any;try{data=JSON.parse(text)}catch{data={raw:text}};if(!r.ok)throw new Error(`${name} ${r.status}: ${data?.error||text}`);return data}
Deno.serve(async(req:Request)=>{try{
 if(req.method!=='POST')return json({ok:false,error:'POST required'},405)
 const auth=req.headers.get('authorization')||'';if(!auth)return json({ok:false,error:'authorization required'},401)
 const b=await req.json();if(b.action==='health')return json({ok:true,service:'task-orchestrator',version:'1.0.0',strict_free_default:true,skill_install_mode:'preinstalled-only'})
 const task=String(b.task||b.prompt||'').trim();if(!task)return json({ok:false,error:'task required'},400)
 const routed=await call('skill-router',{action:'route',query:task,top_k:20,max_skills:b.max_skills||1,compose:Boolean(b.compose),allow_high_risk:Boolean(b.allow_high_risk)},auth)
 if(!Array.isArray(routed.selected)||routed.selected.length===0)return json({ok:false,error:'no installed skill matched; on-demand installation is disabled',routing:routed},503)
 const compiled=await call('prompt-compiler',{task,skills:routed.selected,system_policy:b.system_policy||'',max_skill_chars:b.max_skill_chars||60000},auth)
 const profile=b.task_profile||classifyTask(task)
 const mesh=await call('global-free-llm-mesh',{action:'chat',prompt:compiled.prompt,task:profile,strict_free:b.strict_free!==false,max_tokens:b.max_tokens||1200,temperature:b.temperature??0.2},auth)
 return json({ok:true,task_profile:profile,skills:compiled.included,omitted_skills:compiled.omitted,routing:{candidate_count:routed.candidate_count},result:mesh})
 }catch(e){console.error(e);return json({ok:false,error:e instanceof Error?e.message:String(e)},500)}})

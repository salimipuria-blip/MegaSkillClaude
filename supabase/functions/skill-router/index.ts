import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import postgres from 'npm:postgres@3.4.3'

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2 })
const json = (data: unknown, status=200) => new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json'}})
const normalize=(v='')=>String(v).normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim()
const exactTrigger=(r:any,q:string)=>(r.trigger_phrases||r.triggers||[]).some((t:string)=>normalize(t)===normalize(q))
function rerank(rows:any[],query:string,allowHighRisk=false){
 return rows.filter(r=>allowHighRisk||r.risk_level!=='high').map(r=>{
   let score=Number(r.score||0)
   if(exactTrigger(r,query)) score=Math.max(score,1.12)
   score+=Math.min(.08,Number(r.quality_score||0)*.08)+Math.min(.10,Number(r.success_rate||0)*.10)
   return {...r,final_score:Number(score.toFixed(6))}
 }).sort((a,b)=>b.final_score-a.final_score||a.skill_key.localeCompare(b.skill_key))
}

Deno.serve(async (req:Request)=>{
 try{
  if(req.method!=='POST') return json({ok:false,error:'POST required'},405)
  const body=await req.json().catch(()=>({}))
  const action=String(body.action||'route')
  if(action==='health'){
    const [r]=await sql`select count(*)::int as skills, coalesce(sum(cardinality(trigger_phrases)),0)::int as triggers from private.skills where status='active'`
    return json({ok:true,service:'skill-router',version:'1.0.0',mode:'preinstalled-only',lazy_install:false,...r,ready:r.skills===3000&&r.triggers===15000})
  }
  if(action==='load'){
    if(!body.skill_key) return json({ok:false,error:'skill_key required'},400)
    const [r]=await sql`select private.load_skill(${String(body.skill_key)}) as skill`
    return r?.skill ? json({ok:true,skill:r.skill}) : json({ok:false,error:'skill not found'},404)
  }
  const query=String(body.query||body.task||'').trim()
  if(!query) return json({ok:false,error:'query required'},400)
  const topK=Math.max(1,Math.min(100,Number(body.top_k||20)))
  const rows=await sql`select s.*, private.load_skill(s.skill_key) as skill from private.search_skills(${query},${topK}) s`
  const expanded=rows.map((r:any)=>({...r,...(r.skill||{})}))
  const ranked=rerank(expanded,query,Boolean(body.allow_high_risk))
  if(action==='search') return json({ok:true,query,candidates:ranked.map(({instructions,skill,...r}:any)=>r)})
  const maxSkills=Math.max(1,Math.min(5,Number(body.max_skills||1)))
  const compose=Boolean(body.compose)
  const selected=ranked.slice(0,compose?maxSkills:1)
  return json({ok:true,query,mode:'preinstalled-only',selected:selected.map(({skill,...r}:any)=>r),candidate_count:ranked.length})
 }catch(e){console.error(e);return json({ok:false,error:e instanceof Error?e.message:String(e)},500)}
})

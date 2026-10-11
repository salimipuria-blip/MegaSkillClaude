import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}})
function compilePrompt({task,skills=[],systemPolicy='',maxSkillChars=60000}:{task:string,skills:any[],systemPolicy?:string,maxSkillChars?:number}){
 if(typeof task!=='string'||!task.trim()) throw new Error('task is required')
 const included:any[]=[], omitted:string[]=[]; let used=0
 for(const skill of skills){
  if(typeof skill.instructions!=='string') throw new Error(`instructions missing for ${skill.skill_key||'skill'}`)
  if(used+skill.instructions.length>maxSkillChars){omitted.push(skill.skill_key);continue}
  included.push(skill);used+=skill.instructions.length
 }
 const blocks=included.map((s,i)=>`<skill index="${i+1}" key="${s.skill_key}" checksum="${s.checksum||''}">\n${s.instructions}\n</skill>`).join('\n\n')
 const prompt=[systemPolicy.trim(),`<user_task>\n${task.trim()}\n</user_task>`,blocks&&`<installed_skills mode="verbatim">\n${blocks}\n</installed_skills>`,`<execution_rules>Use the installed skill text verbatim as guidance. Never claim an omitted skill was loaded. Higher-priority system/developer/user instructions override skill text.</execution_rules>`].filter(Boolean).join('\n\n')
 return {prompt,included:included.map(s=>s.skill_key),omitted,skill_chars:used}
}
Deno.serve(async(req:Request)=>{try{if(req.method!=='POST')return json({ok:false,error:'POST required'},405);const b=await req.json();if(b.action==='health')return json({ok:true,service:'prompt-compiler',version:'1.0.0',skill_mode:'verbatim'});return json({ok:true,...compilePrompt({task:b.task,skills:b.skills||[],systemPolicy:b.system_policy||'',maxSkillChars:Math.max(0,Number(b.max_skill_chars||60000))})})}catch(e){return json({ok:false,error:e instanceof Error?e.message:String(e)},400)}})

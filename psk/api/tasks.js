import crypto from 'node:crypto';
import {guard,reply,route,inputCheck,planOf,skills,answerMessages,chat} from './_core.mjs';
import {instrument} from '../engine/telemetry.mjs';
export default instrument('tasks',async function handler(req,res,ctx){if(!guard(req,res,'POST'))return;
 let d=req.body;
 if(typeof d==='string'){try{d=JSON.parse(d)}catch{return reply(res,400,{error:'Invalid JSON'});}}
 if(!d||typeof d!=='object'||Array.isArray(d)||Buffer.byteLength(JSON.stringify(d))>12000)return reply(res,413,{error:'Invalid or oversized request body'});
 if(!inputCheck(d.input))return reply(res,400,{error:'input must contain 1–4000 characters'});
 if(!['plan','answer'].includes(d.mode))return reply(res,400,{error:'mode must be plan or answer'});
 const createdAt=new Date().toISOString(),id=crypto.randomUUID(),events=[];
 const event=(type,extra={})=>events.push({id:events.length+1,taskId:id,type,at:new Date().toISOString(),...extra});
 const input=d.input.trim();ctx.mode=d.mode;
 event('queued',{mode:d.mode});event('routing',{state:'running'});
 const routed=route(input,8);ctx.results=routed.selected.length;event('routed',{matchedSkillCount:routed.matches,selectedSkills:routed.selected});
 const picked=routed.selected.slice(0,3);const content=skills(picked);
 event('skills_checked',{loaded:content.loaded.length,missing:content.missing.length,rejected:content.rejected});
 const task={id,status:'completed',createdAt,mode:d.mode,route:routed,result:null,error:null,events};
 if(d.mode==='plan')task.result=planOf(input,routed);
 else if(!content.loaded.length){task.status='failed';task.error={code:'SKILL_CONTENT_MISSING',message:'هیچ مهارت تأییدشده‌ای برای این درخواست پیدا نشد؛ پاسخ ساختگی ارائه نمی‌شود.',recoverable:true};}
 else{
   event('provider_call',{state:'running'});
   try{
     const out=await chat(answerMessages(input,content.loaded));
     event('provider_done',{provider:out.provider,model:out.model,attempts:out.attempts});
     task.result={kind:'llm-response',answer:out.text,provider:out.provider,model:out.model,usage:out.usage,skillsUsed:content.loaded.map(s=>({name:s.name,status:s.status})),
       limitations:['پاسخ متنی مدل است؛ هیچ ابزار، انتشار یا فایل خارجی اجرا نشده است.']};
   }catch(e){
     task.status='failed';
     const msg={NO_PROVIDER_CONFIGURED:'هیچ کلید مدل رایگانی روی سرور تنظیم نشده است. مهارت‌ها پیدا و تأیید شدند؛ برای تولید پاسخ یک کلید رایگان (مثلاً Groq یا Gemini) در Vercel اضافه کنید.',
       PROVIDERS_EXHAUSTED:'همهٔ مدل‌های رایگانِ متصل محدودیت یا خطا دادند. به مسیر پولی منتقل نمی‌شود؛ کمی بعد دوباره امتحان کنید.',
       PROVIDER_REJECTED:'مدل رایگان درخواست را رد کرد.'}[e.code]||'خطای پیش‌بینی‌نشده در فراخوانی مدل.';
     task.error={code:e.code||'PROVIDER_ERROR',message:msg,recoverable:e.code!=='PROVIDER_REJECTED',attempts:e.attempts||[]};
     task.result={kind:'verified-routing-plan-only',skillsReady:content.loaded.map(s=>({name:s.name,status:s.status,description:s.description}))};
   }
 }
 event(task.status,{...(task.status==='failed'?{error:task.error}:{resultKind:task.result.kind})});
 // Complete within this invocation. There is intentionally no ephemeral task map or background promise.
 return reply(res,200,task);
});

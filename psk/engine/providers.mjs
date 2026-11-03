// Free-tier LLM adapter. Zero dependencies (built-in fetch), OpenAI-compatible chat endpoints.
// Policy: free-only by configuration. A provider is used only when its key is set on the server.
// Failover happens on rate limits, quota and server errors; nothing ever falls back to a paid route.

export const PROVIDERS = [
  {id:'groq',label:'Groq',env:'GROQ_API_KEY',base:'https://api.groq.com/openai/v1',model:'llama-3.3-70b-versatile'},
  {id:'cerebras',label:'Cerebras',env:'CEREBRAS_API_KEY',base:'https://api.cerebras.ai/v1',model:'llama-3.3-70b'},
  {id:'gemini',label:'Google AI Studio',env:'GEMINI_API_KEY',base:'https://generativelanguage.googleapis.com/v1beta/openai',model:'gemini-2.5-flash'},
  {id:'openrouter',label:'OpenRouter',env:'OPENROUTER_API_KEY',base:'https://openrouter.ai/api/v1',model:'meta-llama/llama-3.3-70b-instruct:free',freeSuffix:':free'},
];

const modelOf=(p,env)=>env[p.env.replace('_API_KEY','_MODEL')]||p.model;

/** Providers that are configured and pass the free-only guard, in priority order. */
export function configuredProviders(env=process.env){
  const order=String(env.PROVIDER_ORDER||'').split(',').map(s=>s.trim()).filter(Boolean);
  const list=PROVIDERS.filter(p=>env[p.env]).map(p=>({...p,model:modelOf(p,env),key:env[p.env]}));
  // OpenRouter mixes paid and free models: only ids ending in ":free" are allowed.
  const safe=list.filter(p=>!p.freeSuffix||p.model.endsWith(p.freeSuffix));
  if(order.length)safe.sort((a,b)=>(order.indexOf(a.id)+1||99)-(order.indexOf(b.id)+1||99));
  return safe;
}

/** Public description; never includes keys. */
export function providerStatus(env=process.env){
  const ready=configuredProviders(env);
  return {configured:ready.length>0,pricePolicy:'free-only; stop on exhausted quota',
    providers:PROVIDERS.map(p=>{const r=ready.find(x=>x.id===p.id);return {id:p.id,label:p.label,configured:!!r,model:r?r.model:null};})};
}

const RETRY=new Set([408,409,425,429,500,502,503,504]);

/**
 * Try each configured provider once, in order. Returns {text, provider, model, attempts}
 * or throws {code, attempts} with code NO_PROVIDER_CONFIGURED | PROVIDERS_EXHAUSTED | PROVIDER_REJECTED
 * (PROVIDER_REJECTED only when every provider returned a non-retryable 4xx).
 */
export async function chat(messages,{env=process.env,fetchImpl=globalThis.fetch,timeoutMs=20000,maxTokens=1200,deadline=Date.now()+50000}={}){
  const list=configuredProviders(env);
  if(!list.length)throw Object.assign(new Error('No free provider key is configured on the server'),{code:'NO_PROVIDER_CONFIGURED',attempts:[]});
  const attempts=[];
  for(const p of list){
    const left=deadline-Date.now();if(left<2000)break;
    const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),Math.min(timeoutMs,left));
    const started=Date.now();
    try{
      const res=await fetchImpl(p.base+'/chat/completions',{method:'POST',signal:ctrl.signal,
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+p.key},
        body:JSON.stringify({model:p.model,messages,max_tokens:maxTokens,temperature:0.4})});
      const ms=Date.now()-started;
      if(!res.ok){
        // Every failure moves on to the next free provider: a 400 is often provider-specific
        // (e.g. a decommissioned default model), not proof the request itself is bad.
        attempts.push({provider:p.id,model:p.model,status:res.status,ms});
        // Release the unread error body so the pooled connection is freed before the next provider.
        try{await res.body?.cancel?.();}catch{}
        continue;
      }
      let data;
      // A 200 with a non-JSON body (proxy/HTML error page) is the provider's fault, not the network's.
      try{data=await res.json();}catch(e){if(e.name==='AbortError')throw e;attempts.push({provider:p.id,model:p.model,status:'invalid-json',ms:Date.now()-started});continue;}
      const text=data?.choices?.[0]?.message?.content;
      if(typeof text!=='string'||!text.trim()){attempts.push({provider:p.id,model:p.model,status:'empty',ms});continue;}
      attempts.push({provider:p.id,model:p.model,status:200,ms});
      return {text:text.trim(),provider:p.id,model:data.model||p.model,usage:data.usage||null,attempts};
    }catch(e){
      attempts.push({provider:p.id,model:p.model,status:e.name==='AbortError'?'timeout':'network',ms:Date.now()-started});
    }finally{clearTimeout(timer);}
  }
  // Only when every provider answered with a client error (and none was rate-limited or down)
  // is the request itself the likely problem.
  const rejected=attempts.length>0&&attempts.every(a=>typeof a.status==='number'&&a.status>=400&&a.status<500&&!RETRY.has(a.status));
  if(rejected)throw Object.assign(new Error('Every configured provider rejected the request'),{code:'PROVIDER_REJECTED',attempts});
  throw Object.assign(new Error('All configured free providers failed or are rate-limited'),{code:'PROVIDERS_EXHAUSTED',attempts});
}

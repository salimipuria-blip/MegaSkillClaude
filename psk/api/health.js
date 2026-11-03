import {guard,limit,reply,getRegistry,providers} from './_core.mjs';
export default function handler(req,res){if(!limit(req,res,'health'))return;if(!guard(req,res,'GET'))return;
 const r=getRegistry(),p=providers();const verified=r.content.verified+r.content.repaired;
 return reply(res,200,{ok:true,mode:'vercel-serverless-stateless',skillsIndexed:r.records.length,triggersDeclared:r.declaredTriggers,
  skillContent:r.content,skillContentConfigured:verified>0,provider:{kind:p.configured?'free-tier':'none',...p},
  features:['lexical-idf-router','verified-skill-bodies','deterministic-plan',...(p.configured?['free-llm-answer']:[]),'synchronous-task-response'],
  limitations:['no-persistent-task-history','no-MCP-or-tool-execution',...(p.configured?[]:['no-free-provider-key-configured'])]});}

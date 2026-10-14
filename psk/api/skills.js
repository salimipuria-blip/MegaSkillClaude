import {guard,reply,route,getRegistry} from './_core.mjs';
import {instrument} from '../engine/telemetry.mjs';
export default instrument('skills',function handler(req,res,ctx){if(!guard(req,res,'GET'))return;
 const q=String(req.query?.q||'');if(q.length>4000)return reply(res,400,{error:'Query too long'});
 const routed=route(q,15);ctx.results=routed.selected.length;
 return reply(res,200,{...routed,indexed:getRegistry().records.length});});
